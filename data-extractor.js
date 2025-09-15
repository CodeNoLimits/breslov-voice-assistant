#!/usr/bin/env node

/**
 * EXTRACTEUR DE DONNÉES SEFARIA - Rabbi Nachman Voice
 * 
 * Ce script extrait TOUS les textes de Rabbi Nachman depuis Sefaria.org
 * Conformément à CLAUDE.md : AUCUN mock data, fetching direct uniquement
 */

const fs = require('fs').promises;
const path = require('path');

// Configuration
const CONFIG = {
    SEFARIA_API: 'https://www.sefaria.org/api',
    RATE_LIMIT_MS: 300, // 300ms entre requêtes pour éviter le ban
    DATA_DIR: path.join(__dirname, 'data'),
    MAX_RETRIES: 3,
    CHUNK_SIZE: 75000 // Tokens max par chunk (CLAUDE.md requirement)
};

// Liste COMPLÈTE des livres de Rabbi Nachman
const BRESLOV_BOOKS = [
    // Œuvres principales
    { 
        id: 'Likutei_Moharan', 
        name: 'Likutey Moharan Part I',
        hebrew: 'ליקוטי מוהר"ן חלק א',
        sections: 286,
        type: 'teachings'
    },
    { 
        id: 'Likutei_Moharan_II', 
        name: 'Likutey Moharan Part II',
        hebrew: 'ליקוטי מוהר"ן חלק ב',
        sections: 125,
        type: 'teachings'
    },
    { 
        id: 'Sichot_HaRan', 
        name: 'Sichot HaRan',
        hebrew: 'שיחות הר"ן',
        sections: 309,
        type: 'conversations'
    },
    { 
        id: 'Chayei_Moharan', 
        name: 'Chayei Moharan',
        hebrew: 'חיי מוהר"ן',
        sections: 600, // Estimation, contient les dates historiques!
        type: 'biography'
    },
    { 
        id: 'Shivchei_HaRan', 
        name: 'Shivchei HaRan',
        hebrew: 'שבחי הר"ן',
        sections: 40,
        type: 'biography'
    },
    { 
        id: 'Sippurei_Maasiyot', 
        name: 'Sippurei Maasiyot',
        hebrew: 'סיפורי מעשיות',
        sections: 15, // 13 contes + intro
        type: 'stories'
    },
    { 
        id: 'Sefer_HaMidot', 
        name: 'Sefer HaMidot',
        hebrew: 'ספר המדות',
        sections: 200, // Alphabétique
        type: 'traits'
    },
    { 
        id: 'Likutei_Tefilot', 
        name: 'Likutey Tefilot Part I',
        hebrew: 'ליקוטי תפילות חלק א',
        sections: 150,
        type: 'prayers'
    },
    { 
        id: 'Likutei_Tefilot_II', 
        name: 'Likutey Tefilot Part II',
        hebrew: 'ליקוטי תפילות חלק ב',
        sections: 100,
        type: 'prayers'
    },
    { 
        id: 'Kitzur_Likutei_Moharan', 
        name: 'Kitzur Likutei Moharan',
        hebrew: 'קיצור ליקוטי מוהר"ן',
        sections: 286,
        type: 'abridged'
    },
    { 
        id: 'Tikkun_HaKlali', 
        name: 'Tikkun HaKlali',
        hebrew: 'תיקון הכללי',
        sections: 10, // 10 Psaumes
        type: 'psalms'
    },
    { 
        id: 'Meshivat_Nefesh', 
        name: 'Meshivat Nefesh',
        hebrew: 'משיבת נפש',
        sections: 50,
        type: 'comfort'
    },
    { 
        id: 'Likutei_Halachot', 
        name: 'Likutei Halachot',
        hebrew: 'ליקוטי הלכות',
        sections: 500, // Très large, 8 volumes
        type: 'laws'
    }
];

// Fonction de sleep pour rate limiting
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Fonction pour calculer le nombre approximatif de tokens
function estimateTokens(text) {
    if (!text) return 0;
    // Approximation : 1 token ≈ 4 caractères
    return Math.ceil(text.length / 4);
}

// Fonction de fetch avec retry
async function fetchWithRetry(url, retries = CONFIG.MAX_RETRIES) {
    for (let i = 0; i < retries; i++) {
        try {
            console.log(`  → Fetching: ${url} (tentative ${i + 1}/${retries})`);
            const response = await fetch(url);
            
            if (response.ok) {
                return await response.json();
            } else if (response.status === 404) {
                console.log(`  ⚠️  404 - Ressource non trouvée`);
                return null;
            } else {
                console.log(`  ⚠️  Erreur HTTP ${response.status}`);
            }
        } catch (error) {
            console.log(`  ⚠️  Erreur réseau: ${error.message}`);
        }
        
        if (i < retries - 1) {
            await sleep(1000); // Attendre 1s avant retry
        }
    }
    return null;
}

// Extraire un livre complet
async function extractBook(book) {
    console.log(`\n📚 Extraction de ${book.name} (${book.hebrew})`);
    console.log(`   Type: ${book.type} | Sections estimées: ${book.sections}`);
    
    const bookData = {
        id: book.id,
        title: book.name,
        hebrewTitle: book.hebrew,
        type: book.type,
        sections: [],
        extractedAt: new Date().toISOString(),
        totalTokens: 0
    };

    // Essayer différentes stratégies d'extraction
    
    // Stratégie 1: Texte complet
    console.log(`  1️⃣ Tentative: Texte complet`);
    let fullText = await fetchWithRetry(`${CONFIG.SEFARIA_API}/texts/${book.id}`);
    await sleep(CONFIG.RATE_LIMIT_MS);
    
    if (fullText && (fullText.text || fullText.he)) {
        bookData.sections.push({
            id: 'full',
            text: fullText.text,
            hebrewText: fullText.he,
            ref: fullText.ref
        });
        bookData.totalTokens = estimateTokens(JSON.stringify(fullText));
        console.log(`  ✅ Texte complet récupéré (${bookData.totalTokens} tokens)`);
        return bookData;
    }

    // Stratégie 2: Section par section
    console.log(`  2️⃣ Tentative: Section par section`);
    let sectionsFound = 0;
    let consecutiveFailures = 0;
    
    for (let i = 1; i <= book.sections && consecutiveFailures < 10; i++) {
        // Essayer différents formats d'URL
        const urls = [
            `${CONFIG.SEFARIA_API}/texts/${book.id}.${i}`,
            `${CONFIG.SEFARIA_API}/texts/${book.id}:${i}`,
            `${CONFIG.SEFARIA_API}/texts/${book.id}_${i}`,
            `${CONFIG.SEFARIA_API}/v2/raw/text/${book.id}/${i}`
        ];
        
        let sectionData = null;
        for (const url of urls) {
            sectionData = await fetchWithRetry(url, 1);
            if (sectionData) break;
            await sleep(CONFIG.RATE_LIMIT_MS);
        }
        
        if (sectionData && (sectionData.text || sectionData.he)) {
            bookData.sections.push({
                id: `section_${i}`,
                number: i,
                text: sectionData.text,
                hebrewText: sectionData.he,
                ref: sectionData.ref || `${book.id}:${i}`,
                tokens: estimateTokens(JSON.stringify(sectionData))
            });
            sectionsFound++;
            consecutiveFailures = 0;
            
            if (sectionsFound % 10 === 0) {
                console.log(`    → ${sectionsFound} sections extraites...`);
            }
        } else {
            consecutiveFailures++;
        }
        
        await sleep(CONFIG.RATE_LIMIT_MS);
    }
    
    if (sectionsFound > 0) {
        bookData.totalTokens = bookData.sections.reduce((sum, s) => sum + (s.tokens || 0), 0);
        console.log(`  ✅ ${sectionsFound} sections extraites (${bookData.totalTokens} tokens)`);
        return bookData;
    }

    // Stratégie 3: Index seulement
    console.log(`  3️⃣ Tentative: Index du livre`);
    const index = await fetchWithRetry(`${CONFIG.SEFARIA_API}/index/${book.id}`);
    if (index) {
        bookData.index = index;
        bookData.hasIndex = true;
        console.log(`  ⚠️  Index récupéré (pas de texte disponible)`);
        return bookData;
    }

    console.log(`  ❌ Échec de l'extraction de ${book.name}`);
    return null;
}

// Fonction principale
async function main() {
    console.log('🚀 EXTRACTION DES TEXTES DE RABBI NACHMAN');
    console.log('=========================================');
    console.log(`📁 Dossier de données: ${CONFIG.DATA_DIR}`);
    console.log(`⏱️  Rate limit: ${CONFIG.RATE_LIMIT_MS}ms entre requêtes`);
    console.log(`📚 Nombre de livres à extraire: ${BRESLOV_BOOKS.length}`);
    
    // Créer les dossiers si nécessaire
    await fs.mkdir(path.join(CONFIG.DATA_DIR, 'raw'), { recursive: true });
    await fs.mkdir(path.join(CONFIG.DATA_DIR, 'indexes'), { recursive: true });
    await fs.mkdir(path.join(CONFIG.DATA_DIR, 'chunks'), { recursive: true });
    
    const results = {
        success: [],
        failed: [],
        partial: [],
        totalBooks: BRESLOV_BOOKS.length,
        totalTokens: 0,
        extractedAt: new Date().toISOString()
    };

    // Extraire chaque livre
    for (const book of BRESLOV_BOOKS) {
        const bookData = await extractBook(book);
        
        if (bookData) {
            // Sauvegarder les données brutes
            const filename = path.join(CONFIG.DATA_DIR, 'raw', `${book.id}.json`);
            await fs.writeFile(filename, JSON.stringify(bookData, null, 2));
            
            if (bookData.sections && bookData.sections.length > 0) {
                results.success.push(book.id);
                results.totalTokens += bookData.totalTokens;
                console.log(`  💾 Sauvegardé: ${filename}`);
            } else if (bookData.hasIndex) {
                results.partial.push(book.id);
                console.log(`  💾 Index sauvegardé: ${filename}`);
            }
        } else {
            results.failed.push(book.id);
        }
        
        // Pause entre les livres
        console.log(`  ⏸️  Pause de 2 secondes...`);
        await sleep(2000);
    }

    // Sauvegarder le rapport d'extraction
    const reportFile = path.join(CONFIG.DATA_DIR, 'extraction-report.json');
    await fs.writeFile(reportFile, JSON.stringify(results, null, 2));

    // Afficher le résumé
    console.log('\n📊 RÉSUMÉ DE L\'EXTRACTION');
    console.log('========================');
    console.log(`✅ Succès complet: ${results.success.length}/${results.totalBooks}`);
    console.log(`⚠️  Partiel (index): ${results.partial.length}/${results.totalBooks}`);
    console.log(`❌ Échecs: ${results.failed.length}/${results.totalBooks}`);
    console.log(`📏 Total tokens: ${results.totalTokens.toLocaleString()}`);
    
    if (results.success.length > 0) {
        console.log('\n✅ Livres extraits avec succès:');
        results.success.forEach(id => console.log(`   - ${id}`));
    }
    
    if (results.failed.length > 0) {
        console.log('\n❌ Livres non extraits:');
        results.failed.forEach(id => console.log(`   - ${id}`));
    }

    console.log(`\n💾 Rapport sauvegardé: ${reportFile}`);
    console.log('\n✨ Extraction terminée!');
    
    // Rechercher spécifiquement les mentions de Lemberg
    console.log('\n🔍 RECHERCHE SPÉCIALE: Mentions de Lemberg');
    console.log('==========================================');
    
    let lembergFound = false;
    for (const bookId of results.success) {
        const bookFile = path.join(CONFIG.DATA_DIR, 'raw', `${bookId}.json`);
        const bookData = JSON.parse(await fs.readFile(bookFile, 'utf8'));
        
        if (bookData.sections) {
            for (const section of bookData.sections) {
                const text = JSON.stringify(section.text || '') + JSON.stringify(section.hebrewText || '');
                if (text.toLowerCase().includes('lemberg') || text.includes('למברג')) {
                    console.log(`\n🎯 TROUVÉ dans ${bookId}:`);
                    console.log(`   Section: ${section.ref || section.id}`);
                    lembergFound = true;
                    
                    // Extraire le contexte
                    const textStr = section.text?.toString() || '';
                    const index = textStr.toLowerCase().indexOf('lemberg');
                    if (index > -1) {
                        const context = textStr.substring(Math.max(0, index - 100), Math.min(textStr.length, index + 200));
                        console.log(`   Contexte: ...${context}...`);
                    }
                }
            }
        }
    }
    
    if (!lembergFound) {
        console.log('❌ Aucune mention de Lemberg trouvée dans les textes extraits');
        console.log('   → Il faudra peut-être chercher dans d\'autres sources ou translittérations');
    }
}

// Lancer l'extraction
main().catch(error => {
    console.error('❌ Erreur fatale:', error);
    process.exit(1);
});