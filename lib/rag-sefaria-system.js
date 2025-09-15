/**
 * Système RAG (Retrieval-Augmented Generation) avec données dynamiques Sefaria
 * Accès en temps réel à tous les textes de Rabbi Nachman
 */

const SefariaService = require('./sefaria-service');
const GeminiIntegration = require('./gemini-integration');

class RAGSefariaSystem {
  constructor(geminiApiKey) {
    this.sefaria = new SefariaService();
    this.gemini = new GeminiIntegration(geminiApiKey);
    
    // Configuration du chunking
    this.chunkConfig = {
      maxTokensPerChunk: 8000,
      overlapTokens: 500,
      contextWindow: 100000, // Fenêtre de contexte Gemini
      maxChunksPerQuery: 15
    };

    // Cache des métadonnées des livres
    this.booksMetadata = new Map();
    this.metadataInitialized = false;
  }

  /**
   * Initialise les métadonnées des livres (à appeler une fois)
   */
  async initializeMetadata() {
    if (this.metadataInitialized) return;

    console.log('Initializing Rabbi Nachman books metadata...');
    const books = await this.sefaria.getAvailableBooks();
    
    for (const book of books) {
      if (book.available) {
        const metadata = await this.sefaria.getBookMetadata(book.id);
        if (metadata) {
          this.booksMetadata.set(book.id, metadata);
          console.log(`Loaded metadata for ${book.title}`);
        }
      }
    }
    
    this.metadataInitialized = true;
    console.log(`Initialized ${this.booksMetadata.size} books`);
  }

  /**
   * Recherche RAG à 3 niveaux avec données Sefaria dynamiques
   */
  async search(query, options = {}) {
    // S'assurer que les métadonnées sont chargées
    await this.initializeMetadata();

    console.log(`RAG Search: "${query}"`);

    // Niveau 1 : Identifier les livres pertinents
    const relevantBooks = await this.searchLevel1(query);
    console.log(`Level 1: Found ${relevantBooks.length} relevant books`);

    // Niveau 2 : Rechercher dans Sefaria
    const searchResults = await this.searchLevel2(query, relevantBooks);
    console.log(`Level 2: Found ${searchResults.total} passages`);

    // Niveau 3 : Récupérer les passages complets
    const detailedPassages = await this.searchLevel3(searchResults, query);
    console.log(`Level 3: Retrieved ${detailedPassages.length} detailed passages`);

    // Optimiser les chunks pour Gemini
    const optimizedChunks = this.optimizeChunks(detailedPassages);

    return {
      query,
      books: relevantBooks,
      searchResults: searchResults.total,
      passages: optimizedChunks,
      totalTokens: this.calculateTokens(optimizedChunks),
      metadata: {
        searchTimestamp: new Date().toISOString(),
        levelsSearched: 3,
        booksSearched: relevantBooks.length,
        passagesFound: detailedPassages.length,
        chunksOptimized: optimizedChunks.length
      }
    };
  }

  /**
   * Niveau 1 : Identifier les livres pertinents basé sur la requête
   */
  async searchLevel1(query) {
    const queryLower = query.toLowerCase();
    const relevantBooks = [];

    // Mots-clés pour chaque livre
    const bookKeywords = {
      'Likutei_Moharan': ['enseignement', 'torah', 'leçon', 'likoutey', 'moharan'],
      'Likutei_Moharan,_Part_II': ['enseignement', 'torah', 'leçon', 'likoutey', 'moharan', 'tinyana'],
      'Sichot_HaRan': ['conversation', 'sichot', 'conseil', 'pratique', 'hitbodedout'],
      'Sefer_HaMiddot': ['trait', 'middot', 'caractère', 'éthique', 'comportement'],
      'Likutei_Tefilot': ['prière', 'tefilot', 'supplication', 'demande'],
      'Chayei_Moharan': ['vie', 'biographie', 'histoire', 'chayei'],
      'Sippurei_Maasiyot': ['conte', 'histoire', 'maasiyot', 'récit'],
      'Kitzur_Likutei_Moharan': ['abrégé', 'résumé', 'kitzur', 'court'],
      'Meshivat_Nefesh': ['âme', 'nefesh', 'restauration', 'guérison'],
      'Hishtapchut_HaNefesh': ['épanchement', 'âme', 'méditation', 'prière personnelle'],
      'Azamra': ['joie', 'chanson', 'azamra', 'positif'],
      'Shivchei_HaRan': ['louange', 'éloge', 'shivchei'],
      'Yemey_Moharnat': ['rabbi nathan', 'moharnat', 'disciple'],
      'Avodat_Hashem': ['service', 'divin', 'avodat', 'pratique'],
      'Alim_LiTrufa': ['guérison', 'remède', 'conseil', 'lettre']
    };

    // Scoring des livres
    for (const [bookId, metadata] of this.booksMetadata) {
      let score = 0.1; // Score de base

      // Vérifier les mots-clés
      const keywords = bookKeywords[bookId] || [];
      for (const keyword of keywords) {
        if (queryLower.includes(keyword)) {
          score += 0.3;
        }
      }

      // Bonus pour des requêtes spécifiques
      if (queryLower.includes('hitbodedout') && bookId === 'Sichot_HaRan') {
        score = 1.0;
      }
      if (queryLower.includes('prière') && bookId === 'Likutei_Tefilot') {
        score = 0.9;
      }
      if (queryLower.includes('conte') && bookId === 'Sippurei_Maasiyot') {
        score = 0.9;
      }

      // Toujours inclure Likoutey Moharan pour les questions générales
      if (bookId.includes('Likutei_Moharan') && score < 0.3) {
        score = 0.3;
      }

      if (score > 0.2) {
        relevantBooks.push({
          bookId,
          title: metadata.title,
          score: Math.min(score, 1.0)
        });
      }
    }

    // Trier par score et limiter
    return relevantBooks
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);
  }

  /**
   * Niveau 2 : Rechercher dans Sefaria avec les livres pertinents
   */
  async searchLevel2(query, relevantBooks) {
    // Si pas de livres pertinents, chercher dans tous
    if (relevantBooks.length === 0) {
      return await this.sefaria.searchTexts(query);
    }

    // Créer les filtres pour les livres sélectionnés
    const bookFilters = relevantBooks.map(book => book.bookId);
    
    // Recherche dans Sefaria
    const searchResults = await this.sefaria.searchTexts(query, {
      size: 30,
      filters: bookFilters
    });

    return searchResults;
  }

  /**
   * Niveau 3 : Récupérer les passages complets avec contexte
   */
  async searchLevel3(searchResults, query) {
    if (!searchResults.results || searchResults.results.length === 0) {
      return [];
    }

    const detailedPassages = [];
    const refsToFetch = new Set();

    // Collecter les références uniques
    for (const result of searchResults.results.slice(0, 15)) {
      // Extraire la référence principale (sans le numéro de paragraphe)
      const baseRef = result.ref.replace(/\.\d+$/, '');
      refsToFetch.add(baseRef);
    }

    // Récupérer les textes complets
    const fullTexts = await this.sefaria.getMultipleTexts(Array.from(refsToFetch));

    // Créer les passages détaillés
    for (const text of fullTexts) {
      if (text.error) continue;

      // Créer un passage pour chaque section pertinente
      if (text.text && Array.isArray(text.text)) {
        const relevantSections = [];
        
        text.text.forEach((paragraph, index) => {
          if (paragraph && this.isRelevant(paragraph, query)) {
            relevantSections.push({
              text: paragraph,
              heText: text.heText?.[index] || '',
              index
            });
          }
        });

        if (relevantSections.length > 0) {
          detailedPassages.push({
            ref: text.ref,
            bookTitle: text.bookTitle,
            sections: relevantSections,
            fullText: text.text.join('\n'),
            fullHeText: text.heText?.join('\n') || '',
            tokens: this.estimateTokens(text.text.join(' '))
          });
        }
      }
    }

    return detailedPassages;
  }

  /**
   * Vérifie si un texte est pertinent pour la requête
   */
  isRelevant(text, query) {
    const textLower = text.toLowerCase();
    const queryWords = query.toLowerCase().split(/\s+/);
    
    // Vérifier si au moins un mot de la requête est présent
    return queryWords.some(word => textLower.includes(word));
  }

  /**
   * Optimise les chunks pour respecter les limites de tokens
   */
  optimizeChunks(passages) {
    let totalTokens = 0;
    const optimized = [];

    for (const passage of passages) {
      if (totalTokens + passage.tokens <= this.chunkConfig.contextWindow) {
        optimized.push(passage);
        totalTokens += passage.tokens;
      } else {
        // Tronquer si nécessaire
        const remainingTokens = this.chunkConfig.contextWindow - totalTokens;
        if (remainingTokens > 1000) {
          const truncated = {
            ...passage,
            fullText: this.truncateText(passage.fullText, remainingTokens),
            tokens: remainingTokens,
            truncated: true
          };
          optimized.push(truncated);
        }
        break;
      }
    }

    return optimized;
  }

  /**
   * Prépare le contexte pour Gemini avec les vrais textes Sefaria
   */
  prepareGeminiContext(searchResults) {
    const context = {
      systemPrompt: `Tu es un expert des enseignements de Rabbi Nachman de Breslov.
      Tu as accès aux textes RÉELS de Sefaria.
      Utilise les passages suivants pour répondre de manière précise et profonde.
      Cite TOUJOURS les sources exactes (livre, chapitre, paragraphe).
      Réponds en français sauf pour les termes hébraïques importants.
      Base-toi UNIQUEMENT sur les textes fournis, ne pas inventer.`,
      
      passages: searchResults.passages.map(p => ({
        reference: p.ref,
        bookTitle: p.bookTitle,
        text: p.fullText,
        hebrewText: p.fullHeText,
        relevantSections: p.sections?.map(s => s.text).join('\n')
      })),
      
      query: searchResults.query,
      
      instructions: `Basé sur ces textes RÉELS de Rabbi Nachman provenant de Sefaria, réponds à: "${searchResults.query}"
      
      IMPORTANT:
      1. Utilise UNIQUEMENT les informations des textes fournis
      2. Cite les références exactes (ex: Likutei Moharan I:54)
      3. Si l'information n'est pas dans les textes, dis-le clairement
      4. Inclus des citations en hébreu quand c'est pertinent
      5. Structure ta réponse de manière claire et pédagogique`
    };
    
    return context;
  }

  /**
   * Génère une réponse avec Gemini basée sur les textes Sefaria
   */
  async generateResponse(query) {
    try {
      // Recherche RAG
      const searchResults = await this.search(query);
      
      if (searchResults.passages.length === 0) {
        return {
          response: "Je n'ai pas trouvé de passages spécifiques dans les textes de Rabbi Nachman pour répondre à votre question. Pourriez-vous reformuler ou être plus précis ?",
          citations: [],
          metadata: searchResults.metadata
        };
      }

      // Préparer le contexte pour Gemini
      const context = this.prepareGeminiContext(searchResults);
      
      // Générer la réponse avec Gemini
      const geminiResponse = await this.gemini.generateResponse(context);
      
      if (geminiResponse.success) {
        return {
          response: geminiResponse.text,
          citations: searchResults.passages.map(p => ({
            source: `${p.bookTitle} - ${p.ref}`,
            text: p.sections?.[0]?.text?.substring(0, 200) + '...'
          })),
          metadata: {
            ...searchResults.metadata,
            geminiTokensUsed: geminiResponse.tokensUsed
          }
        };
      } else {
        // Fallback : construire une réponse à partir des textes
        return this.constructFallbackResponse(searchResults);
      }
      
    } catch (error) {
      console.error('Error generating response:', error);
      throw error;
    }
  }

  /**
   * Construit une réponse de secours sans Gemini
   */
  constructFallbackResponse(searchResults) {
    if (searchResults.passages.length === 0) {
      return {
        response: "Aucun passage trouvé pour cette requête.",
        citations: [],
        metadata: searchResults.metadata
      };
    }

    let response = `D'après les textes de Rabbi Nachman sur Sefaria:\n\n`;
    
    // Prendre les 3 passages les plus pertinents
    const topPassages = searchResults.passages.slice(0, 3);
    
    for (const passage of topPassages) {
      response += `**${passage.bookTitle} (${passage.ref})**\n`;
      
      if (passage.sections && passage.sections.length > 0) {
        const section = passage.sections[0];
        response += `"${section.text.substring(0, 300)}..."\n\n`;
        
        if (section.heText) {
          response += `*En hébreu:* ${section.heText.substring(0, 150)}...\n\n`;
        }
      }
    }
    
    response += `\nCes passages montrent l'enseignement de Rabbi Nachman sur ce sujet. `;
    response += `Pour une étude plus approfondie, consultez les textes complets sur Sefaria.`;

    return {
      response,
      citations: topPassages.map(p => ({
        source: `${p.bookTitle} - ${p.ref}`,
        text: p.sections?.[0]?.text?.substring(0, 200) + '...'
      })),
      metadata: searchResults.metadata,
      fallback: true
    };
  }

  /**
   * Estime le nombre de tokens dans un texte
   */
  estimateTokens(text) {
    // Approximation : 1 token ≈ 4 caractères
    return Math.ceil(text.length / 4);
  }

  /**
   * Tronque un texte pour respecter une limite de tokens
   */
  truncateText(text, maxTokens) {
    const maxChars = maxTokens * 4;
    if (text.length <= maxChars) return text;
    return text.substring(0, maxChars) + '...';
  }

  /**
   * Calcule le total de tokens
   */
  calculateTokens(chunks) {
    return chunks.reduce((sum, chunk) => sum + chunk.tokens, 0);
  }

  /**
   * Teste la connexion complète (Sefaria + Gemini)
   */
  async testSystem() {
    console.log('Testing RAG Sefaria System...');
    
    // Test Sefaria
    const sefariaTest = await this.sefaria.testConnection();
    console.log('Sefaria:', sefariaTest);
    
    // Test d'une recherche simple
    const searchTest = await this.search('hitbodedout');
    console.log('Search test:', {
      booksFound: searchTest.books.length,
      passagesFound: searchTest.passages.length,
      totalTokens: searchTest.totalTokens
    });
    
    return {
      sefaria: sefariaTest.connected,
      search: searchTest.passages.length > 0,
      ready: sefariaTest.connected && searchTest.passages.length > 0
    };
  }
}

// Export pour Node.js
if (typeof module !== 'undefined' && module.exports) {
  module.exports = RAGSefariaSystem;
}