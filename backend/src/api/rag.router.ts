import { Router } from 'express';
import { hierarchicalRouter } from '../rag/hierarchicalRouter';
import { GeminiGenerator } from '../rag/geminiGenerator';
import { semanticChunker } from '../processors/semanticChunker';
import { indexBuilder } from '../processors/indexBuilder';
import { logger } from '../utils/logger';

const router = Router();

// Initialize Gemini Generator lazily
let geminiGenerator: GeminiGenerator | null = null;

function getGeminiGenerator() {
  if (!geminiGenerator) {
    geminiGenerator = new GeminiGenerator();
  }
  return geminiGenerator;
}

/**
 * Build indexes from extracted books
 */
router.post('/build-indexes', async (req, res, next) => {
  try {
    logger.info('Building 3-level index hierarchy...');
    
    const fs = require('fs').promises;
    const path = require('path');
    
    // Load extracted books
    const dataDir = path.join(process.cwd(), 'data', 'extracted');
    const files = await fs.readdir(dataDir);
    const books = [];
    
    for (const file of files) {
      if (file.endsWith('.json')) {
        const bookData = await fs.readFile(path.join(dataDir, file), 'utf-8');
        books.push(JSON.parse(bookData));
      }
    }
    
    if (books.length === 0) {
      return res.status(400).json({
        error: 'No books found. Please extract books first.'
      });
    }
    
    // Chunk all books
    const chunksMap = new Map();
    for (const book of books) {
      const chunks = await semanticChunker.chunkBook(book);
      chunksMap.set(book.id, chunks);
    }
    
    // Build indexes
    const { masterIndex, bookIndexes, chunkIndexes } = 
      await indexBuilder.buildAllIndexes(books, chunksMap);
    
    res.json({
      success: true,
      message: 'Indexes built successfully',
      stats: {
        books: masterIndex.totalBooks,
        totalTokens: masterIndex.totalTokens,
        bookIndexes: bookIndexes.size,
        chunkIndexes: chunkIndexes.size
      }
    });
    
  } catch (error) {
    next(error);
  }
});

/**
 * Load indexes into router
 */
router.post('/load-indexes', async (req, res, next) => {
  try {
    await hierarchicalRouter.loadIndexes();
    
    res.json({
      success: true,
      message: 'Indexes loaded into memory'
    });
    
  } catch (error) {
    next(error);
  }
});

/**
 * Main query endpoint
 */
router.post('/query', async (req, res, next) => {
  try {
    const { query, language = 'french', maxTokens, streamResponse = false } = req.body;
    
    if (!query) {
      return res.status(400).json({
        error: 'Query is required'
      });
    }
    
    logger.info(`Processing query: "${query.substring(0, 50)}..."`);
    
    // Route through 3-level hierarchy
    const routeResult = await hierarchicalRouter.route(query, {
      maxTokens,
      language: language as any
    });
    
    if (routeResult.chunks.length === 0) {
      return res.json({
        success: false,
        message: 'Aucun texte pertinent trouvé',
        response: {
          text: "Je n'ai pas trouvé d'enseignement de Rabbi Nachman correspondant à votre question.",
          citations: [],
          confidence: 0
        }
      });
    }
    
    // Generate response with Gemini
    if (streamResponse) {
      // Set up SSE for streaming
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive'
      });
      
      const generator = getGeminiGenerator().generateStream(query, routeResult, {
        language: language as any
      });
      
      for await (const chunk of generator) {
        res.write(`data: ${JSON.stringify({ chunk })}\n\n`);
      }
      
      res.write('data: [DONE]\n\n');
      res.end();
      
    } else {
      // Regular response
      const response = await getGeminiGenerator().generate(query, routeResult, {
        language: language as any
      });
      
      res.json({
        success: true,
        query,
        response,
        routing: {
          books: routeResult.books,
          sections: routeResult.sections.length,
          chunks: routeResult.chunks.length,
          totalTokens: routeResult.totalTokens,
          confidence: routeResult.confidence
        }
      });
    }
    
  } catch (error) {
    next(error);
  }
});

/**
 * Get thematic insights
 */
router.post('/insights', async (req, res, next) => {
  try {
    const { theme, language = 'french' } = req.body;
    
    if (!theme) {
      return res.status(400).json({
        error: 'Theme is required'
      });
    }
    
    // Route to find chunks related to theme
    const routeResult = await hierarchicalRouter.route(theme, {
      language: language as any
    });
    
    if (routeResult.chunks.length === 0) {
      return res.json({
        success: false,
        message: `Aucun enseignement trouvé sur le thème "${theme}"`
      });
    }
    
    // Generate thematic insights
    const insights = await getGeminiGenerator().generateThematicInsights(
      theme,
      routeResult.chunks
    );
    
    res.json({
      success: true,
      theme,
      insights,
      sources: routeResult.chunks.length
    });
    
  } catch (error) {
    next(error);
  }
});

export { router as ragRouter };