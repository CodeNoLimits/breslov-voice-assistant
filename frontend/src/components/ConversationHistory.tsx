import { motion } from 'framer-motion';
import { X, Clock, MessageSquare } from 'lucide-react';
import { useStore } from '../store/useStore';

interface ConversationHistoryProps {
  onClose: () => void;
  onSelectQuery: (query: string) => void;
}

export default function ConversationHistory({
  onClose,
  onSelectQuery
}: ConversationHistoryProps) {
  const { history, clearHistory } = useStore();

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
        className="w-full max-w-2xl max-h-[80vh] glass-panel p-6 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <MessageSquare className="w-6 h-6 text-primary-400" />
            <h2 className="text-xl font-semibold">Historique des conversations</h2>
          </div>
          
          <button
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-gray-100 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* History List */}
        <div className="overflow-y-auto max-h-[60vh] space-y-3">
          {history.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              <MessageSquare className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p>Aucune conversation enregistrée</p>
            </div>
          ) : (
            history.map((item, index) => (
              <motion.div
                key={index}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.05 }}
                className="p-4 bg-gray-800/50 rounded-lg hover:bg-gray-800/70 
                         transition-colors cursor-pointer group"
                onClick={() => {
                  onSelectQuery(item.query);
                  onClose();
                }}
              >
                <div className="flex items-start justify-between mb-2">
                  <p className="font-medium text-gray-100 group-hover:text-primary-400 
                              transition-colors line-clamp-1">
                    {item.query}
                  </p>
                  <span className="text-xs text-gray-500 flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    {new Date(item.timestamp).toLocaleTimeString('fr-FR', {
                      hour: '2-digit',
                      minute: '2-digit'
                    })}
                  </span>
                </div>
                
                {item.response?.text && (
                  <p className="text-sm text-gray-400 line-clamp-2">
                    {item.response.text}
                  </p>
                )}
              </motion.div>
            ))
          )}
        </div>

        {/* Footer */}
        {history.length > 0 && (
          <div className="mt-6 pt-4 border-t border-gray-800">
            <button
              onClick={() => {
                if (confirm('Êtes-vous sûr de vouloir effacer l\'historique ?')) {
                  clearHistory();
                }
              }}
              className="text-sm text-red-400 hover:text-red-300 transition-colors"
            >
              Effacer l'historique
            </button>
          </div>
        )}
      </motion.div>
    </motion.div>
  );
}