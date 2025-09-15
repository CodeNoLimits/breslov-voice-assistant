import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';
import rateLimit from 'express-rate-limit';

// Load environment variables
dotenv.config();

// Import routers
import { sefariaRouter } from './api/sefaria.router';
import { ragRouter } from './api/rag.router';
import { voiceRouter } from './api/voice.router';
import { healthRouter } from './api/health.router';
import { setupRouter } from './api/setup.router';

// Import middleware
import { errorHandler } from './utils/errorHandler';
import { logger } from './utils/logger';

// Import database initialization
import { initializeDatabase } from './utils/database';

// Create Express app
const app = express();
const PORT = process.env.PORT || 3000;

// Security middleware
app.use(helmet());
app.use(cors({
  origin: process.env.CORS_ORIGIN || 'http://localhost:5173',
  credentials: true
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000'),
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '100'),
  message: 'Too many requests from this IP, please try again later.'
});
app.use('/api', limiter);

// Body parsing middleware
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Request logging
app.use((req, res, next) => {
  logger.info(`${req.method} ${req.path}`, {
    ip: req.ip,
    userAgent: req.get('user-agent')
  });
  next();
});

// API Routes
app.use('/api/health', healthRouter);
app.use('/api/sefaria', sefariaRouter);
app.use('/api/rag', ragRouter);
app.use('/api/voice', voiceRouter);
app.use('/api/setup', setupRouter);
app.use('/api', setupRouter); // Also mount at /api for /api/status
app.use('/extract', setupRouter); // Mount for /extract/books
app.use('/nlp', setupRouter); // Mount for /nlp endpoints

// Root endpoint
app.get('/', (req, res) => {
  res.json({
    name: 'Rabbi Nachman Voice API',
    version: '1.0.0',
    status: 'running',
    endpoints: {
      health: '/api/health',
      sefaria: '/api/sefaria',
      rag: '/api/rag',
      voice: '/api/voice',
      setup: '/api/setup',
      extract: '/extract/books',
      nlp: '/nlp/chunk-books'
    }
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    error: 'Not Found',
    message: `Cannot ${req.method} ${req.path}`
  });
});

// Error handling middleware
app.use(errorHandler);

// Initialize database before starting server
async function startServer() {
  try {
    // Initialize database with pgvector
    await initializeDatabase();
    
    // Start server
    const server = app.listen(PORT, () => {
      logger.info(`🚀 Rabbi Nachman Voice API running on port ${PORT}`);
      logger.info(`📚 Environment: ${process.env.NODE_ENV || 'development'}`);
      logger.info(`🔗 Health check: http://localhost:${PORT}/api/health`);
      logger.info(`🎯 Complete setup: POST http://localhost:${PORT}/api/setup/complete`);
    });
    
    return server;
  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
}

// Start the server
const server = startServer();

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM received, shutting down gracefully...');
  server.close(() => {
    logger.info('Server closed');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  logger.info('SIGINT received, shutting down gracefully...');
  server.close(() => {
    logger.info('Server closed');
    process.exit(0);
  });
});

export default app;