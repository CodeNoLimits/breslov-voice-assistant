/**
 * Intégration avec Gemini API pour le système RAG Rabbi Nachman
 */

const https = require('https');

class GeminiIntegration {
  constructor(apiKey) {
    this.apiKey = apiKey;
    this.model = 'gemini-1.5-pro';
    this.apiEndpoint = 'generativelanguage.googleapis.com';
    this.maxRetries = 3;
    this.temperature = 0.7;
    this.maxOutputTokens = 4000;
  }

  /**
   * Envoie une requête à Gemini avec le contexte RAG
   */
  async generateResponse(context, retryCount = 0) {
    const requestBody = {
      contents: [
        {
          role: 'user',
          parts: [
            {
              text: this.formatPrompt(context)
            }
          ]
        }
      ],
      generationConfig: {
        temperature: this.temperature,
        topK: 40,
        topP: 0.95,
        maxOutputTokens: this.maxOutputTokens,
        stopSequences: []
      },
      safetySettings: [
        {
          category: 'HARM_CATEGORY_HARASSMENT',
          threshold: 'BLOCK_NONE'
        },
        {
          category: 'HARM_CATEGORY_HATE_SPEECH',
          threshold: 'BLOCK_NONE'
        },
        {
          category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT',
          threshold: 'BLOCK_NONE'
        },
        {
          category: 'HARM_CATEGORY_DANGEROUS_CONTENT',
          threshold: 'BLOCK_NONE'
        }
      ]
    };

    const options = {
      hostname: this.apiEndpoint,
      path: `/v1beta/models/${this.model}:generateContent?key=${this.apiKey}`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      }
    };

    return new Promise((resolve, reject) => {
      const req = https.request(options, (res) => {
        let data = '';

        res.on('data', (chunk) => {
          data += chunk;
        });

        res.on('end', () => {
          try {
            const response = JSON.parse(data);
            
            if (res.statusCode === 200) {
              const text = this.extractTextFromResponse(response);
              resolve({
                success: true,
                text,
                tokensUsed: response.usageMetadata || {},
                raw: response
              });
            } else if (res.statusCode === 429 && retryCount < this.maxRetries) {
              // Rate limiting - retry with exponential backoff
              setTimeout(() => {
                this.generateResponse(context, retryCount + 1)
                  .then(resolve)
                  .catch(reject);
              }, Math.pow(2, retryCount) * 1000);
            } else {
              reject({
                success: false,
                error: response.error || 'Unknown error',
                statusCode: res.statusCode
              });
            }
          } catch (error) {
            reject({
              success: false,
              error: error.message,
              rawResponse: data
            });
          }
        });
      });

      req.on('error', (error) => {
        reject({
          success: false,
          error: error.message
        });
      });

      req.write(JSON.stringify(requestBody));
      req.end();
    });
  }

  /**
   * Formate le prompt pour Gemini avec le contexte RAG
   */
  formatPrompt(context) {
    let prompt = `${context.systemPrompt}\n\n`;
    
    prompt += "=== PASSAGES DES ENSEIGNEMENTS DE RABBI NACHMAN ===\n\n";
    
    for (const passage of context.passages) {
      prompt += `[Source: ${passage.reference}]\n`;
      prompt += `${passage.text}\n\n`;
      prompt += "---\n\n";
    }
    
    prompt += "=== QUESTION ===\n";
    prompt += `${context.query}\n\n`;
    
    prompt += "=== INSTRUCTIONS ===\n";
    prompt += context.instructions;
    
    return prompt;
  }

  /**
   * Extrait le texte de la réponse Gemini
   */
  extractTextFromResponse(response) {
    if (response.candidates && response.candidates[0]) {
      const candidate = response.candidates[0];
      if (candidate.content && candidate.content.parts) {
        return candidate.content.parts
          .map(part => part.text || '')
          .join('');
      }
    }
    return '';
  }

  /**
   * Génère des embeddings pour la recherche sémantique
   */
  async generateEmbedding(text) {
    const requestBody = {
      model: 'models/text-embedding-004',
      content: {
        parts: [{
          text: text
        }]
      }
    };

    const options = {
      hostname: this.apiEndpoint,
      path: `/v1beta/models/text-embedding-004:embedContent?key=${this.apiKey}`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      }
    };

    return new Promise((resolve, reject) => {
      const req = https.request(options, (res) => {
        let data = '';

        res.on('data', (chunk) => {
          data += chunk;
        });

        res.on('end', () => {
          try {
            const response = JSON.parse(data);
            
            if (res.statusCode === 200 && response.embedding) {
              resolve({
                success: true,
                embedding: response.embedding.values
              });
            } else {
              reject({
                success: false,
                error: response.error || 'Failed to generate embedding'
              });
            }
          } catch (error) {
            reject({
              success: false,
              error: error.message
            });
          }
        });
      });

      req.on('error', (error) => {
        reject({
          success: false,
          error: error.message
        });
      });

      req.write(JSON.stringify(requestBody));
      req.end();
    });
  }

  /**
   * Calcule la similarité cosinus entre deux embeddings
   */
  cosineSimilarity(embedding1, embedding2) {
    let dotProduct = 0;
    let magnitude1 = 0;
    let magnitude2 = 0;

    for (let i = 0; i < embedding1.length; i++) {
      dotProduct += embedding1[i] * embedding2[i];
      magnitude1 += embedding1[i] * embedding1[i];
      magnitude2 += embedding2[i] * embedding2[i];
    }

    magnitude1 = Math.sqrt(magnitude1);
    magnitude2 = Math.sqrt(magnitude2);

    if (magnitude1 === 0 || magnitude2 === 0) {
      return 0;
    }

    return dotProduct / (magnitude1 * magnitude2);
  }

  /**
   * Recherche sémantique avec embeddings
   */
  async semanticSearch(query, documents) {
    try {
      // Générer l'embedding de la requête
      const queryEmbedding = await this.generateEmbedding(query);
      
      if (!queryEmbedding.success) {
        throw new Error('Failed to generate query embedding');
      }

      // Calculer la similarité avec chaque document
      const similarities = [];
      
      for (const doc of documents) {
        if (doc.embedding) {
          const similarity = this.cosineSimilarity(
            queryEmbedding.embedding,
            doc.embedding
          );
          
          similarities.push({
            ...doc,
            similarity
          });
        }
      }

      // Trier par similarité décroissante
      return similarities.sort((a, b) => b.similarity - a.similarity);
      
    } catch (error) {
      console.error('Semantic search error:', error);
      // Fallback vers la recherche par mots-clés
      return documents;
    }
  }

  /**
   * Streaming de la réponse pour une meilleure UX
   */
  async streamResponse(context, onChunk) {
    const requestBody = {
      contents: [
        {
          role: 'user',
          parts: [
            {
              text: this.formatPrompt(context)
            }
          ]
        }
      ],
      generationConfig: {
        temperature: this.temperature,
        topK: 40,
        topP: 0.95,
        maxOutputTokens: this.maxOutputTokens
      }
    };

    const options = {
      hostname: this.apiEndpoint,
      path: `/v1beta/models/${this.model}:streamGenerateContent?key=${this.apiKey}&alt=sse`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      }
    };

    return new Promise((resolve, reject) => {
      const req = https.request(options, (res) => {
        let fullText = '';

        res.on('data', (chunk) => {
          const lines = chunk.toString().split('\n');
          
          for (const line of lines) {
            if (line.startsWith('data: ')) {
              try {
                const data = JSON.parse(line.slice(6));
                if (data.candidates && data.candidates[0]) {
                  const text = this.extractTextFromResponse(data);
                  if (text) {
                    fullText += text;
                    onChunk(text);
                  }
                }
              } catch (e) {
                // Ignore parsing errors for incomplete chunks
              }
            }
          }
        });

        res.on('end', () => {
          resolve({
            success: true,
            text: fullText
          });
        });
      });

      req.on('error', (error) => {
        reject({
          success: false,
          error: error.message
        });
      });

      req.write(JSON.stringify(requestBody));
      req.end();
    });
  }
}

// Export pour Node.js
if (typeof module !== 'undefined' && module.exports) {
  module.exports = GeminiIntegration;
}