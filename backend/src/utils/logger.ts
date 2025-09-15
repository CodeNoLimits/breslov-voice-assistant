export const logger = {
  info: (message: string, meta?: any) => {
    console.log(`[${new Date().toISOString()}] INFO: ${message}`, meta || '');
  },
  
  error: (message: string, error?: any) => {
    console.error(`[${new Date().toISOString()}] ERROR: ${message}`, error || '');
  },
  
  warn: (message: string, meta?: any) => {
    console.warn(`[${new Date().toISOString()}] WARN: ${message}`, meta || '');
  },
  
  debug: (message: string, meta?: any) => {
    if (process.env.NODE_ENV === 'development') {
      console.log(`[${new Date().toISOString()}] DEBUG: ${message}`, meta || '');
    }
  }
};