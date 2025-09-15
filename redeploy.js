const https = require('https');
const fs = require('fs');

const NETLIFY_TOKEN = 'nfp_cVHxr23mVDJ4gFqNcN1AdwJ3HaZJ2MZB1d0c';
const SITE_ID = 'dfcb0c2b-e765-4427-b312-7c787da97055';

// Redéployer le site
const redeploy = () => {
  return new Promise((resolve, reject) => {
    const zipContent = fs.readFileSync('rabbi-nachman-deploy.zip');
    
    const options = {
      hostname: 'api.netlify.com',
      port: 443,
      path: `/api/v1/sites/${SITE_ID}/deploys`,
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
          console.log('✅ Redéploiement réussi!');
          console.log('🌐 URL:', deploy.deploy_ssl_url || deploy.ssl_url);
          resolve(deploy);
        } else {
          reject(new Error(`Erreur: ${res.statusCode} - ${body}`));
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
    console.log('🚀 Redéploiement en cours...');
    const deploy = await redeploy();
    console.log('\n✨ Site mis à jour avec succès!');
    console.log('==================================================');
    console.log('🌐 Votre site est accessible à:');
    console.log('   https://rabbi-nachman-voice-1755448673159.netlify.app');
    console.log('\n📱 Fonctionnalités disponibles:');
    console.log('   ✅ Interface vocale (microphone)');
    console.log('   ✅ Chat interactif');
    console.log('   ✅ Synthèse vocale automatique');
    console.log('   ✅ Base de connaissances Rabbi Nachman');
    console.log('\n⚠️  Pour activer l\'IA Gemini, ajoutez la clé dans:');
    console.log('   Site Settings → Environment variables → GEMINI_API_KEY');
    
  } catch (error) {
    console.error('❌ Erreur:', error.message);
  }
}

main();