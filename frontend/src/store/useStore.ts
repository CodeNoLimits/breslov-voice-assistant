import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface HistoryItem {
  query: string;
  response: any;
  timestamp: Date;
}

interface Store {
  // UI State
  isDarkMode: boolean;
  toggleDarkMode: () => void;
  
  // Conversation History
  history: HistoryItem[];
  addToHistory: (item: HistoryItem) => void;
  clearHistory: () => void;
  
  // Preferences
  preferences: {
    language: string;
    voice: string;
    speechRate: number;
    autoSpeak: boolean;
  };
  updatePreferences: (prefs: Partial<Store['preferences']>) => void;
}

export const useStore = create<Store>()(
  persist(
    (set) => ({
      // UI State
      isDarkMode: true,
      toggleDarkMode: () => set((state) => ({ isDarkMode: !state.isDarkMode })),
      
      // Conversation History
      history: [],
      addToHistory: (item) => set((state) => ({
        history: [item, ...state.history].slice(0, 50) // Keep last 50 items
      })),
      clearHistory: () => set({ history: [] }),
      
      // Preferences
      preferences: {
        language: 'french',
        voice: 'default',
        speechRate: 1.0,
        autoSpeak: true
      },
      updatePreferences: (prefs) => set((state) => ({
        preferences: { ...state.preferences, ...prefs }
      }))
    }),
    {
      name: 'rabbi-nachman-voice-storage',
      partialize: (state) => ({
        isDarkMode: state.isDarkMode,
        history: state.history,
        preferences: state.preferences
      })
    }
  )
);