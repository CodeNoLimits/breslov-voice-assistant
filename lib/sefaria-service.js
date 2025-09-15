/**
 * Service d'intégration avec l'API Sefaria pour Rabbi Nachman Voice
 * Accès RÉEL à tous les textes de Rabbi Nachman depuis Sefaria
 */

const https = require('https');

class SefariaService {
  constructor() {
    this.baseUrl = 'www.sefaria.org';
    this.cache = new Map();
    this.cacheTimeout = 1000 * 60 * 30; // 30 minutes
    
    // Liste complète des livres de Rabbi Nachman sur Sefaria
    this.rabbiNachmanBooks = [
      'Likutei_Moharan',
      'Likutei_Moharan,_Part_II',
      'Sichot_HaRan',
      'Sefer_HaMiddot',
      'Likutei_Tefilot',
      'Chayei_Moharan',
      'Sippurei_Maasiyot',
      'Kitzur_Likutei_Moharan',
      'Meshivat_Nefesh',
      'Hishtapchut_HaNefesh',
      'Azamra',
      'Shivchei_HaRan',
      'Yemey_Moharnat',
      'Avodat_Hashem',
      'Alim_LiTrufa'
    ];

    // Mapping des noms pour l'affichage
    this.bookNames = {
      'Likutei_Moharan': 'Likoutey Moharan I',
      'Likutei_Moharan,_Part_II': 'Likoutey Moharan II',
      'Sichot_HaRan': 'Sichot HaRan - Conversations',
      'Sefer_HaMiddot': 'Sefer HaMiddot - Livre des Traits',
      'Likutei_Tefilot': 'Likoutey Tefilot - Recueil de Prières',
      'Chayei_Moharan': 'Chayei Moharan - Vie de Rabbi Nachman',
      'Sippurei_Maasiyot': 'Sippurei Maasiyot - Contes',
      'Kitzur_Likutei_Moharan': 'Abrégé du Likoutey Moharan',
      'Meshivat_Nefesh': 'Meshivat Nefesh - Restauration de l\'Âme',
      'Hishtapchut_HaNefesh': 'Hishtapchut HaNefesh - Épanchement de l\'Âme',
      'Azamra': 'Azamra - Je Chanterai',
      'Shivchei_HaRan': 'Shivchei HaRan - Louanges de Rabbi Nachman',
      'Yemey_Moharnat': 'Yemey Moharnat - Jours de Rabbi Nathan',
      'Avodat_Hashem': 'Avodat Hashem - Service Divin',
      'Alim_LiTrufa': 'Alim LiTrufa - Feuilles de Guérison'
    };
  }

  /**
   * Effectue une requête HTTP vers l'API Sefaria
   */
  async makeRequest(path) {
    // Vérifier le cache d'abord
    const cacheKey = path;
    const cached = this.cache.get(cacheKey);
    
    if (cached && Date.now() - cached.timestamp < this.cacheTimeout) {
      console.log(`Cache hit for: ${path}`);
      return cached.data;
    }

    return new Promise((resolve, reject) => {
      const options = {
        hostname: this.baseUrl,
        path: path,
        method: 'GET',
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'Rabbi-Nachman-Voice/1.0'
        }
      };

      const req = https.request(options, (res) => {
        let data = '';

        res.on('data', (chunk) => {
          data += chunk;
        });

        res.on('end', () => {
          try {
            const parsed = JSON.parse(data);
            
            // Mettre en cache
            this.cache.set(cacheKey, {
              data: parsed,
              timestamp: Date.now()
            });
            
            resolve(parsed);
          } catch (error) {
            reject(new Error(`Failed to parse Sefaria response: ${error.message}`));
          }
        });
      });

      req.on('error', (error) => {
        reject(error);
      });

      req.end();
    });
  }

  /**
   * Récupère la liste de tous les livres de Rabbi Nachman disponibles
   */
  async getAvailableBooks() {
    const books = [];
    
    for (const bookId of this.rabbiNachmanBooks) {
      try {
        const index = await this.getBookIndex(bookId);
        if (index) {
          books.push({
            id: bookId,
            title: this.bookNames[bookId] || bookId,
            hebrewTitle: index.heTitle || index.title,
            categories: index.categories || [],
            available: true
          });
        }
      } catch (error) {
        console.error(`Failed to get index for ${bookId}:`, error);
        books.push({
          id: bookId,
          title: this.bookNames[bookId] || bookId,
          available: false
        });
      }
    }
    
    return books;
  }

  /**
   * Récupère l'index d'un livre (structure et métadonnées)
   */
  async getBookIndex(bookId) {
    try {
      const path = `/api/index/${bookId}`;
      return await this.makeRequest(path);
    } catch (error) {
      console.error(`Error getting index for ${bookId}:`, error);
      return null;
    }
  }

  /**
   * Récupère un texte spécifique
   * @param {string} ref - Référence du texte (ex: "Likutei_Moharan.1.1")
   * @param {boolean} withCommentary - Inclure les commentaires
   */
  async getText(ref, withCommentary = false) {
    try {
      const path = `/api/texts/${ref}?commentary=${withCommentary ? 1 : 0}`;
      const response = await this.makeRequest(path);
      
      return {
        ref: response.ref,
        heRef: response.heRef,
        text: response.text,
        heText: response.he,
        bookTitle: response.indexTitle,
        sectionRef: response.sectionRef,
        next: response.next,
        prev: response.prev,
        commentary: response.commentary || []
      };
    } catch (error) {
      console.error(`Error getting text ${ref}:`, error);
      throw error;
    }
  }

  /**
   * Recherche dans tous les textes de Rabbi Nachman
   * @param {string} query - Requête de recherche
   * @param {Object} options - Options de recherche
   */
  async searchTexts(query, options = {}) {
    const {
      size = 20,
      page = 0,
      filters = [],
      exact = false
    } = options;

    try {
      // Construire les filtres pour limiter aux livres de Rabbi Nachman
      const bookFilters = this.rabbiNachmanBooks.map(book => 
        `path:"${book.replace(/_/g, ' ')}"`
      ).join(' OR ');

      const searchParams = new URLSearchParams({
        q: query,
        size: size,
        from: page * size,
        filters: bookFilters,
        exact: exact
      });

      const path = `/api/search/text?${searchParams.toString()}`;
      const response = await this.makeRequest(path);
      
      if (response.error) {
        throw new Error(response.error);
      }

      // Formater les résultats
      const results = response.hits?.hits?.map(hit => ({
        ref: hit._source.ref,
        text: hit._source.exact || hit._source.text,
        heText: hit._source.he || hit._source.heText,
        score: hit._score,
        highlight: hit.highlight?.exact || hit.highlight?.text || []
      })) || [];

      return {
        query,
        total: response.hits?.total?.value || 0,
        results,
        page,
        size
      };
    } catch (error) {
      console.error(`Search error for "${query}":`, error);
      
      // Fallback : recherche simple dans les textes en cache
      return this.fallbackSearch(query);
    }
  }

  /**
   * Recherche de secours dans les textes en cache
   */
  async fallbackSearch(query) {
    const results = [];
    const queryLower = query.toLowerCase();
    
    // Rechercher dans le cache
    for (const [key, cached] of this.cache.entries()) {
      if (key.includes('/api/texts/')) {
        const data = cached.data;
        
        if (data.text && Array.isArray(data.text)) {
          data.text.forEach((paragraph, index) => {
            if (paragraph && paragraph.toLowerCase().includes(queryLower)) {
              results.push({
                ref: `${data.ref}.${index + 1}`,
                text: paragraph,
                heText: data.he?.[index] || '',
                score: 1.0
              });
            }
          });
        }
      }
    }
    
    return {
      query,
      total: results.length,
      results: results.slice(0, 20),
      page: 0,
      size: 20,
      fallback: true
    };
  }

  /**
   * Récupère un chapitre entier
   */
  async getChapter(bookId, chapter) {
    const ref = `${bookId}.${chapter}`;
    return await this.getText(ref);
  }

  /**
   * Récupère plusieurs textes en parallèle (avec limitation)
   */
  async getMultipleTexts(refs, maxConcurrent = 3) {
    const results = [];
    
    for (let i = 0; i < refs.length; i += maxConcurrent) {
      const batch = refs.slice(i, i + maxConcurrent);
      const batchResults = await Promise.all(
        batch.map(ref => this.getText(ref).catch(err => ({
          ref,
          error: err.message
        })))
      );
      results.push(...batchResults);
      
      // Petit délai entre les batches pour ne pas surcharger l'API
      if (i + maxConcurrent < refs.length) {
        await new Promise(resolve => setTimeout(resolve, 200));
      }
    }
    
    return results;
  }

  /**
   * Récupère les métadonnées d'un livre pour le système RAG
   */
  async getBookMetadata(bookId) {
    const index = await this.getBookIndex(bookId);
    
    if (!index) {
      return null;
    }

    // Calculer le nombre total de sections et de paragraphes
    let totalSections = 0;
    let totalParagraphs = 0;
    
    if (index.schema) {
      // Parser le schéma pour comprendre la structure
      const processSchema = (node) => {
        if (node.lengths) {
          totalSections += node.lengths.length;
          totalParagraphs += node.lengths.reduce((a, b) => a + b, 0);
        }
        if (node.nodes) {
          node.nodes.forEach(processSchema);
        }
      };
      
      processSchema(index.schema);
    }

    return {
      id: bookId,
      title: this.bookNames[bookId] || index.title,
      heTitle: index.heTitle,
      categories: index.categories,
      totalSections,
      totalParagraphs,
      estimatedTokens: totalParagraphs * 100, // Estimation approximative
      schema: index.schema
    };
  }

  /**
   * Fonction pour tester la connexion à Sefaria
   */
  async testConnection() {
    try {
      const response = await this.makeRequest('/api/texts/Likutei_Moharan.1.1');
      return {
        connected: true,
        message: 'Successfully connected to Sefaria API',
        sampleText: response.text?.[0]?.substring(0, 100) + '...'
      };
    } catch (error) {
      return {
        connected: false,
        message: `Failed to connect to Sefaria: ${error.message}`
      };
    }
  }

  /**
   * Nettoie le cache
   */
  clearCache() {
    this.cache.clear();
    console.log('Sefaria cache cleared');
  }
}

// Export pour Node.js
if (typeof module !== 'undefined' && module.exports) {
  module.exports = SefariaService;
}