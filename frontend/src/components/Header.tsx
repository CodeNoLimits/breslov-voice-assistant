import { motion } from 'framer-motion';
import { BookOpen, Settings, Moon, Sun } from 'lucide-react';
import { useStore } from '../store/useStore';

export default function Header() {
  const { isDarkMode, toggleDarkMode } = useStore();

  return (
    <motion.header
      initial={{ opacity: 0, y: -20 }}
      animate={{ opacity: 1, y: 0 }}
      className="border-b border-gray-800 bg-gray-900/50 backdrop-blur-xl"
    >
      <div className="container mx-auto px-4 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <BookOpen className="w-8 h-8 text-primary-500" />
            <div>
              <h1 className="text-xl font-bold text-gray-100">Rabbi Nachman Voice</h1>
              <p className="text-xs text-gray-500">Sagesse de Breslov</p>
            </div>
          </div>
          
          <div className="flex items-center gap-4">
            <button
              onClick={toggleDarkMode}
              className="p-2 text-gray-400 hover:text-gray-100 transition-colors"
              aria-label="Toggle dark mode"
            >
              {isDarkMode ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
            </button>
            
            <button
              className="p-2 text-gray-400 hover:text-gray-100 transition-colors"
              aria-label="Settings"
            >
              <Settings className="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>
    </motion.header>
  );
}