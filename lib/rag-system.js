/**
 * Système RAG (Retrieval-Augmented Generation) à 3 niveaux
 * Pour gérer des millions de tokens dans la limite de 1M de Gemini
 */

class RAGSystem {
  constructor() {
    // Niveau 1: Index principal - Résumés et métadonnées
    this.level1Index = {
      books: {
        'likoutey_moharan': {
          title: 'Likoutey Moharan',
          volumes: 2,
          topics: ['foi', 'joie', 'prière', 'teshuva', 'torah', 'tsadik'],
          summary: 'Enseignements principaux de Rabbi Nachman sur tous les aspects de la vie spirituelle',
          totalTokens: 500000
        },
        'sichot_haran': {
          title: 'Sichot HaRan',
          conversations: 308,
          topics: ['hitbodedout', 'simplicité', 'foi', 'joie'],
          summary: 'Conversations personnelles et conseils pratiques de Rabbi Nachman',
          totalTokens: 300000
        },
        'sefer_hamidot': {
          title: 'Sefer HaMiddot',
          topics: ['traits de caractère', 'éthique', 'comportement'],
          summary: 'Guide alphabétique des traits de caractère selon Rabbi Nachman',
          totalTokens: 200000
        },
        'likoutey_etzot': {
          title: 'Likoutey Etzot',
          topics: ['conseils pratiques', 'guidance spirituelle'],
          summary: 'Conseils pratiques extraits des enseignements',
          totalTokens: 150000
        },
        'tikoun_haklali': {
          title: 'Tikoun HaKlali',
          psalms: [16, 32, 41, 42, 59, 77, 90, 105, 137, 150],
          summary: 'Les 10 psaumes de la réparation générale',
          totalTokens: 50000
        }
      },
      totalDocuments: 15,
      totalTokens: 1200000,
      lastUpdated: '2025-01-17'
    };

    // Niveau 2: Chapitres et sections - Contenu intermédiaire
    this.level2Chapters = new Map();
    this.initializeLevel2();

    // Niveau 3: Passages détaillés - Texte complet chunké
    this.level3Passages = new Map();
    this.initializeLevel3();

    // Configuration du chunking
    this.chunkConfig = {
      maxTokensPerChunk: 8000,    // Taille max par chunk
      overlapTokens: 500,          // Chevauchement entre chunks
      contextWindow: 100000,       // Fenêtre de contexte pour Gemini
      maxChunksPerQuery: 10        // Maximum de chunks à envoyer
    };
  }

  initializeLevel2() {
    // Likoutey Moharan - Chapitres principaux
    this.level2Chapters.set('lm_joy', {
      book: 'likoutey_moharan',
      reference: 'II:24',
      title: 'La Joie',
      summary: "La joie est une mitzvah constante qui brise toutes les barrières spirituelles. Rabbi Nachman enseigne que même dans les moments les plus difficiles, il faut chercher un point positif pour s'en réjouir.",
      keywords: ['simcha', 'joie', 'bonheur', 'tristesse', 'dépression'],
      tokens: 5000
    });

    this.level2Chapters.set('lm_hitbodedout', {
      book: 'likoutey_moharan',
      reference: 'II:25',
      title: "L'Hitbodedout",
      summary: "La pratique de la méditation solitaire et de la conversation avec Dieu dans sa langue maternelle. C'est la pratique spirituelle la plus élevée selon Rabbi Nachman.",
      keywords: ['hitbodedout', 'méditation', 'prière', 'solitude', 'parler à Dieu'],
      tokens: 6000
    });

    this.level2Chapters.set('lm_faith', {
      book: 'likoutey_moharan',
      reference: 'I:7',
      title: 'La Foi Simple',
      summary: "La foi transcende l'intellect. Là où la compréhension s'arrête, la foi commence. C'est le fondement de toute vie spirituelle.",
      keywords: ['emunah', 'foi', 'croire', 'confiance', 'doute'],
      tokens: 4500
    });

    this.level2Chapters.set('lm_teshuva', {
      book: 'likoutey_moharan',
      reference: 'I:6',
      title: 'Le Retour',
      summary: "Si tu crois que tu peux détruire, crois que tu peux réparer. Il n'y a pas de désespoir dans le monde.",
      keywords: ['teshuva', 'repentir', 'retour', 'pardon', 'espoir'],
      tokens: 5500
    });

    this.level2Chapters.set('sh_conversations', {
      book: 'sichot_haran',
      reference: 'Conversations 1-50',
      title: 'Conseils Pratiques',
      summary: "Conversations directes de Rabbi Nachman sur la pratique spirituelle quotidienne, l'hitbodedout, et comment surmonter les obstacles.",
      keywords: ['conseil', 'pratique', 'quotidien', 'obstacle'],
      tokens: 8000
    });

    this.level2Chapters.set('tikoun_practice', {
      book: 'tikoun_haklali',
      reference: 'Introduction',
      title: 'Pratique du Tikoun',
      summary: "Comment et quand réciter les 10 psaumes. La promesse de Rabbi Nachman concernant cette pratique.",
      keywords: ['tikoun', 'psaumes', 'réparation', 'pratique'],
      tokens: 3000
    });
  }

  initializeLevel3() {
    // Passages détaillés avec le texte complet
    this.level3Passages.set('lm_joy_001', {
      chapterId: 'lm_joy',
      text: `"מצוה גדולה להיות בשמחה תמיד" - C'est une grande mitzvah d'être toujours joyeux.
      
      Rabbi Nachman de Breslov enseigne que la joie est l'état spirituel le plus élevé qu'une personne puisse atteindre. Ce n'est pas simplement une émotion agréable, mais une obligation religieuse fondamentale qui a le pouvoir de transformer complètement notre service divin.
      
      La joie brise toutes les barrières. Quand une personne est joyeuse, elle peut surmonter tous les obstacles spirituels. Les forces du mal n'ont aucun pouvoir sur quelqu'un qui est véritablement joyeux. C'est pourquoi le yetser hara (mauvais penchant) fait tout pour nous plonger dans la tristesse et la dépression.
      
      Même quand il semble impossible d'être joyeux, Rabbi Nachman nous enseigne une technique révolutionnaire : chercher en soi-même un point positif, aussi petit soit-il. Même si vous avez commis de nombreuses fautes, trouvez une mitzvah que vous avez accomplie, une bonne pensée que vous avez eue, un moment où vous avez aidé quelqu'un.
      
      Ce point positif est comme une étincelle qui peut allumer un grand feu. En vous concentrant sur ce point et en vous en réjouissant sincèrement, vous pouvez sortir de la dépression la plus profonde et retrouver la joie.`,
      tokens: 2000,
      embedding: null // Sera calculé par un service d'embedding
    });

    this.level3Passages.set('lm_joy_002', {
      chapterId: 'lm_joy',
      text: `La joie n'est pas conditionnelle. Rabbi Nachman insiste sur le fait que nous devons être joyeux "תמיד" - toujours, constamment, sans interruption. Cela ne dépend pas des circonstances extérieures, de notre situation financière, de notre santé, ou même de notre niveau spirituel.
      
      Comment est-ce possible ? Rabbi Nachman révèle que la vraie joie vient de la conscience que nous sommes les enfants du Roi des rois. Chaque Juif a une âme divine, une partie de Dieu Lui-même. Cette réalité transcende toutes les difficultés temporaires de ce monde.
      
      De plus, Rabbi Nachman enseigne que tout ce qui nous arrive est pour notre bien ultime. Même les épreuves les plus difficiles cachent en elles des bénédictions immenses qui se révéleront dans le futur. Avec cette perspective, nous pouvons maintenir notre joie même dans l'adversité.
      
      La musique et la danse sont des outils puissants pour éveiller la joie. Rabbi Nachman lui-même dansait souvent et encourageait ses disciples à utiliser la musique pour élever leur esprit. Il composait des mélodies (niggunim) spécifiquement conçues pour réveiller la joie dans le cœur.`,
      tokens: 1800,
      embedding: null
    });

    this.level3Passages.set('lm_hitbodedout_001', {
      chapterId: 'lm_hitbodedout',
      text: `L'hitbodedout est la clé de toute croissance spirituelle. Rabbi Nachman déclare que c'est la pratique la plus élevée, surpassant même l'étude de la Torah en importance pour le développement personnel.
      
      Qu'est-ce que l'hitbodedout ? C'est la pratique de s'isoler, de préférence dans la nature, et de parler à Dieu dans sa langue maternelle, comme on parlerait à son meilleur ami. Pas de formules fixes, pas de textes préétablis - juste une conversation sincère et spontanée avec le Créateur.
      
      Rabbi Nachman recommande de consacrer au moins une heure par jour à cette pratique. L'idéal est de le faire la nuit, quand le monde est silencieux, ou tôt le matin avant que les activités de la journée ne commencent. Un endroit dans la nature - une forêt, un champ, près d'une rivière - est optimal car la nature elle-même aide à ouvrir le cœur.
      
      Durant l'hitbodedout, exprimez tout ce qui est dans votre cœur : vos joies, vos peines, vos désirs spirituels, vos regrets pour vos fautes, vos demandes d'aide. Parlez de vos défis quotidiens, de vos relations, de vos aspirations. Rien n'est trop grand ou trop petit pour être partagé avec Dieu.`,
      tokens: 2100,
      embedding: null
    });

    this.level3Passages.set('lm_faith_001', {
      chapterId: 'lm_faith',
      text: `"אמונה פשוטה" - La foi simple est le fondement de tout le service divin. Rabbi Nachman révèle que même les plus grands tsadikim, avec toute leur sagesse et leur compréhension profonde de la Torah, vivent principalement par la foi simple.
      
      Pourquoi ? Parce que l'essence de Dieu est absolument au-delà de toute compréhension humaine. Peu importe combien nous étudions, combien nous méditons, combien nous nous élevons spirituellement - l'Infini reste infiniment au-delà de notre portée intellectuelle.
      
      C'est là que la foi entre en jeu. La foi n'est pas une béquille pour ceux qui ne peuvent pas comprendre ; c'est le seul moyen d'établir une véritable connexion avec l'Infini. La foi transcende les limites de l'intellect et nous permet de toucher l'Essence Divine.
      
      Rabbi Nachman met en garde contre une foi trop intellectualisée. La vraie foi est simple, pure, sans complications philosophiques. C'est la foi d'un enfant qui fait confiance à son père, sachant qu'il prend soin de lui même s'il ne comprend pas toujours ses actions.`,
      tokens: 1900,
      embedding: null
    });

    // Ajouter plus de passages pour couvrir tous les enseignements...
  }

  /**
   * Recherche sémantique à travers les 3 niveaux
   */
  async search(query, context = {}) {
    // Étape 1: Recherche au niveau 1 pour identifier les livres pertinents
    const relevantBooks = this.searchLevel1(query);
    
    // Étape 2: Recherche au niveau 2 pour identifier les chapitres pertinents
    const relevantChapters = this.searchLevel2(query, relevantBooks);
    
    // Étape 3: Recherche au niveau 3 pour récupérer les passages spécifiques
    const relevantPassages = await this.searchLevel3(query, relevantChapters);
    
    // Étape 4: Chunking intelligent pour respecter la limite de tokens
    const optimizedChunks = this.optimizeChunks(relevantPassages, this.chunkConfig.contextWindow);
    
    return {
      query,
      books: relevantBooks,
      chapters: relevantChapters,
      passages: optimizedChunks,
      totalTokens: this.calculateTokens(optimizedChunks),
      metadata: {
        searchTimestamp: new Date().toISOString(),
        levelsSearched: 3,
        documentsScanned: relevantBooks.length + relevantChapters.length + relevantPassages.length
      }
    };
  }

  searchLevel1(query) {
    const queryLower = query.toLowerCase();
    const relevant = [];
    
    for (const [bookId, bookData] of Object.entries(this.level1Index.books)) {
      // Toujours inclure les livres principaux avec un score de base
      let score = 0.2; // Score de base
      
      // Augmenter le score si des topics correspondent
      if (bookData.topics && Array.isArray(bookData.topics)) {
        for (const topic of bookData.topics) {
          if (queryLower.includes(topic) || topic.includes(queryLower)) {
            score += 0.3;
          }
        }
      }
      
      // Vérifier dans le résumé
      if (bookData.summary && bookData.summary.toLowerCase().includes(queryLower)) {
        score += 0.2;
      }
      
      // Ajouter des mots-clés spécifiques
      if (queryLower.includes('hitbodedout') && bookId === 'sichot_haran') {
        score += 0.5;
      }
      if (queryLower.includes('hitbodedout') && bookId === 'likoutey_moharan') {
        score += 0.4;
      }
      
      relevant.push({
        bookId,
        ...bookData,
        relevanceScore: Math.min(score, 1.0)
      });
    }
    
    return relevant.sort((a, b) => b.relevanceScore - a.relevanceScore);
  }

  searchLevel2(query, relevantBooks) {
    const queryLower = query.toLowerCase();
    const bookIds = relevantBooks.map(b => b.bookId);
    const relevant = [];
    
    for (const [chapterId, chapterData] of this.level2Chapters) {
      // Toujours vérifier tous les chapitres des livres pertinents
      if (bookIds.includes(chapterData.book)) {
        let score = 0;
        
        // Vérifier les mots-clés
        if (chapterData.keywords && Array.isArray(chapterData.keywords)) {
          for (const keyword of chapterData.keywords) {
            if (queryLower.includes(keyword.toLowerCase()) || keyword.toLowerCase().includes(queryLower)) {
              score += 0.4;
            }
          }
        }
        
        // Vérifier le titre
        if (chapterData.title && chapterData.title.toLowerCase().includes(queryLower)) {
          score += 0.5;
        }
        
        // Vérifier le résumé
        if (chapterData.summary && chapterData.summary.toLowerCase().includes(queryLower)) {
          score += 0.3;
        }
        
        // Bonus spécifique pour hitbodedout
        if (queryLower.includes('hitbodedout') && chapterId === 'lm_hitbodedout') {
          score = 1.0; // Score maximum pour correspondance exacte
        }
        
        if (score > 0.2) {
          relevant.push({
            chapterId,
            ...chapterData,
            relevanceScore: Math.min(score, 1.0)
          });
        }
      }
    }
    
    return relevant.sort((a, b) => b.relevanceScore - a.relevanceScore).slice(0, 10);
  }

  async searchLevel3(query, relevantChapters) {
    const chapterIds = relevantChapters.map(c => c.chapterId);
    const relevant = [];
    
    for (const [passageId, passageData] of this.level3Passages) {
      if (chapterIds.includes(passageData.chapterId)) {
        // Ici on pourrait utiliser des embeddings pour une recherche sémantique plus fine
        const score = this.calculateTextSimilarity(query, passageData.text);
        
        // Toujours inclure les passages des chapitres pertinents avec un score minimum
        if (score > 0.1 || chapterIds.includes(passageData.chapterId)) {
          relevant.push({
            passageId,
            ...passageData,
            relevanceScore: Math.max(score, 0.3) // Score minimum de 0.3 pour les chapitres pertinents
          });
        }
      }
    }
    
    return relevant.sort((a, b) => b.relevanceScore - a.relevanceScore);
  }

  calculateRelevanceScore(query, keywords, text) {
    let score = 0;
    const queryWords = query.split(/\s+/);
    
    // Score pour les mots-clés
    if (keywords && Array.isArray(keywords)) {
      for (const keyword of keywords) {
        if (query.includes(keyword.toLowerCase())) {
          score += 0.3;
        }
      }
    }
    
    // Score pour le texte
    if (text) {
      for (const word of queryWords) {
        if (text.toLowerCase().includes(word)) {
          score += 0.1;
        }
      }
    }
    
    return Math.min(score, 1.0);
  }

  calculateTextSimilarity(query, text) {
    // Implémentation simple - pourrait être remplacée par des embeddings
    const queryWords = new Set(query.toLowerCase().split(/\s+/));
    const textWords = new Set(text.toLowerCase().split(/\s+/));
    
    const intersection = new Set([...queryWords].filter(x => textWords.has(x)));
    const union = new Set([...queryWords, ...textWords]);
    
    return intersection.size / union.size;
  }

  optimizeChunks(passages, maxTokens) {
    let totalTokens = 0;
    const optimized = [];
    
    for (const passage of passages) {
      if (totalTokens + passage.tokens <= maxTokens) {
        optimized.push(passage);
        totalTokens += passage.tokens;
      } else {
        // Tronquer le passage si nécessaire
        const remainingTokens = maxTokens - totalTokens;
        if (remainingTokens > 1000) {
          const truncated = {
            ...passage,
            text: this.truncateText(passage.text, remainingTokens),
            tokens: remainingTokens,
            truncated: true
          };
          optimized.push(truncated);
        }
        break;
      }
    }
    
    return optimized;
  }

  truncateText(text, maxTokens) {
    // Approximation: 1 token ≈ 4 caractères
    const maxChars = maxTokens * 4;
    if (text.length <= maxChars) return text;
    
    return text.substring(0, maxChars) + '...';
  }

  calculateTokens(chunks) {
    return chunks.reduce((sum, chunk) => sum + chunk.tokens, 0);
  }

  /**
   * Prépare le contexte pour Gemini
   */
  prepareGeminiContext(searchResults) {
    const context = {
      systemPrompt: `Tu es un expert des enseignements de Rabbi Nachman de Breslov. 
      Utilise les passages suivants pour répondre à la question de manière précise et profonde.
      Cite toujours les sources (livre, chapitre, référence).
      Réponds en français sauf pour les termes hébraïques importants.`,
      
      passages: searchResults.passages.map(p => ({
        reference: `${p.chapterId} - ${this.level2Chapters.get(p.chapterId)?.reference || ''}`,
        text: p.text
      })),
      
      query: searchResults.query,
      
      instructions: `Basé sur ces enseignements de Rabbi Nachman, réponds à la question suivante: "${searchResults.query}"
      
      Structure ta réponse ainsi:
      1. Réponse principale avec les enseignements pertinents
      2. Citations et exemples spécifiques des textes
      3. Application pratique pour aujourd'hui
      4. Sources précises (livre, chapitre)`
    };
    
    return context;
  }
}

// Export pour Node.js
if (typeof module !== 'undefined' && module.exports) {
  module.exports = RAGSystem;
}