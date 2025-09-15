import { Router } from 'express';
import { voiceService } from '../voice/voiceService';
import { logger } from '../utils/logger';
import multer from 'multer';

const router = Router();

// Configure multer for audio upload
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB max
  }
});

/**
 * Transcribe audio to text
 */
router.post('/transcribe', upload.single('audio'), async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        error: 'Audio file is required'
      });
    }
    
    const { language = 'fr' } = req.body;
    
    logger.info(`Transcribing audio: ${req.file.size} bytes, language: ${language}`);
    
    const result = await voiceService.transcribe(
      req.file.buffer,
      language
    );
    
    res.json({
      success: true,
      transcription: result
    });
    
  } catch (error) {
    // If OpenAI not configured, suggest frontend fallback
    if (error.message.includes('Web Speech API')) {
      return res.status(501).json({
        error: 'Server-side transcription not available',
        suggestion: 'Use Web Speech API on frontend',
        fallback: true
      });
    }
    next(error);
  }
});

/**
 * Synthesize text to speech
 */
router.post('/synthesize', async (req, res, next) => {
  try {
    const { text, voice, speed = 1.0, language = 'fr' } = req.body;
    
    if (!text) {
      return res.status(400).json({
        error: 'Text is required'
      });
    }
    
    logger.info(`Synthesizing text: ${text.length} chars, language: ${language}`);
    
    const audioBuffer = await voiceService.synthesize(text, {
      voice: voice as any,
      speed,
      language: language as any
    });
    
    // Send audio file
    res.set({
      'Content-Type': 'audio/mpeg',
      'Content-Length': audioBuffer.length.toString()
    });
    
    res.send(audioBuffer);
    
  } catch (error) {
    // If OpenAI not configured, suggest frontend fallback
    if (error.message.includes('Web Speech API')) {
      return res.status(501).json({
        error: 'Server-side synthesis not available',
        suggestion: 'Use Web Speech API on frontend',
        fallback: true
      });
    }
    next(error);
  }
});

/**
 * Stream synthesized speech
 */
router.post('/synthesize-stream', async (req, res, next) => {
  try {
    const { text, voice, speed = 1.0, language = 'fr' } = req.body;
    
    if (!text) {
      return res.status(400).json({
        error: 'Text is required'
      });
    }
    
    logger.info(`Starting streamed synthesis: ${text.length} chars`);
    
    // Set up streaming response
    res.set({
      'Content-Type': 'audio/mpeg',
      'Transfer-Encoding': 'chunked',
      'Cache-Control': 'no-cache'
    });
    
    const generator = voiceService.synthesizeStream(text, {
      voice: voice as any,
      speed,
      language: language as any
    });
    
    for await (const chunk of generator) {
      res.write(chunk);
    }
    
    res.end();
    
  } catch (error) {
    next(error);
  }
});

/**
 * Get available voices
 */
router.get('/voices', (req, res) => {
  res.json({
    voices: [
      { id: 'alloy', name: 'Alloy', languages: ['en'] },
      { id: 'echo', name: 'Echo', languages: ['en'] },
      { id: 'fable', name: 'Fable', languages: ['en'] },
      { id: 'onyx', name: 'Onyx', languages: ['he', 'en'] },
      { id: 'nova', name: 'Nova', languages: ['fr', 'en'] },
      { id: 'shimmer', name: 'Shimmer', languages: ['en'] }
    ],
    webSpeechAvailable: true,
    openAIAvailable: !!process.env.OPENAI_API_KEY
  });
});

export { router as voiceRouter };