/**
 * Fonction Netlify pour les requêtes Rabbi Nachman avec intégration Sefaria réelle
 */

const RAGSefariaSystem = require('../../lib/rag-sefaria-system');
const DataPreloader = require('../../lib/data-preloader');

// Initialiser les systèmes
const ragSystem = new RAGSefariaSystem(process.env.GEMINI_API_KEY || 'AIzaSyBiQYNYmVBkSELyCcCRa566I4563wmYAVM');
const preloader = new DataPreloader();

exports.handler = async (event, context) => {
  // Headers CORS
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json'
  };

  // Handle OPTIONS request for CORS
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers,
      body: ''
    };
  }

  // Vérifier la méthode
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({
        error: 'Method not allowed',
        message: 'Cette endpoint accepte uniquement les requêtes POST'
      })
    };
  }

  try {
    // Parser la requête
    const { 
      query, 
      language = 'french', 
      useGemini = true,
      useCache = true,
      books = [] 
    } = JSON.parse(event.body || '{}');

    if (!query || query.trim().length === 0) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({
          error: 'Query required',
          message: 'Veuillez poser une question sur les enseignements de Rabbi Nachman'
        })
      };
    }

    console.log(`Processing Sefaria query: ${query}`);

    // Vérifier si on peut utiliser le cache local
    let searchResults;
    let dataSource = 'sefaria_api';
    
    if (useCache) {
      // Essayer de chercher dans le cache local d'abord
      const cachedResults = await preloader.searchOffline(query);
      if (cachedResults && cachedResults.length > 0) {
        console.log(`Found ${cachedResults.length} results in local cache`);
        searchResults = {
          query,
          books: [],
          searchResults: cachedResults.length,
          passages: cachedResults.map(r => ({
            ref: r.ref,
            bookTitle: r.bookId,
            sections: [{ text: r.snippet, heText: '', index: 0 }],
            fullText: r.snippet,
            fullHeText: '',
            tokens: Math.ceil(r.snippet.length / 4)
          })),
          totalTokens: cachedResults.reduce((sum, r) => sum + Math.ceil(r.snippet.length / 4), 0),
          metadata: {
            searchTimestamp: new Date().toISOString(),
            levelsSearched: 1,
            booksSearched: [...new Set(cachedResults.map(r => r.bookId))].length,
            passagesFound: cachedResults.length,
            chunksOptimized: cachedResults.length,
            dataSource: 'local_cache'
          }
        };
        dataSource = 'local_cache';
      }
    }
    
    // Si pas de résultats en cache, utiliser Sefaria API
    if (!searchResults || searchResults.passages.length === 0) {
      searchResults = await ragSystem.search(query, { books });
      dataSource = 'sefaria_api';
    }
    
    console.log(`Found ${searchResults.passages.length} relevant passages from ${dataSource}`);
    console.log(`Total tokens: ${searchResults.totalTokens}`);

    // Générer la réponse avec Gemini ou fallback
    let finalResponse;
    
    if (useGemini && searchResults.passages.length > 0) {
      try {
        // Générer avec Gemini
        finalResponse = await ragSystem.generateResponse(query);
        finalResponse.metadata.dataSource = dataSource;
        
      } catch (error) {
        console.error('Gemini generation error:', error);
        // Fallback vers construction locale
        finalResponse = ragSystem.constructFallbackResponse(searchResults);
        finalResponse.metadata.dataSource = dataSource;
        finalResponse.metadata.fallbackReason = error.message;
      }
    } else {
      // Construire une réponse sans Gemini
      finalResponse = ragSystem.constructFallbackResponse(searchResults);
      finalResponse.metadata.dataSource = dataSource;
    }

    // Ajouter des métadonnées supplémentaires
    finalResponse.metadata = {
      ...finalResponse.metadata,
      timestamp: new Date().toISOString(),
      cacheAvailable: await preloader.isDataPreloaded(),
      endpoint: 'query-sefaria'
    };

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify(finalResponse)
    };

  } catch (error) {
    console.error('Handler error:', error);
    
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        error: 'Server error',
        message: error.message,
        query: event.body ? JSON.parse(event.body).query : '',
        metadata: {
          source: 'error_handler',
          timestamp: new Date().toISOString()
        }
      })
    };
  }
};