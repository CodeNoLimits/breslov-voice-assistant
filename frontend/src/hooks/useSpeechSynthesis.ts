import { useEffect, useRef, useState } from 'react';

export function useSpeechSynthesis() {
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);

  useEffect(() => {
    // Load available voices
    const loadVoices = () => {
      const availableVoices = window.speechSynthesis.getVoices();
      setVoices(availableVoices);
    };

    loadVoices();
    window.speechSynthesis.onvoiceschanged = loadVoices;

    return () => {
      window.speechSynthesis.cancel();
    };
  }, []);

  const speak = (
    text: string, 
    lang: string = 'fr-FR',
    options: {
      rate?: number;
      pitch?: number;
      volume?: number;
      voice?: string;
    } = {}
  ) => {
    // Cancel any ongoing speech
    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = lang;
    utterance.rate = options.rate || 1.0;
    utterance.pitch = options.pitch || 1.0;
    utterance.volume = options.volume || 1.0;

    // Select appropriate voice
    if (options.voice) {
      const selectedVoice = voices.find(v => v.name === options.voice);
      if (selectedVoice) {
        utterance.voice = selectedVoice;
      }
    } else {
      // Auto-select best voice for language
      const langVoices = voices.filter(v => v.lang.startsWith(lang.split('-')[0]));
      if (langVoices.length > 0) {
        // Prefer enhanced or premium voices
        const enhancedVoice = langVoices.find(v => 
          v.name.includes('Enhanced') || 
          v.name.includes('Premium') ||
          v.name.includes('Google')
        );
        utterance.voice = enhancedVoice || langVoices[0];
      }
    }

    utterance.onstart = () => {
      setIsSpeaking(true);
      setIsPaused(false);
    };

    utterance.onend = () => {
      setIsSpeaking(false);
      setIsPaused(false);
    };

    utterance.onerror = (event) => {
      console.error('Speech synthesis error:', event);
      setIsSpeaking(false);
      setIsPaused(false);
    };

    utteranceRef.current = utterance;
    window.speechSynthesis.speak(utterance);
  };

  const pause = () => {
    if (window.speechSynthesis.speaking && !window.speechSynthesis.paused) {
      window.speechSynthesis.pause();
      setIsPaused(true);
    }
  };

  const resume = () => {
    if (window.speechSynthesis.paused) {
      window.speechSynthesis.resume();
      setIsPaused(false);
    }
  };

  const stop = () => {
    window.speechSynthesis.cancel();
    setIsSpeaking(false);
    setIsPaused(false);
  };

  const getVoicesByLanguage = (lang: string) => {
    return voices.filter(v => v.lang.startsWith(lang.split('-')[0]));
  };

  return {
    speak,
    pause,
    resume,
    stop,
    isSpeaking,
    isPaused,
    voices,
    getVoicesByLanguage
  };
}