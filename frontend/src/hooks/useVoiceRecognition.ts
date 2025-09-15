import { useEffect, useRef, useState } from 'react';

interface UseVoiceRecognitionOptions {
  onTranscript: (transcript: string) => void;
  onEnd?: (finalTranscript: string) => void;
  language?: string;
}

export function useVoiceRecognition({
  onTranscript,
  onEnd,
  language = 'fr-FR'
}: UseVoiceRecognitionOptions) {
  const [isListening, setIsListening] = useState(false);
  const [isSupported, setIsSupported] = useState(false);
  const recognitionRef = useRef<any>(null);
  const finalTranscriptRef = useRef<string>('');

  useEffect(() => {
    // Check if Web Speech API is supported
    const SpeechRecognition = 
      (window as any).SpeechRecognition || 
      (window as any).webkitSpeechRecognition;
    
    if (SpeechRecognition) {
      setIsSupported(true);
      
      const recognition = new SpeechRecognition();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = language;
      recognition.maxAlternatives = 1;
      
      recognition.onstart = () => {
        console.log('Speech recognition started');
        setIsListening(true);
      };
      
      recognition.onresult = (event: any) => {
        let interimTranscript = '';
        let finalTranscript = '';
        
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const transcript = event.results[i][0].transcript;
          
          if (event.results[i].isFinal) {
            finalTranscript += transcript + ' ';
          } else {
            interimTranscript += transcript;
          }
        }
        
        if (finalTranscript) {
          finalTranscriptRef.current += finalTranscript;
        }
        
        const currentTranscript = finalTranscriptRef.current + interimTranscript;
        onTranscript(currentTranscript);
      };
      
      recognition.onerror = (event: any) => {
        console.error('Speech recognition error:', event.error);
        setIsListening(false);
        
        if (event.error === 'no-speech') {
          console.log('No speech detected');
        }
      };
      
      recognition.onend = () => {
        console.log('Speech recognition ended');
        setIsListening(false);
        
        if (finalTranscriptRef.current && onEnd) {
          onEnd(finalTranscriptRef.current.trim());
        }
      };
      
      recognitionRef.current = recognition;
    } else {
      console.warn('Web Speech API not supported');
      setIsSupported(false);
    }
    
    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.abort();
      }
    };
  }, [language, onTranscript, onEnd]);

  const startListening = () => {
    if (recognitionRef.current && !isListening) {
      finalTranscriptRef.current = '';
      try {
        recognitionRef.current.start();
      } catch (error) {
        console.error('Failed to start speech recognition:', error);
      }
    }
  };

  const stopListening = () => {
    if (recognitionRef.current && isListening) {
      recognitionRef.current.stop();
    }
  };

  return {
    isListening,
    isSupported,
    startListening,
    stopListening
  };
}