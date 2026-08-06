import {
  RequestTooLargeError,
  SupDeskAPIError,
  SupDeskConnectionError,
  SupDeskTimeoutError,
  createAPIError,
} from './errors.js';
import type { QueryParams } from './query.js';
import { buildQueryString, joinUrl } from './query.js';
import {
  DEFAULT_MAX_RETRIES,
  backoffDelay,
  parseRetryAfter,
  shouldRetry,
  sleep as defaultSleep,
} from './retry.js';
import { VERSION } from '../version.js';

export const DEFAULT_BASE_URL = 'https://api.supdesk.app/v1';
export const DEFAULT_TIMEOUT_MS = 30_000;
/** SupDesk documents a 1 MB maximum request size. */
export const MAX_REQUEST_BYTES = 1_048_576;

export type HttpMethod = 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';

export interface RequestOptions {
  method: HttpMethod;
  path: string;
  query?: QueryParams;
  body?: unknown;
  headers?: Record<string, string>;
  /** Caller cancellation, composed with the client timeout. */
  signal?: AbortSignal;
  /** Overrides the client-level timeout for this request. `0` disables it. */
  timeout?: number;
}

export interface HttpClientConfig {
  apiKey: string;
  baseUrl: string;
  fetch: typeof globalThis.fetch;
  timeout: number;
  maxRetries: number;
  retryUnsafeMethods: boolean;
  defaultHeaders: Record<string, string>;
  /** Injected in tests so retry suites do not spend real time. */
  sleep: (ms: number) => Promise<void>;
  /** Injected in tests to make jitter deterministic. */
  random: () => number;
}

export type HttpClientOptions = Partial<HttpClientConfig> & { apiKey: string };

const encoder = new TextEncoder();

/**
 * The only module in the library that calls `fetch`.
 *
 * Everything here sticks to WHATWG APIs (`fetch`, `Request`, `Response`,
 * `AbortController`, `URLSearchParams`, `TextEncoder`) so the same bundle runs
 * unmodified in Node, Deno, Bun, Cloudflare Workers and browsers.
 */
export class HttpClient {
  readonly config: HttpClientConfig;

  constructor(options: HttpClientOptions) {
    this.config = {
      apiKey: options.apiKey,
      baseUrl: options.baseUrl ?? DEFAULT_BASE_URL,
      // Read the global lazily-bound to `globalThis`: some runtimes reject a
      // `fetch` invoked with the wrong receiver.
      fetch: options.fetch ?? ((input, init) => globalThis.fetch(input, init)),
      timeout: options.timeout ?? DEFAULT_TIMEOUT_MS,
      maxRetries: options.maxRetries ?? DEFAULT_MAX_RETRIES,
      retryUnsafeMethods: options.retryUnsafeMethods ?? false,
      defaultHeaders: options.defaultHeaders ?? {},
      sleep: options.sleep ?? defaultSleep,
      random: options.random ?? Math.random,
    };
  }

  /** Issues a request, retrying per the policy in `retry.ts`, and parses the body. */
  async request<T>(options: RequestOptions): Promise<T> {
    const url = joinUrl(this.config.baseUrl, options.path) + buildQueryString(options.query);
    const init = this.#buildInit(options);

    let attempt = 0;

    for (;;) {
      try {
        return await this.#attempt<T>(url, init, options);
      } catch (error) {
        const retryable = shouldRetry({
          error,
          method: options.method,
          attempt,
          maxRetries: this.config.maxRetries,
          retryUnsafeMethods: this.config.retryUnsafeMethods,
        });

        if (!retryable) throw error;

        const retryAfterMs =
          error instanceof SupDeskAPIError
            ? parseRetryAfter(error.headers?.get('retry-after'))
            : undefined;

        await this.config.sleep(
          backoffDelay({ attempt, retryAfterMs, random: this.config.random }),
        );
        attempt += 1;
      }
    }
  }

  #buildInit(options: RequestOptions): { headers: Record<string, string>; body?: string } {
    const headers: Record<string, string> = {
      accept: 'application/json',
      'user-agent': `supdesk-js/${VERSION}`,
      ...this.config.defaultHeaders,
      ...options.headers,
      authorization: `Bearer ${this.config.apiKey}`,
    };

    if (options.body === undefined) return { headers };

    const body = JSON.stringify(options.body);
    const size = encoder.encode(body).byteLength;
    if (size > MAX_REQUEST_BYTES) {
      throw new RequestTooLargeError(size, MAX_REQUEST_BYTES);
    }

    headers['content-type'] = 'application/json';
    return { headers, body };
  }

  async #attempt<T>(
    url: string,
    init: { headers: Record<string, string>; body?: string },
    options: RequestOptions,
  ): Promise<T> {
    const timeout = options.timeout ?? this.config.timeout;
    const controller = new AbortController();
    const external = options.signal;

    let timedOut = false;
    const onExternalAbort = () => controller.abort(external?.reason);

    // Deliberately hand-rolled rather than using AbortSignal.timeout/any: those
    // are missing or gated behind compatibility flags on older Workers dates.
    const timer =
      timeout > 0
        ? setTimeout(() => {
            timedOut = true;
            controller.abort();
          }, timeout)
        : undefined;

    if (external) {
      if (external.aborted) controller.abort(external.reason);
      else external.addEventListener('abort', onExternalAbort, { once: true });
    }

    let response: Response;
    try {
      response = await this.config.fetch(url, {
        method: options.method,
        headers: init.headers,
        ...(init.body === undefined ? {} : { body: init.body }),
        signal: controller.signal,
      });
    } catch (error) {
      // Caller cancellation is theirs to observe — pass it through untouched.
      if (external?.aborted) throw error;
      if (timedOut) throw new SupDeskTimeoutError(timeout);
      throw new SupDeskConnectionError(
        `Request to ${url} failed: ${error instanceof Error ? error.message : String(error)}`,
        { cause: error },
      );
    } finally {
      if (timer !== undefined) clearTimeout(timer);
      external?.removeEventListener('abort', onExternalAbort);
    }

    return parseResponse<T>(response);
  }
}

/**
 * Turns a `Response` into a parsed body or a typed error.
 *
 * A non-JSON body must never make this throw a `SyntaxError`: an HTML error
 * page from a proxy should surface as a `SupDeskAPIError` carrying the raw
 * text, not as a parse failure that hides the actual status.
 */
export async function parseResponse<T>(response: Response): Promise<T> {
  const text = response.status === 204 ? '' : await response.text();
  const parsed = text === '' ? undefined : safeJsonParse(text);

  if (response.ok) {
    if (text !== '' && parsed === undefined) {
      throw createAPIError({
        status: response.status,
        code: 'internal_error',
        message: 'Expected a JSON response body but could not parse one.',
        headers: response.headers,
        body: text,
      });
    }
    return parsed as T;
  }

  const envelope = extractErrorEnvelope(parsed);

  throw createAPIError({
    status: response.status,
    code: envelope?.code ?? '',
    // `||` not `??`: an envelope present but with an empty message should still
    // fall back to something a human can act on.
    message: envelope?.message || `SupDesk API request failed with status ${response.status}.`,
    headers: response.headers,
    body: parsed ?? text,
  });
}

function safeJsonParse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

function extractErrorEnvelope(body: unknown): { code: string; message: string } | undefined {
  if (typeof body !== 'object' || body === null) return undefined;

  const error = (body as { error?: unknown }).error;
  if (typeof error !== 'object' || error === null) return undefined;

  const { code, message } = error as { code?: unknown; message?: unknown };

  return {
    code: typeof code === 'string' ? code : '',
    message: typeof message === 'string' ? message : '',
  };
}
