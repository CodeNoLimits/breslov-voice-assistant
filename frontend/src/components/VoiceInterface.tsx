import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Mic, MicOff, Volume2, VolumeX, Loader2, Send, History, BookOpen } from 'lucide-react';
import { useVoiceRecognition } from '../hooks/useVoiceRecognition';
import { useSpeechSynthesis } from '../hooks/useSpeechSynthesis';
import { useQuery } from '../hooks/useQuery';
import ConversationHistory from './ConversationHistory';
import ResponseDisplay from './ResponseDisplay';
import SourcesPanel from './SourcesPanel';
import toast from 'react-hot-toast';

export default function VoiceInterface() {
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [response, setResponse] = useState<any>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [showSources, setShowSources] = useState(false);
  
  const { startListening, stopListening, isSupported } = useVoiceRecognition({
    onTranscript: setTranscript,
    onEnd: handleQuery,
    language: 'fr-FR'
  });
  
  const { speak, stop: stopSpeaking, isSpeaking } = useSpeechSynthesis();
  const { submitQuery } = useQuery();
  
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleQuery(finalTranscript?: string) {
    const query = finalTranscript || transcript;
    
    if (!query.trim()) {
      toast.error('Veuillez poser une question');
      return;
    }
    
    setIsProcessing(true);
    stopSpeaking();
    
    try {
      const result = await submitQuery(query);
      
      if (result.success) {
        setResponse(result.response);
        
        // Auto-speak the response
        if (result.response.audioOptimized) {
          speak(result.response.audioOptimized, 'fr-FR');
        }
        
        // Show sources if available
        if (result.routing?.chunks > 0) {
          setShowSources(true);
        }
      } else {
        toast.error(result.message || 'Aucune réponse trouvée');
      }
    } catch (error) {
      toast.error('Erreur lors de la recherche');
      console.error(error);
    } finally {
      setIsProcessing(false);
    }
  }

  function toggleListening() {
    if (!isSupported) {
      toast.error('La reconnaissance vocale n\'est pas supportée par votre navigateur');
      return;
    }
    
    if (isListening) {
      stopListening();
      stopSpeaking();
    } else {
      startListening();
      setTranscript('');
      setResponse(null);
    }
    setIsListening(!isListening);
  }

  function handleTextSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (transcript.trim()) {
      handleQuery(transcript);
    }
  }

  return (
    <div className="max-w-6xl mx-auto">
      {/* Hero Section */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-center mb-12"
      >
        <h1 className="text-5xl font-bold mb-4">
          <span className="text-gradient">Rabbi Nachman Voice</span>
        </h1>
        <p className="text-xl text-gray-400">
          Explorez la sagesse de Rabbi Nachman de Breslov par la voix
        </p>
      </motion.div>

      {/* Main Interface */}
      <div className="grid lg:grid-cols-3 gap-6">
        {/* Voice Control Panel */}
        <div className="lg:col-span-2">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="glass-panel p-8"
          >
            {/* Microphone Button */}
            <div className="flex justify-center mb-8">
              <motion.button
                onClick={toggleListening}
                className={`relative w-32 h-32 rounded-full flex items-center justify-center transition-all ${
                  isListening
                    ? 'bg-red-500 shadow-lg shadow-red-500/50'
                    : 'bg-primary-600 hover:bg-primary-700 shadow-lg shadow-primary-600/30'
                }`}
                whileTap={{ scale: 0.95 }}
                disabled={isProcessing}
              >
                {isListening && (
                  <motion.div
                    className="absolute inset-0 rounded-full bg-red-500"
                    animate={{ scale: [1, 1.2, 1] }}
                    transition={{ duration: 1.5, repeat: Infinity }}
                    style={{ opacity: 0.3 }}
                  />
                )}
                
                {isProcessing ? (
                  <Loader2 className="w-12 h-12 text-white animate-spin" />
                ) : isListening ? (
                  <MicOff className="w-12 h-12 text-white" />
                ) : (
                  <Mic className="w-12 h-12 text-white" />
                )}
              </motion.button>
            </div>

            {/* Status Text */}
            <div className="text-center mb-6">
              <AnimatePresence mode="wait">
                {isListening && (
                  <motion.p
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="text-red-400 font-medium"
                  >
                    🔴 Écoute en cours...
                  </motion.p>
                )}
                {isProcessing && (
                  <motion.p
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="text-primary-400 font-medium"
                  >
                    🤔 Recherche dans les enseignements...
                  </motion.p>
                )}
                {isSpeaking && (
                  <motion.p
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="text-green-400 font-medium"
                  >
                    🔊 Lecture en cours...
                  </motion.p>
                )}
              </AnimatePresence>
            </div>

            {/* Text Input */}
            <form onSubmit={handleTextSubmit} className="mb-6">
              <div className="relative">
                <input
                  ref={inputRef}
                  type="text"
                  value={transcript}
                  onChange={(e) => setTranscript(e.target.value)}
                  placeholder="Ou tapez votre question ici..."
                  className="w-full px-6 py-4 pr-12 bg-gray-800 border border-gray-700 rounded-xl
                           text-gray-100 placeholder-gray-500 focus:outline-none focus:border-primary-500
                           transition-colors"
                  disabled={isProcessing || isListening}
                />
                <button
                  type="submit"
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-2 text-gray-400
                           hover:text-primary-400 transition-colors disabled:opacity-50"
                  disabled={!transcript.trim() || isProcessing}
                >
                  <Send className="w-5 h-5" />
                </button>
              </div>
            </form>

            {/* Transcript Display */}
            <AnimatePresence>
              {transcript && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="mb-6 p-4 bg-gray-800/50 rounded-lg"
                >
                  <p className="text-sm text-gray-400 mb-1">Votre question :</p>
                  <p className="text-gray-100">{transcript}</p>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Response Display */}
            <AnimatePresence>
              {response && (
                <ResponseDisplay
                  response={response}
                  onSpeak={(text) => speak(text, 'fr-FR')}
                  onStop={stopSpeaking}
                  isSpeaking={isSpeaking}
                />
              )}
            </AnimatePresence>
          </motion.div>
        </div>

        {/* Side Panel */}
        <div className="space-y-6">
          {/* Controls */}
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.2 }}
            className="glass-panel p-6"
          >
            <h3 className="text-lg font-semibold mb-4">Contrôles</h3>
            
            <div className="space-y-3">
              <button
                onClick={() => setShowHistory(!showHistory)}
                className="w-full flex items-center justify-between px-4 py-3 bg-gray-800
                         rounded-lg hover:bg-gray-700 transition-colors"
              >
                <span className="flex items-center gap-2">
                  <History className="w-4 h-4" />
                  Historique
                </span>
                <span className="text-sm text-gray-500">
                  {showHistory ? 'Masquer' : 'Afficher'}
                </span>
              </button>
              
              <button
                onClick={() => setShowSources(!showSources)}
                className="w-full flex items-center justify-between px-4 py-3 bg-gray-800
                         rounded-lg hover:bg-gray-700 transition-colors"
              >
                <span className="flex items-center gap-2">
                  <BookOpen className="w-4 h-4" />
                  Sources
                </span>
                <span className="text-sm text-gray-500">
                  {showSources ? 'Masquer' : 'Afficher'}
                </span>
              </button>
              
              <button
                onClick={() => {
                  if (isSpeaking) {
                    stopSpeaking();
                  } else if (response?.audioOptimized) {
                    speak(response.audioOptimized, 'fr-FR');
                  }
                }}
                className="w-full flex items-center justify-between px-4 py-3 bg-gray-800
                         rounded-lg hover:bg-gray-700 transition-colors"
                disabled={!response}
              >
                <span className="flex items-center gap-2">
                  {isSpeaking ? (
                    <VolumeX className="w-4 h-4" />
                  ) : (
                    <Volume2 className="w-4 h-4" />
                  )}
                  Audio
                </span>
                <span className="text-sm text-gray-500">
                  {isSpeaking ? 'Arrêter' : 'Écouter'}
                </span>
              </button>
            </div>
          </motion.div>

          {/* Quick Examples */}
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.3 }}
            className="glass-panel p-6"
          >
            <h3 className="text-lg font-semibold mb-4">Exemples de questions</h3>
            
            <div className="space-y-2">
              {[
                "Que dit Rabbi Nachman sur la joie ?",
                "Comment pratiquer l'hitbodedout ?",
                "Qu'est-ce que le Tikoun HaKlali ?",
                "Les enseignements sur la foi simple"
              ].map((example, index) => (
                <button
                  key={index}
                  onClick={() => {
                    setTranscript(example);
                    handleQuery(example);
                  }}
                  className="w-full text-left px-3 py-2 text-sm text-gray-400
                           hover:text-gray-100 hover:bg-gray-800 rounded-lg
                           transition-colors"
                  disabled={isProcessing}
                >
                  "{example}"
                </button>
              ))}
            </div>
          </motion.div>
        </div>
      </div>

      {/* History Panel */}
      <AnimatePresence>
        {showHistory && (
          <ConversationHistory
            onClose={() => setShowHistory(false)}
            onSelectQuery={(q) => {
              setTranscript(q);
              handleQuery(q);
            }}
          />
        )}
      </AnimatePresence>

      {/* Sources Panel */}
      <AnimatePresence>
        {showSources && response && (
          <SourcesPanel
            sources={response.citations || []}
            onClose={() => setShowSources(false)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}