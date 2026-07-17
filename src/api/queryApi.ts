import { Reference } from '../types/wiki';
import { post, getToken } from './client';

export interface AIResponse {
  answer: string;
  references: Reference[];
  relatedEntryIds: string[];
}

export interface StreamCallbacks {
  onToken: (token: string) => void;
  onStart?: (conversationId: number) => void;
  onDone?: (data: { sources: Array<{ id: number; title: string; entry_type: string }>; conversationId: number }) => void;
  onError?: (message: string) => void;
}

export const queryApi = {
  /** Non-streaming RAG Q&A */
  async askAI(question: string): Promise<AIResponse> {
    try {
      const data = await post<{
        answer: string;
        sources: Array<{ id: number; title: string; entry_type: string }>;
        conversationId: number;
      }>('/ai/chat', { question });

      const references: Reference[] = (data.sources || []).map((s) => ({
        id: `ref-ai-${s.id}`,
        fromEntryId: String(s.id),
        locator: '',
        quote: '',
        referenceType: 'document' as const,
        title: s.title,
        updatedAt: new Date().toISOString(),
      }));

      return {
        answer: data.answer || '（未收到回复）',
        references,
        relatedEntryIds: references.map((r) => r.fromEntryId),
      };
    } catch (err: any) {
      return {
        answer: `[AI 服务暂时不可用] ${err.message || '未知错误'}`,
        references: [],
        relatedEntryIds: [],
      };
    }
  },

  /**
   * Streaming RAG Q&A — token-by-token via SSE.
   * Returns an AbortController for cancellation.
   */
  askAIStream(
    question: string,
    callbacks: StreamCallbacks,
    conversationId?: number,
  ): AbortController {
    const abort = new AbortController();
    const tStart = Date.now();

    const token = getToken();
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    console.log('[SSE-client] fetch POST /api/ai/chat/stream', { question: question.slice(0, 60), conversationId });

    fetch('/api/ai/chat/stream', {
      method: 'POST',
      headers,
      body: JSON.stringify({ question, conversationId }),
      signal: abort.signal,
    })
      .then(async (response) => {
        console.log(`[SSE-client] response status=${response.status} content-type=${response.headers.get('content-type')} (${Date.now() - tStart}ms)`);

        if (!response.ok) {
          console.error(`[SSE-client] HTTP error ${response.status}`);
          callbacks.onError?.(`HTTP ${response.status}`);
          return;
        }

        const reader = response.body?.getReader();
        if (!reader) {
          console.error('[SSE-client] No response body / reader');
          callbacks.onError?.('No response body');
          return;
        }

        const decoder = new TextDecoder();
        let buffer = '';
        let currentEvent = '';
        let receivedDone = false;
        let chunkCount = 0;

        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) {
              console.log(`[SSE-client] reader done — receivedDone=${receivedDone} chunks=${chunkCount} (${Date.now() - tStart}ms)`);
              break;
            }

            const raw = decoder.decode(value, { stream: true });
            chunkCount++;
            if (chunkCount <= 3 || chunkCount % 50 === 0) {
              console.log(`[SSE-client] chunk #${chunkCount}: ${raw.length}B "${raw.slice(0, 120).replace(/\n/g, '\\n')}"`);
            }

            buffer += raw;
            const lines = buffer.split('\n');
            buffer = lines.pop() || '';

            for (const line of lines) {
              // Track event name from SSE "event:" field
              if (line.startsWith('event: ')) {
                currentEvent = line.slice(7).trim();
                if (chunkCount <= 3) {
                  console.log(`[SSE-client]   event: ${currentEvent}`);
                }
                continue;
              }

              // Skip non-data lines
              if (!line.startsWith('data: ')) continue;

              // Dispatch by the last seen SSE event name, not by a "type" field in JSON
              const rawData = line.slice(6);
              if (!currentEvent) {
                // First data line before any event: — skip or treat as comment
                if (chunkCount <= 3) {
                  console.log(`[SSE-client]   data (no event): "${rawData.slice(0, 60)}"`);
                }
                continue;
              }

              try {
                const data = JSON.parse(rawData);

                switch (currentEvent) {
                  case 'start':
                    callbacks.onStart?.(data.conversationId);
                    break;
                  case 'token':
                    callbacks.onToken(data.content);
                    break;
                  case 'done':
                    receivedDone = true;
                    console.log(`[SSE-client] DONE — sources=${data.sources?.length} convId=${data.conversationId} (${Date.now() - tStart}ms)`);
                    callbacks.onDone?.(data);
                    break;
                  case 'error':
                    receivedDone = true;
                    console.error(`[SSE-client] ERROR — "${data.message}"`);
                    callbacks.onError?.(data.message);
                    break;
                  default:
                    console.warn(`[SSE-client] UNKNOWN event: "${currentEvent}"`, data);
                }
              } catch {
                if (chunkCount <= 3) {
                  console.warn(`[SSE-client] unparseable data line: "${rawData.slice(0, 100)}"`);
                }
              }
            }
          }

          // Stream ended without explicit done/error event — connection dropped early
          if (!receivedDone) {
            console.warn(`[SSE-client] stream ended without done/error event (${Date.now() - tStart}ms)`);
            callbacks.onError?.('Connection lost — please try again');
          }
        } catch (err: any) {
          if (err.name !== 'AbortError') {
            console.error(`[SSE-client] read error: ${err.message}`);
            callbacks.onError?.(err.message);
          } else {
            console.log(`[SSE-client] aborted by user (${Date.now() - tStart}ms)`);
          }
        } finally {
          reader.releaseLock();
        }
      })
      .catch((err) => {
        if (err.name !== 'AbortError') {
          console.error(`[SSE-client] fetch error: ${err.message}`);
          callbacks.onError?.(err.message);
        } else {
          console.log(`[SSE-client] fetch aborted (${Date.now() - tStart}ms)`);
        }
      });

    return abort;
  },
};
