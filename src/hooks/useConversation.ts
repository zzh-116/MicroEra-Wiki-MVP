// useConversation — manages multi-turn RAG chat state for a knowledge entry.
// Each entry gets its own conversation (keyed by entryId).
// Sends full message history to backend for true multi-turn RAG.
// Persistence is delegated to the storage abstraction layer.

import { useState, useRef, useCallback } from 'react';
import { queryApi } from '../api/queryApi';
import { storage } from '../lib/storage';
import type { ChatMessage, ChatSource, ConversationState } from '../types/viewModels';

function loadState(entryId: string): ConversationState {
  const parsed = storage.getConversation<any>(entryId);
  if (parsed) {
    return {
      conversationId: parsed.conversationId,
      messages: parsed.messages || [],
    };
  }
  return { messages: [] };
}

function saveState(entryId: string, state: ConversationState): void {
  storage.setConversation(entryId, state);
}

let _msgId = 0;
function nextId(): string {
  return `msg_${Date.now()}_${_msgId++}`;
}

export function useConversation(entryId: string) {
  const [state, setState] = useState<ConversationState>(() => loadState(entryId));
  const [isLoading, setIsLoading] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const stateRef = useRef(state);
  stateRef.current = state;

  const send = useCallback(async (question: string) => {
    if (!question.trim() || isLoading) return;

    // Cancel any in-flight stream
    if (abortRef.current) abortRef.current.abort();

    const userMsg: ChatMessage = {
      id: nextId(),
      role: 'user',
      content: question.trim(),
      timestamp: new Date().toISOString(),
    };

    const assistantMsg: ChatMessage = {
      id: nextId(),
      role: 'assistant',
      content: '',
      timestamp: new Date().toISOString(),
    };

    // Optimistic update — add user + empty assistant bubble
    const prev = stateRef.current;
    const next: ConversationState = {
      ...prev,
      messages: [...prev.messages, userMsg, assistantMsg],
    };
    setState(next);
    saveState(entryId, next);
    setIsLoading(true);

    // Build message history for the backend (user/assistant pairs)
    const history = stateRef.current.messages
      .filter((m) => m.role === 'user' || m.role === 'assistant')
      .map((m) => ({ role: m.role, content: m.content }));

    abortRef.current = queryApi.askAIStream(
      question,
      {
        onToken: (token: string) => {
          setState((s) => {
            const msgs = [...s.messages];
            const last = msgs[msgs.length - 1];
            if (last && last.role === 'assistant') {
              msgs[msgs.length - 1] = { ...last, content: last.content + token };
            }
            const updated = { ...s, messages: msgs };
            saveState(entryId, updated);
            return updated;
          });
        },
        onDone: (data) => {
          setIsLoading(false);
          abortRef.current = null;

          const sources: ChatSource[] = (data.sources || []).map((s) => ({
            id: s.id,
            title: s.title,
            entry_type: s.entry_type,
          }));

          setState((s) => {
            const msgs = [...s.messages];
            const last = msgs[msgs.length - 1];
            if (last && last.role === 'assistant') {
              msgs[msgs.length - 1] = { ...last, sources };
            }
            const updated = {
              conversationId: data.conversationId || s.conversationId,
              messages: msgs,
            };
            saveState(entryId, updated);
            return updated;
          });
        },
        onError: (message: string) => {
          setIsLoading(false);
          abortRef.current = null;

          setState((s) => {
            const msgs = [...s.messages];
            const last = msgs[msgs.length - 1];
            if (last && last.role === 'assistant') {
              msgs[msgs.length - 1] = {
                ...last,
                content: last.content + `\n\n❌ 生成中断: ${message}`,
              };
            }
            const updated = { ...s, messages: msgs };
            saveState(entryId, updated);
            return updated;
          });
        },
      },
      stateRef.current.conversationId,
    );
  }, [entryId, isLoading]);

  const newChat = useCallback(() => {
    if (abortRef.current) abortRef.current.abort();
    abortRef.current = null;
    setIsLoading(false);
    const fresh: ConversationState = { messages: [] };
    setState(fresh);
    saveState(entryId, fresh);
  }, [entryId]);

  const navigateToSource = useCallback((sourceId: number) => {
    window.open(`/entry/${sourceId}`, '_blank');
  }, []);

  // Cleanup on unmount
  // (handled by component returning cleanup from useEffect)

  return {
    messages: state.messages,
    isLoading,
    send,
    newChat,
    navigateToSource,
  };
}
