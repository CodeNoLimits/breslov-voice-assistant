/**
 * Fonction Netlify pour les requêtes Rabbi Nachman avec système RAG complet
 */

const RAGSystem = require('../../lib/rag-system');
const GeminiIntegration = require('../../lib/gemini-integration');

// Initialisation des systèmes
const ragSystem = new RAGSystem();
const gemini = new GeminiIntegration(process.env.GEMINI_API_KEY || 'AIzaSyBiQYNYmVBkSELyCcCRa566I4563wmYAVM');

exports.handler = async (event, context) => {
  // Headers CORS
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json'
  };

  // Handle OPTIONS request for CORS
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers,
      body: ''
    };
  }

  // Vérifier la méthode
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({
        error: 'Method not allowed',
        message: 'Cette endpoint accepte uniquement les requêtes POST'
      })
    };
  }

  try {
    // Parser la requête
    const { query, language = 'french', useGemini = true } = JSON.parse(event.body || '{}');

    if (!query || query.trim().length === 0) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({
          error: 'Query required',
          message: 'Veuillez poser une question sur les enseignements de Rabbi Nachman'
        })
      };
    }

    console.log(`Processing query: ${query}`);

    // Étape 1: Recherche RAG à travers les 3 niveaux
    const searchResults = await ragSystem.search(query);
    
    console.log(`Found ${searchResults.passages.length} relevant passages`);
    console.log(`Total tokens: ${searchResults.totalTokens}`);

    // Étape 2: Générer la réponse
    let response;
    let citations = [];
    let source = 'rag_system';

    if (useGemini && process.env.GEMINI_API_KEY && searchResults.passages.length > 0) {
      try {
        // Préparer le contexte pour Gemini
        const geminiContext = ragSystem.prepareGeminiContext(searchResults);
        
        // Appeler Gemini avec le contexte RAG
        console.log('Calling Gemini API...');
        const geminiResponse = await gemini.generateResponse(geminiContext);
        
        if (geminiResponse.success && geminiResponse.text) {
          response = geminiResponse.text;
          source = 'gemini_with_rag';
          
          // Extraire les citations de la réponse Gemini
          citations = searchResults.chapters.map(chapter => ({
            source: `${chapter.title} - ${chapter.reference}`,
            topic: chapter.book,
            relevance: chapter.relevanceScore
          }));
        } else {
          throw new Error('Gemini response was empty');
        }
        
      } catch (geminiError) {
        console.error('Gemini error:', geminiError);
        // Fallback vers une réponse construite à partir du RAG
        response = constructResponseFromRAG(searchResults);
        source = 'rag_fallback';
      }
    } else {
      // Construire une réponse à partir des passages RAG
      response = constructResponseFromRAG(searchResults);
    }

    // Ajouter les citations si elles ne sont pas déjà définies
    if (citations.length === 0 && searchResults.chapters.length > 0) {
      citations = searchResults.chapters.slice(0, 5).map(chapter => ({
        source: `${chapter.title} - ${chapter.reference}`,
        topic: chapter.book,
        relevance: chapter.relevanceScore
      }));
    }

    // Formater la réponse finale
    const finalResponse = {
      response,
      citations,
      query,
      metadata: {
        source,
        timestamp: new Date().toISOString(),
        tokensAnalyzed: searchResults.totalTokens,
        documentsSearched: searchResults.metadata.documentsScanned,
        relevantPassages: searchResults.passages.length,
        ragLevels: 3
      }
    };

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify(finalResponse)
    };

  } catch (error) {
    console.error('Handler error:', error);
    
    // Réponse d'urgence avec contenu de base
    const emergencyResponse = getEmergencyResponse(event.body ? JSON.parse(event.body).query : '');
    
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        response: emergencyResponse.response,
        citations: emergencyResponse.citations,
        query: event.body ? JSON.parse(event.body).query : '',
        metadata: {
          source: 'emergency_fallback',
          error: error.message,
          timestamp: new Date().toISOString()
        }
      })
    };
  }
};

/**
 * Construit une réponse à partir des résultats RAG sans Gemini
 */
function constructResponseFromRAG(searchResults) {
  if (searchResults.passages.length === 0) {
    return `Rabbi Nachman nous enseigne que chaque question sincère mérite une réponse profonde. 
    Bien que je n'aie pas trouvé de passage spécifique correspondant exactement à votre question, 
    je vous encourage à explorer les textes du Likoutey Moharan et des Sichot HaRan. 
    N'oubliez jamais l'enseignement central de Rabbi Nachman : "Il n'existe pas de désespoir dans le monde !"`;
  }

  let response = '';
  
  // Introduction basée sur le contexte trouvé
  const mainChapter = searchResults.chapters[0];
  if (mainChapter) {
    response += `D'après ${mainChapter.title} (${mainChapter.reference}), voici ce que Rabbi Nachman enseigne :\n\n`;
  }

  // Combiner les passages les plus pertinents
  const topPassages = searchResults.passages.slice(0, 3);
  for (const passage of topPassages) {
    // Extraire les points clés du passage
    const lines = passage.text.split('\n').filter(line => line.trim().length > 0);
    const keyPoints = lines.slice(0, 3).join(' ');
    
    response += keyPoints + '\n\n';
  }

  // Conclusion avec application pratique
  response += `\n💡 Application pratique : `;
  
  // Ajouter une application basée sur le sujet
  const query = searchResults.query.toLowerCase();
  if (query.includes('hitbodedout') || query.includes('prière') || query.includes('méditation')) {
    response += `Commencez dès aujourd'hui par consacrer ne serait-ce que 5 minutes à parler à Dieu dans votre langue maternelle. 
    Trouvez un endroit calme, idéalement dans la nature, et exprimez tout ce qui est dans votre cœur.`;
  } else if (query.includes('joie') || query.includes('bonheur') || query.includes('simcha')) {
    response += `Même dans les moments difficiles, cherchez un point positif dans votre journée - 
    une mitzvah accomplie, une bonne pensée, un moment de connexion. Concentrez-vous sur ce point et laissez-le illuminer votre cœur.`;
  } else if (query.includes('foi') || query.includes('emunah') || query.includes('confiance')) {
    response += `Renforcez votre foi simple en répétant : "Tout ce que Dieu fait est pour le bien." 
    Même si vous ne comprenez pas, faites confiance que chaque situation cache une bénédiction.`;
  } else if (query.includes('teshuva') || query.includes('repentir') || query.includes('retour')) {
    response += `Commencez maintenant, à cet instant précis. Ne regardez pas en arrière avec désespoir. 
    Chaque moment est une nouvelle création, une nouvelle opportunité de vous rapprocher de Dieu.`;
  } else {
    response += `Mettez en pratique cet enseignement dès aujourd'hui. 
    Commencez petit, avec sincérité, et vous verrez des miracles se produire dans votre vie.`;
  }

  return response;
}

/**
 * Réponse d'urgence pour les cas d'erreur
 */
function getEmergencyResponse(query) {
  const queryLower = query.toLowerCase();
  
  // Base de réponses d'urgence par sujet
  const emergencyResponses = {
    hitbodedout: {
      response: `L'hitbodedout est la pratique spirituelle la plus élevée selon Rabbi Nachman. 
      Il s'agit de s'isoler et de parler à Dieu dans sa langue maternelle, comme on parlerait à son meilleur ami. 
      Rabbi Nachman recommande de consacrer au moins une heure par jour à cette pratique, de préférence dans la nature. 
      Exprimez tout ce qui est dans votre cœur - vos joies, vos peines, vos désirs, vos regrets. 
      Cette conversation sincère avec Dieu peut littéralement transformer votre vie.`,
      citations: [
        { source: "Likoutey Moharan II:25", topic: "hitbodedout" },
        { source: "Sichot HaRan 227", topic: "hitbodedout" }
      ]
    },
    joie: {
      response: `Rabbi Nachman enseigne que "מצוה גדולה להיות בשמחה תמיד" - c'est une grande mitzvah d'être toujours joyeux. 
      La joie brise toutes les barrières spirituelles et ouvre les portes du ciel. 
      Même dans les moments difficiles, cherchez un point de lumière, aussi petit soit-il, pour vous en réjouir. 
      La joie n'est pas seulement une émotion, c'est un service divin qui élève l'âme et transforme l'obscurité en lumière.`,
      citations: [
        { source: "Likoutey Moharan II:24", topic: "joie" },
        { source: "Likoutey Etzot - Simcha", topic: "joie" }
      ]
    },
    foi: {
      response: `La foi simple (אמונה פשוטה) est le fondement de tout selon Rabbi Nachman. 
      La foi transcende l'intellect - là où la raison s'arrête, la foi commence. 
      Ayez foi que tout ce qui vous arrive est pour votre bien ultime, même si vous ne le comprenez pas. 
      Rabbi Nachman dit que même les plus grands tsadikim vivent principalement par la foi, 
      car l'essence divine est au-delà de toute compréhension.`,
      citations: [
        { source: "Likoutey Moharan I:7", topic: "foi" },
        { source: "Sefer HaMiddot - Emunah", topic: "foi" }
      ]
    },
    tikoun: {
      response: `Le Tikoun HaKlali est un remède spirituel unique révélé par Rabbi Nachman. 
      Il consiste en la récitation de 10 psaumes spécifiques : 16, 32, 41, 42, 59, 77, 90, 105, 137, 150. 
      Ces psaumes ont le pouvoir de réparer l'âme à sa racine. 
      Rabbi Nachman a promis que quiconque viendrait sur sa tombe à Ouman, donnerait une pièce à la charité 
      et réciterait ces 10 psaumes, il ferait tout son possible pour l'aider.`,
      citations: [
        { source: "Likoutey Moharan I:29", topic: "tikoun" },
        { source: "Sichot HaRan 141", topic: "tikoun" }
      ]
    }
  };

  // Trouver la réponse appropriée
  for (const [key, data] of Object.entries(emergencyResponses)) {
    if (queryLower.includes(key) || 
        (key === 'hitbodedout' && (queryLower.includes('méditation') || queryLower.includes('prière'))) ||
        (key === 'joie' && (queryLower.includes('bonheur') || queryLower.includes('simcha'))) ||
        (key === 'foi' && (queryLower.includes('emunah') || queryLower.includes('confiance'))) ||
        (key === 'tikoun' && queryLower.includes('klali'))) {
      return data;
    }
  }

  // Réponse par défaut
  return {
    response: `Rabbi Nachman nous enseigne que chaque âme juive est précieuse et unique. 
    Les principes fondamentaux de son enseignement sont : la joie constante, l'hitbodedout (méditation personnelle), 
    la foi simple, et la certitude qu'il n'existe pas de désespoir dans le monde. 
    Je vous encourage à explorer ces thèmes dans les textes du Likoutey Moharan et des Sichot HaRan.`,
    citations: [
      { source: "Likoutey Moharan", topic: "general" },
      { source: "Sichot HaRan", topic: "general" }
    ]
  };
}