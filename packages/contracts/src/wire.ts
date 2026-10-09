// Wire contract + exit-code table. CLI and MCP both serialize through these
// helpers so the JSON shape stays identical across transports.

export interface WireMeta {
  operation_id: string;
  trace_id: string;
  count?: number;
  next_cursor?: string | null;
  version?: string;
}

export interface WireSuccess<T = unknown> {
  ok: true;
  data: T;
  meta: WireMeta;
}

export interface WireErrorDetail {
  type: string;
  code: string;
  message: string;
  hint?: string;
  exit_code: number;
  trace_id: string;
}

export interface WireError {
  ok: false;
  error: WireErrorDetail;
}

export const EXIT = {
  OK: 0,
  UNCLASSIFIED: 1,
  USAGE: 2,
  UNAUTHORIZED: 3,
  NOT_FOUND: 4,
  CONFLICT: 5,
  RATE_LIMIT: 6,
  UNAVAILABLE: 7,
  NEEDS_CONFIRMATION: 10,
  TIMEOUT: 124,
  CANCELLED: 130,
} as const;

/** A typed error catalog. `type` is the stable machine slug; `code` is the
 *  short human code; `exit_code` is the CLI exit code. */
export const ErrorKind = {
  resource_not_found: { type: 'resource.not_found', code: 'NOT_FOUND', exit: EXIT.NOT_FOUND },
  validation_failed: { type: 'validation.failed', code: 'INVALID_ARGUMENT', exit: EXIT.USAGE },
  unauthorized: { type: 'auth.unauthorized', code: 'UNAUTHORIZED', exit: EXIT.UNAUTHORIZED },
  forbidden: { type: 'auth.forbidden', code: 'FORBIDDEN', exit: EXIT.UNAUTHORIZED },
  conflict: { type: 'resource.conflict', code: 'CONFLICT', exit: EXIT.CONFLICT },
  rate_limited: { type: 'rate.limited', code: 'RATE_LIMITED', exit: EXIT.RATE_LIMIT },
  unavailable: { type: 'service.unavailable', code: 'UNAVAILABLE', exit: EXIT.UNAVAILABLE },
  not_implemented: { type: 'not.implemented', code: 'NOT_IMPLEMENTED', exit: EXIT.NOT_FOUND },
  needs_confirmation: { type: 'confirm.required', code: 'NEEDS_CONFIRMATION', exit: EXIT.NEEDS_CONFIRMATION },
  cancelled: { type: 'cancelled', code: 'CANCELLED', exit: EXIT.CANCELLED },
  timeout: { type: 'timeout', code: 'TIMEOUT', exit: EXIT.TIMEOUT },
  internal: { type: 'internal.error', code: 'INTERNAL', exit: EXIT.UNCLASSIFIED },
} as const;

export type ErrorKindKey = keyof typeof ErrorKind;

export function ok<T>(
  operationId: string,
  data: T,
  traceId: string,
  extra?: { count?: number; next_cursor?: string | null; version?: string },
): WireSuccess<T> {
  return {
    ok: true,
    data,
    meta: {
      operation_id: operationId,
      trace_id: traceId,
      count: extra?.count,
      next_cursor: extra?.next_cursor ?? null,
      version: extra?.version ?? '1',
    },
  };
}

export function fail(
  operationId: string,
  kind: ErrorKindKey,
  message: string,
  traceId: string,
  hint?: string,
): WireError {
  const k = ErrorKind[kind];
  return {
    ok: false,
    error: {
      type: k.type,
      code: k.code,
      message,
      hint,
      exit_code: k.exit,
      trace_id: traceId,
    },
  };
}

/** Generate a short, unique trace id (hex). No external dep. */
export function newTraceId(): string {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('');
}
