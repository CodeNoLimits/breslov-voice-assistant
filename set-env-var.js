const https = require('https');

const NETLIFY_TOKEN = 'nfp_cVHxr23mVDJ4gFqNcN1AdwJ3HaZJ2MZB1d0c';
const SITE_ID = 'dfcb0c2b-e765-4427-b312-7c787da97055';
const GEMINI_KEY = 'AIzaSyBiQYNYmVBkSELyCcCRa566I4563wmYAVM';

// Configurer les variables d'environnement
const setEnvVars = () => {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify({
      key: 'GEMINI_API_KEY',
      value: GEMINI_KEY
    });

    const options = {
      hostname: 'api.netlify.com',
      port: 443,
      path: `/api/v1/sites/${SITE_ID}/env`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${NETLIFY_TOKEN}`,
        'Content-Length': data.length
      }
    };

    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => body += chunk);
      res.on('end', () => {
        if (res.statusCode === 201 || res.statusCode === 200) {
          console.log('✅ Variable d\'environnement GEMINI_API_KEY configurée!');
          resolve();
        } else {
          // Essayer avec l'endpoint PUT
          setEnvVarsPut();
        }
      });
    });

    req.on('error', reject);
    req.write(data);
    req.end();
  });
};

// Alternative avec PUT
const setEnvVarsPut = () => {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify({
      GEMINI_API_KEY: GEMINI_KEY
    });

    const options = {
      hostname: 'api.netlify.com',
      port: 443,
      path: `/api/v1/sites/${SITE_ID}/env`,
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${NETLIFY_TOKEN}`,
        'Content-Length': data.length
      }
    };

    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => body += chunk);
      res.on('end', () => {
        if (res.statusCode === 201 || res.statusCode === 200) {
          console.log('✅ Variable d\'environnement GEMINI_API_KEY configurée!');
          resolve();
        } else {
          console.log('⚠️  Configurez manuellement GEMINI_API_KEY dans les settings Netlify');
          console.log('   Response:', res.statusCode, body);
          resolve();
        }
      });
    });

    req.on('error', reject);
    req.write(data);
    req.end();
  });
};

// Main
async function main() {
  try {
    console.log('⚙️  Configuration des variables d\'environnement...');
    await setEnvVars();
    console.log('\n✅ Configuration terminée!');
    console.log('🌐 Site accessible à: https://rabbi-nachman-voice-1755448673159.netlify.app');
    
  } catch (error) {
    console.error('❌ Erreur:', error.message);
  }
}

main();