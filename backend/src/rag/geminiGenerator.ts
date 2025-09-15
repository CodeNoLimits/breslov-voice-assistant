import { GoogleGenerativeAI, GenerativeModel, Content } from '@google/generative-ai';
import { logger } from '../utils/logger';
import { Chunk } from '../processors/semanticChunker';
import { RouteResult } from './hierarchicalRouter';

export interface GeneratedResponse {
  text: string;
  citations: Citation[];
  confidence: number;
  language: string;
  audioOptimized: string;  // Version optimized for TTS
  metadata: {
    model: string;
    tokensUsed: number;
    generationTime: number;
    temperature: number;
  };
}

interface Citation {
  text: string;
  source: string;
  bookId: string;
  reference: string;
}

interface GenerationOptions {
  language?: 'french' | 'hebrew' | 'english';
  maxLength?: number;
  temperature?: number;
  includeHebrew?: boolean;
  streamResponse?: boolean;
}

export class GeminiGenerator {
  private genAI: GoogleGenerativeAI;
  private model: GenerativeModel;
  
  constructor() {
    if (!process.env.GEMINI_API_KEY) {
      throw new Error('GEMINI_API_KEY is required');
    }
    
    this.genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    
    // Use Gemini 1.5 Pro for maximum context window
    this.model = this.genAI.getGenerativeModel({ 
      model: 'gemini-1.5-pro',
      generationConfig: {
        temperature: 0.7,
        topK: 40,
        topP: 0.95,
        maxOutputTokens: 2048,
      }
    });
    
    logger.info('✅ Gemini 1.5 Pro initialized');
  }
  
  /**
   * Generate a response based on routed chunks
   */
  async generate(
    query: string,
    routeResult: RouteResult,
    options: GenerationOptions = {}
  ): Promise<GeneratedResponse> {
    const startTime = Date.now();
    
    const opts = {
      language: 'french' as const,
      maxLength: 500,
      temperature: 0.7,
      includeHebrew: true,
      streamResponse: false,
      ...options
    };
    
    logger.info(`🤖 Generating response for: "${query.substring(0, 50)}..."`);
    
    try {
      // Build context from chunks
      const context = this.buildContext(routeResult.chunks, opts);
      
      // Create prompt
      const prompt = this.createPrompt(query, context, opts);
      
      // Generate response
      const result = await this.model.generateContent({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: opts.temperature,
          maxOutputTokens: opts.maxLength * 4, // Approximate tokens
        }
      });
      
      const response = result.response;
      const responseText = response.text();
      
      // Extract citations from response
      const citations = this.extractCitations(responseText, routeResult.chunks);
      
      // Create audio-optimized version
      const audioOptimized = this.optimizeForAudio(responseText, opts.language);
      
      const generationTime = Date.now() - startTime;
      
      logger.info(`✅ Response generated in ${generationTime}ms`);
      
      return {
        text: responseText,
        citations,
        confidence: routeResult.confidence,
        language: opts.language,
        audioOptimized,
        metadata: {
          model: 'gemini-1.5-pro',
          tokensUsed: routeResult.totalTokens,
          generationTime,
          temperature: opts.temperature
        }
      };
      
    } catch (error) {
      logger.error('Generation error:', error);
      throw error;
    }
  }
  
  /**
   * Stream response generation for real-time output
   */
  async *generateStream(
    query: string,
    routeResult: RouteResult,
    options: GenerationOptions = {}
  ): AsyncGenerator<string, void, unknown> {
    const opts = {
      language: 'french' as const,
      maxLength: 500,
      temperature: 0.7,
      includeHebrew: true,
      ...options
    };
    
    logger.info(`🤖 Starting streamed generation...`);
    
    try {
      // Build context from chunks
      const context = this.buildContext(routeResult.chunks, opts);
      
      // Create prompt
      const prompt = this.createPrompt(query, context, opts);
      
      // Stream generation
      const result = await this.model.generateContentStream({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: opts.temperature,
          maxOutputTokens: opts.maxLength * 4,
        }
      });
      
      for await (const chunk of result.stream) {
        const chunkText = chunk.text();
        if (chunkText) {
          yield chunkText;
        }
      }
      
    } catch (error) {
      logger.error('Stream generation error:', error);
      throw error;
    }
  }
  
  /**
   * Build context from chunks
   */
  private buildContext(chunks: Chunk[], options: any): string {
    if (chunks.length === 0) {
      return "Aucun texte pertinent trouvé dans les enseignements de Rabbi Nachman.";
    }
    
    const contextParts: string[] = [];
    
    for (const chunk of chunks) {
      const reference = chunk.metadata.reference;
      let content = '';
      
      // Add Hebrew if requested
      if (options.includeHebrew && chunk.content.hebrew) {
        content += `[Hébreu - ${reference}]\n${chunk.content.hebrew}\n\n`;
      }
      
      // Add translation based on language
      if (options.language === 'french' && chunk.content.french) {
        content += `[Français - ${reference}]\n${chunk.content.french}\n\n`;
      } else if (options.language === 'english' && chunk.content.english) {
        content += `[English - ${reference}]\n${chunk.content.english}\n\n`;
      } else if (chunk.content.hebrew && !options.includeHebrew) {
        // Fallback to Hebrew if no translation available
        content += `[${reference}]\n${chunk.content.hebrew}\n\n`;
      }
      
      contextParts.push(content);
    }
    
    return contextParts.join('\n---\n');
  }
  
  /**
   * Create the prompt for Gemini
   */
  private createPrompt(
    query: string,
    context: string,
    options: any
  ): string {
    const languageInstructions = {
      french: "Réponds en français",
      hebrew: "תשובה בעברית",
      english: "Answer in English"
    };
    
    const prompt = `Tu es un expert des enseignements de Rabbi Nachman de Breslov. Tu as accès aux textes originaux de ses œuvres.

QUESTION DE L'UTILISATEUR :
${query}

CONTEXTE DES ENSEIGNEMENTS DE RABBI NACHMAN :
${context}

INSTRUCTIONS :
1. ${languageInstructions[options.language]}
2. Base ta réponse UNIQUEMENT sur les textes fournis
3. Cite les sources exactes (livre, chapitre, section) entre [crochets]
4. Maintiens la fidélité spirituelle et la profondeur du message
5. Limite ta réponse à ${options.maxLength} mots maximum
6. Si tu cites en hébreu, fournis toujours la traduction
7. Structure ta réponse de manière claire et accessible
8. Si le contexte ne contient pas d'information pertinente, dis-le clairement

FORMAT DE RÉPONSE :
- Introduction brève
- Enseignement principal avec citations
- Application pratique si pertinente
- Conclusion spirituelle

Rappel : Tu es la voix des enseignements de Rabbi Nachman. Transmets sa sagesse avec respect et clarté.`;
    
    return prompt;
  }
  
  /**
   * Extract citations from generated text
   */
  private extractCitations(text: string, chunks: Chunk[]): Citation[] {
    const citations: Citation[] = [];
    
    // Pattern to match citations in brackets
    const citationPattern = /\[([^\]]+)\]/g;
    const matches = text.matchAll(citationPattern);
    
    for (const match of matches) {
      const citationText = match[1];
      
      // Try to match with chunk references
      const matchingChunk = chunks.find(chunk => 
        chunk.metadata.reference.includes(citationText) ||
        citationText.includes(chunk.metadata.reference)
      );
      
      if (matchingChunk) {
        citations.push({
          text: citationText,
          source: this.identifySource(matchingChunk.bookId),
          bookId: matchingChunk.bookId,
          reference: matchingChunk.metadata.reference
        });
      } else {
        // Generic citation without exact match
        citations.push({
          text: citationText,
          source: 'Rabbi Nachman',
          bookId: '',
          reference: citationText
        });
      }
    }
    
    return citations;
  }
  
  /**
   * Optimize text for audio synthesis
   */
  private optimizeForAudio(text: string, language: string): string {
    let optimized = text;
    
    // Remove citations for cleaner audio
    optimized = optimized.replace(/\[[^\]]+\]/g, '');
    
    // Replace Hebrew characters if not Hebrew output
    if (language !== 'hebrew') {
      optimized = optimized.replace(/[\u0590-\u05FF]+/g, '');
    }
    
    // Clean up punctuation for better flow
    optimized = optimized.replace(/\s+/g, ' ');
    optimized = optimized.replace(/\.\.\./g, '.');
    optimized = optimized.replace(/\n\n+/g, '\n');
    
    // Add pauses for better rhythm
    optimized = optimized.replace(/\./g, '. ');
    optimized = optimized.replace(/,/g, ', ');
    optimized = optimized.replace(/:/g, ': ');
    
    // Trim and clean
    optimized = optimized.trim();
    
    return optimized;
  }
  
  /**
   * Identify source book name
   */
  private identifySource(bookId: string): string {
    const bookNames: Record<string, string> = {
      'likutey_moharan_1': 'Likoutey Moharan I',
      'likutey_moharan_2': 'Likoutey Moharan II',
      'chayei_moharan': 'Chayei Moharan',
      'likutey_tefilot': 'Likoutey Tefilot',
      'sippurei_maasiyot': 'Sippourei Maasiyot',
      'shivchey_haran': 'Shivchey HaRan',
      'sichot_haran': 'Sichot HaRan',
      'sefer_hamidot': 'Sefer HaMidot',
      'likutey_etzot': 'Likoutey Etzot'
    };
    
    return bookNames[bookId] || 'Rabbi Nachman';
  }
  
  /**
   * Generate a summary of multiple texts
   */
  async generateSummary(
    chunks: Chunk[],
    maxLength: number = 200
  ): Promise<string> {
    if (chunks.length === 0) return '';
    
    const context = chunks.map(chunk => 
      `${chunk.metadata.reference}: ${chunk.content.hebrew.substring(0, 200)}...`
    ).join('\n\n');
    
    const prompt = `Résume les enseignements suivants de Rabbi Nachman en ${maxLength} mots maximum :

${context}

Fournis un résumé concis qui capture l'essence spirituelle des textes.`;
    
    try {
      const result = await this.model.generateContent({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.5,
          maxOutputTokens: maxLength * 4,
        }
      });
      
      return result.response.text();
    } catch (error) {
      logger.error('Summary generation error:', error);
      return '';
    }
  }
  
  /**
   * Generate thematic insights
   */
  async generateThematicInsights(
    theme: string,
    chunks: Chunk[]
  ): Promise<string> {
    const relevantChunks = chunks.filter(chunk => 
      chunk.metadata.themes.includes(theme)
    );
    
    if (relevantChunks.length === 0) {
      return `Aucun enseignement trouvé sur le thème "${theme}".`;
    }
    
    const context = this.buildContext(relevantChunks.slice(0, 5), {
      language: 'french',
      includeHebrew: false
    });
    
    const prompt = `Analyse les enseignements de Rabbi Nachman sur le thème "${theme}" :

${context}

Fournis une analyse profonde en 300 mots maximum qui :
1. Explique la vision unique de Rabbi Nachman sur ce thème
2. Montre les connections entre les différents enseignements
3. Offre une application pratique pour aujourd'hui`;
    
    try {
      const result = await this.model.generateContent({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.7,
          maxOutputTokens: 1200,
        }
      });
      
      return result.response.text();
    } catch (error) {
      logger.error('Thematic insights generation error:', error);
      return '';
    }
  }
}