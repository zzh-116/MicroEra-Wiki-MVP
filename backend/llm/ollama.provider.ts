// Ollama LLM Provider — implements LLMProvider for Ollama's OpenAI-compatible API
// Works with: Ollama, llama.cpp server, vLLM, LocalAI, text-generation-webui
import type { LLMProvider, ChatOptions, StreamChunk } from './types.js';
import type { ChatMessage } from '../types.js';

export class OllamaProvider implements LLMProvider {
  readonly name = 'ollama';

  constructor(
    private baseUrl: string,
    public defaultModel: string,
  ) {}

  /** Non-streaming chat */
  async chat(
    messages: ChatMessage[],
    options?: ChatOptions,
    signal?: AbortSignal,
  ): Promise<string> {
    const response = await fetch(`${this.baseUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: options?.model ?? this.defaultModel,
        messages,
        temperature: options?.temperature ?? 0.3,
        max_tokens: options?.maxTokens ?? 1024,
      }),
      signal: signal ?? AbortSignal.timeout(120000),
    });

    if (!response.ok) {
      throw new Error(`Ollama API error ${response.status}: ${await response.text().catch(() => '')}`);
    }

    const data = await response.json() as {
      choices: Array<{ message: { content: string } }>;
    };
    return data.choices?.[0]?.message?.content || '';
  }

  /** Streaming chat — yields tokens via AsyncGenerator */
  async *streamChat(
    messages: ChatMessage[],
    options?: ChatOptions,
    signal?: AbortSignal,
  ): AsyncGenerator<StreamChunk> {
    const response = await fetch(`${this.baseUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: options?.model ?? this.defaultModel,
        messages,
        temperature: options?.temperature ?? 0.3,
        max_tokens: options?.maxTokens ?? 1024,
        stream: true,
      }),
      signal: signal ?? AbortSignal.timeout(300000), // 5 min for streaming
    });

    if (!response.ok) {
      throw new Error(`Ollama stream error ${response.status}`);
    }

    const reader = response.body?.getReader();
    if (!reader) throw new Error('No response body');

    const decoder = new TextDecoder();
    let buffer = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || ''; // Keep incomplete line in buffer

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || !trimmed.startsWith('data: ')) continue;
          if (trimmed === 'data: [DONE]') {
            yield { token: '', done: true, finishReason: 'stop' };
            return;
          }

          try {
            const parsed = JSON.parse(trimmed.slice(6)); // Remove "data: " prefix
            const delta = parsed.choices?.[0]?.delta;
            const finishReason = parsed.choices?.[0]?.finish_reason;

            if (delta?.content) {
              yield { token: delta.content, done: false };
            }

            if (finishReason) {
              const usage = parsed.usage;
              yield {
                token: '',
                done: true,
                finishReason,
                usage: usage ? {
                  promptTokens: usage.prompt_tokens ?? 0,
                  completionTokens: usage.completion_tokens ?? 0,
                  totalTokens: usage.total_tokens ?? 0,
                } : undefined,
              };
              return;
            }
          } catch {
            // Skip unparseable lines (some providers send comments)
          }
        }
      }

      // Stream ended without explicit [DONE] or finish_reason
      yield { token: '', done: true, finishReason: 'stop' };
    } finally {
      reader.releaseLock();
    }
  }
}
