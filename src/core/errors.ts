/**
 * Every error code the SupDesk API documents.
 *
 * Note that `limit_reached` and `rate_limited` share HTTP 429, which is why
 * dispatch happens on the code and only falls back to the status.
 */
export type SupDeskErrorCode =
  | 'invalid_request'
  | 'unauthorized'
  | 'forbidden'
  | 'not_found'
  | 'limit_reached'
  | 'rate_limited'
  | 'internal_error';

/** The `error` object inside a SupDesk error response. */
export interface SupDeskErrorPayload {
  code: string;
  message: string;
}

/** Base class for everything this library throws. */
export class SupDeskError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'SupDeskError';
  }
}

/** Thrown when the client is constructed with unusable options. */
export class SupDeskConfigurationError extends SupDeskError {
  constructor(message: string) {
    super(message);
    this.name = 'SupDeskConfigurationError';
  }
}

/** The request never produced a response (DNS failure, socket reset, …). */
export class SupDeskConnectionError extends SupDeskError {
  constructor(message = 'Could not reach the SupDesk API.', options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'SupDeskConnectionError';
  }
}

/** The request exceeded the configured `timeout`. */
export class SupDeskTimeoutError extends SupDeskError {
  readonly timeout: number;

  constructor(timeout: number) {
    super(`Request timed out after ${timeout}ms.`);
    this.name = 'SupDeskTimeoutError';
    this.timeout = timeout;
  }
}

/**
 * The serialized request body exceeds SupDesk's documented 1 MB cap.
 *
 * Caught client-side so the failure names the real problem instead of arriving
 * as an opaque proxy error after the bytes have already gone over the wire.
 */
export class RequestTooLargeError extends SupDeskError {
  readonly size: number;
  readonly limit: number;

  constructor(size: number, limit: number) {
    super(`Request body is ${size} bytes, which exceeds the ${limit} byte API limit.`);
    this.name = 'RequestTooLargeError';
    this.size = size;
    this.limit = limit;
  }
}

/** A webhook payload did not match its signature. */
export class SupDeskSignatureVerificationError extends SupDeskError {
  constructor(message = 'Webhook signature verification failed.') {
    super(message);
    this.name = 'SupDeskSignatureVerificationError';
  }
}

export interface SupDeskAPIErrorOptions {
  status: number;
  code: string;
  message: string;
  headers?: Headers;
  body?: unknown;
}

/** The API responded, but with a non-2xx status. */
export class SupDeskAPIError extends SupDeskError {
  /** HTTP status code. */
  readonly status: number;
  /** Machine-readable code from the response envelope. */
  readonly code: string;
  /** Response headers, when the runtime surfaced them. */
  readonly headers: Headers | undefined;
  /** Parsed response body, or the raw text when it was not JSON. */
  readonly body: unknown;
  /** Opportunistic — SupDesk does not document a request-id header. */
  readonly requestId: string | undefined;

  constructor(options: SupDeskAPIErrorOptions) {
    super(options.message);
    this.name = 'SupDeskAPIError';
    this.status = options.status;
    this.code = options.code;
    this.headers = options.headers;
    this.body = options.body;
    this.requestId =
      options.headers?.get('x-request-id') ??
      options.headers?.get('x-supdesk-request-id') ??
      undefined;
  }
}

/** 400 — validation failed, bad JSON, or an invalid query parameter. */
export class InvalidRequestError extends SupDeskAPIError {
  constructor(options: SupDeskAPIErrorOptions) {
    super(options);
    this.name = 'InvalidRequestError';
  }
}

/** 401 — missing, malformed, revoked, or unknown API key. */
export class UnauthorizedError extends SupDeskAPIError {
  constructor(options: SupDeskAPIErrorOptions) {
    super(options);
    this.name = 'UnauthorizedError';
  }
}

/** 403 — valid key, but the plan does not allow this action. Writes need Pro. */
export class ForbiddenError extends SupDeskAPIError {
  constructor(options: SupDeskAPIErrorOptions) {
    super(options);
    this.name = 'ForbiddenError';
  }
}

/** 404 — unknown route, or no such resource in this project. */
export class NotFoundError extends SupDeskAPIError {
  constructor(options: SupDeskAPIErrorOptions) {
    super(options);
    this.name = 'NotFoundError';
  }
}

/**
 * 429 `rate_limited` — too many requests in the current window.
 * Retryable: the window will pass.
 */
export class RateLimitedError extends SupDeskAPIError {
  constructor(options: SupDeskAPIErrorOptions) {
    super(options);
    this.name = 'RateLimitedError';
  }
}

/**
 * 429 `limit_reached` — the monthly submission quota is exhausted.
 *
 * Deliberately *not* retryable: a monthly quota will not free up inside a
 * backoff window, so retrying only burns more of the caller's rate budget.
 */
export class LimitReachedError extends SupDeskAPIError {
  constructor(options: SupDeskAPIErrorOptions) {
    super(options);
    this.name = 'LimitReachedError';
  }
}

/** 5xx — something failed on SupDesk's side. Safe to retry. */
export class InternalServerError extends SupDeskAPIError {
  constructor(options: SupDeskAPIErrorOptions) {
    super(options);
    this.name = 'InternalServerError';
  }
}

/**
 * Picks the most specific error class for a response.
 *
 * The documented code wins over the status because the two 429s mean very
 * different things; the status is only a fallback for undocumented responses
 * (a proxy 502, an HTML error page, …).
 */
export function createAPIError(options: SupDeskAPIErrorOptions): SupDeskAPIError {
  switch (options.code) {
    case 'invalid_request':
      return new InvalidRequestError(options);
    case 'unauthorized':
      return new UnauthorizedError(options);
    case 'forbidden':
      return new ForbiddenError(options);
    case 'not_found':
      return new NotFoundError(options);
    case 'rate_limited':
      return new RateLimitedError(options);
    case 'limit_reached':
      return new LimitReachedError(options);
    case 'internal_error':
      return new InternalServerError(options);
  }

  if (options.status >= 500) return new InternalServerError(options);

  switch (options.status) {
    case 400:
      return new InvalidRequestError(options);
    case 401:
      return new UnauthorizedError(options);
    case 403:
      return new ForbiddenError(options);
    case 404:
      return new NotFoundError(options);
    // An undocumented 429 shape is treated as throttling rather than quota:
    // retrying a throttle is harmless, whereas treating a throttle as a hard
    // quota failure would surface a spurious permanent error.
    case 429:
      return new RateLimitedError(options);
    default:
      return new SupDeskAPIError(options);
  }
}

/** Type guard for any error thrown by this library. */
export function isSupDeskError(value: unknown): value is SupDeskError {
  return value instanceof SupDeskError;
}

/** Type guard for errors that carry an HTTP status from the API. */
export function isSupDeskAPIError(value: unknown): value is SupDeskAPIError {
  return value instanceof SupDeskAPIError;
}
