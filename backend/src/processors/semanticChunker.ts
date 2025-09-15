import { logger } from '../utils/logger';
import crypto from 'crypto';

export interface Chunk {
  id: string;
  bookId: string;
  sectionId: string;
  content: {
    hebrew: string;
    english?: string;
    french?: string;
  };
  metadata: {
    reference: string;
    startIndex: number;
    endIndex: number;
    tokenCount: number;
    themes: string[];
    citations: Citation[];
    context: {
      before?: string;
      after?: string;
    };
  };
  embedding?: number[];
  searchVectors?: {
    semantic?: number[];
    lexical?: Record<string, number>;
  };
}

interface Citation {
  source: string;
  text: string;
}

interface ChunkingOptions {
  maxTokens: number;
  minTokens: number;
  overlapRatio: number;
  preserveSemanticUnits: boolean;
}

export class SemanticChunker {
  private readonly DEFAULT_OPTIONS: ChunkingOptions = {
    maxTokens: 75000,   // Maximum tokens per chunk (CLAUDE.md requirement)
    minTokens: 50000,   // Minimum tokens per chunk
    overlapRatio: 0.1,  // 10% overlap between chunks
    preserveSemanticUnits: true
  };

  /**
   * Chunk a book into semantic units while respecting token limits
   */
  async chunkBook(
    book: any,
    options: Partial<ChunkingOptions> = {}
  ): Promise<Chunk[]> {
    const opts = { ...this.DEFAULT_OPTIONS, ...options };
    const chunks: Chunk[] = [];
    
    logger.info(`📄 Chunking book: ${book.title} with ${book.sections.length} sections`);
    
    // Identify semantic units (complete Torahs, chapters, stories)
    const semanticUnits = this.identifySemanticUnits(book);
    
    // Group units into chunks respecting token limits
    const groupedUnits = this.groupUnitsIntoChunks(semanticUnits, opts);
    
    // Create chunks with overlap
    for (let i = 0; i < groupedUnits.length; i++) {
      const group = groupedUnits[i];
      const chunk = this.createChunk(
        book.id,
        group,
        i,
        groupedUnits[i - 1],
        groupedUnits[i + 1],
        opts
      );
      chunks.push(chunk);
    }
    
    logger.info(`✅ Created ${chunks.length} chunks for ${book.title}`);
    
    return chunks;
  }

  /**
   * Identify semantic units within the book
   */
  private identifySemanticUnits(book: any): SemanticUnit[] {
    const units: SemanticUnit[] = [];
    
    // For Likutey Moharan - each Torah is a unit
    if (book.id.includes('likutey_moharan')) {
      return this.identifyTorahUnits(book);
    }
    
    // For Sippurei Maasiyot - each story is a unit
    if (book.id.includes('sippurei_maasiyot')) {
      return this.identifyStoryUnits(book);
    }
    
    // For prayer books - group by prayer themes
    if (book.id.includes('tefilot')) {
      return this.identifyPrayerUnits(book);
    }
    
    // Default: treat each major section as a unit
    return this.identifyDefaultUnits(book);
  }

  /**
   * Identify Torah units (for Likutey Moharan)
   */
  private identifyTorahUnits(book: any): SemanticUnit[] {
    const units: SemanticUnit[] = [];
    let currentTorah: SemanticUnit | null = null;
    
    for (const section of book.sections) {
      // Detect new Torah start (usually numbered)
      if (this.isTorahStart(section)) {
        if (currentTorah) {
          units.push(currentTorah);
        }
        currentTorah = {
          id: `torah_${units.length + 1}`,
          type: 'torah',
          sections: [section],
          tokenCount: this.estimateTokens(section.hebrewText),
          themes: this.extractThemes(section.hebrewText)
        };
      } else if (currentTorah) {
        currentTorah.sections.push(section);
        currentTorah.tokenCount += this.estimateTokens(section.hebrewText);
      }
    }
    
    if (currentTorah) {
      units.push(currentTorah);
    }
    
    return units;
  }

  /**
   * Identify story units (for Sippurei Maasiyot)
   */
  private identifyStoryUnits(book: any): SemanticUnit[] {
    const units: SemanticUnit[] = [];
    let currentStory: SemanticUnit | null = null;
    
    for (const section of book.sections) {
      // Detect story boundaries
      if (this.isStoryStart(section)) {
        if (currentStory) {
          units.push(currentStory);
        }
        currentStory = {
          id: `story_${units.length + 1}`,
          type: 'story',
          sections: [section],
          tokenCount: this.estimateTokens(section.hebrewText),
          themes: this.extractThemes(section.hebrewText)
        };
      } else if (currentStory) {
        currentStory.sections.push(section);
        currentStory.tokenCount += this.estimateTokens(section.hebrewText);
      }
    }
    
    if (currentStory) {
      units.push(currentStory);
    }
    
    return units;
  }

  /**
   * Identify prayer units (for Likutey Tefilot)
   */
  private identifyPrayerUnits(book: any): SemanticUnit[] {
    const units: SemanticUnit[] = [];
    let currentPrayer: SemanticUnit | null = null;
    
    for (const section of book.sections) {
      // Detect prayer boundaries
      if (this.isPrayerStart(section)) {
        if (currentPrayer) {
          units.push(currentPrayer);
        }
        currentPrayer = {
          id: `prayer_${units.length + 1}`,
          type: 'prayer',
          sections: [section],
          tokenCount: this.estimateTokens(section.hebrewText),
          themes: this.extractPrayerThemes(section.hebrewText)
        };
      } else if (currentPrayer) {
        currentPrayer.sections.push(section);
        currentPrayer.tokenCount += this.estimateTokens(section.hebrewText);
      }
    }
    
    if (currentPrayer) {
      units.push(currentPrayer);
    }
    
    return units;
  }

  /**
   * Default unit identification
   */
  private identifyDefaultUnits(book: any): SemanticUnit[] {
    const units: SemanticUnit[] = [];
    const sectionsPerUnit = 10; // Group every 10 sections by default
    
    for (let i = 0; i < book.sections.length; i += sectionsPerUnit) {
      const sections = book.sections.slice(i, i + sectionsPerUnit);
      const tokenCount = sections.reduce(
        (sum: number, s: any) => sum + this.estimateTokens(s.hebrewText),
        0
      );
      
      units.push({
        id: `unit_${units.length + 1}`,
        type: 'section',
        sections,
        tokenCount,
        themes: this.extractThemes(sections.map((s: any) => s.hebrewText).join(' '))
      });
    }
    
    return units;
  }

  /**
   * Group semantic units into chunks respecting token limits
   */
  private groupUnitsIntoChunks(
    units: SemanticUnit[],
    options: ChunkingOptions
  ): SemanticUnit[][] {
    const groups: SemanticUnit[][] = [];
    let currentGroup: SemanticUnit[] = [];
    let currentTokens = 0;
    
    for (const unit of units) {
      // If unit itself exceeds max tokens, split it
      if (unit.tokenCount > options.maxTokens) {
        // Save current group if not empty
        if (currentGroup.length > 0) {
          groups.push(currentGroup);
          currentGroup = [];
          currentTokens = 0;
        }
        
        // Split large unit
        const splitUnits = this.splitLargeUnit(unit, options);
        for (const splitUnit of splitUnits) {
          groups.push([splitUnit]);
        }
      }
      // If adding unit exceeds max tokens, start new group
      else if (currentTokens + unit.tokenCount > options.maxTokens) {
        if (currentGroup.length > 0) {
          groups.push(currentGroup);
        }
        currentGroup = [unit];
        currentTokens = unit.tokenCount;
      }
      // Add to current group
      else {
        currentGroup.push(unit);
        currentTokens += unit.tokenCount;
      }
    }
    
    // Add remaining group
    if (currentGroup.length > 0) {
      // If last group is too small, merge with previous
      if (currentTokens < options.minTokens && groups.length > 0) {
        const lastGroup = groups[groups.length - 1];
        const lastGroupTokens = lastGroup.reduce((sum, u) => sum + u.tokenCount, 0);
        
        if (lastGroupTokens + currentTokens <= options.maxTokens) {
          groups[groups.length - 1] = [...lastGroup, ...currentGroup];
        } else {
          groups.push(currentGroup);
        }
      } else {
        groups.push(currentGroup);
      }
    }
    
    return groups;
  }

  /**
   * Split a large semantic unit into smaller chunks
   */
  private splitLargeUnit(
    unit: SemanticUnit,
    options: ChunkingOptions
  ): SemanticUnit[] {
    const chunks: SemanticUnit[] = [];
    const targetSize = Math.floor(options.maxTokens * 0.8); // 80% of max
    
    let currentSections: any[] = [];
    let currentTokens = 0;
    
    for (const section of unit.sections) {
      const sectionTokens = this.estimateTokens(section.hebrewText);
      
      if (currentTokens + sectionTokens > targetSize && currentSections.length > 0) {
        chunks.push({
          id: `${unit.id}_part${chunks.length + 1}`,
          type: unit.type,
          sections: currentSections,
          tokenCount: currentTokens,
          themes: unit.themes
        });
        currentSections = [section];
        currentTokens = sectionTokens;
      } else {
        currentSections.push(section);
        currentTokens += sectionTokens;
      }
    }
    
    if (currentSections.length > 0) {
      chunks.push({
        id: `${unit.id}_part${chunks.length + 1}`,
        type: unit.type,
        sections: currentSections,
        tokenCount: currentTokens,
        themes: unit.themes
      });
    }
    
    return chunks;
  }

  /**
   * Create a chunk from grouped semantic units
   */
  private createChunk(
    bookId: string,
    units: SemanticUnit[],
    index: number,
    prevUnits: SemanticUnit[] | undefined,
    nextUnits: SemanticUnit[] | undefined,
    options: ChunkingOptions
  ): Chunk {
    // Combine all sections from units
    const allSections = units.flatMap(u => u.sections);
    
    // Calculate overlap context
    const overlapTokens = Math.floor(options.maxTokens * options.overlapRatio);
    const beforeContext = prevUnits ? this.getOverlapContext(prevUnits, overlapTokens, 'end') : '';
    const afterContext = nextUnits ? this.getOverlapContext(nextUnits, overlapTokens, 'start') : '';
    
    // Combine content
    const hebrewText = allSections.map(s => s.hebrewText).join('\n\n');
    const englishText = allSections.map(s => s.englishText || '').join('\n\n');
    const frenchText = allSections.map(s => s.frenchText || '').join('\n\n');
    
    // Extract themes and citations
    const themes = this.extractUniqueThemes(units);
    const citations = this.extractCitations(hebrewText);
    
    // Generate chunk ID
    const chunkId = this.generateChunkId(bookId, index, hebrewText);
    
    return {
      id: chunkId,
      bookId,
      sectionId: units[0].id,
      content: {
        hebrew: hebrewText,
        english: englishText || undefined,
        french: frenchText || undefined
      },
      metadata: {
        reference: this.generateReference(bookId, units),
        startIndex: allSections[0].index,
        endIndex: allSections[allSections.length - 1].index,
        tokenCount: units.reduce((sum, u) => sum + u.tokenCount, 0),
        themes,
        citations,
        context: {
          before: beforeContext || undefined,
          after: afterContext || undefined
        }
      }
    };
  }

  /**
   * Get overlap context from adjacent units
   */
  private getOverlapContext(
    units: SemanticUnit[],
    maxTokens: number,
    position: 'start' | 'end'
  ): string {
    const sections = units.flatMap(u => u.sections);
    const texts = sections.map(s => s.hebrewText);
    
    if (position === 'start') {
      // Get beginning of next chunk
      let context = '';
      let tokens = 0;
      
      for (const text of texts) {
        const textTokens = this.estimateTokens(text);
        if (tokens + textTokens > maxTokens) {
          // Take partial text
          const ratio = (maxTokens - tokens) / textTokens;
          const charCount = Math.floor(text.length * ratio);
          context += text.substring(0, charCount) + '...';
          break;
        }
        context += text + '\n';
        tokens += textTokens;
      }
      
      return context;
    } else {
      // Get end of previous chunk
      let context = '';
      let tokens = 0;
      
      for (let i = texts.length - 1; i >= 0; i--) {
        const text = texts[i];
        const textTokens = this.estimateTokens(text);
        
        if (tokens + textTokens > maxTokens) {
          // Take partial text
          const ratio = (maxTokens - tokens) / textTokens;
          const charCount = Math.floor(text.length * ratio);
          context = '...' + text.substring(text.length - charCount) + context;
          break;
        }
        context = text + '\n' + context;
        tokens += textTokens;
      }
      
      return context;
    }
  }

  // Helper methods for semantic detection
  
  private isTorahStart(section: any): boolean {
    // Check for Torah numbering patterns
    const patterns = [
      /^תורה\s+[א-ת]+/,  // Hebrew numbering
      /^Torah\s+\d+/,     // English numbering
      /^סימן\s+[א-ת]+/,   // Siman numbering
    ];
    
    return patterns.some(p => p.test(section.title || section.hebrewText.substring(0, 50)));
  }

  private isStoryStart(section: any): boolean {
    // Check for story markers
    const storyMarkers = [
      'מעשה',
      'היה פעם',
      'מעשה ב',
      'Once there was',
      'Story of'
    ];
    
    const text = section.hebrewText.substring(0, 100);
    return storyMarkers.some(marker => text.includes(marker));
  }

  private isPrayerStart(section: any): boolean {
    // Check for prayer markers
    const prayerMarkers = [
      'רבונו של עולם',
      'יהי רצון',
      'תפילה',
      'Master of the Universe'
    ];
    
    const text = section.hebrewText.substring(0, 100);
    return prayerMarkers.some(marker => text.includes(marker));
  }

  private extractThemes(text: string): string[] {
    // Extract key themes from text
    const themes: string[] = [];
    
    const themeKeywords = {
      'תפילה': ['תפילה', 'להתפלל', 'תפלה'],
      'שמחה': ['שמחה', 'לשמוח', 'שמח'],
      'אמונה': ['אמונה', 'להאמין', 'מאמין'],
      'תשובה': ['תשובה', 'לשוב', 'חזרה'],
      'צדיק': ['צדיק', 'צדיקים', 'הצדיק'],
      'תורה': ['תורה', 'ללמוד', 'לימוד'],
      'התבודדות': ['התבודדות', 'להתבודד', 'בודד']
    };
    
    for (const [theme, keywords] of Object.entries(themeKeywords)) {
      if (keywords.some(kw => text.includes(kw))) {
        themes.push(theme);
      }
    }
    
    return themes;
  }

  private extractPrayerThemes(text: string): string[] {
    // Extract specific prayer themes
    const themes = this.extractThemes(text);
    
    const prayerThemes = {
      'הודאה': ['תודה', 'להודות', 'מודה'],
      'בקשה': ['בקשה', 'לבקש', 'מבקש'],
      'שבח': ['שבח', 'לשבח', 'משבח'],
      'וידוי': ['וידוי', 'להתוודות', 'מתוודה']
    };
    
    for (const [theme, keywords] of Object.entries(prayerThemes)) {
      if (keywords.some(kw => text.includes(kw))) {
        themes.push(theme);
      }
    }
    
    return [...new Set(themes)];
  }

  private extractUniqueThemes(units: SemanticUnit[]): string[] {
    const allThemes = units.flatMap(u => u.themes);
    return [...new Set(allThemes)];
  }

  private extractCitations(text: string): Citation[] {
    const citations: Citation[] = [];
    
    // Pattern for biblical citations
    const patterns = [
      /\(([^)]+)\)/g,  // Text in parentheses
      /[""]([^""]+)[""]/ // Quoted text
    ];
    
    // Common citation sources
    const sources = [
      'תהלים',
      'משלי',
      'בראשית',
      'שמות',
      'ויקרא',
      'במדבר',
      'דברים'
    ];
    
    for (const pattern of patterns) {
      const matches = text.matchAll(pattern);
      for (const match of matches) {
        const citationText = match[1];
        
        // Check if it's a known source
        for (const source of sources) {
          if (citationText.includes(source)) {
            citations.push({
              source: citationText,
              text: citationText
            });
            break;
          }
        }
      }
    }
    
    return citations;
  }

  private estimateTokens(text: string): number {
    // Rough estimation: 1 token ≈ 4 characters for Hebrew
    // Adjust based on your specific tokenizer
    return Math.ceil(text.length / 4);
  }

  private generateChunkId(bookId: string, index: number, content: string): string {
    const hash = crypto.createHash('md5')
      .update(content.substring(0, 100))
      .digest('hex')
      .substring(0, 8);
    
    return `${bookId}_chunk_${index}_${hash}`;
  }

  private generateReference(bookId: string, units: SemanticUnit[]): string {
    const firstSection = units[0].sections[0];
    const lastUnit = units[units.length - 1];
    const lastSection = lastUnit.sections[lastUnit.sections.length - 1];
    
    if (firstSection.reference === lastSection.reference) {
      return firstSection.reference;
    }
    
    return `${firstSection.reference} - ${lastSection.reference}`;
  }
}

// Type definitions
interface SemanticUnit {
  id: string;
  type: 'torah' | 'story' | 'prayer' | 'section';
  sections: any[];
  tokenCount: number;
  themes: string[];
}

// Export singleton
export const semanticChunker = new SemanticChunker();