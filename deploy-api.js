const https = require('https');
const fs = require('fs');
const path = require('path');

const NETLIFY_TOKEN = 'nfp_cVHxr23mVDJ4gFqNcN1AdwJ3HaZJ2MZB1d0c';
const SITE_NAME = `rabbi-nachman-voice-${Date.now()}`;

// Créer un nouveau site
const createSite = () => {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify({
      name: SITE_NAME,
      custom_domain: null,
      force_ssl: true
    });

    const options = {
      hostname: 'api.netlify.com',
      port: 443,
      path: '/api/v1/sites',
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
          const site = JSON.parse(body);
          console.log('✅ Site créé:', site.url);
          resolve(site);
        } else {
          reject(new Error(`Erreur: ${res.statusCode} - ${body}`));
        }
      });
    });

    req.on('error', reject);
    req.write(data);
    req.end();
  });
};

// Déployer les fichiers
const deployFiles = async (siteId) => {
  console.log('📦 Préparation du déploiement...');
  
  // Pour un déploiement simple, on utilise l'endpoint de zip deploy
  const zipPath = path.join(__dirname, 'rabbi-nachman-netlify.zip');
  const zipContent = fs.readFileSync(zipPath);
  
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'api.netlify.com',
      port: 443,
      path: `/api/v1/sites/${siteId}/deploys`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/zip',
        'Authorization': `Bearer ${NETLIFY_TOKEN}`,
        'Content-Length': zipContent.length
      }
    };

    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => body += chunk);
      res.on('end', () => {
        if (res.statusCode === 200 || res.statusCode === 201) {
          const deploy = JSON.parse(body);
          console.log('✅ Déploiement réussi!');
          resolve(deploy);
        } else {
          reject(new Error(`Erreur déploiement: ${res.statusCode} - ${body}`));
        }
      });
    });

    req.on('error', reject);
    req.write(zipContent);
    req.end();
  });
};

// Main
async function main() {
  try {
    console.log('🚀 Déploiement Rabbi Nachman Voice sur Netlify...');
    console.log('==================================================');
    
    // Créer le site
    const site = await createSite();
    console.log('🌐 URL du site:', site.url);
    console.log('🔑 Site ID:', site.id);
    
    // Déployer les fichiers
    await deployFiles(site.id);
    
    console.log('\n✨ Déploiement terminé avec succès!');
    console.log('==================================================');
    console.log(`🌐 Votre site est accessible à: ${site.url}`);
    console.log(`📱 URL personnalisée: https://${SITE_NAME}.netlify.app`);
    console.log('\n⚠️  N\'oubliez pas d\'ajouter la variable GEMINI_API_KEY dans:');
    console.log('   Site Settings → Environment variables');
    console.log('   GEMINI_API_KEY = AIzaSyBiQYNYmVBkSELyCcCRa566I4563wmYAVM');
    
  } catch (error) {
    console.error('❌ Erreur:', error.message);
    process.exit(1);
  }
}

main();