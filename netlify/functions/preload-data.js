/**
 * Fonction Netlify pour gérer le préchargement des données
 */

const DataPreloader = require('../../lib/data-preloader');

const preloader = new DataPreloader();

exports.handler = async (event, context) => {
  // Headers CORS
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
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

  try {
    const path = event.path.replace('/.netlify/functions/preload-data', '');
    
    // GET /status - Vérifier le statut du préchargement
    if (event.httpMethod === 'GET' && (path === '/status' || path === '')) {
      const isPreloaded = await preloader.isDataPreloaded();
      const cacheSize = await preloader.getCacheSize();
      
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          preloaded: isPreloaded,
          cacheSize,
          booksAvailable: preloader.booksToPreload.length,
          totalChapters: preloader.totalChaptersToLoad,
          timestamp: new Date().toISOString()
        })
      };
    }
    
    // POST /start - Démarrer le préchargement
    if (event.httpMethod === 'POST' && path === '/start') {
      // Note: Cette fonction peut timeout sur Netlify (10s limit)
      // Pour un vrai déploiement, utiliser une queue ou background function
      
      const result = await preloader.preloadAllData((progress) => {
        console.log(`Preload progress: ${progress.percentage}% - ${progress.message}`);
      });
      
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          success: result.success,
          chaptersLoaded: result.chaptersLoaded,
          fromCache: result.fromCache,
          timestamp: new Date().toISOString()
        })
      };
    }
    
    // DELETE /cache - Effacer le cache
    if (event.httpMethod === 'DELETE' && path === '/cache') {
      await preloader.clearCache();
      
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          success: true,
          message: 'Cache cleared successfully',
          timestamp: new Date().toISOString()
        })
      };
    }
    
    // GET /search - Rechercher dans le cache
    if (event.httpMethod === 'GET' && path === '/search') {
      const { q } = event.queryStringParameters || {};
      
      if (!q) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({
            error: 'Query parameter "q" is required'
          })
        };
      }
      
      const results = await preloader.searchOffline(q);
      
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          query: q,
          results,
          totalResults: results.length,
          timestamp: new Date().toISOString()
        })
      };
    }
    
    // GET /books - Obtenir la liste des livres en cache
    if (event.httpMethod === 'GET' && path === '/books') {
      const books = await preloader.getBooksFromCache();
      
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          books,
          totalBooks: books.length,
          timestamp: new Date().toISOString()
        })
      };
    }
    
    // Route non trouvée
    return {
      statusCode: 404,
      headers,
      body: JSON.stringify({
        error: 'Route not found',
        availableRoutes: [
          'GET /status - Check preload status',
          'POST /start - Start preloading',
          'DELETE /cache - Clear cache',
          'GET /search?q=query - Search in cache',
          'GET /books - List cached books'
        ]
      })
    };

  } catch (error) {
    console.error('Preload handler error:', error);
    
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        error: 'Server error',
        message: error.message,
        timestamp: new Date().toISOString()
      })
    };
  }
};