import { logger } from '../utils/logger';
import OpenAI from 'openai';
import { Readable } from 'stream';

export interface TranscriptionResult {
  text: string;
  language: string;
  confidence: number;
  duration: number;
}

export interface SynthesisOptions {
  voice?: 'alloy' | 'echo' | 'fable' | 'onyx' | 'nova' | 'shimmer';
  speed?: number;
  language?: 'fr' | 'he' | 'en';
  format?: 'mp3' | 'opus' | 'aac' | 'flac';
}

export class VoiceService {
  private openai: OpenAI | null = null;
  
  constructor() {
    if (process.env.OPENAI_API_KEY) {
      this.openai = new OpenAI({
        apiKey: process.env.OPENAI_API_KEY
      });
      logger.info('✅ OpenAI Voice Services initialized');
    } else {
      logger.warn('⚠️ OpenAI API key not found, using Web Speech API fallback');
    }
  }
  
  /**
   * Transcribe audio to text (Speech-to-Text)
   */
  async transcribe(
    audioBuffer: Buffer,
    language: string = 'fr'
  ): Promise<TranscriptionResult> {
    const startTime = Date.now();
    
    if (!this.openai) {
      // Fallback to Web Speech API (handled on frontend)
      throw new Error('OpenAI not configured, use Web Speech API on frontend');
    }
    
    try {
      logger.info(`🎤 Transcribing audio (${audioBuffer.length} bytes)...`);
      
      // Convert buffer to File object for OpenAI
      const file = new File([audioBuffer], 'audio.webm', { type: 'audio/webm' });
      
      const transcription = await this.openai.audio.transcriptions.create({
        file,
        model: 'whisper-1',
        language,
        response_format: 'verbose_json'
      });
      
      const duration = Date.now() - startTime;
      
      logger.info(`✅ Transcription completed in ${duration}ms`);
      
      return {
        text: transcription.text,
        language: transcription.language || language,
        confidence: 0.95, // Whisper doesn't provide confidence scores
        duration
      };
      
    } catch (error) {
      logger.error('Transcription error:', error);
      throw error;
    }
  }
  
  /**
   * Synthesize text to speech (Text-to-Speech)
   */
  async synthesize(
    text: string,
    options: SynthesisOptions = {}
  ): Promise<Buffer> {
    const opts = {
      voice: 'nova' as const,
      speed: 1.0,
      language: 'fr' as const,
      format: 'mp3' as const,
      ...options
    };
    
    if (!this.openai) {
      // Fallback to Web Speech API (handled on frontend)
      throw new Error('OpenAI not configured, use Web Speech API on frontend');
    }
    
    try {
      logger.info(`🔊 Synthesizing ${text.length} characters...`);
      
      // Choose voice based on language
      const voice = this.selectVoice(opts.language, opts.voice);
      
      const mp3 = await this.openai.audio.speech.create({
        model: 'tts-1',
        voice,
        input: text,
        speed: opts.speed
      });
      
      const buffer = Buffer.from(await mp3.arrayBuffer());
      
      logger.info(`✅ Synthesized ${buffer.length} bytes of audio`);
      
      return buffer;
      
    } catch (error) {
      logger.error('Synthesis error:', error);
      throw error;
    }
  }
  
  /**
   * Stream synthesized speech
   */
  async *synthesizeStream(
    text: string,
    options: SynthesisOptions = {}
  ): AsyncGenerator<Buffer, void, unknown> {
    const opts = {
      voice: 'nova' as const,
      speed: 1.0,
      language: 'fr' as const,
      ...options
    };
    
    if (!this.openai) {
      throw new Error('OpenAI not configured for streaming');
    }
    
    try {
      logger.info(`🔊 Starting streamed synthesis...`);
      
      const voice = this.selectVoice(opts.language, opts.voice);
      
      // Split text into chunks for progressive synthesis
      const chunks = this.splitTextForStreaming(text);
      
      for (const chunk of chunks) {
        const mp3 = await this.openai.audio.speech.create({
          model: 'tts-1',
          voice,
          input: chunk,
          speed: opts.speed
        });
        
        const buffer = Buffer.from(await mp3.arrayBuffer());
        yield buffer;
      }
      
    } catch (error) {
      logger.error('Stream synthesis error:', error);
      throw error;
    }
  }
  
  /**
   * Select appropriate voice based on language
   */
  private selectVoice(
    language: string,
    requestedVoice: string
  ): 'alloy' | 'echo' | 'fable' | 'onyx' | 'nova' | 'shimmer' {
    // Language-optimized voice selection
    const voiceMap = {
      'fr': 'nova',    // Best for French
      'he': 'onyx',    // Deep voice for Hebrew
      'en': 'alloy'    // Clear for English
    };
    
    return (requestedVoice || voiceMap[language] || 'nova') as any;
  }
  
  /**
   * Split text for streaming synthesis
   */
  private splitTextForStreaming(text: string): string[] {
    const chunks: string[] = [];
    const sentences = text.match(/[^.!?]+[.!?]+/g) || [text];
    
    let currentChunk = '';
    
    for (const sentence of sentences) {
      if (currentChunk.length + sentence.length > 500) {
        if (currentChunk) {
          chunks.push(currentChunk.trim());
        }
        currentChunk = sentence;
      } else {
        currentChunk += ' ' + sentence;
      }
    }
    
    if (currentChunk) {
      chunks.push(currentChunk.trim());
    }
    
    return chunks;
  }
}

/**
 * Web Speech API Adapter for frontend fallback
 */
export class WebSpeechAdapter {
  /**
   * Initialize speech recognition (browser only)
   */
  static initializeSpeechRecognition(): any {
    if (typeof window === 'undefined') {
      throw new Error('Web Speech API is only available in browser');
    }
    
    const SpeechRecognition = (window as any).SpeechRecognition || 
                             (window as any).webkitSpeechRecognition;
    
    if (!SpeechRecognition) {
      throw new Error('Speech Recognition not supported in this browser');
    }
    
    const recognition = new SpeechRecognition();
    
    // Configure recognition
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'fr-FR';
    recognition.maxAlternatives = 1;
    
    return recognition;
  }
  
  /**
   * Initialize speech synthesis (browser only)
   */
  static initializeSpeechSynthesis(): any {
    if (typeof window === 'undefined') {
      throw new Error('Web Speech API is only available in browser');
    }
    
    if (!('speechSynthesis' in window)) {
      throw new Error('Speech Synthesis not supported in this browser');
    }
    
    return window.speechSynthesis;
  }
  
  /**
   * Create utterance for synthesis
   */
  static createUtterance(
    text: string,
    lang: string = 'fr-FR',
    rate: number = 1.0,
    pitch: number = 1.0
  ): any {
    if (typeof window === 'undefined') {
      throw new Error('Web Speech API is only available in browser');
    }
    
    const utterance = new (window as any).SpeechSynthesisUtterance(text);
    utterance.lang = lang;
    utterance.rate = rate;
    utterance.pitch = pitch;
    utterance.volume = 1.0;
    
    // Select voice based on language
    const voices = window.speechSynthesis.getVoices();
    const voice = voices.find(v => v.lang.startsWith(lang.split('-')[0]));
    if (voice) {
      utterance.voice = voice;
    }
    
    return utterance;
  }
}

// Export singleton
export const voiceService = new VoiceService();