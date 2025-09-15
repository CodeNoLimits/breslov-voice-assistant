#!/usr/bin/env node

/**
 * CONSTRUCTEUR D'INDEX 3 COUCHES - Rabbi Nachman Voice
 * 
 * Construit l'architecture 3 couches à partir des données extraites :
 * 1. Master Index (< 100K tokens) - Routage vers les livres
 * 2. Book Indexes (< 200K tokens) - Routage vers les sections
 * 3. Chunks (75K tokens) - Contenu réel
 */

const fs = require('fs').promises;
const path = require('path');

const CONFIG = {
    DATA_DIR: path.join(__dirname, 'data'),
    MAX_CHUNK_TOKENS: 75000,
    MAX_BOOK_INDEX_TOKENS: 200000,
    MAX_MASTER_INDEX_TOKENS: 100000,
    OVERLAP_PERCENT: 0.1 // 10% d'overlap entre chunks
};

// Fonction pour estimer les tokens
function estimateTokens(text) {
    if (!text) return 0;
    return Math.ceil(text.length / 4);
}

// Extraire les mots-clés d'un texte
function extractKeywords(text) {
    if (!text) return [];
    
    // Mots-clés importants pour Rabbi Nachman
    const importantTerms = [
        'hitbodedout', 'hitbodédout', 'méditation', 'prière', 'prayer',
        'simcha', 'simḥa', 'joie', 'joy', 'happiness',
        'emunah', 'émounah', 'foi', 'faith',
        'teshuva', 'téchouva', 'repentance', 'retour',
        'tzaddik', 'tsaddik', 'juste', 'righteous',
        'azamra', 'chanter', 'sing',
        'tikkun', 'tikoun', 'réparation', 'repair',
        'lemberg', 'למברג', 'voyage', 'travel', 'journey',
        'uman', 'ouman', 'אומן',
        'breslov', 'breslev', 'ברסלב',
        'nachman', 'nahman', 'נחמן',
        'torah', 'תורה', 'enseignement', 'teaching',
        'story', 'histoire', 'conte', 'maasiyot'
    ];
    
    const textLower = text.toLowerCase();
    const found = [];
    
    for (const term of importantTerms) {
        if (textLower.includes(term)) {
            found.push(term);
        }
    }
    
    // Ajouter aussi les années (pour les dates historiques)
    const yearMatches = textLower.match(/\b(17\d{2}|18\d{2})\b/g);
    if (yearMatches) {
        found.push(...yearMatches);
    }
    
    // Chercher les noms de villes
    const cities = ['lemberg', 'lviv', 'lwów', 'istanbul', 'breslov', 'uman', 'medzhybizh', 'jerusalem'];
    for (const city of cities) {
        if (textLower.includes(city)) {
            found.push(city);
        }
    }
    
    return [...new Set(found)]; // Enlever les doublons
}

// Créer un résumé du texte
function generateSummary(text, maxLength = 200) {
    if (!text) return '';
    
    const cleaned = text.replace(/\s+/g, ' ').trim();
    if (cleaned.length <= maxLength) return cleaned;
    
    return cleaned.substring(0, maxLength) + '...';
}

// Diviser une section en chunks
function createChunks(section, bookId, sectionId) {
    const chunks = [];
    const text = section.text || section.hebrewText || '';
    const textStr = Array.isArray(text) ? text.join(' ') : text.toString();
    
    if (!textStr) return chunks;
    
    const tokens = estimateTokens(textStr);
    
    if (tokens <= CONFIG.MAX_CHUNK_TOKENS) {
        // Pas besoin de diviser
        chunks.push({
            id: `${bookId}_${sectionId}_chunk_1`,
            bookId: bookId,
            sectionId: sectionId,
            content: textStr,
            hebrewText: section.hebrewText,
            reference: section.ref || `${bookId}:${sectionId}`,
            tokens: tokens,
            keywords: extractKeywords(textStr),
            position: 1
        });
    } else {
        // Diviser en plusieurs chunks avec overlap
        const charsPerChunk = Math.floor((CONFIG.MAX_CHUNK_TOKENS * 4) * (1 - CONFIG.OVERLAP_PERCENT));
        const overlapChars = Math.floor(charsPerChunk * CONFIG.OVERLAP_PERCENT);
        
        let pos = 0;
        let chunkNum = 1;
        
        while (pos < textStr.length) {
            const start = Math.max(0, pos - overlapChars);
            const end = Math.min(textStr.length, pos + charsPerChunk);
            const chunkText = textStr.substring(start, end);
            
            chunks.push({
                id: `${bookId}_${sectionId}_chunk_${chunkNum}`,
                bookId: bookId,
                sectionId: sectionId,
                content: chunkText,
                reference: `${section.ref || bookId + ':' + sectionId} (partie ${chunkNum})`,
                tokens: estimateTokens(chunkText),
                keywords: extractKeywords(chunkText),
                position: chunkNum,
                overlap: pos > 0
            });
            
            pos += charsPerChunk;
            chunkNum++;
        }
    }
    
    return chunks;
}

// Construire l'index d'un livre
function buildBookIndex(bookData, chunks) {
    const bookChunks = chunks.filter(c => c.bookId === bookData.id);
    const sections = {};
    
    for (const chunk of bookChunks) {
        if (!sections[chunk.sectionId]) {
            sections[chunk.sectionId] = {
                id: chunk.sectionId,
                keywords: [],
                chunkIds: [],
                summary: ''
            };
        }
        
        sections[chunk.sectionId].chunkIds.push(chunk.id);
        sections[chunk.sectionId].keywords.push(...chunk.keywords);
    }
    
    // Nettoyer et finaliser chaque section
    for (const sectionId in sections) {
        const section = sections[sectionId];
        section.keywords = [...new Set(section.keywords)]; // Enlever doublons
        
        // Générer un résumé basé sur les mots-clés
        if (section.keywords.length > 0) {
            section.summary = `Section contenant: ${section.keywords.slice(0, 5).join(', ')}`;
        }
    }
    
    return {
        bookId: bookData.id,
        title: bookData.title,
        hebrewTitle: bookData.hebrewTitle,
        type: bookData.type,
        sections: Object.values(sections),
        totalChunks: bookChunks.length,
        totalTokens: bookChunks.reduce((sum, c) => sum + c.tokens, 0)
    };
}

// Construire le master index
function buildMasterIndex(bookIndexes) {
    const books = {};
    
    for (const bookIndex of bookIndexes) {
        // Collecter tous les mots-clés du livre
        const allKeywords = [];
        for (const section of bookIndex.sections) {
            allKeywords.push(...section.keywords);
        }
        
        books[bookIndex.bookId] = {
            id: bookIndex.bookId,
            title: bookIndex.title,
            hebrewTitle: bookIndex.hebrewTitle,
            type: bookIndex.type,
            keywords: [...new Set(allKeywords)].slice(0, 50), // Top 50 mots-clés
            totalSections: bookIndex.sections.length,
            totalChunks: bookIndex.totalChunks,
            totalTokens: bookIndex.totalTokens,
            summary: generateBookSummary(bookIndex)
        };
    }
    
    return {
        version: '1.0',
        createdAt: new Date().toISOString(),
        books: Object.values(books),
        totalBooks: Object.keys(books).length,
        architecture: '3-layer',
        chunkSize: CONFIG.MAX_CHUNK_TOKENS
    };
}

// Générer un résumé pour un livre
function generateBookSummary(bookIndex) {
    const summaries = {
        'teachings': 'Enseignements principaux de Rabbi Nachman',
        'prayers': 'Prières et supplications selon Rabbi Nachman',
        'biography': 'Vie et voyages de Rabbi Nachman',
        'stories': 'Contes mystiques de Rabbi Nachman',
        'traits': 'Traits de caractère et conseils pratiques',
        'laws': 'Applications halakhiques des enseignements',
        'psalms': 'Psaumes du Tikkun HaKlali',
        'comfort': 'Paroles de réconfort et d\'encouragement',
        'conversations': 'Conversations et enseignements oraux',
        'abridged': 'Version abrégée des enseignements principaux'
    };
    
    return summaries[bookIndex.type] || 'Textes de Rabbi Nachman de Breslov';
}

// Fonction principale
async function main() {
    console.log('🏗️  CONSTRUCTION DES INDEX 3 COUCHES');
    console.log('=====================================');
    
    // Lire tous les fichiers extraits
    const rawDir = path.join(CONFIG.DATA_DIR, 'raw');
    const files = await fs.readdir(rawDir);
    const jsonFiles = files.filter(f => f.endsWith('.json') && f !== 'extraction-report.json');
    
    console.log(`📚 ${jsonFiles.length} livres à traiter`);
    
    const allChunks = [];
    const bookIndexes = [];
    
    // Traiter chaque livre
    for (const file of jsonFiles) {
        const bookData = JSON.parse(await fs.readFile(path.join(rawDir, file), 'utf8'));
        
        if (!bookData.sections || bookData.sections.length === 0) {
            console.log(`⚠️  ${bookData.id}: Pas de sections, ignoré`);
            continue;
        }
        
        console.log(`\n📖 Traitement de ${bookData.title}`);
        console.log(`   Sections: ${bookData.sections.length}`);
        
        // Créer les chunks pour ce livre
        const bookChunks = [];
        for (const section of bookData.sections) {
            const chunks = createChunks(section, bookData.id, section.id || section.number);
            bookChunks.push(...chunks);
        }
        
        console.log(`   ✅ ${bookChunks.length} chunks créés`);
        
        // Sauvegarder les chunks
        for (const chunk of bookChunks) {
            const chunkFile = path.join(CONFIG.DATA_DIR, 'chunks', `${chunk.id}.json`);
            await fs.writeFile(chunkFile, JSON.stringify(chunk, null, 2));
            allChunks.push(chunk);
        }
        
        // Créer l'index du livre
        const bookIndex = buildBookIndex(bookData, bookChunks);
        bookIndexes.push(bookIndex);
        
        // Sauvegarder l'index du livre
        const indexFile = path.join(CONFIG.DATA_DIR, 'indexes', `${bookData.id}.json`);
        await fs.writeFile(indexFile, JSON.stringify(bookIndex, null, 2));
        console.log(`   💾 Index sauvegardé: ${indexFile}`);
    }
    
    // Créer et sauvegarder le master index
    const masterIndex = buildMasterIndex(bookIndexes);
    const masterFile = path.join(CONFIG.DATA_DIR, 'master-index.json');
    await fs.writeFile(masterFile, JSON.stringify(masterIndex, null, 2));
    
    console.log('\n📊 RÉSUMÉ DE LA CONSTRUCTION');
    console.log('============================');
    console.log(`✅ Master index créé: ${masterIndex.totalBooks} livres`);
    console.log(`📚 Book indexes créés: ${bookIndexes.length}`);
    console.log(`📄 Chunks créés: ${allChunks.length}`);
    console.log(`📏 Tokens totaux: ${allChunks.reduce((sum, c) => sum + c.tokens, 0).toLocaleString()}`);
    
    // Recherche spéciale pour Lemberg
    console.log('\n🔍 RECHERCHE LEMBERG DANS LES CHUNKS');
    console.log('=====================================');
    
    const lembergChunks = allChunks.filter(chunk => 
        chunk.keywords.includes('lemberg') || 
        chunk.keywords.includes('למברג') ||
        chunk.content.toLowerCase().includes('lemberg')
    );
    
    if (lembergChunks.length > 0) {
        console.log(`🎯 ${lembergChunks.length} chunks contiennent "Lemberg":`);
        for (const chunk of lembergChunks) {
            console.log(`\n📍 Chunk: ${chunk.id}`);
            console.log(`   Livre: ${chunk.bookId}`);
            console.log(`   Référence: ${chunk.reference}`);
            console.log(`   Mots-clés: ${chunk.keywords.join(', ')}`);
            
            // Extraire le contexte
            const text = chunk.content.toLowerCase();
            const index = text.indexOf('lemberg');
            if (index > -1) {
                const context = chunk.content.substring(
                    Math.max(0, index - 100),
                    Math.min(chunk.content.length, index + 200)
                );
                console.log(`   Contexte: ...${context}...`);
            }
        }
    } else {
        console.log('❌ Aucune mention directe de Lemberg dans les chunks');
        console.log('   → Vérifier les translittérations ou chercher "Lviv", "Lwów"');
    }
    
    console.log('\n✨ Construction des index terminée!');
    console.log(`💾 Master index: ${masterFile}`);
}

// Lancer la construction
main().catch(error => {
    console.error('❌ Erreur fatale:', error);
    process.exit(1);
});