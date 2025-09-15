// Netlify Function for RAG Chat endpoint
const { GoogleGenerativeAI } = require('@google/generative-ai');

// Initialize Gemini
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || 'AIzaSyBiQYNYmVBkSELyCcCRa566I4563wmYAVM');

// Sample Breslov texts for demo (in production, these would come from Sefaria)
const BRESLOV_KNOWLEDGE = {
  hitbodedout: {
    text: "L'hitbodedout est la pratique de la méditation solitaire et de la prière personnelle enseignée par Rabbi Nachman. Il recommandait de passer au moins une heure par jour dans une conversation personnelle avec Dieu, de préférence dans la nature.",
    source: "Likutey Moharan II:25",
    hebrew: "התבודדות"
  },
  simcha: {
    text: "Rabbi Nachman enseigne que c'est une grande mitzvah d'être toujours joyeux. Même dans les moments difficiles, on doit chercher des points de joie et de gratitude.",
    source: "Likutey Moharan II:24",
    hebrew: "שמחה"
  },
  azamra: {
    text: "Azamra - 'Je chanterai' - le principe de trouver le bien en soi et chez les autres. Même si une personne semble mauvaise, il faut chercher le point de bien en elle.",
    source: "Likutey Moharan I:282",
    hebrew: "אזמרה"
  },
  tikkun: {
    text: "Le Tikkun HaKlali est composé de 10 Psaumes que Rabbi Nachman a révélés comme remède général pour tous les types de fautes, particulièrement les fautes sexuelles.",
    source: "Les 10 Psaumes: 16, 32, 41, 42, 59, 77, 90, 105, 137, 150",
    hebrew: "תיקון הכללי"
  },
  emunah: {
    text: "La foi (emunah) est le fondement de tout. Rabbi Nachman enseigne que même quand on ne comprend pas, la foi simple et pure nous connecte à Dieu.",
    source: "Sichot HaRan 5",
    hebrew: "אמונה"
  }
};

exports.handler = async (event, context) => {
  // CORS headers
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json'
  };

  // Handle preflight
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  try {
    const { message, language = 'french' } = JSON.parse(event.body || '{}');
    
    if (!message) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Message is required' })
      };
    }

    // Find relevant teaching
    const lowerMessage = message.toLowerCase();
    let relevantTeaching = null;
    let matchedConcept = null;

    // Search for concepts
    for (const [concept, teaching] of Object.entries(BRESLOV_KNOWLEDGE)) {
      if (lowerMessage.includes(concept) || 
          lowerMessage.includes(teaching.hebrew) ||
          (concept === 'hitbodedout' && (lowerMessage.includes('méditation') || lowerMessage.includes('solitude'))) ||
          (concept === 'simcha' && (lowerMessage.includes('joie') || lowerMessage.includes('joyeux'))) ||
          (concept === 'tikkun' && (lowerMessage.includes('psaume') || lowerMessage.includes('réparation'))) ||
          (concept === 'emunah' && (lowerMessage.includes('foi') || lowerMessage.includes('croire')))) {
        relevantTeaching = teaching;
        matchedConcept = concept;
        break;
      }
    }

    // If no specific match, use Gemini for general response
    if (!relevantTeaching) {
      const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
      
      const prompt = `Tu es un expert des enseignements de Rabbi Nachman de Breslov. 
      Réponds à cette question de manière authentique et précise: "${message}"
      
      Important:
      - Base ta réponse sur les vrais enseignements de Rabbi Nachman
      - Cite des sources si possible (Likutey Moharan, Sichot HaRan, etc.)
      - Réponds en ${language === 'hebrew' ? 'hébreu' : 'français'}
      - Sois concis mais profond`;

      const result = await model.generateContent(prompt);
      const response = result.response.text();

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          success: true,
          response: {
            text: response,
            source: "Généré selon les enseignements de Rabbi Nachman",
            confidence: 0.85,
            language,
            method: 'gemini'
          }
        })
      };
    }

    // Use matched teaching
    let responseText = relevantTeaching.text;
    
    // Add more context using Gemini
    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
    const enrichPrompt = `Enrichis cette réponse sur ${matchedConcept} de Rabbi Nachman: "${responseText}"
    Ajoute 1-2 phrases de contexte ou d'application pratique. Reste fidèle à l'enseignement original.`;
    
    try {
      const enrichResult = await model.generateContent(enrichPrompt);
      responseText = responseText + "\n\n" + enrichResult.response.text();
    } catch (e) {
      // If Gemini fails, use original text
      console.log('Gemini enrichment failed:', e);
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        response: {
          text: responseText,
          source: relevantTeaching.source,
          hebrewTerm: relevantTeaching.hebrew,
          confidence: 0.95,
          language,
          method: 'knowledge_base'
        }
      })
    };

  } catch (error) {
    console.error('Chat error:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ 
        error: 'Internal server error',
        message: error.message 
      })
    };
  }
};