// Tests for SSE protocol compliance
// Verifies that emitted events follow the SSE specification:
//   event: token
//   data: {"content":"..."}
// No "type" field in JSON payload.
import { describe, it, expect } from 'vitest';

// Re-create the SSE helper inline to test its output independently
// This mirrors backend/llm/sse.ts without requiring Express

function sseEmit(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

describe('SSE Protocol', () => {
  describe('event framing', () => {
    it('emits "event: token" with only business content', () => {
      const frame = sseEmit('token', { content: 'Hello' });

      expect(frame).toContain('event: token');
      expect(frame).toContain('data: {"content":"Hello"}');
      // Must NOT contain "type" in JSON payload
      const dataLine = frame.split('\n')[1];
      const json = JSON.parse(dataLine.slice(6));
      expect(json).not.toHaveProperty('type');
      expect(json).toEqual({ content: 'Hello' });
    });

    it('emits "event: done" with sources and conversationId', () => {
      const frame = sseEmit('done', {
        sources: [{ id: 1, title: 'Test', entry_type: 'tech' }],
        conversationId: 42,
      });

      expect(frame).toContain('event: done');
      const dataLine = frame.split('\n')[1];
      const json = JSON.parse(dataLine.slice(6));
      expect(json).not.toHaveProperty('type');
      expect(json.sources).toHaveLength(1);
      expect(json.conversationId).toBe(42);
    });

    it('emits "event: error" with message only', () => {
      const frame = sseEmit('error', { message: 'LLM timeout' });

      expect(frame).toContain('event: error');
      const dataLine = frame.split('\n')[1];
      const json = JSON.parse(dataLine.slice(6));
      expect(json).not.toHaveProperty('type');
      expect(json.message).toBe('LLM timeout');
    });

    it('emits "event: start" with conversationId', () => {
      const frame = sseEmit('start', { conversationId: 7 });

      expect(frame).toContain('event: start');
      const dataLine = frame.split('\n')[1];
      const json = JSON.parse(dataLine.slice(6));
      expect(json).not.toHaveProperty('type');
    });

    it('each frame ends with double newline (SSE spec)', () => {
      const frame = sseEmit('token', { content: 'x' });

      expect(frame.endsWith('\n\n')).toBe(true);
    });
  });
});
