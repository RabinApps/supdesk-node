import {
  LimitReachedError,
  SupDeskAPIError,
  SupDeskConnectionError,
  SupDeskTimeoutError,
} from './errors.js';

export const DEFAULT_MAX_RETRIES = 2;
export const BASE_RETRY_DELAY_MS = 500;
export const MAX_RETRY_DELAY_MS = 8_000;

/** HTTP methods that are safe to replay without risking a duplicate write. */
const SAFE_METHODS = new Set(['GET', 'HEAD', 'DELETE', 'PATCH', 'PUT', 'OPTIONS']);

export interface ShouldRetryOptions {
  error: unknown;
  method: string;
  attempt: number;
  maxRetries: number;
  /** Allow replaying POSTs on network/5xx failures. Off by default. */
  retryUnsafeMethods: boolean;
}

/**
 * Decides whether a failed attempt is worth repeating.
 *
 * Two rules carry most of the weight:
 *
 * 1. A 429 `limit_reached` is never retried. It means the monthly submission
 *    quota is gone, which no amount of backoff will fix.
 * 2. A failed `POST` is not replayed on a network error or 5xx unless the
 *    caller opts in. SupDesk documents no idempotency key, and both
 *    `POST /submissions` and `POST /feedback` are metered against that monthly
 *    quota — a request that failed *after* the server accepted it would be
 *    double-charged and would file the end user's ticket twice. A 429
 *    `rate_limited` is different: the server is explicitly saying it did not
 *    process the request, so replaying it is safe for any method.
 */
export function shouldRetry(options: ShouldRetryOptions): boolean {
  const { error, method, attempt, maxRetries, retryUnsafeMethods } = options;

  if (attempt >= maxRetries) return false;

  const methodIsSafe = SAFE_METHODS.has(method.toUpperCase()) || retryUnsafeMethods;

  if (error instanceof LimitReachedError) return false;

  if (error instanceof SupDeskAPIError) {
    // The server rejected the request outright — safe to replay regardless.
    if (error.status === 429) return true;
    if (error.status === 408) return methodIsSafe;
    if (error.status >= 500) return methodIsSafe;
    return false;
  }

  if (error instanceof SupDeskConnectionError) return methodIsSafe;

  // Timeouts are surfaced, not retried: the caller chose the deadline, and
  // silently spending it several times over defeats the point.
  if (error instanceof SupDeskTimeoutError) return false;

  return false;
}

/**
 * Parses a `Retry-After` header, which may be either a delay in seconds or an
 * HTTP-date. SupDesk does not document sending one, but honouring it costs
 * nothing and behaves correctly behind a proxy or CDN that does.
 *
 * Returns `undefined` for anything unparseable or nonsensical.
 */
export function parseRetryAfter(header: string | null | undefined, now = Date.now()): number | undefined {
  if (!header) return undefined;

  const trimmed = header.trim();
  if (trimmed === '') return undefined;

  if (/^\d+(\.\d+)?$/.test(trimmed)) {
    const seconds = Number(trimmed);
    return Number.isFinite(seconds) ? Math.max(0, seconds * 1000) : undefined;
  }

  const date = Date.parse(trimmed);
  if (Number.isNaN(date)) return undefined;

  return Math.max(0, date - now);
}

export interface BackoffOptions {
  attempt: number;
  retryAfterMs?: number | undefined;
  /** Injected for deterministic tests. */
  random?: () => number;
}

/**
 * Exponential backoff with jitter, clamped to {@link MAX_RETRY_DELAY_MS}.
 *
 * Jitter spreads retries out so that a fleet of workers rate-limited at the
 * same instant does not stampede the API in lockstep when the window opens.
 * A server-supplied `Retry-After` wins over the computed delay.
 */
export function backoffDelay(options: BackoffOptions): number {
  const { attempt, retryAfterMs, random = Math.random } = options;

  if (retryAfterMs !== undefined) {
    return Math.min(retryAfterMs, MAX_RETRY_DELAY_MS);
  }

  const exponential = Math.min(BASE_RETRY_DELAY_MS * 2 ** attempt, MAX_RETRY_DELAY_MS);
  return Math.round(exponential * (0.5 + random() / 2));
}

/** Default sleep. Injected in tests so retry suites do not spend real time. */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
