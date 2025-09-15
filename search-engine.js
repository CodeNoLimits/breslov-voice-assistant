/**
 * MOTEUR DE RECHERCHE HIÉRARCHIQUE - Rabbi Nachman Voice
 * 
 * Implémente la recherche en 3 couches pour répondre aux questions spécifiques
 * comme "Quand est-ce que Rabbi Nachman est parti à Lemberg?"
 */

const fs = require('fs').promises;
const path = require('path');

class RabbiNachmanSearchEngine {
    constructor(dataDir = path.join(__dirname, 'data')) {
        this.dataDir = dataDir;
        this.masterIndex = null;
        this.bookIndexes = {};
        this.chunksCache = {};
        this.initialized = false;
    }

    /**
     * Initialiser le moteur de recherche
     */
    async initialize() {
        console.log('🔧 Initialisation du moteur de recherche...');
        
        try {
            // Charger le master index
            const masterPath = path.join(this.dataDir, 'master-index.json');
            this.masterIndex = JSON.parse(await fs.readFile(masterPath, 'utf8'));
            console.log(`✅ Master index chargé: ${this.masterIndex.books.length} livres`);
            
            // Charger tous les book indexes
            const indexDir = path.join(this.dataDir, 'indexes');
            const indexFiles = await fs.readdir(indexDir);
            
            for (const file of indexFiles) {
                if (file.endsWith('.json')) {
                    const bookIndex = JSON.parse(
                        await fs.readFile(path.join(indexDir, file), 'utf8')
                    );
                    this.bookIndexes[bookIndex.bookId] = bookIndex;
                }
            }
            console.log(`✅ ${Object.keys(this.bookIndexes).length} book indexes chargés`);
            
            this.initialized = true;
            return true;
        } catch (error) {
            console.error('❌ Erreur d\'initialisation:', error);
            return false;
        }
    }

    /**
     * Recherche principale - Point d'entrée
     */
    async search(query, options = {}) {
        if (!this.initialized) {
            await this.initialize();
        }

        const {
            maxResults = 5,
            includeHebrew = true,
            contextLength = 200
        } = options;

        console.log(`\n🔍 Recherche: "${query}"`);
        
        // Étape 1: Analyser la requête
        const queryAnalysis = this.analyzeQuery(query);
        console.log(`📝 Analyse: ${JSON.stringify(queryAnalysis.keywords)}`);
        
        // Étape 2: Rechercher dans le master index
        const relevantBooks = this.searchMasterIndex(queryAnalysis);
        console.log(`📚 Livres pertinents: ${relevantBooks.map(b => b.id).join(', ')}`);
        
        if (relevantBooks.length === 0) {
            return {
                success: false,
                message: 'Aucun livre pertinent trouvé',
                results: []
            };
        }
        
        // Étape 3: Rechercher dans les book indexes
        const relevantSections = await this.searchBookIndexes(relevantBooks, queryAnalysis);
        console.log(`📖 ${relevantSections.length} sections pertinentes trouvées`);
        
        if (relevantSections.length === 0) {
            return {
                success: false,
                message: 'Aucune section pertinente trouvée',
                results: []
            };
        }
        
        // Étape 4: Récupérer et scorer les chunks
        const results = await this.searchChunks(relevantSections, queryAnalysis, {
            maxResults,
            includeHebrew,
            contextLength
        });
        
        return {
            success: true,
            query: query,
            results: results,
            totalResults: results.length
        };
    }

    /**
     * Analyser la requête pour extraire les concepts clés
     */
    analyzeQuery(query) {
        const queryLower = query.toLowerCase();
        
        // Mots-clés pour dates et lieux
        const dateKeywords = [];
        const locationKeywords = [];
        const conceptKeywords = [];
        
        // Détecter les années
        const yearMatches = queryLower.match(/\b(17\d{2}|18\d{2}|19\d{2})\b/g);
        if (yearMatches) {
            dateKeywords.push(...yearMatches);
        }
        
        // Détecter les villes importantes
        const cities = {
            'lemberg': ['lemberg', 'lwów', 'lviv', 'למברג', 'לבוב'],
            'uman': ['uman', 'ouman', 'אומן', 'אומאן'],
            'breslov': ['breslov', 'breslev', 'bratslav', 'ברסלב'],
            'jerusalem': ['jerusalem', 'jérusalem', 'ירושלים'],
            'istanbul': ['istanbul', 'constantinople', 'קושטא'],
            'medzhybizh': ['medzhybizh', 'מעזיבוז'],
            'złoczów': ['złoczów', 'zolochiv', 'זלאטשוב']
        };
        
        for (const [mainName, variants] of Object.entries(cities)) {
            for (const variant of variants) {
                if (queryLower.includes(variant)) {
                    locationKeywords.push(mainName);
                    break;
                }
            }
        }
        
        // Détecter les concepts clés
        const concepts = {
            'voyage': ['voyage', 'voyager', 'partir', 'aller', 'travel', 'journey', 'נסיעה', 'מסע'],
            'date': ['quand', 'when', 'date', 'année', 'year', 'מתי', 'שנה'],
            'histoire': ['histoire', 'history', 'biographie', 'biography', 'vie', 'life', 'חיים'],
            'mort': ['mort', 'décès', 'death', 'פטירה', 'נפטר'],
            'naissance': ['naissance', 'né', 'birth', 'born', 'לידה', 'נולד']
        };
        
        for (const [concept, keywords] of Object.entries(concepts)) {
            for (const keyword of keywords) {
                if (queryLower.includes(keyword)) {
                    conceptKeywords.push(concept);
                    break;
                }
            }
        }
        
        // Extraire tous les mots significatifs
        const words = queryLower
            .replace(/[^\w\s\u0590-\u05FF]/g, ' ') // Garder lettres et hébreu
            .split(/\s+/)
            .filter(word => word.length > 2);
        
        return {
            original: query,
            keywords: [...new Set([...words, ...dateKeywords, ...locationKeywords, ...conceptKeywords])],
            dateKeywords,
            locationKeywords,
            conceptKeywords,
            isHistoricalQuery: dateKeywords.length > 0 || locationKeywords.length > 0,
            isBiographicalQuery: conceptKeywords.includes('histoire') || conceptKeywords.includes('voyage')
        };
    }

    /**
     * Rechercher dans le master index
     */
    searchMasterIndex(queryAnalysis) {
        const relevantBooks = [];
        
        for (const book of this.masterIndex.books) {
            let score = 0;
            
            // Bonus pour les livres biographiques si c'est une question historique
            if (queryAnalysis.isHistoricalQuery || queryAnalysis.isBiographicalQuery) {
                if (book.type === 'biography' || book.id.includes('Chayei') || book.id.includes('Shivchei')) {
                    score += 10;
                }
            }
            
            // Chercher les mots-clés dans les mots-clés du livre
            for (const keyword of queryAnalysis.keywords) {
                if (book.keywords && book.keywords.some(k => k.includes(keyword))) {
                    score += 5;
                }
                if (book.title && book.title.toLowerCase().includes(keyword)) {
                    score += 3;
                }
                if (book.summary && book.summary.toLowerCase().includes(keyword)) {
                    score += 2;
                }
            }
            
            if (score > 0) {
                relevantBooks.push({ ...book, score });
            }
        }
        
        // Trier par score décroissant
        return relevantBooks.sort((a, b) => b.score - a.score);
    }

    /**
     * Rechercher dans les book indexes
     */
    async searchBookIndexes(relevantBooks, queryAnalysis) {
        const relevantSections = [];
        
        for (const book of relevantBooks) {
            const bookIndex = this.bookIndexes[book.id];
            if (!bookIndex) continue;
            
            for (const section of bookIndex.sections) {
                let sectionScore = book.score; // Hériter du score du livre
                
                // Chercher les mots-clés dans la section
                for (const keyword of queryAnalysis.keywords) {
                    if (section.keywords && section.keywords.some(k => k.includes(keyword))) {
                        sectionScore += 3;
                    }
                    if (section.summary && section.summary.toLowerCase().includes(keyword)) {
                        sectionScore += 2;
                    }
                }
                
                // Bonus spécial pour les mots-clés de lieu
                for (const location of queryAnalysis.locationKeywords) {
                    if (section.keywords && section.keywords.includes(location)) {
                        sectionScore += 10; // Fort bonus pour correspondance exacte de lieu
                    }
                }
                
                if (sectionScore > book.score) {
                    relevantSections.push({
                        bookId: book.id,
                        bookTitle: book.title,
                        sectionId: section.id,
                        chunkIds: section.chunkIds,
                        score: sectionScore
                    });
                }
            }
        }
        
        // Trier et limiter
        return relevantSections
            .sort((a, b) => b.score - a.score)
            .slice(0, 20); // Top 20 sections
    }

    /**
     * Rechercher dans les chunks
     */
    async searchChunks(relevantSections, queryAnalysis, options) {
        const results = [];
        
        for (const section of relevantSections) {
            for (const chunkId of section.chunkIds) {
                const chunk = await this.loadChunk(chunkId);
                if (!chunk) continue;
                
                const searchResult = this.searchInChunk(chunk, queryAnalysis, {
                    ...options,
                    bookTitle: section.bookTitle,
                    baseScore: section.score
                });
                
                if (searchResult) {
                    results.push(searchResult);
                }
            }
        }
        
        // Trier par score et limiter
        return results
            .sort((a, b) => b.score - a.score)
            .slice(0, options.maxResults);
    }

    /**
     * Rechercher dans un chunk spécifique
     */
    searchInChunk(chunk, queryAnalysis, options) {
        const content = chunk.content || '';
        const contentLower = content.toLowerCase();
        
        let score = options.baseScore || 0;
        let matchedKeywords = [];
        let contexts = [];
        
        // Rechercher chaque mot-clé
        for (const keyword of queryAnalysis.keywords) {
            if (contentLower.includes(keyword)) {
                score += 2;
                matchedKeywords.push(keyword);
                
                // Extraire le contexte autour du mot-clé
                const index = contentLower.indexOf(keyword);
                if (index > -1) {
                    const start = Math.max(0, index - options.contextLength / 2);
                    const end = Math.min(content.length, index + keyword.length + options.contextLength / 2);
                    const context = content.substring(start, end);
                    contexts.push({
                        keyword: keyword,
                        context: '...' + context.trim() + '...',
                        position: index
                    });
                }
            }
        }
        
        // Bonus pour correspondances de dates
        for (const date of queryAnalysis.dateKeywords) {
            if (contentLower.includes(date)) {
                score += 10;
                matchedKeywords.push(date);
            }
        }
        
        // Bonus pour correspondances de lieux
        for (const location of queryAnalysis.locationKeywords) {
            if (contentLower.includes(location)) {
                score += 15;
                matchedKeywords.push(location);
            }
        }
        
        // Si pas de correspondance, retourner null
        if (matchedKeywords.length === 0) {
            return null;
        }
        
        // Créer le résultat
        return {
            chunkId: chunk.id,
            bookTitle: options.bookTitle,
            reference: chunk.reference,
            score: score,
            matchedKeywords: [...new Set(matchedKeywords)],
            contexts: contexts.slice(0, 3), // Top 3 contextes
            fullText: options.includeHebrew && chunk.hebrewText ? chunk.hebrewText : chunk.content,
            excerpt: contexts.length > 0 ? contexts[0].context : content.substring(0, 300) + '...'
        };
    }

    /**
     * Charger un chunk depuis le disque
     */
    async loadChunk(chunkId) {
        // Vérifier le cache
        if (this.chunksCache[chunkId]) {
            return this.chunksCache[chunkId];
        }
        
        try {
            const chunkPath = path.join(this.dataDir, 'chunks', `${chunkId}.json`);
            const chunk = JSON.parse(await fs.readFile(chunkPath, 'utf8'));
            
            // Mettre en cache (limiter à 100 chunks)
            if (Object.keys(this.chunksCache).length < 100) {
                this.chunksCache[chunkId] = chunk;
            }
            
            return chunk;
        } catch (error) {
            console.error(`❌ Erreur chargement chunk ${chunkId}:`, error.message);
            return null;
        }
    }

    /**
     * Recherche spéciale pour des questions historiques
     */
    async searchHistorical(query) {
        // Optimisé pour les questions comme "Quand Rabbi Nachman est parti à Lemberg?"
        const results = await this.search(query, {
            maxResults: 10,
            includeHebrew: true,
            contextLength: 400
        });
        
        if (!results.success || results.results.length === 0) {
            return {
                success: false,
                message: "Aucune information trouvée sur cette question historique"
            };
        }
        
        // Essayer d'extraire une date précise des résultats
        for (const result of results.results) {
            for (const context of result.contexts) {
                // Chercher des patterns de date
                const datePattern = /\b(17\d{2}|18\d{2})\b/g;
                const dates = context.context.match(datePattern);
                
                if (dates && dates.length > 0) {
                    return {
                        success: true,
                        answer: context.context,
                        date: dates[0],
                        source: result.reference,
                        confidence: 'high'
                    };
                }
            }
        }
        
        // Si pas de date trouvée, retourner le meilleur résultat
        return {
            success: true,
            answer: results.results[0].excerpt,
            source: results.results[0].reference,
            confidence: 'medium'
        };
    }
}

// Export pour utilisation dans d'autres modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = RabbiNachmanSearchEngine;
}

// Si exécuté directement, lancer un test
if (require.main === module) {
    async function test() {
        console.log('🧪 TEST DU MOTEUR DE RECHERCHE');
        console.log('==============================\n');
        
        const engine = new RabbiNachmanSearchEngine();
        await engine.initialize();
        
        // Test 1: Question sur Lemberg
        console.log('\n📝 Test 1: "Quand est-ce que Rabbi Nachman est parti à Lemberg?"');
        const result1 = await engine.searchHistorical("Quand est-ce que Rabbi Nachman est parti à Lemberg?");
        console.log('Résultat:', result1);
        
        // Test 2: Recherche sur l'hitbodedout
        console.log('\n📝 Test 2: "Qu\'est-ce que l\'hitbodedout?"');
        const result2 = await engine.search("Qu'est-ce que l'hitbodedout?");
        if (result2.success && result2.results.length > 0) {
            console.log(`✅ ${result2.results.length} résultats trouvés`);
            console.log(`Top résultat: ${result2.results[0].reference}`);
            console.log(`Score: ${result2.results[0].score}`);
            console.log(`Extrait: ${result2.results[0].excerpt.substring(0, 200)}...`);
        }
        
        // Test 3: Recherche sur Uman
        console.log('\n📝 Test 3: "Rabbi Nachman Uman 1810"');
        const result3 = await engine.search("Rabbi Nachman Uman 1810");
        if (result3.success && result3.results.length > 0) {
            console.log(`✅ ${result3.results.length} résultats trouvés`);
            for (const res of result3.results.slice(0, 3)) {
                console.log(`- ${res.reference}: ${res.matchedKeywords.join(', ')}`);
            }
        }
    }
    
    test().catch(console.error);
}