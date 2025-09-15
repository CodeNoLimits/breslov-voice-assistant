// Fonction de santé pour vérifier que l'API fonctionne
exports.handler = async (event, context) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
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

  return {
    statusCode: 200,
    headers,
    body: JSON.stringify({
      status: 'operational',
      service: 'Rabbi Nachman Voice - Netlify Functions',
      timestamp: new Date().toISOString(),
      environment: process.env.NODE_ENV || 'production',
      features: {
        gemini: !!process.env.GEMINI_API_KEY,
        teachings: true,
        multilingual: true
      }
    })
  };
};