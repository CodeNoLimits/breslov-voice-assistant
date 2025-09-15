import { Router } from 'express';
import { Pool } from 'pg';
import Redis from 'ioredis';

const router = Router();

// Health check endpoint
router.get('/', async (req, res) => {
  const health = {
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV || 'development',
    services: {
      api: 'operational',
      database: 'checking...',
      redis: 'checking...'
    }
  };

  // Check database connection
  try {
    const pool = new Pool({
      connectionString: process.env.DATABASE_URL
    });
    await pool.query('SELECT 1');
    await pool.end();
    health.services.database = 'operational';
  } catch (error) {
    health.services.database = 'unavailable';
    health.status = 'degraded';
  }

  // Check Redis connection
  try {
    const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');
    await redis.ping();
    redis.disconnect();
    health.services.redis = 'operational';
  } catch (error) {
    health.services.redis = 'unavailable';
    health.status = 'degraded';
  }

  const statusCode = health.status === 'ok' ? 200 : 503;
  res.status(statusCode).json(health);
});

// Readiness check
router.get('/ready', (req, res) => {
  res.status(200).json({ ready: true });
});

// Liveness check
router.get('/live', (req, res) => {
  res.status(200).json({ alive: true });
});

export { router as healthRouter };