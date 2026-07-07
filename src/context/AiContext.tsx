import React, { createContext, useContext, useState, useCallback } from 'react';
import { Entry } from '../types/entry';
import { apiFetch } from '../api/client';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface AiSearchResult {
  results: Entry[];
  source?: string;
}

interface AiContextType {
  // AI Search
  aiSearch: (query: string) => Promise<Entry[]>;
  isSearching: boolean;
  searchError: string | null;

  // AI Chat
  chatHistory: ChatMessage[];
  isChatting: boolean;
  chatError: string | null;
  sendChat: (question: string) => Promise<string>;
  clearChat: () => void;

  // AI Summarize
  summarize: (entryId: number) => Promise<string>;
  isSummarizing: boolean;
  summarizeError: string | null;
}

const AiContext = createContext<AiContextType | undefined>(undefined);

export const AiProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // Search state
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  // Chat state
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([]);
  const [isChatting, setIsChatting] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);

  // Summarize state
  const [isSummarizing, setIsSummarizing] = useState(false);
  const [summarizeError, setSummarizeError] = useState<string | null>(null);

  const aiSearch = useCallback(async (query: string): Promise<Entry[]> => {
    setIsSearching(true);
    setSearchError(null);
    try {
      const data = await apiFetch<AiSearchResult>('/search', {
        method: 'POST',
        body: JSON.stringify({ query }),
      });
      return data.results || [];
    } catch (err: any) {
      setSearchError(err.message || 'AI search failed');
      return [];
    } finally {
      setIsSearching(false);
    }
  }, []);

  const sendChat = useCallback(async (question: string): Promise<string> => {
    setIsChatting(true);
    setChatError(null);
    const newHistory: ChatMessage[] = [
      ...chatHistory,
      { role: 'user' as const, content: question },
    ];
    setChatHistory(newHistory);
    try {
      const data = await apiFetch<{ answer: string }>('/ai/chat', {
        method: 'POST',
        body: JSON.stringify({ question, history: chatHistory }),
      });
      const answer = data.answer || '（未收到回复）';
      setChatHistory([...newHistory, { role: 'assistant', content: answer }]);
      return answer;
    } catch (err: any) {
      const msg = err.message || 'AI chat failed';
      setChatError(msg);
      setChatHistory([...newHistory, { role: 'assistant', content: `[错误] ${msg}` }]);
      return msg;
    } finally {
      setIsChatting(false);
    }
  }, [chatHistory]);

  const clearChat = useCallback(() => {
    setChatHistory([]);
    setChatError(null);
  }, []);

  const summarize = useCallback(async (entryId: number): Promise<string> => {
    setIsSummarizing(true);
    setSummarizeError(null);
    try {
      const data = await apiFetch<{ summary: string }>('/ai/summarize', {
        method: 'POST',
        body: JSON.stringify({ entryId }),
      });
      return data.summary || '';
    } catch (err: any) {
      setSummarizeError(err.message || 'AI summarization failed');
      return '';
    } finally {
      setIsSummarizing(false);
    }
  }, []);

  return (
    <AiContext.Provider
      value={{
        aiSearch,
        isSearching,
        searchError,
        chatHistory,
        isChatting,
        chatError,
        sendChat,
        clearChat,
        summarize,
        isSummarizing,
        summarizeError,
      }}
    >
      {children}
    </AiContext.Provider>
  );
};

export const useAi = () => {
  const context = useContext(AiContext);
  if (context === undefined) {
    throw new Error('useAi must be used within an AiProvider');
  }
  return context;
};
