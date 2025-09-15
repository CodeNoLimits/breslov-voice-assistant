import { motion } from 'framer-motion';
import { X, BookOpen, ExternalLink } from 'lucide-react';

interface SourcesPanelProps {
  sources: any[];
  onClose: () => void;
}

export default function SourcesPanel({ sources, onClose }: SourcesPanelProps) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.95, opacity: 0 }}
        className="w-full max-w-3xl max-h-[80vh] glass-panel p-6 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <BookOpen className="w-6 h-6 text-primary-400" />
            <h2 className="text-xl font-semibold">Sources et Références</h2>
          </div>
          
          <button
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-gray-100 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Sources List */}
        <div className="overflow-y-auto max-h-[60vh] space-y-4">
          {sources.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              <BookOpen className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p>Aucune source disponible</p>
            </div>
          ) : (
            sources.map((source, index) => (
              <motion.div
                key={index}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: index * 0.1 }}
                className="p-4 bg-gray-800/50 rounded-lg"
              >
                <div className="flex items-start justify-between mb-2">
                  <h3 className="font-semibold text-primary-400">
                    {source.source}
                  </h3>
                  <button
                    className="p-1 text-gray-400 hover:text-primary-400 transition-colors"
                    title="Voir sur Sefaria"
                  >
                    <ExternalLink className="w-4 h-4" />
                  </button>
                </div>
                
                {source.reference && (
                  <p className="text-sm text-gray-500 mb-2">
                    {source.reference}
                  </p>
                )}
                
                {source.text && (
                  <p className="text-sm text-gray-300 italic">
                    "{source.text}"
                  </p>
                )}
                
                {source.bookId && (
                  <div className="mt-2 flex items-center gap-4 text-xs text-gray-500">
                    <span>Livre: {formatBookId(source.bookId)}</span>
                  </div>
                )}
              </motion.div>
            ))
          )}
        </div>

        {/* Footer Info */}
        <div className="mt-6 pt-4 border-t border-gray-800">
          <p className="text-xs text-gray-500 text-center">
            Les textes proviennent de la base de données Sefaria et des œuvres de Rabbi Nachman de Breslov
          </p>
        </div>
      </motion.div>
    </motion.div>
  );
}

function formatBookId(bookId: string): string {
  const bookNames: Record<string, string> = {
    'likutey_moharan_1': 'Likoutey Moharan I',
    'likutey_moharan_2': 'Likoutey Moharan II',
    'chayei_moharan': 'Chayei Moharan',
    'likutey_tefilot': 'Likoutey Tefilot',
    'sippurei_maasiyot': 'Sippourei Maasiyot',
    'shivchey_haran': 'Shivchey HaRan',
    'sichot_haran': 'Sichot HaRan',
    'sefer_hamidot': 'Sefer HaMidot',
    'likutey_etzot': 'Likoutey Etzot'
  };
  
  return bookNames[bookId] || bookId;
}