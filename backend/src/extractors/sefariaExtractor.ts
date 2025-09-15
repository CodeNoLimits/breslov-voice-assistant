import axios, { AxiosInstance } from 'axios';
import puppeteer, { Browser, Page } from 'puppeteer';
import { logger } from '../utils/logger';
import { AppError } from '../utils/errorHandler';
import fs from 'fs/promises';
import path from 'path';

interface BookInfo {
  id: string;
  title: string;
  hebrewTitle: string;
  altTitles?: string[];
  parts?: string[];
}

interface ExtractedBook {
  id: string;
  title: string;
  hebrewTitle: string;
  sections: Section[];
  metadata: {
    extractedAt: Date;
    strategy: string;
    totalTokens?: number;
  };
}

interface Section {
  id: string;
  title: string;
  hebrewText: string;
  englishText?: string;
  frenchText?: string;
  reference: string;
  index: number;
}

export class SefariaExtractor {
  private axiosClient: AxiosInstance;
  private browser: Browser | null = null;
  private dataDir: string;
  
  // Rabbi Nachman's main books - COMPLETE LIST per CLAUDE.md
  private readonly BRESLOV_BOOKS: BookInfo[] = [
    // Œuvres principales
    {
      id: 'likutey_moharan_1',
      title: 'Likutey Moharan Part I',
      hebrewTitle: 'ליקוטי מוהר"ן חלק א',
      altTitles: ['Likutei_Moharan', 'Likutei_Moharan,_Part_I', 'Likkutei_Moharan'],
      parts: ['Part_One']
    },
    {
      id: 'likutey_moharan_2',
      title: 'Likutey Moharan Part II',
      hebrewTitle: 'ליקוטי מוהר"ן חלק ב',
      altTitles: ['Likutei_Moharan,_Part_II', 'Likutei_Moharan_II'],
      parts: ['Part_Two']
    },
    {
      id: 'likutey_tefilot',
      title: 'Likutey Tefilot',
      hebrewTitle: 'ליקוטי תפילות',
      altTitles: ['Likutei_Tefilot', 'Likkutei_Tefilot', 'Likutey_Tefilot_Part_I', 'Likutey_Tefilot_Part_II']
    },
    {
      id: 'likutey_halachot',
      title: 'Likutey Halachot',
      hebrewTitle: 'ליקוטי הלכות',
      altTitles: ['Likutei_Halachot', 'Likkutei_Halachot'],
      parts: ['Orach_Chaim', 'Yoreh_Deah', 'Even_HaEzer', 'Choshen_Mishpat']
    },
    {
      id: 'sippurei_maasiyot',
      title: 'Sippurei Maasiyot',
      hebrewTitle: 'סיפורי מעשיות',
      altTitles: ['Sippurey_Maasiyot', 'Stories', 'Rabbi_Nachman\'s_Stories']
    },
    // Biographies
    {
      id: 'chayei_moharan',
      title: 'Chayei Moharan',
      hebrewTitle: 'חיי מוהר"ן',
      altTitles: ['Chayei_Moharan', 'Hayei_Moharan', 'Life_of_Moharan']
    },
    {
      id: 'shivchey_haran',
      title: 'Shivchey HaRan',
      hebrewTitle: 'שבחי הר"ן',
      altTitles: ['Shivhei_HaRan', 'Praises_of_Rabbi_Nachman', 'Shivchei_HaRan']
    },
    {
      id: 'sichot_haran',
      title: 'Sichot HaRan',
      hebrewTitle: 'שיחות הר"ן',
      altTitles: ['Sihot_HaRan', 'Conversations', 'Sichos_HaRan']
    },
    // Autres œuvres
    {
      id: 'sefer_hamidot',
      title: 'Sefer HaMidot',
      hebrewTitle: 'ספר המדות',
      altTitles: ['Sefer_HaMiddot', 'Book_of_Traits', 'Sefer_HaMidos']
    },
    {
      id: 'kitzur_likutey_moharan',
      title: 'Kitzur Likutey Moharan',
      hebrewTitle: 'קיצור ליקוטי מוהר"ן',
      altTitles: ['Kitzur_Likutei_Moharan', 'Abridged_Likutey_Moharan']
    },
    // Note: Meshivat Nefesh may not be directly available on Sefaria
    // It's often included as part of other collections
    // We'll try to fetch it, but it may need special handling
    {
      id: 'tikkun_haklali',
      title: 'Tikkun HaKlali',
      hebrewTitle: 'תיקון הכללי',
      altTitles: ['Tikkun_HaKlali', 'General_Remedy', 'Ten_Psalms']
    },
    {
      id: 'likutey_etzot',
      title: 'Likutey Etzot',
      hebrewTitle: 'ליקוטי עצות',
      altTitles: ['Likutei_Etzot', 'Collected_Advice', 'Likutey_Eitzot']
    }
  ];

  constructor() {
    this.axiosClient = axios.create({
      baseURL: 'https://www.sefaria.org/api',
      timeout: 30000,
      headers: {
        'User-Agent': 'RabbiNachmanVoiceBot/1.0 (Educational)',
      }
    });
    
    this.dataDir = path.join(process.cwd(), 'data', 'extracted');
  }

  /**
   * Extract all Rabbi Nachman books using progressive fallback strategy
   */
  async extractAllBooks(): Promise<ExtractedBook[]> {
    await this.ensureDataDirectory();
    const results: ExtractedBook[] = [];
    
    for (const bookInfo of this.BRESLOV_BOOKS) {
      logger.info(`📚 Extracting ${bookInfo.hebrewTitle} (${bookInfo.title})...`);
      
      try {
        // Check if already extracted
        const cached = await this.loadCachedBook(bookInfo.id);
        if (cached) {
          logger.info(`✅ Found cached: ${bookInfo.id}`);
          results.push(cached);
          continue;
        }
        
        // Try extraction strategies
        const book = await this.extractBook(bookInfo);
        if (book) {
          await this.saveBook(book);
          results.push(book);
          logger.info(`✅ Successfully extracted: ${bookInfo.id}`);
        } else {
          logger.error(`❌ Failed to extract: ${bookInfo.id}`);
        }
      } catch (error) {
        logger.error(`❌ Error extracting ${bookInfo.id}:`, error);
      }
      
      // Rate limiting between books
      await this.delay(2000);
    }
    
    return results;
  }

  /**
   * Extract a single book using fallback strategies - NO LOCAL BACKUP (CLAUDE.md requirement)
   */
  private async extractBook(bookInfo: BookInfo): Promise<ExtractedBook | null> {
    const strategies = [
      () => this.tryDirectAPI(bookInfo),
      () => this.tryBatchAPI(bookInfo),
      () => this.tryV2API(bookInfo),
      () => this.tryGraphQLAPI(bookInfo),
      () => this.tryJSONLD(bookInfo),
      () => this.tryWebScraping(bookInfo)
      // NO LOCAL BACKUP - Pure fetching only per CLAUDE.md
    ];
    
    for (let i = 0; i < strategies.length; i++) {
      try {
        logger.debug(`Trying strategy ${i + 1}/${strategies.length} for ${bookInfo.id}`);
        const result = await strategies[i]();
        if (result && result.sections.length > 0) {
          result.metadata.strategy = `Strategy${i + 1}`;
          return result;
        }
      } catch (error) {
        logger.debug(`Strategy ${i + 1} failed for ${bookInfo.id}:`, error);
        continue;
      }
    }
    
    return null;
  }

  /**
   * Strategy 1: Try direct API v3
   */
  private async tryDirectAPI(bookInfo: BookInfo): Promise<ExtractedBook | null> {
    // Try each alternative title
    const titles = [bookInfo.title, ...(bookInfo.altTitles || [])];
    
    for (const title of titles) {
      try {
        const url = `/v3/texts/${encodeURIComponent(title)}`;
        const response = await this.axiosClient.get(url, {
          params: {
            context: 1,
            commentary: 0,
            pad: 0
          }
        });
        
        if (response.data && response.data.text) {
          return this.parseAPIResponse(bookInfo, response.data);
        }
      } catch (error) {
        continue;
      }
    }
    
    throw new Error('Direct API failed');
  }

  /**
   * Strategy 2: Try batch API (section by section)
   */
  private async tryBatchAPI(bookInfo: BookInfo): Promise<ExtractedBook | null> {
    const titles = [bookInfo.title, ...(bookInfo.altTitles || [])];
    
    for (const title of titles) {
      try {
        // Get index first
        const indexUrl = `/v3/index/${encodeURIComponent(title)}`;
        const indexResponse = await this.axiosClient.get(indexUrl);
        
        if (!indexResponse.data || !indexResponse.data.schema) {
          continue;
        }
        
        const sections: Section[] = [];
        const sectionRefs = this.extractSectionRefs(indexResponse.data.schema);
        
        // Fetch each section
        for (const ref of sectionRefs) {
          try {
            const sectionUrl = `/v3/texts/${encodeURIComponent(title)}.${ref}`;
            const sectionResponse = await this.axiosClient.get(sectionUrl);
            
            if (sectionResponse.data) {
              const section = this.parseSectionResponse(
                bookInfo.id,
                ref,
                sectionResponse.data
              );
              if (section) {
                sections.push(section);
              }
            }
            
            await this.delay(500); // Rate limiting
          } catch (error) {
            logger.debug(`Failed to fetch section ${ref}:`, error);
          }
        }
        
        if (sections.length > 0) {
          return {
            id: bookInfo.id,
            title: bookInfo.title,
            hebrewTitle: bookInfo.hebrewTitle,
            sections,
            metadata: {
              extractedAt: new Date(),
              strategy: 'BatchAPI'
            }
          };
        }
      } catch (error) {
        continue;
      }
    }
    
    throw new Error('Batch API failed');
  }

  /**
   * Strategy 3: Try older v2 API
   */
  private async tryV2API(bookInfo: BookInfo): Promise<ExtractedBook | null> {
    const titles = [bookInfo.title, ...(bookInfo.altTitles || [])];
    
    for (const title of titles) {
      try {
        const url = `/texts/${encodeURIComponent(title)}`;
        const response = await this.axiosClient.get(url);
        
        if (response.data) {
          return this.parseV2Response(bookInfo, response.data);
        }
      } catch (error) {
        continue;
      }
    }
    
    throw new Error('V2 API failed');
  }

  /**
   * Strategy 4: Web scraping with Puppeteer
   */
  private async tryWebScraping(bookInfo: BookInfo): Promise<ExtractedBook | null> {
    if (!this.browser) {
      this.browser = await puppeteer.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
      });
    }
    
    const page = await this.browser.newPage();
    await page.setUserAgent('RabbiNachmanVoiceBot/1.0 (Educational; Contact: dev@example.com)');
    
    const titles = [bookInfo.title.replace(/ /g, '_'), ...(bookInfo.altTitles || [])];
    
    for (const title of titles) {
      try {
        const url = `https://www.sefaria.org/${title}`;
        await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
        
        // Wait for content to load
        await page.waitForSelector('.segment', { timeout: 5000 });
        
        // Extract content
        const sections = await page.evaluate(() => {
          const segments = document.querySelectorAll('.segment');
          const results: any[] = [];
          
          segments.forEach((segment, index) => {
            const hebrew = segment.querySelector('.he')?.textContent?.trim();
            const english = segment.querySelector('.en')?.textContent?.trim();
            const ref = segment.getAttribute('data-ref');
            
            if (hebrew) {
              results.push({
                id: `section_${index}`,
                hebrewText: hebrew,
                englishText: english,
                reference: ref || `Section ${index + 1}`,
                index
              });
            }
          });
          
          return results;
        });
        
        await page.close();
        
        if (sections.length > 0) {
          return {
            id: bookInfo.id,
            title: bookInfo.title,
            hebrewTitle: bookInfo.hebrewTitle,
            sections,
            metadata: {
              extractedAt: new Date(),
              strategy: 'WebScraping'
            }
          };
        }
      } catch (error) {
        logger.debug(`Scraping failed for ${title}:`, error);
      }
    }
    
    await page.close();
    throw new Error('Web scraping failed');
  }

  /**
   * Strategy 4: Try GraphQL API
   */
  private async tryGraphQLAPI(bookInfo: BookInfo): Promise<ExtractedBook | null> {
    const titles = [bookInfo.title, ...(bookInfo.altTitles || [])];
    
    for (const title of titles) {
      try {
        const query = `
          query GetText($ref: String!) {
            text(ref: $ref) {
              ref
              heText
              text
              sections
              book
            }
          }
        `;
        
        const response = await axios.post('https://www.sefaria.org/graphql', {
          query,
          variables: { ref: title }
        });
        
        if (response.data?.data?.text) {
          return this.parseGraphQLResponse(bookInfo, response.data.data.text);
        }
      } catch (error) {
        continue;
      }
    }
    
    throw new Error('GraphQL API failed');
  }

  /**
   * Strategy 5: Try JSON-LD extraction from HTML
   */
  private async tryJSONLD(bookInfo: BookInfo): Promise<ExtractedBook | null> {
    const titles = [bookInfo.title.replace(/ /g, '_'), ...(bookInfo.altTitles || [])];
    
    for (const title of titles) {
      try {
        const url = `https://www.sefaria.org/${title}`;
        const response = await axios.get(url);
        const html = response.data;
        
        // Extract JSON-LD
        const jsonLdMatch = html.match(/<script type="application\/ld\+json">(.*?)<\/script>/s);
        if (jsonLdMatch) {
          const jsonLd = JSON.parse(jsonLdMatch[1]);
          if (jsonLd && jsonLd.text) {
            return this.parseJSONLDResponse(bookInfo, jsonLd);
          }
        }
      } catch (error) {
        continue;
      }
    }
    
    throw new Error('JSON-LD extraction failed');
  }

  // Helper methods
  
  private parseAPIResponse(bookInfo: BookInfo, data: any): ExtractedBook {
    const sections: Section[] = [];
    
    if (Array.isArray(data.text)) {
      data.text.forEach((text: any, index: number) => {
        if (text) {
          sections.push({
            id: `section_${index}`,
            title: `Section ${index + 1}`,
            hebrewText: typeof text === 'string' ? text : text.he || '',
            englishText: text.en || '',
            reference: data.ref || `${bookInfo.title} ${index + 1}`,
            index
          });
        }
      });
    }
    
    return {
      id: bookInfo.id,
      title: bookInfo.title,
      hebrewTitle: bookInfo.hebrewTitle,
      sections,
      metadata: {
        extractedAt: new Date(),
        strategy: 'DirectAPI'
      }
    };
  }

  private parseV2Response(bookInfo: BookInfo, data: any): ExtractedBook {
    const sections: Section[] = [];
    
    if (data.he && Array.isArray(data.he)) {
      data.he.forEach((heText: any, index: number) => {
        if (heText) {
          sections.push({
            id: `section_${index}`,
            title: `Section ${index + 1}`,
            hebrewText: Array.isArray(heText) ? heText.join(' ') : heText,
            englishText: data.text?.[index] ? 
              (Array.isArray(data.text[index]) ? data.text[index].join(' ') : data.text[index]) : '',
            reference: `${bookInfo.title} ${index + 1}`,
            index
          });
        }
      });
    }
    
    return {
      id: bookInfo.id,
      title: bookInfo.title,
      hebrewTitle: bookInfo.hebrewTitle,
      sections,
      metadata: {
        extractedAt: new Date(),
        strategy: 'V2API'
      }
    };
  }

  private parseGraphQLResponse(bookInfo: BookInfo, data: any): ExtractedBook {
    const sections: Section[] = [];
    
    if (data.heText && Array.isArray(data.heText)) {
      data.heText.forEach((heText: string, index: number) => {
        if (heText) {
          sections.push({
            id: `section_${index}`,
            title: `Section ${index + 1}`,
            hebrewText: heText,
            englishText: data.text?.[index] || '',
            reference: data.ref || `${bookInfo.title} ${index + 1}`,
            index
          });
        }
      });
    }
    
    return {
      id: bookInfo.id,
      title: bookInfo.title,
      hebrewTitle: bookInfo.hebrewTitle,
      sections,
      metadata: {
        extractedAt: new Date(),
        strategy: 'GraphQL'
      }
    };
  }

  private parseJSONLDResponse(bookInfo: BookInfo, data: any): ExtractedBook {
    const sections: Section[] = [];
    
    if (data.text) {
      const texts = Array.isArray(data.text) ? data.text : [data.text];
      texts.forEach((text: any, index: number) => {
        sections.push({
          id: `section_${index}`,
          title: text.name || `Section ${index + 1}`,
          hebrewText: text.inLanguage === 'he' ? text.text : '',
          englishText: text.inLanguage === 'en' ? text.text : '',
          reference: text.identifier || `${bookInfo.title} ${index + 1}`,
          index
        });
      });
    }
    
    return {
      id: bookInfo.id,
      title: bookInfo.title,
      hebrewTitle: bookInfo.hebrewTitle,
      sections,
      metadata: {
        extractedAt: new Date(),
        strategy: 'JSON-LD'
      }
    };
  }

  private parseSectionResponse(bookId: string, ref: string, data: any): Section | null {
    if (!data.he && !data.text) return null;
    
    return {
      id: `${bookId}_${ref.replace(/\./g, '_')}`,
      title: ref,
      hebrewText: Array.isArray(data.he) ? data.he.join(' ') : (data.he || ''),
      englishText: Array.isArray(data.text) ? data.text.join(' ') : (data.text || ''),
      reference: data.ref || ref,
      index: parseInt(ref.split('.')[0]) || 0
    };
  }

  private extractSectionRefs(schema: any): string[] {
    const refs: string[] = [];
    
    // Handle different schema structures
    if (schema.lengths) {
      schema.lengths.forEach((length: number, i: number) => {
        for (let j = 1; j <= length; j++) {
          refs.push(`${i + 1}.${j}`);
        }
      });
    } else if (schema.chapters) {
      for (let i = 1; i <= schema.chapters; i++) {
        refs.push(String(i));
      }
    }
    
    return refs;
  }

  private async ensureDataDirectory(): Promise<void> {
    await fs.mkdir(this.dataDir, { recursive: true });
    await fs.mkdir(path.join(this.dataDir, 'backups'), { recursive: true });
  }

  private async saveBook(book: ExtractedBook): Promise<void> {
    const filePath = path.join(this.dataDir, `${book.id}.json`);
    await fs.writeFile(filePath, JSON.stringify(book, null, 2));
  }

  private async loadCachedBook(bookId: string): Promise<ExtractedBook | null> {
    try {
      const filePath = path.join(this.dataDir, `${bookId}.json`);
      const data = await fs.readFile(filePath, 'utf-8');
      return JSON.parse(data);
    } catch (error) {
      return null;
    }
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async cleanup(): Promise<void> {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
  }
}

// Export singleton instance
export const sefariaExtractor = new SefariaExtractor();