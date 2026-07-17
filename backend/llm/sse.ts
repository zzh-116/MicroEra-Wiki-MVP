// Server-Sent Events helpers for Express
// Produces standard SSE format: "event: name\ndata: json\n\n"
// The event name comes exclusively from the SSE protocol's "event:" field.
// The JSON payload contains ONLY business data — no transport metadata.
import type { Response } from 'express';

/** Set SSE headers and return a send function */
export function sseStart(res: Response): (event: string, data: unknown) => void {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no',   // Disable nginx buffering
  });

  // Flush headers immediately so the client sees the 200 before first data
  res.flushHeaders();

  // Disable Nagle's algorithm — send each SSE chunk immediately
  const sock = (res as any).socket;
  if (sock && typeof sock.setNoDelay === 'function') {
    sock.setNoDelay(true);
  }

  // Send initial comment to establish connection
  res.write(':ok\n\n');

  return (event: string, data: unknown) => {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };
}

/** Send a token event */
export function sseToken(send: ReturnType<typeof sseStart>, content: string) {
  send('token', { content });
}

/** Send the done event with sources and conversation ID */
export function sseDone(
  send: ReturnType<typeof sseStart>,
  data: { sources: Array<{ id: number; title: string; entry_type: string }>; conversationId: number },
) {
  send('done', data);
}

/** Send an error event and close */
export function sseError(
  send: ReturnType<typeof sseStart>,
  res: Response,
  message: string,
) {
  send('error', { message });
  res.end();
}

/** Send a start event with conversation metadata */
export function sseStartEvent(send: ReturnType<typeof sseStart>, conversationId: number) {
  send('start', { conversationId });
}
