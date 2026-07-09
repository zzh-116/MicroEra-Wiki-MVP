// Provider-agnostic LLM abstraction types
// Add new providers by implementing this interface — no other code changes needed
import type { ChatMessage } from '../types.js';

export interface ChatOptions {
  temperature?: number;
  maxTokens?: number;
  model?: string;
}

export interface StreamChunk {
  /** Delta token content */
  token: string;
  /** True when generation is complete */
  done: boolean;
  /** Token usage stats (only on final chunk if provider supports it) */
  usage?: TokenUsage;
  /** Finish reason: 'stop', 'length', 'error' */
  finishReason?: 'stop' | 'length' | 'error';
}

export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

/**
 * Unified LLM Provider interface.
 * Supports both streaming (AsyncGenerator) and non-streaming (Promise<string>).
 *
 * Adding a new provider requires:
 * 1. Implement this interface
 * 2. Register in llm/index.ts
 * — no changes to ChatService or routes needed.
 */
export interface LLMProvider {
  readonly name: string;
  readonly defaultModel: string;

  /** Non-streaming chat — returns complete response */
  chat(messages: ChatMessage[], options?: ChatOptions, signal?: AbortSignal): Promise<string>;

  /** Streaming chat — yields tokens as they arrive */
  streamChat(messages: ChatMessage[], options?: ChatOptions, signal?: AbortSignal): AsyncGenerator<StreamChunk>;
}

/** Provider configuration from environment */
export interface ProviderConfig {
  provider: 'ollama' | 'openai' | 'deepseek' | 'anthropic';
  url: string;
  apiKey?: string;
  chatModel: string;
}
