#!/usr/bin/env node

/**
 * SCRIPT DE SETUP COMPLET - Rabbi Nachman Voice
 * 
 * Lance l'extraction depuis Sefaria et la construction des index en une commande
 */

const { spawn } = require('child_process');
const fs = require('fs').promises;
const path = require('path');

async function runCommand(command, args = []) {
    return new Promise((resolve, reject) => {
        console.log(`\n🚀 Exécution: ${command} ${args.join(' ')}`);
        
        const child = spawn(command, args, {
            stdio: 'inherit',
            shell: true
        });
        
        child.on('close', (code) => {
            if (code !== 0) {
                reject(new Error(`${command} a échoué avec le code ${code}`));
            } else {
                resolve();
            }
        });
        
        child.on('error', (err) => {
            reject(err);
        });
    });
}

async function checkDataExists() {
    const dataDir = path.join(__dirname, 'data');
    const masterIndex = path.join(dataDir, 'master-index.json');
    
    try {
        await fs.access(masterIndex);
        return true;
    } catch {
        return false;
    }
}

async function main() {
    console.log('🎯 SETUP COMPLET - Rabbi Nachman Voice');
    console.log('=====================================');
    console.log('Ce script va :');
    console.log('1. Extraire tous les textes depuis Sefaria');
    console.log('2. Construire l\'architecture 3 couches');
    console.log('3. Préparer le système pour répondre aux questions');
    console.log('\n⚠️  ATTENTION: L\'extraction peut prendre 10-20 minutes');
    
    // Vérifier si les données existent déjà
    const dataExists = await checkDataExists();
    if (dataExists) {
        console.log('\n✅ Des données existent déjà.');
        console.log('Voulez-vous les remplacer? (Cela effacera les données actuelles)');
        console.log('Appuyez sur Ctrl+C pour annuler, ou attendez 5 secondes pour continuer...');
        await new Promise(resolve => setTimeout(resolve, 5000));
    }
    
    try {
        // Étape 1: Extraction
        console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log('📥 ÉTAPE 1/2: EXTRACTION DES DONNÉES');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        await runCommand('node', ['data-extractor.js']);
        
        // Attendre un peu entre les étapes
        console.log('\n⏸️  Pause de 3 secondes...');
        await new Promise(resolve => setTimeout(resolve, 3000));
        
        // Étape 2: Construction des index
        console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log('🏗️  ÉTAPE 2/2: CONSTRUCTION DES INDEX');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        await runCommand('node', ['index-builder.js']);
        
        // Vérifier le résultat
        console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log('🔍 VÉRIFICATION DU SETUP');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        
        const dataDir = path.join(__dirname, 'data');
        const files = {
            'master-index.json': 'Master Index',
            'extraction-report.json': 'Rapport d\'extraction'
        };
        
        for (const [file, name] of Object.entries(files)) {
            try {
                const filePath = path.join(dataDir, file);
                const stats = await fs.stat(filePath);
                const sizeKB = Math.round(stats.size / 1024);
                console.log(`✅ ${name}: ${sizeKB} KB`);
            } catch {
                console.log(`❌ ${name}: Non trouvé`);
            }
        }
        
        // Compter les chunks
        try {
            const chunksDir = path.join(dataDir, 'chunks');
            const chunks = await fs.readdir(chunksDir);
            console.log(`✅ Chunks créés: ${chunks.length}`);
        } catch {
            console.log('❌ Aucun chunk trouvé');
        }
        
        // Test rapide du moteur de recherche
        console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log('🧪 TEST DU MOTEUR DE RECHERCHE');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        
        const SearchEngine = require('./search-engine.js');
        const engine = new SearchEngine();
        await engine.initialize();
        
        const testQuery = "Lemberg";
        console.log(`\nTest avec: "${testQuery}"`);
        const results = await engine.search(testQuery);
        
        if (results.success && results.results.length > 0) {
            console.log(`✅ ${results.results.length} résultats trouvés!`);
            console.log(`   Top résultat: ${results.results[0].reference}`);
        } else {
            console.log('⚠️  Aucun résultat trouvé pour le test');
        }
        
        console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log('✨ SETUP TERMINÉ AVEC SUCCÈS!');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log('\n📖 Prochaines étapes:');
        console.log('1. Ouvrez deep-search-app.html dans votre navigateur');
        console.log('2. Testez avec: "Quand est-ce que Rabbi Nachman est parti à Lemberg?"');
        console.log('3. Pour déployer sur Netlify: npm run deploy');
        
    } catch (error) {
        console.error('\n❌ ERREUR LORS DU SETUP:', error.message);
        console.error('\nVérifiez que Node.js est installé et que vous avez une connexion internet.');
        process.exit(1);
    }
}

// Lancer le setup
main().catch(error => {
    console.error('❌ Erreur fatale:', error);
    process.exit(1);
});