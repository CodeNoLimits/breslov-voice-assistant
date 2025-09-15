/**
 * Fonction Netlify proxy pour l'API Sefaria
 * Permet d'accéder à Sefaria depuis le client sans problèmes CORS
 */

const https = require('https');

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
    // Parser les paramètres
    const { path, method = 'GET', body } = event.queryStringParameters || {};
    
    if (!path) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ 
          error: 'Path parameter required',
          message: 'Veuillez spécifier un chemin API Sefaria'
        })
      };
    }

    // Faire la requête vers Sefaria
    const sefariaResponse = await makeSefariaRequest(path, method, body);
    
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify(sefariaResponse)
    };

  } catch (error) {
    console.error('Sefaria proxy error:', error);
    
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        error: 'Sefaria API error',
        message: error.message
      })
    };
  }
};

/**
 * Effectue une requête vers l'API Sefaria
 */
function makeSefariaRequest(path, method, body) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'www.sefaria.org',
      path: path.startsWith('/') ? path : `/${path}`,
      method: method,
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'Rabbi-Nachman-Voice/1.0'
      }
    };

    if (body && method !== 'GET') {
      options.headers['Content-Type'] = 'application/json';
      options.headers['Content-Length'] = Buffer.byteLength(body);
    }

    const req = https.request(options, (res) => {
      let data = '';

      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          resolve(parsed);
        } catch (error) {
          reject(new Error(`Failed to parse Sefaria response: ${error.message}`));
        }
      });
    });

    req.on('error', (error) => {
      reject(error);
    });

    if (body && method !== 'GET') {
      req.write(body);
    }

    req.end();
  });
}