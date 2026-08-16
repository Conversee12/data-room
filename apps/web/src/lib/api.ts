import type { ApiError, ApiErrorCode } from '@data-room/shared';

const BASE_URL = (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000').replace(/\/$/, '');

/**
 * A failure the API described on purpose. `code` is what the UI branches on —
 * a name conflict opens the rename prompt, a revoked share gets its own screen —
 * so behaviour never depends on message wording.
 */
export class ApiRequestError extends Error {
  readonly code: ApiErrorCode;
  readonly statusCode: number;
  readonly details?: Record<string, string[]>;

  constructor(error: ApiError) {
    super(error.message);
    this.name = 'ApiRequestError';
    this.code = error.code;
    this.statusCode = error.statusCode;
    this.details = error.details;
  }

  /** The first message for a field, for inline form errors. */
  fieldError(field: string): string | undefined {
    return this.details?.[field]?.[0];
  }
}

/** Raised when the network never reached the API at all. */
export class NetworkError extends Error {
  constructor() {
    super('Could not reach the server. Check your connection and try again.');
    this.name = 'NetworkError';
  }
}

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  body?: unknown;
  /** Bearer token of the signed-in user, when there is one. */
  token?: string | null;
  /** Share link the visitor arrived through, when browsing shared content. */
  shareToken?: string | null;
  signal?: AbortSignal;
}

export async function apiFetch<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, token, shareToken, signal } = options;

  let response: Response;
  try {
    response = await fetch(`${BASE_URL}/api${path}`, {
      method,
      headers: {
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(shareToken ? { 'X-Share-Token': shareToken } : {}),
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      signal,
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error;
    throw new NetworkError();
  }

  if (response.status === 204) return undefined as T;

  const text = await response.text();
  const payload = text ? (JSON.parse(text) as unknown) : null;

  if (!response.ok) {
    throw new ApiRequestError(
      (payload as ApiError | null) ?? {
        statusCode: response.status,
        code: 'INTERNAL',
        message: 'Something went wrong. Please try again.',
      },
    );
  }

  return payload as T;
}

/** Turns any thrown value into something worth showing a person. */
export function describeError(error: unknown): string {
  if (error instanceof ApiRequestError || error instanceof NetworkError) return error.message;
  if (error instanceof Error && error.message) return error.message;
  return 'Something went wrong. Please try again.';
}

export function isErrorCode(error: unknown, code: ApiErrorCode): boolean {
  return error instanceof ApiRequestError && error.code === code;
}

/**
 * True when the item is gone or was never visible to this caller — the case the
 * UI has to handle gracefully, because someone may be looking at a folder its
 * owner just deleted.
 */
export function isMissing(error: unknown): boolean {
  return isErrorCode(error, 'NOT_FOUND');
}
