import { useState } from 'react';
import axios from 'axios';
import { useStore } from '../store/useStore';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';

export function useQuery() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { addToHistory } = useStore();

  const submitQuery = async (query: string, options = {}) => {
    setLoading(true);
    setError(null);

    try {
      const response = await axios.post(`${API_URL}/rag/query`, {
        query,
        language: 'french',
        ...options
      });

      // Add to history
      if (response.data.success) {
        addToHistory({
          query,
          response: response.data.response,
          timestamp: new Date()
        });
      }

      return response.data;
    } catch (err: any) {
      const errorMessage = err.response?.data?.error || 'Une erreur est survenue';
      setError(errorMessage);
      throw new Error(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const streamQuery = async (
    query: string,
    onChunk: (chunk: string) => void,
    options = {}
  ) => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`${API_URL}/rag/query`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          query,
          language: 'french',
          streamResponse: true,
          ...options
        })
      });

      if (!response.ok) {
        throw new Error('Stream request failed');
      }

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();

      if (!reader) {
        throw new Error('No response body');
      }

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        const lines = chunk.split('\n');

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            if (data === '[DONE]') {
              break;
            }
            try {
              const parsed = JSON.parse(data);
              if (parsed.chunk) {
                onChunk(parsed.chunk);
              }
            } catch (e) {
              console.error('Failed to parse chunk:', e);
            }
          }
        }
      }
    } catch (err: any) {
      const errorMessage = err.message || 'Stream failed';
      setError(errorMessage);
      throw new Error(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  return {
    submitQuery,
    streamQuery,
    loading,
    error
  };
}