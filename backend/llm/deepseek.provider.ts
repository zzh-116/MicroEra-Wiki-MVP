// DeepSeek LLM Provider — OpenAI-compatible cloud API
// DeepSeek API: https://api.deepseek.com/v1
// Models: deepseek-chat (fast, general), deepseek-reasoner (reasoning)
import type { LLMProvider, ChatOptions, StreamChunk } from './types.js';
import type { ChatMessage } from '../types.js';

export class DeepSeekProvider implements LLMProvider {
  readonly name = 'deepseek';

  constructor(
    private baseUrl: string,
    private apiKey: string,
    public defaultModel: string = 'deepseek-chat',
  ) {}

  /** Non-streaming chat */
  async chat(
    messages: ChatMessage[],
    options?: ChatOptions,
    signal?: AbortSignal,
  ): Promise<string> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(new Error('timeout')), 60000);

    if (signal) {
      if (signal.aborted) { clearTimeout(timeoutId); controller.abort(signal.reason); }
      else { signal.addEventListener('abort', () => { clearTimeout(timeoutId); controller.abort(signal.reason); }, { once: true }); }
    }

    let response: Response;
    try {
      response = await fetch(`${this.baseUrl}/v1/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: options?.model ?? this.defaultModel,
          messages,
          temperature: options?.temperature ?? 0.3,
          max_tokens: options?.maxTokens ?? 1024,
        }),
        signal: controller.signal,
      });
    } catch (err: any) {
      clearTimeout(timeoutId);
      throw new Error(`DeepSeek API unreachable: ${err.message}`);
    }
    clearTimeout(timeoutId);

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new Error(`DeepSeek API error ${response.status}: ${body}`);
    }

    const data = (await response.json()) as {
      choices: Array<{ message: { content: string } }>;
    };
    return data.choices?.[0]?.message?.content || '';
  }

  /** Streaming chat — SSE, OpenAI-compatible format */
  async *streamChat(
    messages: ChatMessage[],
    options?: ChatOptions,
    signal?: AbortSignal,
  ): AsyncGenerator<StreamChunk> {
    const t0 = Date.now();

    // Manual timeout controller — more reliable than AbortSignal.any() across Node versions
    const timeoutMs = 120000;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(new Error('timeout')), timeoutMs);

    // Forward client disconnect signal to our controller
    if (signal) {
      if (signal.aborted) {
        clearTimeout(timeoutId);
        controller.abort(signal.reason);
      } else {
        signal.addEventListener('abort', () => {
          clearTimeout(timeoutId);
          controller.abort(signal.reason);
        }, { once: true });
      }
    }

    console.log(`[DeepSeek] Requesting ${this.baseUrl}/v1/chat/completions (model: ${options?.model ?? this.defaultModel})`);

    let response: Response;
    try {
      response = await fetch(`${this.baseUrl}/v1/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: options?.model ?? this.defaultModel,
          messages,
          temperature: options?.temperature ?? 0.3,
          max_tokens: options?.maxTokens ?? 1024,
          stream: true,
        }),
        signal: controller.signal,
      });
    } catch (err: any) {
      clearTimeout(timeoutId);
      console.error(`[DeepSeek] Fetch failed after ${Date.now() - t0}ms: ${err.message}`);
      throw new Error(`DeepSeek API unreachable: ${err.message}`);
    }
    clearTimeout(timeoutId);

    console.log(`[DeepSeek] Response ${response.status} after ${Date.now() - t0}ms`);

    if (!response.ok) {
      const errBody = await response.text().catch(() => '');
      console.error(`[DeepSeek] Error ${response.status}: ${errBody.slice(0, 500)}`);
      throw new Error(`DeepSeek API error ${response.status}: ${errBody.slice(0, 200)}`);
    }

    const reader = response.body?.getReader();
    if (!reader) throw new Error('No response body');

    const decoder = new TextDecoder();
    let buffer = '';
    let firstToken = true;
    let tokenCount = 0;

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || !trimmed.startsWith('data: ')) continue;
          if (trimmed === 'data: [DONE]') {
            console.log(`[DeepSeek] stream done: ${Date.now() - t0}ms, ${tokenCount} tokens`);
            yield { token: '', done: true, finishReason: 'stop' };
            return;
          }

          try {
            const parsed = JSON.parse(trimmed.slice(6));
            const delta = parsed.choices?.[0]?.delta;
            const finishReason = parsed.choices?.[0]?.finish_reason;

            if (delta?.content) {
              if (firstToken) {
                firstToken = false;
                console.log(`[DeepSeek] first token: ${Date.now() - t0}ms`);
              }
              tokenCount++;
              yield { token: delta.content, done: false };
            }

            if (finishReason) {
              const usage = parsed.usage;
              yield {
                token: '',
                done: true,
                finishReason,
                usage: usage
                  ? {
                      promptTokens: usage.prompt_tokens ?? 0,
                      completionTokens: usage.completion_tokens ?? 0,
                      totalTokens: usage.total_tokens ?? 0,
                    }
                  : undefined,
              };
              return;
            }
          } catch {
            // Skip unparseable lines
          }
        }
      }

      yield { token: '', done: true, finishReason: 'stop' };
    } finally {
      reader.releaseLock();
    }
  }
}
