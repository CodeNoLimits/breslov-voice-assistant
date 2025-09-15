import { Router } from 'express';
import { sefariaExtractor } from '../extractors/sefariaExtractor';
import { logger } from '../utils/logger';

const router = Router();

/**
 * Extract all Rabbi Nachman books from Sefaria
 */
router.post('/extract-all', async (req, res, next) => {
  try {
    logger.info('Starting full extraction of Rabbi Nachman books...');
    
    const books = await sefariaExtractor.extractAllBooks();
    
    res.json({
      success: true,
      message: `Extracted ${books.length} books`,
      books: books.map(b => ({
        id: b.id,
        title: b.title,
        hebrewTitle: b.hebrewTitle,
        sections: b.sections.length,
        strategy: b.metadata.strategy
      }))
    });
    
  } catch (error) {
    next(error);
  }
});

/**
 * Get extraction status
 */
router.get('/status', async (req, res) => {
  // Check what books are already extracted
  const fs = require('fs').promises;
  const path = require('path');
  
  try {
    const dataDir = path.join(process.cwd(), 'data', 'extracted');
    const files = await fs.readdir(dataDir).catch(() => []);
    
    const extractedBooks = files
      .filter((f: string) => f.endsWith('.json'))
      .map((f: string) => f.replace('.json', ''));
    
    res.json({
      extractedBooks,
      totalBooks: extractedBooks.length,
      ready: extractedBooks.length > 0
    });
  } catch (error) {
    res.json({
      extractedBooks: [],
      totalBooks: 0,
      ready: false
    });
  }
});

/**
 * Clean up resources
 */
router.post('/cleanup', async (req, res) => {
  await sefariaExtractor.cleanup();
  res.json({ success: true, message: 'Resources cleaned up' });
});

export { router as sefariaRouter };