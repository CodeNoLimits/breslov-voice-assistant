/**
 * Système de préchargement et cache des données Sefaria
 * Télécharge et stocke localement tous les textes de Rabbi Nachman
 * pour un accès rapide et offline
 */

class DataPreloader {
  constructor() {
    this.dbName = 'RabbiNachmanVoiceDB';
    this.dbVersion = 2;
    this.db = null;
    this.isPreloading = false;
    this.preloadProgress = {
      total: 0,
      loaded: 0,
      currentBook: '',
      percentage: 0
    };
    
    // Livres à précharger avec leur structure
    this.booksToPreload = [
      { id: 'Likutei_Moharan', name: 'Likoutey Moharan I', priority: 1, chapters: 286 },
      { id: 'Likutei_Moharan,_Part_II', name: 'Likoutey Moharan II', priority: 1, chapters: 125 },
      { id: 'Sichot_HaRan', name: 'Sichot HaRan', priority: 1, chapters: 308 },
      { id: 'Sefer_HaMiddot', name: 'Sefer HaMiddot', priority: 2, chapters: 100 },
      { id: 'Likutei_Tefilot', name: 'Likoutey Tefilot', priority: 2, chapters: 150 },
      { id: 'Chayei_Moharan', name: 'Chayei Moharan', priority: 3, chapters: 600 },
      { id: 'Sippurei_Maasiyot', name: 'Contes', priority: 2, chapters: 13 },
      { id: 'Kitzur_Likutei_Moharan', name: 'Abrégé', priority: 3, chapters: 72 }
    ];

    this.totalChaptersToLoad = this.booksToPreload.reduce((sum, book) => sum + book.chapters, 0);
  }

  /**
   * Initialise IndexedDB
   */
  async initDB() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, this.dbVersion);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        this.db = request.result;
        resolve(this.db);
      };

      request.onupgradeneeded = (event) => {
        const db = event.target.result;

        // Store pour les métadonnées des livres
        if (!db.objectStoreNames.contains('books')) {
          const booksStore = db.createObjectStore('books', { keyPath: 'id' });
          booksStore.createIndex('priority', 'priority', { unique: false });
        }

        // Store pour les textes
        if (!db.objectStoreNames.contains('texts')) {
          const textsStore = db.createObjectStore('texts', { keyPath: 'ref' });
          textsStore.createIndex('bookId', 'bookId', { unique: false });
          textsStore.createIndex('chapter', 'chapter', { unique: false });
        }

        // Store pour l'index de recherche
        if (!db.objectStoreNames.contains('searchIndex')) {
          const searchStore = db.createObjectStore('searchIndex', { keyPath: 'id' });
          searchStore.createIndex('word', 'word', { unique: false });
          searchStore.createIndex('bookId', 'bookId', { unique: false });
        }

        // Store pour les métadonnées
        if (!db.objectStoreNames.contains('metadata')) {
          db.createObjectStore('metadata', { keyPath: 'key' });
        }
      };
    });
  }

  /**
   * Vérifie si les données sont déjà préchargées
   */
  async isDataPreloaded() {
    if (!this.db) await this.initDB();

    const transaction = this.db.transaction(['metadata'], 'readonly');
    const store = transaction.objectStore('metadata');
    
    return new Promise((resolve) => {
      const request = store.get('preloadStatus');
      request.onsuccess = () => {
        const status = request.result;
        if (status && status.value) {
          const lastUpdate = new Date(status.value.lastUpdate);
          const daysSinceUpdate = (Date.now() - lastUpdate) / (1000 * 60 * 60 * 24);
          
          // Considérer comme valide si mis à jour dans les 30 derniers jours
          resolve(status.value.complete && daysSinceUpdate < 30);
        } else {
          resolve(false);
        }
      };
      request.onerror = () => resolve(false);
    });
  }

  /**
   * Précharge toutes les données essentielles
   */
  async preloadAllData(onProgress) {
    if (this.isPreloading) return;
    this.isPreloading = true;

    if (!this.db) await this.initDB();

    try {
      // Vérifier si déjà préchargé
      const alreadyLoaded = await this.isDataPreloaded();
      if (alreadyLoaded) {
        console.log('Data already preloaded, using cache');
        if (onProgress) {
          onProgress({ percentage: 100, message: 'Données déjà en cache' });
        }
        return { success: true, fromCache: true };
      }

      let chaptersLoaded = 0;

      // Trier par priorité
      const sortedBooks = [...this.booksToPreload].sort((a, b) => a.priority - b.priority);

      for (const book of sortedBooks) {
        this.preloadProgress.currentBook = book.name;
        
        // Mettre à jour la progression
        if (onProgress) {
          onProgress({
            percentage: Math.round((chaptersLoaded / this.totalChaptersToLoad) * 100),
            message: `Chargement de ${book.name}...`,
            currentBook: book.name,
            booksLoaded: sortedBooks.indexOf(book),
            totalBooks: sortedBooks.length
          });
        }

        // Charger les métadonnées du livre
        await this.preloadBookMetadata(book.id);

        // Charger les chapitres par batch
        const batchSize = 10;
        for (let i = 1; i <= book.chapters; i += batchSize) {
          const batch = [];
          for (let j = i; j < Math.min(i + batchSize, book.chapters + 1); j++) {
            batch.push(this.preloadChapter(book.id, j));
          }
          
          await Promise.all(batch);
          chaptersLoaded += batch.length;

          // Mettre à jour la progression
          if (onProgress) {
            const percentage = Math.round((chaptersLoaded / this.totalChaptersToLoad) * 100);
            onProgress({
              percentage,
              message: `${book.name}: Chapitre ${Math.min(i + batchSize - 1, book.chapters)}/${book.chapters}`,
              currentBook: book.name,
              chaptersLoaded,
              totalChapters: this.totalChaptersToLoad
            });
          }

          // Petit délai entre les batches pour ne pas surcharger
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      }

      // Marquer comme complet
      await this.markPreloadComplete();

      // Construire l'index de recherche
      if (onProgress) {
        onProgress({
          percentage: 95,
          message: 'Construction de l\'index de recherche...'
        });
      }
      await this.buildSearchIndex();

      if (onProgress) {
        onProgress({
          percentage: 100,
          message: 'Préchargement terminé !',
          complete: true
        });
      }

      return { success: true, chaptersLoaded };

    } catch (error) {
      console.error('Preload error:', error);
      return { success: false, error: error.message };
    } finally {
      this.isPreloading = false;
    }
  }

  /**
   * Précharge les métadonnées d'un livre
   */
  async preloadBookMetadata(bookId) {
    try {
      const response = await fetch(`https://www.sefaria.org/api/v3/index/${bookId}`);
      const data = await response.json();

      const transaction = this.db.transaction(['books'], 'readwrite');
      const store = transaction.objectStore('books');
      
      await new Promise((resolve, reject) => {
        const request = store.put({
          id: bookId,
          title: data.title,
          heTitle: data.heTitle,
          categories: data.categories,
          schema: data.schema,
          priority: this.booksToPreload.find(b => b.id === bookId)?.priority || 99,
          lastUpdated: new Date().toISOString()
        });
        request.onsuccess = resolve;
        request.onerror = reject;
      });

    } catch (error) {
      console.error(`Failed to preload metadata for ${bookId}:`, error);
    }
  }

  /**
   * Précharge un chapitre
   */
  async preloadChapter(bookId, chapter) {
    try {
      const ref = `${bookId}.${chapter}`;
      const response = await fetch(`https://www.sefaria.org/api/texts/${ref}`);
      const data = await response.json();

      if (data.text && data.text.length > 0) {
        const transaction = this.db.transaction(['texts'], 'readwrite');
        const store = transaction.objectStore('texts');
        
        await new Promise((resolve, reject) => {
          const request = store.put({
            ref: data.ref,
            bookId: bookId,
            chapter: chapter,
            text: data.text,
            he: data.he,
            indexTitle: data.indexTitle,
            sectionRef: data.sectionRef,
            next: data.next,
            prev: data.prev,
            lastUpdated: new Date().toISOString()
          });
          request.onsuccess = resolve;
          request.onerror = reject;
        });
      }

    } catch (error) {
      console.error(`Failed to preload ${bookId}.${chapter}:`, error);
    }
  }

  /**
   * Construit l'index de recherche
   */
  async buildSearchIndex() {
    const transaction = this.db.transaction(['texts', 'searchIndex'], 'readwrite');
    const textsStore = transaction.objectStore('texts');
    const searchStore = transaction.objectStore('searchIndex');

    // Vider l'ancien index
    await new Promise((resolve) => {
      const clearRequest = searchStore.clear();
      clearRequest.onsuccess = resolve;
    });

    // Parcourir tous les textes
    return new Promise((resolve) => {
      const request = textsStore.openCursor();
      let indexId = 0;

      request.onsuccess = (event) => {
        const cursor = event.target.result;
        if (cursor) {
          const text = cursor.value;
          
          // Indexer chaque paragraphe
          if (text.text && Array.isArray(text.text)) {
            text.text.forEach((paragraph, index) => {
              if (paragraph) {
                // Extraire les mots significatifs
                const words = this.extractKeywords(paragraph);
                
                // Ajouter à l'index
                words.forEach(word => {
                  searchStore.put({
                    id: indexId++,
                    word: word.toLowerCase(),
                    bookId: text.bookId,
                    ref: `${text.ref}.${index + 1}`,
                    snippet: paragraph.substring(0, 200)
                  });
                });
              }
            });
          }
          
          cursor.continue();
        } else {
          resolve();
        }
      };
    });
  }

  /**
   * Extrait les mots-clés d'un texte
   */
  extractKeywords(text) {
    // Mots vides à ignorer
    const stopWords = new Set([
      'le', 'la', 'les', 'un', 'une', 'de', 'du', 'des', 'et', 'ou', 'à', 'au', 'aux',
      'ce', 'ces', 'qui', 'que', 'dont', 'où', 'si', 'dans', 'sur', 'pour', 'par',
      'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with',
      'is', 'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had'
    ]);

    // Nettoyer et diviser le texte
    const words = text
      .toLowerCase()
      .replace(/[.,;:!?'"()[\]{}]/g, ' ')
      .split(/\s+/)
      .filter(word => word.length > 2 && !stopWords.has(word));

    // Retourner les mots uniques
    return [...new Set(words)];
  }

  /**
   * Marque le préchargement comme complet
   */
  async markPreloadComplete() {
    const transaction = this.db.transaction(['metadata'], 'readwrite');
    const store = transaction.objectStore('metadata');
    
    return new Promise((resolve, reject) => {
      const request = store.put({
        key: 'preloadStatus',
        value: {
          complete: true,
          lastUpdate: new Date().toISOString(),
          version: this.dbVersion,
          booksLoaded: this.booksToPreload.length,
          totalChapters: this.totalChaptersToLoad
        }
      });
      request.onsuccess = resolve;
      request.onerror = reject;
    });
  }

  /**
   * Recherche dans les données préchargées
   */
  async searchOffline(query) {
    if (!this.db) await this.initDB();

    const queryWords = query.toLowerCase().split(/\s+/);
    const results = new Map();

    const transaction = this.db.transaction(['searchIndex', 'texts'], 'readonly');
    const searchStore = transaction.objectStore('searchIndex');
    const textsStore = transaction.objectStore('texts');

    // Rechercher chaque mot
    for (const word of queryWords) {
      const index = searchStore.index('word');
      const range = IDBKeyRange.bound(word, word + '\uffff');
      
      await new Promise((resolve) => {
        const request = index.openCursor(range);
        
        request.onsuccess = (event) => {
          const cursor = event.target.result;
          if (cursor) {
            const entry = cursor.value;
            
            // Agrégér les résultats par référence
            if (!results.has(entry.ref)) {
              results.set(entry.ref, {
                ref: entry.ref,
                bookId: entry.bookId,
                snippet: entry.snippet,
                score: 0
              });
            }
            
            results.get(entry.ref).score += 1;
            cursor.continue();
          } else {
            resolve();
          }
        };
      });
    }

    // Trier par score et retourner les meilleurs résultats
    return Array.from(results.values())
      .sort((a, b) => b.score - a.score)
      .slice(0, 20);
  }

  /**
   * Récupère un texte depuis le cache
   */
  async getTextFromCache(ref) {
    if (!this.db) await this.initDB();

    const transaction = this.db.transaction(['texts'], 'readonly');
    const store = transaction.objectStore('texts');
    
    return new Promise((resolve) => {
      const request = store.get(ref);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(null);
    });
  }

  /**
   * Récupère tous les livres du cache
   */
  async getBooksFromCache() {
    if (!this.db) await this.initDB();

    const transaction = this.db.transaction(['books'], 'readonly');
    const store = transaction.objectStore('books');
    
    return new Promise((resolve) => {
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => resolve([]);
    });
  }

  /**
   * Efface toutes les données préchargées
   */
  async clearCache() {
    if (!this.db) await this.initDB();

    const transaction = this.db.transaction(['books', 'texts', 'searchIndex', 'metadata'], 'readwrite');
    
    await Promise.all([
      transaction.objectStore('books').clear(),
      transaction.objectStore('texts').clear(),
      transaction.objectStore('searchIndex').clear(),
      transaction.objectStore('metadata').clear()
    ]);

    console.log('Cache cleared');
  }

  /**
   * Obtient la taille du cache
   */
  async getCacheSize() {
    if (!this.db) await this.initDB();

    const stores = ['books', 'texts', 'searchIndex', 'metadata'];
    let totalCount = 0;

    for (const storeName of stores) {
      const transaction = this.db.transaction([storeName], 'readonly');
      const store = transaction.objectStore(storeName);
      
      const count = await new Promise((resolve) => {
        const request = store.count();
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => resolve(0);
      });
      
      totalCount += count;
    }

    return {
      totalEntries: totalCount,
      estimatedSizeMB: Math.round(totalCount * 0.005) // Estimation approximative
    };
  }
}

// Export pour utilisation
if (typeof module !== 'undefined' && module.exports) {
  module.exports = DataPreloader;
}