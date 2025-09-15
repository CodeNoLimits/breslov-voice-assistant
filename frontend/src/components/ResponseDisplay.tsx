import { motion } from 'framer-motion';
import { Volume2, VolumeX, BookOpen, Quote } from 'lucide-react';

interface ResponseDisplayProps {
  response: any;
  onSpeak: (text: string) => void;
  onStop: () => void;
  isSpeaking: boolean;
}

export default function ResponseDisplay({
  response,
  onSpeak,
  onStop,
  isSpeaking
}: ResponseDisplayProps) {
  if (!response) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className="space-y-4"
    >
      {/* Response Text */}
      <div className="p-6 bg-gray-800/50 rounded-xl">
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-2">
            <Quote className="w-5 h-5 text-primary-400" />
            <h3 className="font-semibold text-gray-100">Réponse</h3>
          </div>
          
          <button
            onClick={() => isSpeaking ? onStop() : onSpeak(response.audioOptimized || response.text)}
            className="p-2 text-gray-400 hover:text-primary-400 transition-colors"
          >
            {isSpeaking ? (
              <VolumeX className="w-5 h-5" />
            ) : (
              <Volume2 className="w-5 h-5" />
            )}
          </button>
        </div>
        
        <div className="prose prose-invert max-w-none">
          <p className="text-gray-200 leading-relaxed whitespace-pre-wrap">
            {response.text}
          </p>
        </div>
        
        {/* Confidence Indicator */}
        {response.confidence !== undefined && (
          <div className="mt-4 pt-4 border-t border-gray-700">
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-500">Confiance</span>
              <div className="flex items-center gap-2">
                <div className="w-32 h-2 bg-gray-700 rounded-full overflow-hidden">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${response.confidence * 100}%` }}
                    transition={{ duration: 0.5, ease: 'easeOut' }}
                    className={`h-full ${
                      response.confidence > 0.7 
                        ? 'bg-green-500' 
                        : response.confidence > 0.4 
                        ? 'bg-yellow-500' 
                        : 'bg-red-500'
                    }`}
                  />
                </div>
                <span className="text-gray-400">
                  {Math.round(response.confidence * 100)}%
                </span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Citations */}
      {response.citations && response.citations.length > 0 && (
        <div className="p-6 bg-gray-800/30 rounded-xl">
          <div className="flex items-center gap-2 mb-3">
            <BookOpen className="w-5 h-5 text-primary-400" />
            <h4 className="font-semibold text-gray-100">Sources</h4>
          </div>
          
          <div className="space-y-2">
            {response.citations.map((citation: any, index: number) => (
              <motion.div
                key={index}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: index * 0.1 }}
                className="flex items-start gap-2 text-sm"
              >
                <span className="text-primary-400 mt-0.5">•</span>
                <div>
                  <span className="text-gray-300">{citation.source}</span>
                  {citation.reference && (
                    <span className="text-gray-500 ml-2">
                      [{citation.reference}]
                    </span>
                  )}
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      )}

      {/* Metadata */}
      {response.metadata && (
        <div className="flex items-center justify-between text-xs text-gray-500">
          <span>
            Modèle: {response.metadata.model}
          </span>
          <span>
            Temps: {response.metadata.generationTime}ms
          </span>
          <span>
            Tokens: {response.metadata.tokensUsed}
          </span>
        </div>
      )}
    </motion.div>
  );
}