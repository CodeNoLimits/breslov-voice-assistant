/**
 * Serveur Express pour Rabbi Nachman Voice
 * Permet de faire fonctionner l'application localement avec toutes les fonctionnalités
 */

const express = require('express');
const cors = require('cors');
const https = require('https');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('.'));

// Configuration Gemini
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || 'AIzaSyBiQYNYmVBkSELyCcCRa566I4563wmYAVM';

// Route principale
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'sefaria-app.html'));
});

// Route pour la version locale
app.get('/local', (req, res) => {
    res.sendFile(path.join(__dirname, 'rabbi-nachman-local.html'));
});

// Proxy pour l'API Sefaria
app.get('/api/sefaria/*', async (req, res) => {
    const sefariaPath = req.params[0];
    
    try {
        const data = await makeSefariaRequest(`/api/${sefariaPath}`);
        res.json(data);
    } catch (error) {
        console.error('Sefaria proxy error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Route pour rechercher dans Sefaria
app.post('/api/search', async (req, res) => {
    const { query, books = [] } = req.body;
    
    try {
        // Construire la requête de recherche
        let searchPath = `/api/search/text?q=${encodeURIComponent(query)}&size=20`;
        
        // Ajouter les filtres de livres si spécifiés
        if (books.length > 0) {
            const bookFilters = books.map(b => `path:"${b}"`).join(' OR ');
            searchPath += `&filters=${encodeURIComponent(bookFilters)}`;
        }
        
        const results = await makeSefariaRequest(searchPath);
        res.json(results);
    } catch (error) {
        console.error('Search error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Route pour obtenir un texte spécifique
app.get('/api/text/:ref', async (req, res) => {
    const { ref } = req.params;
    
    try {
        const text = await makeSefariaRequest(`/api/texts/${ref}`);
        res.json(text);
    } catch (error) {
        console.error('Get text error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Route pour interroger avec Gemini + Sefaria
app.post('/api/query', async (req, res) => {
    const { query, useCache = false } = req.body;
    
    try {
        // 1. Rechercher dans Sefaria
        const searchResults = await makeSefariaRequest(
            `/api/search/text?q=${encodeURIComponent(query)}&size=10`
        );
        
        // 2. Extraire les passages pertinents
        let context = '';
        if (searchResults.hits && searchResults.hits.hits) {
            const passages = searchResults.hits.hits.slice(0, 5);
            for (const hit of passages) {
                const source = hit._source;
                context += `\n\nSource: ${source.ref}\n`;
                context += `Texte: ${source.exact || source.text}\n`;
                if (source.he) {
                    context += `Hébreu: ${source.he}\n`;
                }
            }
        }
        
        // 3. Construire le prompt pour Gemini
        const prompt = `Tu es un expert des enseignements de Rabbi Nachman de Breslov.
        
        Question de l'utilisateur : "${query}"
        
        Contexte des textes de Sefaria :
        ${context || 'Aucun texte spécifique trouvé, utilise tes connaissances générales sur Rabbi Nachman.'}
        
        Réponds en français de manière profonde et inspirante. 
        Cite les sources exactes quand elles sont disponibles.
        Si tu utilises le contexte fourni, mentionne les références.`;
        
        // 4. Appeler Gemini
        const geminiResponse = await callGemini(prompt);
        
        // 5. Formater la réponse
        res.json({
            response: geminiResponse,
            citations: extractCitations(searchResults),
            metadata: {
                source: 'gemini_with_sefaria',
                timestamp: new Date().toISOString(),
                searchResults: searchResults.hits ? searchResults.hits.total.value : 0
            }
        });
        
    } catch (error) {
        console.error('Query error:', error);
        
        // Fallback response
        res.json({
            response: getFallbackResponse(query),
            citations: [],
            metadata: {
                source: 'fallback',
                error: error.message,
                timestamp: new Date().toISOString()
            }
        });
    }
});

// Fonction pour appeler l'API Sefaria
function makeSefariaRequest(path) {
    return new Promise((resolve, reject) => {
        const options = {
            hostname: 'www.sefaria.org',
            path: path,
            method: 'GET',
            headers: {
                'Accept': 'application/json',
                'User-Agent': 'Rabbi-Nachman-Voice/1.0'
            }
        };

        const req = https.request(options, (res) => {
            let data = '';

            res.on('data', (chunk) => {
                data += chunk;
            });

            res.on('end', () => {
                try {
                    const parsed = JSON.parse(data);
                    resolve(parsed);
                } catch (error) {
                    reject(new Error(`Failed to parse Sefaria response: ${error.message}`));
                }
            });
        });

        req.on('error', (error) => {
            reject(error);
        });

        req.end();
    });
}

// Fonction pour appeler Gemini
async function callGemini(prompt) {
    try {
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                contents: [{
                    parts: [{
                        text: prompt
                    }]
                }]
            })
        });

        if (!response.ok) {
            throw new Error(`Gemini API error: ${response.status}`);
        }

        const data = await response.json();
        return data.candidates[0].content.parts[0].text;
        
    } catch (error) {
        console.error('Gemini error:', error);
        throw error;
    }
}

// Extraire les citations des résultats Sefaria
function extractCitations(searchResults) {
    const citations = [];
    
    if (searchResults.hits && searchResults.hits.hits) {
        searchResults.hits.hits.slice(0, 3).forEach(hit => {
            const source = hit._source;
            citations.push({
                source: source.ref,
                text: (source.exact || source.text || '').substring(0, 200) + '...'
            });
        });
    }
    
    return citations;
}

// Réponse de fallback
function getFallbackResponse(query) {
    const queryLower = query.toLowerCase();
    
    if (queryLower.includes('hitbodedout')) {
        return "L'hitbodedout est la pratique centrale de Rabbi Nachman : s'isoler chaque jour pour parler à Dieu dans sa langue maternelle. C'est un moment d'intimité avec le Créateur où l'on peut exprimer tout ce qui est dans notre cœur. Rabbi Nachman recommande au moins une heure par jour pour cette pratique transformatrice. (Likoutey Moharan II:25)";
    }
    
    if (queryLower.includes('joie') || queryLower.includes('simcha')) {
        return "Rabbi Nachman enseigne : 'C'est une grande mitzvah d'être toujours joyeux.' La joie brise toutes les barrières spirituelles. Même dans les moments difficiles, trouvez un point positif pour vous réjouir. La joie est le remède à tous les maux de l'âme. (Likoutey Moharan II:24)";
    }
    
    if (queryLower.includes('foi') || queryLower.includes('emunah')) {
        return "La foi simple est le fondement de tout selon Rabbi Nachman. Ayez foi que tout vient de Dieu et est pour votre bien ultime. La foi transcende l'intellect - là où la raison s'arrête, la foi commence. (Likoutey Moharan I:7)";
    }
    
    return "Rabbi Nachman nous enseigne des principes profonds sur ce sujet. Ses enseignements principaux incluent : la joie constante, l'hitbodedout (méditation personnelle), la foi simple, et la certitude qu'il n'existe pas de désespoir dans le monde. Consultez le Likoutey Moharan et les Sichot HaRan pour approfondir.";
}

// Démarrer le serveur
app.listen(PORT, () => {
    console.log(`
    ✨ Rabbi Nachman Voice Server ✨
    =================================
    🚀 Serveur démarré sur http://localhost:${PORT}
    
    📚 Endpoints disponibles :
    - http://localhost:${PORT}/ - Application principale
    - http://localhost:${PORT}/local - Version locale autonome
    - http://localhost:${PORT}/api/sefaria/* - Proxy Sefaria
    - http://localhost:${PORT}/api/query - Requêtes avec Gemini
    
    🔑 Clé Gemini : ${GEMINI_API_KEY.substring(0, 10)}...
    
    Appuyez sur Ctrl+C pour arrêter le serveur
    `);
});