import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'react-hot-toast';
import VoiceInterface from './components/VoiceInterface';
import Header from './components/Header';
import { useStore } from './store/useStore';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5, // 5 minutes
      retry: 1,
    },
  },
});

function App() {
  const { isDarkMode } = useStore();

  return (
    <QueryClientProvider client={queryClient}>
      <div className={`min-h-screen ${isDarkMode ? 'dark' : ''}`}>
        <div className="min-h-screen bg-gradient-to-br from-gray-950 via-gray-900 to-gray-950">
          <Header />
          <main className="container mx-auto px-4 py-8">
            <VoiceInterface />
          </main>
        </div>
        <Toaster
          position="top-right"
          toastOptions={{
            className: 'glass-panel',
            style: {
              background: 'rgba(17, 24, 39, 0.8)',
              color: '#f3f4f6',
              border: '1px solid rgba(55, 65, 81, 0.5)',
            },
          }}
        />
      </div>
    </QueryClientProvider>
  );
}

export default App;