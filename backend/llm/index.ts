// LLM Provider factory — returns the appropriate provider based on config
// Adding a new provider: implement LLMProvider, add a case here
import type { LLMProvider } from './types.js';
import { OllamaProvider } from './ollama.provider.js';
import { DeepSeekProvider } from './deepseek.provider.js';
import { config } from '../config.js';

let _provider: LLMProvider | null = null;

/** Get or create the LLM provider singleton */
export function getLLMProvider(): LLMProvider {
  if (_provider) return _provider;

  switch (config.llmProvider) {
    case 'deepseek': {
      if (!config.deepseek.apiKey) {
        console.warn('[LLM] DEEPSEEK_API_KEY not set — falling back to Ollama');
        _provider = new OllamaProvider(config.ollama.url, config.ollama.chatModel);
      } else {
        _provider = new DeepSeekProvider(
          config.deepseek.baseUrl,
          config.deepseek.apiKey,
          config.deepseek.chatModel,
        );
      }
      break;
    }
    case 'ollama':
    default:
      _provider = new OllamaProvider(config.ollama.url, config.ollama.chatModel);
      break;
  }

  console.log(`[LLM] Provider: ${_provider.name} (model: ${_provider.defaultModel})`);
  return _provider;
}

/** Reset provider (for testing or hot-swap) */
export function resetLLMProvider(): void {
  _provider = null;
}

export type { LLMProvider, ChatOptions, StreamChunk, TokenUsage } from './types.js';
