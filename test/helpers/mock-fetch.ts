/**
 * A tiny `fetch` double.
 *
 * The client takes `fetch` as an option, so tests can inject one directly
 * instead of patching the global. That keeps the harness dependency-free and,
 * unlike request-interception libraries, it works identically inside workerd —
 * the same helper backs both the Node and the edge suites.
 */

export interface MockCall {
  url: URL;
  method: string;
  headers: Headers;
  /** Parsed JSON request body, or `undefined` when there was none. */
  body: unknown;
  rawBody: string | undefined;
}

export interface MockResponseSpec {
  status?: number;
  /** Serialized to JSON. Ignored when `text` is given. */
  json?: unknown;
  /** Raw response text, for testing malformed bodies. */
  text?: string;
  headers?: Record<string, string>;
}

/** Queue entry: a response to return, or an error to throw (network failure). */
export type MockResponseEntry = MockResponseSpec | Error;

export interface MockFetch {
  fetch: typeof globalThis.fetch;
  calls: MockCall[];
}

function toResponse(spec: MockResponseSpec): Response {
  const status = spec.status ?? 200;
  const headers = new Headers(spec.headers);

  // 204/205 must not carry a body, per the Fetch spec.
  if (status === 204 || status === 205) {
    return new Response(null, { status, headers });
  }

  if (spec.text !== undefined) {
    return new Response(spec.text, { status, headers });
  }

  if (spec.json === undefined) {
    return new Response('', { status, headers });
  }

  if (!headers.has('content-type')) headers.set('content-type', 'application/json');
  return new Response(JSON.stringify(spec.json), { status, headers });
}

/**
 * Returns a `fetch` that replays `entries` in order and records every call.
 *
 * Running out of queued entries is a hard error rather than a silent repeat, so
 * a test that fires more requests than it expects fails loudly.
 */
export function createMockFetch(entries: MockResponseEntry | MockResponseEntry[]): MockFetch {
  const queue = Array.isArray(entries) ? [...entries] : [entries];
  const calls: MockCall[] = [];

  const fetch: typeof globalThis.fetch = async (input, init) => {
    const rawBody = typeof init?.body === 'string' ? init.body : undefined;

    calls.push({
      url: new URL(String(input)),
      method: init?.method ?? 'GET',
      headers: new Headers(init?.headers),
      body: rawBody === undefined ? undefined : JSON.parse(rawBody),
      rawBody,
    });

    const next = queue.shift();
    if (next === undefined) {
      throw new Error(
        `mock fetch: request #${calls.length} to ${String(input)} had no queued response.`,
      );
    }

    if (next instanceof Error) throw next;
    return toResponse(next);
  };

  return { fetch, calls };
}

/** A `fetch` that never settles until its signal aborts — for timeout tests. */
export function createHangingFetch(): typeof globalThis.fetch {
  return (_input, init) =>
    new Promise((_resolve, reject) => {
      const abort = () =>
        reject(
          Object.assign(new Error('The operation was aborted.'), {
            name: 'AbortError',
          }),
        );

      if (init?.signal?.aborted) return abort();
      init?.signal?.addEventListener('abort', abort, { once: true });
    });
}

/** Builds a `{ data, pagination }` list envelope. */
export function pageOf<T>(data: T[], overrides: Partial<{ limit: number; offset: number; has_more: boolean }> = {}) {
  return {
    data,
    pagination: {
      limit: overrides.limit ?? 20,
      offset: overrides.offset ?? 0,
      has_more: overrides.has_more ?? false,
    },
  };
}

/** Builds a SupDesk error envelope. */
export function errorBody(code: string, message = `${code} occurred`) {
  return { error: { code, message } };
}
