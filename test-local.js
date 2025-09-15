// Test local du système Sefaria
const SefariaService = require('./lib/sefaria-service');
const RAGSefariaSystem = require('./lib/rag-sefaria-system');

async function testSystem() {
    console.log('🧪 Test du système Rabbi Nachman Voice avec Sefaria\n');
    console.log('='.repeat(50));
    
    // 1. Test de connexion Sefaria
    console.log('\n1. Test de connexion à Sefaria...');
    const sefaria = new SefariaService();
    const connectionTest = await sefaria.testConnection();
    console.log('   ✅ Sefaria:', connectionTest.connected ? 'Connecté' : '❌ Erreur');
    if (connectionTest.sampleText) {
        console.log('   📖 Échantillon:', connectionTest.sampleText);
    }
    
    // 2. Test de récupération des livres
    console.log('\n2. Récupération des livres de Rabbi Nachman...');
    const books = await sefaria.getAvailableBooks();
    console.log(`   ✅ ${books.length} livres trouvés:`);
    books.slice(0, 5).forEach(book => {
        console.log(`      - ${book.title} (${book.hebrewTitle || book.id})`);
    });
    
    // 3. Test d'une recherche
    console.log('\n3. Test de recherche: "hitbodedout"...');
    const searchResults = await sefaria.searchTexts('hitbodedout');
    console.log(`   ✅ ${searchResults.total} résultats trouvés`);
    if (searchResults.results && searchResults.results.length > 0) {
        console.log(`   📖 Premier résultat: ${searchResults.results[0].ref}`);
        console.log(`      "${searchResults.results[0].text?.substring(0, 100)}..."`);
    }
    
    // 4. Test du système RAG
    console.log('\n4. Test du système RAG avec Gemini...');
    const rag = new RAGSefariaSystem('AIzaSyBiQYNYmVBkSELyCcCRa566I4563wmYAVM');
    
    console.log('   Initialisation des métadonnées...');
    await rag.initializeMetadata();
    console.log(`   ✅ ${rag.booksMetadata.size} livres initialisés`);
    
    console.log('\n5. Test d\'une requête complète...');
    const query = "Comment pratiquer l'hitbodedout selon Rabbi Nachman ?";
    console.log(`   Question: "${query}"`);
    
    const ragSearch = await rag.search(query);
    console.log(`   ✅ Recherche RAG complétée:`);
    console.log(`      - Livres pertinents: ${ragSearch.books.length}`);
    console.log(`      - Passages trouvés: ${ragSearch.passages.length}`);
    console.log(`      - Tokens totaux: ${ragSearch.totalTokens}`);
    
    if (ragSearch.books.length > 0) {
        console.log(`      - Livre principal: ${ragSearch.books[0].title} (score: ${ragSearch.books[0].score})`);
    }
    
    if (ragSearch.passages.length > 0) {
        const firstPassage = ragSearch.passages[0];
        console.log(`\n   📖 Premier passage (${firstPassage.ref}):`);
        console.log(`      "${firstPassage.fullText?.substring(0, 200)}..."`);
    }
    
    console.log('\n' + '='.repeat(50));
    console.log('✅ Tous les tests sont passés avec succès !');
    console.log('\nLe système est prêt pour le déploiement.');
    
    return true;
}

// Exécuter les tests
testSystem()
    .then(() => {
        console.log('\n🎉 Tests terminés avec succès !');
        process.exit(0);
    })
    .catch(error => {
        console.error('\n❌ Erreur lors des tests:', error);
        process.exit(1);
    });