import { logger } from '../utils/logger';
import { MasterIndex, BookIndex, ChunkIndex } from '../processors/indexBuilder';
import { Chunk } from '../processors/semanticChunker';
import fs from 'fs/promises';
import path from 'path';
import Redis from 'ioredis';
import OpenAI from 'openai';

export interface RouteResult {
  query: string;
  books: BookScore[];
  sections: SectionCandidate[];
  chunks: Chunk[];
  totalTokens: number;
  confidence: number;
  fromCache: boolean;
  strategy: string;
}

interface BookScore {
  bookId: string;
  title: string;
  score: number;
  reason: string;
}

interface SectionCandidate {
  bookId: string;
  sectionId: string;
  score: number;
  chunkIds: string[];
}

interface SearchOptions {
  maxTokens?: number;
  minConfidence?: number;
  language?: 'hebrew' | 'french' | 'english';
  useCache?: boolean;
}

export class HierarchicalRouter {
  private masterIndex: MasterIndex | null = null;
  private bookIndexes: Map<string, BookIndex> = new Map();
  private chunkIndexes: Map<string, ChunkIndex[]> = new Map();
  private chunksCache: Map<string, Chunk> = new Map();
  
  private redis: Redis | null = null;
  private openai: OpenAI | null = null;
  
  private readonly MAX_CONTEXT_TOKENS = 900000; // Leave margin for Gemini
  private readonly CACHE_TTL = 3600; // 1 hour
  
  constructor() {
    this.initializeServices();
  }
  
  private async initializeServices() {
    // Initialize Redis if available
    try {
      this.redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');
      await this.redis.ping();
      logger.info('✅ Redis connected for caching');
    } catch (error) {
      logger.warn('⚠️ Redis not available, caching disabled');
      this.redis = null;
    }
    
    // Initialize OpenAI for embeddings
    if (process.env.OPENAI_API_KEY) {
      this.openai = new OpenAI({
        apiKey: process.env.OPENAI_API_KEY
      });
      logger.info('✅ OpenAI initialized for embeddings');
    } else {
      logger.warn('⚠️ OpenAI API key not found, semantic search limited');
    }
  }
  
  /**
   * Load all indexes into memory
   */
  async loadIndexes(): Promise<void> {
    const indexDir = path.join(process.cwd(), 'data', 'indexes');
    
    try {
      // Load master index
      const masterData = await fs.readFile(
        path.join(indexDir, 'master', 'index.json'),
        'utf-8'
      );
      this.masterIndex = JSON.parse(masterData);
      
      // Load book indexes
      const bookFiles = await fs.readdir(path.join(indexDir, 'books'));
      for (const file of bookFiles) {
        if (file.endsWith('.json')) {
          const bookData = await fs.readFile(
            path.join(indexDir, 'books', file),
            'utf-8'
          );
          const bookIndex = JSON.parse(bookData);
          this.bookIndexes.set(bookIndex.bookId, bookIndex);
        }
      }
      
      // Load chunk indexes
      const chunkFiles = await fs.readdir(path.join(indexDir, 'chunks'));
      for (const file of chunkFiles) {
        if (file.endsWith('.json')) {
          const chunkData = await fs.readFile(
            path.join(indexDir, 'chunks', file),
            'utf-8'
          );
          const chunks = JSON.parse(chunkData);
          const bookId = file.replace('.json', '');
          this.chunkIndexes.set(bookId, chunks);
        }
      }
      
      logger.info(`📚 Loaded indexes: ${this.bookIndexes.size} books, ${this.chunkIndexes.size} chunk groups`);
    } catch (error) {
      logger.error('Failed to load indexes:', error);
      throw error;
    }
  }
  
  /**
   * Main routing method - navigates through 3 levels to find relevant content
   */
  async route(query: string, options: SearchOptions = {}): Promise<RouteResult> {
    const startTime = Date.now();
    const opts = {
      maxTokens: this.MAX_CONTEXT_TOKENS,
      minConfidence: 0.3,
      language: 'french' as const,
      useCache: true,
      ...options
    };
    
    logger.info(`🔍 Routing query: "${query.substring(0, 50)}..."`);
    
    // Check cache first
    if (opts.useCache && this.redis) {
      const cached = await this.getCachedResult(query);
      if (cached) {
        logger.info('💾 Returning cached result');
        return { ...cached, fromCache: true };
      }
    }
    
    try {
      // Step 1: Generate query embedding
      const queryEmbedding = await this.generateEmbedding(query);
      const queryKeywords = this.extractQueryKeywords(query);
      
      // Step 2: Search Master Index (Level 1)
      const relevantBooks = await this.searchMasterIndex(
        query,
        queryEmbedding,
        queryKeywords
      );
      
      if (relevantBooks.length === 0) {
        logger.warn('No relevant books found');
        return this.createEmptyResult(query);
      }
      
      // Step 3: Search Book Indexes (Level 2)
      const sectionCandidates = await this.searchBookIndexes(
        relevantBooks,
        query,
        queryEmbedding,
        queryKeywords
      );
      
      if (sectionCandidates.length === 0) {
        logger.warn('No relevant sections found');
        return this.createEmptyResult(query);
      }
      
      // Step 4: Retrieve Chunks (Level 3)
      const chunks = await this.retrieveChunks(
        sectionCandidates,
        opts.maxTokens
      );
      
      // Calculate confidence
      const confidence = this.calculateConfidence(
        chunks,
        query,
        queryKeywords
      );
      
      // Count total tokens
      const totalTokens = chunks.reduce(
        (sum, chunk) => sum + chunk.metadata.tokenCount,
        0
      );
      
      const result: RouteResult = {
        query,
        books: relevantBooks,
        sections: sectionCandidates,
        chunks,
        totalTokens,
        confidence,
        fromCache: false,
        strategy: 'HierarchicalRouting'
      };
      
      // Cache result
      if (opts.useCache && this.redis) {
        await this.cacheResult(query, result);
      }
      
      const duration = Date.now() - startTime;
      logger.info(`✅ Routing completed in ${duration}ms: ${chunks.length} chunks, ${totalTokens} tokens, confidence: ${confidence.toFixed(2)}`);
      
      return result;
      
    } catch (error) {
      logger.error('Routing error:', error);
      throw error;
    }
  }
  
  /**
   * Level 1: Search Master Index to find relevant books
   */
  private async searchMasterIndex(
    query: string,
    queryEmbedding: number[] | null,
    queryKeywords: string[]
  ): Promise<BookScore[]> {
    if (!this.masterIndex) {
      throw new Error('Master index not loaded');
    }
    
    const bookScores: BookScore[] = [];
    
    // Lexical search in global search index
    const lexicalMatches = new Map<string, number>();
    for (const keyword of queryKeywords) {
      const bookRefs = this.masterIndex.searchIndex[keyword];
      if (bookRefs) {
        for (const ref of bookRefs) {
          const [bookId, count] = ref.split(':');
          const score = parseInt(count) / 100; // Normalize
          lexicalMatches.set(bookId, (lexicalMatches.get(bookId) || 0) + score);
        }
      }
    }
    
    // Thematic search
    const thematicMatches = new Map<string, number>();
    for (const keyword of queryKeywords) {
      const bookRefs = this.masterIndex.thematicMap[keyword];
      if (bookRefs) {
        for (const ref of bookRefs) {
          thematicMatches.set(
            ref.bookId,
            (thematicMatches.get(ref.bookId) || 0) + ref.weight
          );
        }
      }
    }
    
    // Semantic search if embeddings available
    const semanticMatches = new Map<string, number>();
    if (queryEmbedding && this.masterIndex.books[0]?.keywordEmbeddings) {
      for (const book of this.masterIndex.books) {
        if (book.keywordEmbeddings && book.keywordEmbeddings.length > 0) {
          const similarities = book.keywordEmbeddings.map(
            emb => this.cosineSimilarity(queryEmbedding, emb)
          );
          const maxSim = Math.max(...similarities);
          semanticMatches.set(book.id, maxSim);
        }
      }
    }
    
    // Combine scores
    const allBookIds = new Set([
      ...lexicalMatches.keys(),
      ...thematicMatches.keys(),
      ...semanticMatches.keys()
    ]);
    
    for (const bookId of allBookIds) {
      const lexicalScore = lexicalMatches.get(bookId) || 0;
      const thematicScore = thematicMatches.get(bookId) || 0;
      const semanticScore = semanticMatches.get(bookId) || 0;
      
      // Weighted combination
      const totalScore = (lexicalScore * 0.3) + 
                        (thematicScore * 0.3) + 
                        (semanticScore * 0.4);
      
      if (totalScore > 0.1) {
        const book = this.masterIndex.books.find(b => b.id === bookId);
        if (book) {
          bookScores.push({
            bookId: book.id,
            title: book.title,
            score: totalScore,
            reason: this.explainBookRelevance(
              book,
              lexicalScore,
              thematicScore,
              semanticScore
            )
          });
        }
      }
    }
    
    // Sort by score
    bookScores.sort((a, b) => b.score - a.score);
    
    // Return top 3 books
    return bookScores.slice(0, 3);
  }
  
  /**
   * Level 2: Search within selected books to find relevant sections
   */
  private async searchBookIndexes(
    books: BookScore[],
    query: string,
    queryEmbedding: number[] | null,
    queryKeywords: string[]
  ): Promise<SectionCandidate[]> {
    const candidates: SectionCandidate[] = [];
    
    for (const book of books) {
      const bookIndex = this.bookIndexes.get(book.bookId);
      if (!bookIndex) continue;
      
      // Search sections within this book
      const sectionScores = new Map<string, number>();
      
      // Keyword matching in sections
      for (const section of bookIndex.structure.sections) {
        let score = 0;
        
        // Check keyword overlap
        const keywordOverlap = queryKeywords.filter(
          kw => section.keywords.includes(kw)
        ).length;
        score += keywordOverlap * 0.2;
        
        // Check theme overlap
        const themeOverlap = queryKeywords.filter(
          kw => section.themes.includes(kw)
        ).length;
        score += themeOverlap * 0.3;
        
        // Semantic similarity if available
        if (queryEmbedding && section.embedding) {
          const similarity = this.cosineSimilarity(queryEmbedding, section.embedding);
          score += similarity * 0.5;
        }
        
        // Weight by book relevance
        score *= book.score;
        
        if (score > 0.1) {
          sectionScores.set(section.id, score);
        }
      }
      
      // Create candidates from top sections
      const topSections = Array.from(sectionScores.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5);
      
      for (const [sectionId, score] of topSections) {
        const section = bookIndex.structure.sections.find(s => s.id === sectionId);
        if (section) {
          candidates.push({
            bookId: book.bookId,
            sectionId,
            score,
            chunkIds: section.chunkIds
          });
        }
      }
    }
    
    // Sort all candidates by score
    candidates.sort((a, b) => b.score - a.score);
    
    // Return top candidates
    return candidates.slice(0, 10);
  }
  
  /**
   * Level 3: Retrieve actual chunks up to token limit
   */
  private async retrieveChunks(
    candidates: SectionCandidate[],
    maxTokens: number
  ): Promise<Chunk[]> {
    const chunks: Chunk[] = [];
    let totalTokens = 0;
    
    for (const candidate of candidates) {
      // Load chunks for this candidate
      const candidateChunks = await this.loadChunksForSection(
        candidate.bookId,
        candidate.chunkIds
      );
      
      for (const chunk of candidateChunks) {
        const chunkTokens = chunk.metadata.tokenCount;
        
        // Check if adding this chunk exceeds limit
        if (totalTokens + chunkTokens > maxTokens) {
          // Try to add partial chunk if there's significant space left
          if (maxTokens - totalTokens > 10000) {
            const partialChunk = this.truncateChunk(
              chunk,
              maxTokens - totalTokens
            );
            chunks.push(partialChunk);
            totalTokens += partialChunk.metadata.tokenCount;
          }
          
          // Stop here as we've reached the limit
          logger.info(`📊 Token limit reached: ${totalTokens}/${maxTokens}`);
          return chunks;
        }
        
        chunks.push(chunk);
        totalTokens += chunkTokens;
      }
      
      // Stop if we have enough context (80% of max)
      if (totalTokens > maxTokens * 0.8) {
        logger.info(`📊 Sufficient context gathered: ${totalTokens} tokens`);
        break;
      }
    }
    
    return chunks;
  }
  
  /**
   * Load actual chunk content from storage
   */
  private async loadChunksForSection(
    bookId: string,
    chunkIds: string[]
  ): Promise<Chunk[]> {
    const chunks: Chunk[] = [];
    
    for (const chunkId of chunkIds) {
      // Check cache first
      if (this.chunksCache.has(chunkId)) {
        chunks.push(this.chunksCache.get(chunkId)!);
        continue;
      }
      
      // Load from file
      try {
        const chunkPath = path.join(
          process.cwd(),
          'data',
          'chunks',
          bookId,
          `${chunkId}.json`
        );
        
        const chunkData = await fs.readFile(chunkPath, 'utf-8');
        const chunk = JSON.parse(chunkData);
        
        // Cache for future use
        this.chunksCache.set(chunkId, chunk);
        
        chunks.push(chunk);
      } catch (error) {
        logger.warn(`Failed to load chunk ${chunkId}:`, error);
      }
    }
    
    return chunks;
  }
  
  /**
   * Truncate a chunk to fit within token limit
   */
  private truncateChunk(chunk: Chunk, maxTokens: number): Chunk {
    const ratio = maxTokens / chunk.metadata.tokenCount;
    const hebrewLength = Math.floor(chunk.content.hebrew.length * ratio);
    
    return {
      ...chunk,
      content: {
        hebrew: chunk.content.hebrew.substring(0, hebrewLength) + '...',
        english: chunk.content.english ? 
          chunk.content.english.substring(0, hebrewLength) + '...' : undefined,
        french: chunk.content.french ? 
          chunk.content.french.substring(0, hebrewLength) + '...' : undefined
      },
      metadata: {
        ...chunk.metadata,
        tokenCount: maxTokens
      }
    };
  }
  
  /**
   * Generate embedding for a query
   */
  private async generateEmbedding(text: string): Promise<number[] | null> {
    if (!this.openai) return null;
    
    try {
      const response = await this.openai.embeddings.create({
        model: 'text-embedding-ada-002',
        input: text
      });
      
      return response.data[0].embedding;
    } catch (error) {
      logger.warn('Failed to generate embedding:', error);
      return null;
    }
  }
  
  /**
   * Extract keywords from query
   */
  private extractQueryKeywords(query: string): string[] {
    // Normalize query
    const normalized = query.toLowerCase();
    
    // Extract meaningful words
    const words = normalized.split(/\s+/)
      .filter(word => word.length > 2);
    
    // Add Hebrew keywords if detected
    const hebrewKeywords: string[] = [];
    if (/[\u0590-\u05FF]/.test(query)) {
      // Hebrew text detected
      const hebrewWords = query.match(/[\u0590-\u05FF]+/g) || [];
      hebrewKeywords.push(...hebrewWords);
    }
    
    // Add thematic keywords
    const thematicKeywords = this.detectThematicKeywords(query);
    
    return [...new Set([...words, ...hebrewKeywords, ...thematicKeywords])];
  }
  
  /**
   * Detect thematic keywords from query
   */
  private detectThematicKeywords(query: string): string[] {
    const keywords: string[] = [];
    
    const themeMap: Record<string, string[]> = {
      'joie': ['שמחה', 'simcha'],
      'prière': ['תפילה', 'tefila'],
      'foi': ['אמונה', 'emuna'],
      'repentance': ['תשובה', 'teshuva'],
      'torah': ['תורה', 'torah'],
      'tsadik': ['צדיק', 'tzadik'],
      'hitbodedout': ['התבודדות', 'hitbodedut']
    };
    
    for (const [french, hebrew] of Object.entries(themeMap)) {
      if (query.toLowerCase().includes(french)) {
        keywords.push(...hebrew);
      }
    }
    
    return keywords;
  }
  
  /**
   * Calculate cosine similarity between two vectors
   */
  private cosineSimilarity(vec1: number[], vec2: number[]): number {
    if (vec1.length !== vec2.length) return 0;
    
    let dotProduct = 0;
    let norm1 = 0;
    let norm2 = 0;
    
    for (let i = 0; i < vec1.length; i++) {
      dotProduct += vec1[i] * vec2[i];
      norm1 += vec1[i] * vec1[i];
      norm2 += vec2[i] * vec2[i];
    }
    
    norm1 = Math.sqrt(norm1);
    norm2 = Math.sqrt(norm2);
    
    if (norm1 === 0 || norm2 === 0) return 0;
    
    return dotProduct / (norm1 * norm2);
  }
  
  /**
   * Calculate confidence score for results
   */
  private calculateConfidence(
    chunks: Chunk[],
    query: string,
    queryKeywords: string[]
  ): number {
    if (chunks.length === 0) return 0;
    
    let confidence = 0;
    
    // Factor 1: Number of chunks found
    confidence += Math.min(chunks.length / 10, 1) * 0.3;
    
    // Factor 2: Keyword coverage
    const allChunkKeywords = new Set(
      chunks.flatMap(c => this.extractQueryKeywords(c.content.hebrew))
    );
    const keywordCoverage = queryKeywords.filter(
      kw => allChunkKeywords.has(kw)
    ).length / queryKeywords.length;
    confidence += keywordCoverage * 0.4;
    
    // Factor 3: Theme alignment
    const allThemes = new Set(chunks.flatMap(c => c.metadata.themes));
    const themeAlignment = queryKeywords.filter(
      kw => allThemes.has(kw)
    ).length / Math.max(queryKeywords.length, 1);
    confidence += themeAlignment * 0.3;
    
    return Math.min(confidence, 1);
  }
  
  /**
   * Explain why a book was selected
   */
  private explainBookRelevance(
    book: any,
    lexicalScore: number,
    thematicScore: number,
    semanticScore: number
  ): string {
    const reasons: string[] = [];
    
    if (lexicalScore > 0.2) {
      reasons.push('Strong keyword match');
    }
    if (thematicScore > 0.3) {
      reasons.push(`Relevant themes: ${book.themes.slice(0, 3).join(', ')}`);
    }
    if (semanticScore > 0.5) {
      reasons.push('High semantic similarity');
    }
    
    return reasons.join('; ') || 'General relevance';
  }
  
  /**
   * Get cached result from Redis
   */
  private async getCachedResult(query: string): Promise<RouteResult | null> {
    if (!this.redis) return null;
    
    try {
      const key = `route:${this.hashQuery(query)}`;
      const cached = await this.redis.get(key);
      
      if (cached) {
        return JSON.parse(cached);
      }
    } catch (error) {
      logger.warn('Cache retrieval error:', error);
    }
    
    return null;
  }
  
  /**
   * Cache result in Redis
   */
  private async cacheResult(query: string, result: RouteResult): Promise<void> {
    if (!this.redis) return;
    
    try {
      const key = `route:${this.hashQuery(query)}`;
      await this.redis.setex(
        key,
        this.CACHE_TTL,
        JSON.stringify(result)
      );
    } catch (error) {
      logger.warn('Cache storage error:', error);
    }
  }
  
  /**
   * Hash query for cache key
   */
  private hashQuery(query: string): string {
    const crypto = require('crypto');
    return crypto.createHash('md5').update(query).digest('hex');
  }
  
  /**
   * Create empty result when no matches found
   */
  private createEmptyResult(query: string): RouteResult {
    return {
      query,
      books: [],
      sections: [],
      chunks: [],
      totalTokens: 0,
      confidence: 0,
      fromCache: false,
      strategy: 'NoResults'
    };
  }
}

// Export singleton
export const hierarchicalRouter = new HierarchicalRouter();