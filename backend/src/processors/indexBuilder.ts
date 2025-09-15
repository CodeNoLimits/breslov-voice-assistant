import { logger } from '../utils/logger';
import { Chunk } from './semanticChunker';
import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';

// Types for the 3-level index hierarchy

export interface MasterIndex {
  version: string;
  created: Date;
  totalBooks: number;
  totalTokens: number;
  books: BookSummary[];
  searchIndex: Record<string, string[]>;  // keyword -> book references
  thematicMap: Record<string, BookReference[]>;
  embeddingDimensions?: number;
}

interface BookSummary {
  id: string;
  title: string;
  hebrewTitle: string;
  sections: number;
  chunks: number;
  totalTokens: number;
  themes: string[];
  summary: string;
  keywordEmbeddings?: number[][];  // Top keywords embeddings for quick search
}

interface BookReference {
  bookId: string;
  weight: number;  // Relevance weight
}

export interface BookIndex {
  bookId: string;
  title: string;
  hebrewTitle: string;
  created: Date;
  structure: BookStructure;
  chunks: ChunkReference[];
  thematicMap: Record<string, string[]>;  // theme -> chunk IDs
  crossReferences: CrossReference[];
  totalTokens: number;
}

interface BookStructure {
  sections: SectionInfo[];
  hierarchy: HierarchyNode[];
}

interface SectionInfo {
  id: string;
  title: string;
  themes: string[];
  summary: string;
  chunkIds: string[];
  tokenCount: number;
  keywords: string[];
  embedding?: number[];
}

interface HierarchyNode {
  id: string;
  type: 'part' | 'chapter' | 'section' | 'torah' | 'prayer' | 'story';
  title: string;
  children?: HierarchyNode[];
  chunkIds: string[];
}

interface ChunkReference {
  id: string;
  sectionId: string;
  reference: string;
  summary: string;
  keywords: string[];
  themes: string[];
  tokenCount: number;
  embedding?: number[];
}

interface CrossReference {
  fromSection: string;
  toSection: string;
  type: 'quote' | 'theme' | 'concept';
  strength: number;
}

export interface ChunkIndex {
  chunkId: string;
  bookId: string;
  created: Date;
  reference: string;
  tokenCount: number;
  themes: string[];
  keywords: string[];
  citations: any[];
  relatedChunks: string[];
  embedding?: number[];
  bm25Vector?: Record<string, number>;
}

export class IndexBuilder {
  private indexDir: string;
  
  constructor() {
    this.indexDir = path.join(process.cwd(), 'data', 'indexes');
  }

  /**
   * Build all three levels of indexes
   */
  async buildAllIndexes(
    books: any[],
    chunksMap: Map<string, Chunk[]>
  ): Promise<{
    masterIndex: MasterIndex;
    bookIndexes: Map<string, BookIndex>;
    chunkIndexes: Map<string, ChunkIndex>;
  }> {
    await this.ensureIndexDirectory();
    
    logger.info('🏗️ Building 3-level index hierarchy...');
    
    // Level 3: Build chunk indexes first
    const chunkIndexes = await this.buildChunkIndexes(chunksMap);
    
    // Level 2: Build book indexes
    const bookIndexes = await this.buildBookIndexes(books, chunksMap, chunkIndexes);
    
    // Level 1: Build master index
    const masterIndex = await this.buildMasterIndex(books, bookIndexes);
    
    // Save all indexes
    await this.saveIndexes(masterIndex, bookIndexes, chunkIndexes);
    
    logger.info('✅ All indexes built successfully');
    
    return { masterIndex, bookIndexes, chunkIndexes };
  }

  /**
   * Build Master Index (Level 1 - Router)
   * Target size: < 100K tokens
   */
  async buildMasterIndex(
    books: any[],
    bookIndexes: Map<string, BookIndex>
  ): Promise<MasterIndex> {
    logger.info('📚 Building Master Index...');
    
    const bookSummaries: BookSummary[] = [];
    const globalSearchIndex: Record<string, string[]> = {};
    const globalThematicMap: Record<string, BookReference[]> = {};
    let totalTokens = 0;
    
    for (const book of books) {
      const bookIndex = bookIndexes.get(book.id);
      if (!bookIndex) continue;
      
      // Create book summary
      const summary: BookSummary = {
        id: book.id,
        title: book.title,
        hebrewTitle: book.hebrewTitle,
        sections: bookIndex.structure.sections.length,
        chunks: bookIndex.chunks.length,
        totalTokens: bookIndex.totalTokens,
        themes: this.extractTopThemes(bookIndex),
        summary: await this.generateBookSummary(book, bookIndex),
        keywordEmbeddings: [] // Will be populated by embedding service
      };
      
      bookSummaries.push(summary);
      totalTokens += bookIndex.totalTokens;
      
      // Build global search index
      this.updateGlobalSearchIndex(globalSearchIndex, book.id, bookIndex);
      
      // Build global thematic map
      this.updateGlobalThematicMap(globalThematicMap, book.id, bookIndex);
    }
    
    const masterIndex: MasterIndex = {
      version: '1.0.0',
      created: new Date(),
      totalBooks: books.length,
      totalTokens,
      books: bookSummaries,
      searchIndex: globalSearchIndex,
      thematicMap: globalThematicMap
    };
    
    // Verify master index size
    const indexSize = this.estimateIndexSize(masterIndex);
    if (indexSize > 100000) {
      logger.warn(`⚠️ Master Index size (${indexSize} tokens) exceeds target of 100K tokens`);
      // Compress if needed
      return this.compressMasterIndex(masterIndex);
    }
    
    logger.info(`✅ Master Index built: ${books.length} books, ${totalTokens} total tokens`);
    
    return masterIndex;
  }

  /**
   * Build Book Indexes (Level 2 - Section Router)
   * Target size: < 200K tokens per book
   */
  async buildBookIndexes(
    books: any[],
    chunksMap: Map<string, Chunk[]>,
    chunkIndexes: Map<string, ChunkIndex>
  ): Promise<Map<string, BookIndex>> {
    logger.info('📖 Building Book Indexes...');
    
    const bookIndexes = new Map<string, BookIndex>();
    
    for (const book of books) {
      const chunks = chunksMap.get(book.id) || [];
      const bookChunkIndexes = chunks
        .map(c => chunkIndexes.get(c.id))
        .filter(Boolean) as ChunkIndex[];
      
      const bookIndex = await this.buildBookIndex(book, chunks, bookChunkIndexes);
      
      // Verify book index size
      const indexSize = this.estimateIndexSize(bookIndex);
      if (indexSize > 200000) {
        logger.warn(`⚠️ Book Index for ${book.id} (${indexSize} tokens) exceeds target of 200K tokens`);
        // Compress if needed
        bookIndexes.set(book.id, await this.compressBookIndex(bookIndex));
      } else {
        bookIndexes.set(book.id, bookIndex);
      }
    }
    
    logger.info(`✅ Built ${bookIndexes.size} book indexes`);
    
    return bookIndexes;
  }

  /**
   * Build individual book index
   */
  private async buildBookIndex(
    book: any,
    chunks: Chunk[],
    chunkIndexes: ChunkIndex[]
  ): Promise<BookIndex> {
    // Build section info
    const sections = this.buildSectionInfo(book, chunks);
    
    // Build hierarchy
    const hierarchy = this.buildHierarchy(book, sections);
    
    // Build chunk references
    const chunkReferences = chunks.map(chunk => this.buildChunkReference(chunk));
    
    // Build thematic map
    const thematicMap = this.buildThematicMap(chunks);
    
    // Find cross references
    const crossReferences = this.findCrossReferences(sections, chunks);
    
    // Calculate total tokens
    const totalTokens = chunks.reduce((sum, chunk) => sum + chunk.metadata.tokenCount, 0);
    
    return {
      bookId: book.id,
      title: book.title,
      hebrewTitle: book.hebrewTitle,
      created: new Date(),
      structure: {
        sections,
        hierarchy
      },
      chunks: chunkReferences,
      thematicMap,
      crossReferences,
      totalTokens
    };
  }

  /**
   * Build Chunk Indexes (Level 3 - Content)
   */
  async buildChunkIndexes(
    chunksMap: Map<string, Chunk[]>
  ): Promise<Map<string, ChunkIndex>> {
    logger.info('📄 Building Chunk Indexes...');
    
    const chunkIndexes = new Map<string, ChunkIndex>();
    
    for (const [bookId, chunks] of chunksMap) {
      for (const chunk of chunks) {
        const chunkIndex = this.buildChunkIndex(chunk);
        chunkIndexes.set(chunk.id, chunkIndex);
      }
    }
    
    // Find related chunks across books
    this.findRelatedChunks(chunkIndexes);
    
    logger.info(`✅ Built ${chunkIndexes.size} chunk indexes`);
    
    return chunkIndexes;
  }

  /**
   * Build individual chunk index
   */
  private buildChunkIndex(chunk: Chunk): ChunkIndex {
    return {
      chunkId: chunk.id,
      bookId: chunk.bookId,
      created: new Date(),
      reference: chunk.metadata.reference,
      tokenCount: chunk.metadata.tokenCount,
      themes: chunk.metadata.themes,
      keywords: this.extractKeywords(chunk.content.hebrew),
      citations: chunk.metadata.citations,
      relatedChunks: [], // Will be populated by findRelatedChunks
      embedding: chunk.embedding,
      bm25Vector: this.buildBM25Vector(chunk.content.hebrew)
    };
  }

  // Helper methods

  private buildSectionInfo(book: any, chunks: Chunk[]): SectionInfo[] {
    const sectionsMap = new Map<string, SectionInfo>();
    
    // Group chunks by section
    for (const chunk of chunks) {
      const sectionId = chunk.sectionId;
      
      if (!sectionsMap.has(sectionId)) {
        sectionsMap.set(sectionId, {
          id: sectionId,
          title: `Section ${sectionId}`,
          themes: [],
          summary: '',
          chunkIds: [],
          tokenCount: 0,
          keywords: []
        });
      }
      
      const section = sectionsMap.get(sectionId)!;
      section.chunkIds.push(chunk.id);
      section.tokenCount += chunk.metadata.tokenCount;
      section.themes.push(...chunk.metadata.themes);
      section.keywords.push(...this.extractKeywords(chunk.content.hebrew));
    }
    
    // Deduplicate and summarize
    for (const section of sectionsMap.values()) {
      section.themes = [...new Set(section.themes)];
      section.keywords = [...new Set(section.keywords)].slice(0, 20);
      section.summary = this.generateSectionSummary(section);
    }
    
    return Array.from(sectionsMap.values());
  }

  private buildHierarchy(book: any, sections: SectionInfo[]): HierarchyNode[] {
    // Build hierarchy based on book type
    if (book.id.includes('likutey_moharan')) {
      return this.buildTorahHierarchy(sections);
    } else if (book.id.includes('sippurei_maasiyot')) {
      return this.buildStoryHierarchy(sections);
    } else if (book.id.includes('tefilot')) {
      return this.buildPrayerHierarchy(sections);
    }
    
    // Default flat hierarchy
    return sections.map(section => ({
      id: section.id,
      type: 'section' as const,
      title: section.title,
      chunkIds: section.chunkIds
    }));
  }

  private buildTorahHierarchy(sections: SectionInfo[]): HierarchyNode[] {
    // Group sections into Torahs
    const torahs: HierarchyNode[] = [];
    let currentTorah: HierarchyNode | null = null;
    let torahNumber = 1;
    
    for (const section of sections) {
      if (section.title.includes('Torah') || section.title.includes('תורה')) {
        if (currentTorah) {
          torahs.push(currentTorah);
        }
        currentTorah = {
          id: `torah_${torahNumber++}`,
          type: 'torah',
          title: section.title,
          chunkIds: section.chunkIds,
          children: []
        };
      } else if (currentTorah) {
        currentTorah.chunkIds.push(...section.chunkIds);
      }
    }
    
    if (currentTorah) {
      torahs.push(currentTorah);
    }
    
    return torahs;
  }

  private buildStoryHierarchy(sections: SectionInfo[]): HierarchyNode[] {
    // Group sections into stories
    const stories: HierarchyNode[] = [];
    let storyNumber = 1;
    
    for (const section of sections) {
      if (section.themes.includes('story') || section.title.includes('מעשה')) {
        stories.push({
          id: `story_${storyNumber++}`,
          type: 'story',
          title: section.title,
          chunkIds: section.chunkIds
        });
      }
    }
    
    return stories;
  }

  private buildPrayerHierarchy(sections: SectionInfo[]): HierarchyNode[] {
    // Group sections by prayer themes
    const prayers: HierarchyNode[] = [];
    let prayerNumber = 1;
    
    for (const section of sections) {
      prayers.push({
        id: `prayer_${prayerNumber++}`,
        type: 'prayer',
        title: section.title,
        chunkIds: section.chunkIds
      });
    }
    
    return prayers;
  }

  private buildChunkReference(chunk: Chunk): ChunkReference {
    return {
      id: chunk.id,
      sectionId: chunk.sectionId,
      reference: chunk.metadata.reference,
      summary: this.generateChunkSummary(chunk),
      keywords: this.extractKeywords(chunk.content.hebrew).slice(0, 10),
      themes: chunk.metadata.themes,
      tokenCount: chunk.metadata.tokenCount,
      embedding: chunk.embedding
    };
  }

  private buildThematicMap(chunks: Chunk[]): Record<string, string[]> {
    const thematicMap: Record<string, string[]> = {};
    
    for (const chunk of chunks) {
      for (const theme of chunk.metadata.themes) {
        if (!thematicMap[theme]) {
          thematicMap[theme] = [];
        }
        thematicMap[theme].push(chunk.id);
      }
    }
    
    return thematicMap;
  }

  private findCrossReferences(
    sections: SectionInfo[],
    chunks: Chunk[]
  ): CrossReference[] {
    const crossRefs: CrossReference[] = [];
    
    // Find thematic connections
    for (let i = 0; i < sections.length; i++) {
      for (let j = i + 1; j < sections.length; j++) {
        const commonThemes = sections[i].themes.filter(
          t => sections[j].themes.includes(t)
        );
        
        if (commonThemes.length > 0) {
          crossRefs.push({
            fromSection: sections[i].id,
            toSection: sections[j].id,
            type: 'theme',
            strength: commonThemes.length / Math.max(sections[i].themes.length, sections[j].themes.length)
          });
        }
      }
    }
    
    // Find citation connections
    for (const chunk of chunks) {
      for (const citation of chunk.metadata.citations) {
        // Find chunks that might contain the source
        const sourceChunks = chunks.filter(c => 
          c.content.hebrew.includes(citation.source)
        );
        
        for (const sourceChunk of sourceChunks) {
          if (sourceChunk.id !== chunk.id) {
            crossRefs.push({
              fromSection: chunk.sectionId,
              toSection: sourceChunk.sectionId,
              type: 'quote',
              strength: 0.8
            });
          }
        }
      }
    }
    
    return crossRefs;
  }

  private findRelatedChunks(chunkIndexes: Map<string, ChunkIndex>): void {
    const chunks = Array.from(chunkIndexes.values());
    
    for (const chunk of chunks) {
      const related: { id: string; score: number }[] = [];
      
      for (const other of chunks) {
        if (other.chunkId === chunk.chunkId) continue;
        
        // Calculate similarity based on themes
        const commonThemes = chunk.themes.filter(t => other.themes.includes(t));
        const themeScore = commonThemes.length / Math.max(chunk.themes.length, other.themes.length);
        
        // Calculate similarity based on keywords
        const commonKeywords = chunk.keywords.filter(k => other.keywords.includes(k));
        const keywordScore = commonKeywords.length / Math.max(chunk.keywords.length, other.keywords.length);
        
        const totalScore = (themeScore * 0.6) + (keywordScore * 0.4);
        
        if (totalScore > 0.3) {
          related.push({ id: other.chunkId, score: totalScore });
        }
      }
      
      // Keep top 5 related chunks
      related.sort((a, b) => b.score - a.score);
      chunk.relatedChunks = related.slice(0, 5).map(r => r.id);
    }
  }

  private updateGlobalSearchIndex(
    index: Record<string, string[]>,
    bookId: string,
    bookIndex: BookIndex
  ): void {
    // Add book themes to global index
    for (const [theme, chunkIds] of Object.entries(bookIndex.thematicMap)) {
      if (!index[theme]) {
        index[theme] = [];
      }
      index[theme].push(`${bookId}:${chunkIds.length}`);
    }
    
    // Add common keywords
    const allKeywords = bookIndex.chunks.flatMap(c => c.keywords);
    const keywordCounts = this.countOccurrences(allKeywords);
    
    for (const [keyword, count] of Object.entries(keywordCounts)) {
      if (count > 5) { // Only include frequent keywords
        if (!index[keyword]) {
          index[keyword] = [];
        }
        index[keyword].push(`${bookId}:${count}`);
      }
    }
  }

  private updateGlobalThematicMap(
    map: Record<string, BookReference[]>,
    bookId: string,
    bookIndex: BookIndex
  ): void {
    for (const [theme, chunkIds] of Object.entries(bookIndex.thematicMap)) {
      if (!map[theme]) {
        map[theme] = [];
      }
      map[theme].push({
        bookId,
        weight: chunkIds.length / bookIndex.chunks.length
      });
    }
  }

  private extractTopThemes(bookIndex: BookIndex): string[] {
    const themeCounts: Record<string, number> = {};
    
    for (const [theme, chunkIds] of Object.entries(bookIndex.thematicMap)) {
      themeCounts[theme] = chunkIds.length;
    }
    
    return Object.entries(themeCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([theme]) => theme);
  }

  private async generateBookSummary(book: any, bookIndex: BookIndex): Promise<string> {
    // Generate a concise summary of the book
    const themes = this.extractTopThemes(bookIndex).join(', ');
    const sections = bookIndex.structure.sections.length;
    const chunks = bookIndex.chunks.length;
    
    return `${book.hebrewTitle}: ${sections} sections, ${chunks} chunks. Main themes: ${themes}`;
  }

  private generateSectionSummary(section: SectionInfo): string {
    return `${section.title}: ${section.themes.slice(0, 3).join(', ')}`;
  }

  private generateChunkSummary(chunk: Chunk): string {
    const preview = chunk.content.hebrew.substring(0, 100);
    return `${chunk.metadata.reference}: ${preview}...`;
  }

  private extractKeywords(text: string): string[] {
    // Simple keyword extraction - can be enhanced with NLP
    const words = text.split(/\s+/);
    const wordCounts = this.countOccurrences(words);
    
    // Filter out common words and return top keywords
    const stopWords = ['את', 'של', 'על', 'אל', 'מן', 'עם', 'הוא', 'היא', 'הם', 'הן'];
    
    return Object.entries(wordCounts)
      .filter(([word]) => !stopWords.includes(word) && word.length > 2)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 50)
      .map(([word]) => word);
  }

  private buildBM25Vector(text: string): Record<string, number> {
    // Build BM25 vector for lexical search
    const words = text.split(/\s+/);
    const vector: Record<string, number> = {};
    
    for (const word of words) {
      if (word.length > 2) {
        vector[word] = (vector[word] || 0) + 1;
      }
    }
    
    // Normalize
    const maxCount = Math.max(...Object.values(vector));
    for (const word in vector) {
      vector[word] = vector[word] / maxCount;
    }
    
    return vector;
  }

  private countOccurrences(items: string[]): Record<string, number> {
    const counts: Record<string, number> = {};
    for (const item of items) {
      counts[item] = (counts[item] || 0) + 1;
    }
    return counts;
  }

  private estimateIndexSize(index: any): number {
    // Estimate size in tokens
    const jsonString = JSON.stringify(index);
    return Math.ceil(jsonString.length / 4);
  }

  private async compressMasterIndex(index: MasterIndex): Promise<MasterIndex> {
    logger.warn('Compressing Master Index...');
    
    // Reduce book summaries
    for (const book of index.books) {
      book.summary = book.summary.substring(0, 100);
      book.themes = book.themes.slice(0, 5);
    }
    
    // Reduce search index
    for (const keyword in index.searchIndex) {
      index.searchIndex[keyword] = index.searchIndex[keyword].slice(0, 10);
    }
    
    return index;
  }

  private async compressBookIndex(index: BookIndex): Promise<BookIndex> {
    logger.warn(`Compressing Book Index for ${index.bookId}...`);
    
    // Reduce chunk references
    for (const chunk of index.chunks) {
      chunk.summary = chunk.summary.substring(0, 50);
      chunk.keywords = chunk.keywords.slice(0, 5);
    }
    
    // Reduce section info
    for (const section of index.structure.sections) {
      section.keywords = section.keywords.slice(0, 10);
      section.summary = section.summary.substring(0, 50);
    }
    
    return index;
  }

  private async ensureIndexDirectory(): Promise<void> {
    await fs.mkdir(this.indexDir, { recursive: true });
    await fs.mkdir(path.join(this.indexDir, 'master'), { recursive: true });
    await fs.mkdir(path.join(this.indexDir, 'books'), { recursive: true });
    await fs.mkdir(path.join(this.indexDir, 'chunks'), { recursive: true });
  }

  private async saveIndexes(
    masterIndex: MasterIndex,
    bookIndexes: Map<string, BookIndex>,
    chunkIndexes: Map<string, ChunkIndex>
  ): Promise<void> {
    // Save master index
    await fs.writeFile(
      path.join(this.indexDir, 'master', 'index.json'),
      JSON.stringify(masterIndex, null, 2)
    );
    
    // Save book indexes
    for (const [bookId, bookIndex] of bookIndexes) {
      await fs.writeFile(
        path.join(this.indexDir, 'books', `${bookId}.json`),
        JSON.stringify(bookIndex, null, 2)
      );
    }
    
    // Save chunk indexes (grouped by book)
    const chunksByBook = new Map<string, ChunkIndex[]>();
    for (const chunkIndex of chunkIndexes.values()) {
      if (!chunksByBook.has(chunkIndex.bookId)) {
        chunksByBook.set(chunkIndex.bookId, []);
      }
      chunksByBook.get(chunkIndex.bookId)!.push(chunkIndex);
    }
    
    for (const [bookId, chunks] of chunksByBook) {
      await fs.writeFile(
        path.join(this.indexDir, 'chunks', `${bookId}.json`),
        JSON.stringify(chunks, null, 2)
      );
    }
    
    logger.info(`💾 Saved all indexes to ${this.indexDir}`);
  }
}

// Export singleton
export const indexBuilder = new IndexBuilder();