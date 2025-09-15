import { Pool } from 'pg';
import { logger } from './logger';

// PostgreSQL connection pool
export const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME || 'rabbi_nachman_voice',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

/**
 * Initialize database with pgvector extension and required tables
 */
export async function initializeDatabase() {
  try {
    logger.info('🔧 Initializing database...');
    
    // Create pgvector extension
    await pool.query('CREATE EXTENSION IF NOT EXISTS vector');
    logger.info('✅ pgvector extension enabled');
    
    // Create books table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS books (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        title TEXT NOT NULL,
        hebrew_title TEXT,
        reference TEXT UNIQUE,
        content JSONB,
        metadata JSONB,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    logger.info('✅ Books table created');
    
    // Create chunks table with vector support
    await pool.query(`
      CREATE TABLE IF NOT EXISTS chunks (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        book_id UUID REFERENCES books(id) ON DELETE CASCADE,
        content TEXT,
        hebrew_text TEXT,
        reference TEXT,
        position INTEGER,
        token_count INTEGER,
        embedding vector(1536),
        metadata JSONB,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT unique_book_position UNIQUE(book_id, position)
      )
    `);
    logger.info('✅ Chunks table created');
    
    // Create indexes table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS indexes (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        type TEXT NOT NULL, -- 'master', 'book', or 'chunk'
        name TEXT UNIQUE NOT NULL,
        content JSONB NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    logger.info('✅ Indexes table created');
    
    // Create search_logs table for analytics
    await pool.query(`
      CREATE TABLE IF NOT EXISTS search_logs (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        query TEXT NOT NULL,
        language TEXT,
        results_count INTEGER,
        response_time_ms INTEGER,
        user_session TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    logger.info('✅ Search logs table created');
    
    // Create vector similarity search index
    await pool.query(`
      CREATE INDEX IF NOT EXISTS chunks_embedding_idx 
      ON chunks 
      USING ivfflat (embedding vector_cosine_ops)
      WITH (lists = 100)
    `);
    logger.info('✅ Vector similarity index created');
    
    // Create text search indexes
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_chunks_content_gin 
      ON chunks 
      USING gin(to_tsvector('english', content))
    `);
    
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_chunks_hebrew_gin 
      ON chunks 
      USING gin(to_tsvector('hebrew', hebrew_text))
    `);
    logger.info('✅ Text search indexes created');
    
    // Create other useful indexes
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_chunks_book_id ON chunks(book_id);
      CREATE INDEX IF NOT EXISTS idx_chunks_reference ON chunks(reference);
      CREATE INDEX IF NOT EXISTS idx_books_reference ON books(reference);
    `);
    logger.info('✅ Additional indexes created');
    
    logger.info('✅ Database initialization complete');
    
  } catch (error) {
    logger.error('❌ Database initialization failed:', error);
    throw error;
  }
}

/**
 * Vector similarity search using pgvector
 */
export async function vectorSearch(
  embedding: number[], 
  limit: number = 10,
  threshold: number = 0.7
): Promise<any[]> {
  const query = `
    SELECT 
      id,
      book_id,
      reference,
      content,
      hebrew_text,
      1 - (embedding <=> $1::vector) as similarity
    FROM chunks
    WHERE 1 - (embedding <=> $1::vector) > $2
    ORDER BY embedding <=> $1::vector
    LIMIT $3
  `;
  
  const result = await pool.query(query, [
    JSON.stringify(embedding),
    threshold,
    limit
  ]);
  
  return result.rows;
}

/**
 * Hybrid search combining vector and text search
 */
export async function hybridSearch(
  query: string,
  embedding: number[],
  limit: number = 10
): Promise<any[]> {
  const sqlQuery = `
    WITH vector_results AS (
      SELECT 
        id,
        book_id,
        reference,
        content,
        hebrew_text,
        1 - (embedding <=> $1::vector) as vector_score
      FROM chunks
      ORDER BY embedding <=> $1::vector
      LIMIT $3
    ),
    text_results AS (
      SELECT 
        id,
        book_id,
        reference,
        content,
        hebrew_text,
        ts_rank_cd(to_tsvector('english', content), plainto_tsquery('english', $2)) as text_score
      FROM chunks
      WHERE to_tsvector('english', content) @@ plainto_tsquery('english', $2)
      LIMIT $3
    )
    SELECT DISTINCT
      id,
      book_id,
      reference,
      content,
      hebrew_text,
      COALESCE(v.vector_score, 0) * 0.7 + COALESCE(t.text_score, 0) * 0.3 as combined_score
    FROM vector_results v
    FULL OUTER JOIN text_results t USING (id)
    ORDER BY combined_score DESC
    LIMIT $3
  `;
  
  const result = await pool.query(sqlQuery, [
    JSON.stringify(embedding),
    query,
    limit
  ]);
  
  return result.rows;
}

/**
 * Clean up database connections
 */
export async function closeDatabase() {
  await pool.end();
  logger.info('Database connections closed');
}