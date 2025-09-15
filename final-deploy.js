const https = require('https');
const fs = require('fs');

const NETLIFY_TOKEN = 'nfp_cVHxr23mVDJ4gFqNcN1AdwJ3HaZJ2MZB1d0c';
const SITE_ID = 'dfcb0c2b-e765-4427-b312-7c787da97055';

// Déployer le site final
const deploy = () => {
  return new Promise((resolve, reject) => {
    const zipContent = fs.readFileSync('rabbi-nachman-final.zip');
    
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
          console.log('✅ Déploiement final réussi!');
          console.log('🌐 URL:', deploy.deploy_ssl_url || deploy.ssl_url || deploy.url);
          console.log('📦 Deploy ID:', deploy.id);
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
    console.log('🚀 Déploiement final Rabbi Nachman Voice...');
    console.log('==================================================');
    
    const result = await deploy();
    
    console.log('\n✨ APPLICATION DÉPLOYÉE AVEC SUCCÈS!');
    console.log('==================================================');
    console.log('');
    console.log('🌐 VOTRE SITE EST MAINTENANT EN LIGNE:');
    console.log('   https://rabbi-nachman-voice-1755448673159.netlify.app');
    console.log('');
    console.log('📱 FONCTIONNALITÉS DISPONIBLES:');
    console.log('   ✅ Interface vocale (microphone)');
    console.log('   ✅ Chat interactif avec Rabbi Nachman');
    console.log('   ✅ Synthèse vocale automatique');
    console.log('   ✅ Base de connaissances intégrée');
    console.log('   ✅ Questions suggérées');
    console.log('');
    console.log('🎯 COMMENT UTILISER:');
    console.log('   1. Cliquez sur le microphone pour parler');
    console.log('   2. Ou tapez votre question dans le champ');
    console.log('   3. Ou cliquez sur une suggestion');
    console.log('');
    console.log('📚 SUJETS DISPONIBLES:');
    console.log('   • La joie et le bonheur (Simcha)');
    console.log('   • L\'hitbodedout (méditation)');
    console.log('   • Le Tikoun HaKlali');
    console.log('   • La foi simple (Emunah)');
    console.log('   • Le retour à Dieu (Teshuva)');
    console.log('   • Surmonter les épreuves');
    console.log('');
    console.log('⚙️  OPTIONNEL - Pour activer l\'IA Gemini:');
    console.log('   1. Allez sur app.netlify.com');
    console.log('   2. Site Settings → Environment variables');
    console.log('   3. Ajoutez: GEMINI_API_KEY = AIzaSyBiQYNYmVBkSELyCcCRa566I4563wmYAVM');
    console.log('');
    console.log('✅ Le site fonctionne déjà SANS la clé Gemini');
    console.log('   grâce à la base de connaissances intégrée!');
    console.log('');
    console.log('==================================================');
    console.log('💫 Na Nach Nachma Nachman MeOuman! 💫');
    
  } catch (error) {
    console.error('❌ Erreur:', error.message);
  }
}

main();