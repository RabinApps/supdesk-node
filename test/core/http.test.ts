import { describe, expect, it, vi } from 'vitest';
import { HttpClient, MAX_REQUEST_BYTES, parseResponse } from '../../src/core/http.js';
import {
  ForbiddenError,
  InternalServerError,
  LimitReachedError,
  NotFoundError,
  RateLimitedError,
  RequestTooLargeError,
  SupDeskAPIError,
  SupDeskConnectionError,
  SupDeskTimeoutError,
} from '../../src/core/errors.js';
import { VERSION } from '../../src/version.js';
import {
  createHangingFetch,
  createMockFetch,
  errorBody,
  type MockResponseEntry,
} from '../helpers/mock-fetch.js';

/**
 * Awaits a promise that is expected to reject and returns the error.
 *
 * Fails loudly if it resolves instead, and returns `any` so assertions can read
 * error properties without a cast on every line.
 */
async function captureError(promise: Promise<unknown>): Promise<any> {
  let captured: unknown;
  let rejected = false;

  try {
    await promise;
  } catch (error) {
    captured = error;
    rejected = true;
  }

  if (!rejected) throw new Error('Expected the request to reject, but it resolved.');
  return captured;
}

/** A client whose retries cost no real time. */
function makeClient(entries: MockResponseEntry | MockResponseEntry[], overrides = {}) {
  const mock = createMockFetch(entries);
  const sleeps: number[] = [];

  const client = new HttpClient({
    apiKey: 'sd_live_test',
    baseUrl: 'https://api.supdesk.app/v1',
    fetch: mock.fetch,
    sleep: async (ms) => {
      sleeps.push(ms);
    },
    random: () => 1,
    ...overrides,
  });

  return { client, calls: mock.calls, sleeps };
}

describe('request construction', () => {
  it('builds the URL from base, path and query', async () => {
    const { client, calls } = makeClient({ json: { data: [] } });

    await client.request({
      method: 'GET',
      path: '/submissions',
      query: { status: 'open', limit: 5 },
    });

    expect(calls[0]!.url.href).toBe('https://api.supdesk.app/v1/submissions?status=open&limit=5');
  });

  it('sends auth, accept and user-agent headers', async () => {
    const { client, calls } = makeClient({ json: { data: {} } });

    await client.request({ method: 'GET', path: '/submissions/1' });

    const headers = calls[0]!.headers;
    expect(headers.get('authorization')).toBe('Bearer sd_live_test');
    expect(headers.get('accept')).toBe('application/json');
    expect(headers.get('user-agent')).toBe(`supdesk-js/${VERSION}`);
  });

  it('merges default and per-request headers', async () => {
    const { client, calls } = makeClient(
      { json: { data: {} } },
      { defaultHeaders: { 'x-tenant': 'acme' } },
    );

    await client.request({ method: 'GET', path: '/x', headers: { 'x-trace': 'abc' } });

    expect(calls[0]!.headers.get('x-tenant')).toBe('acme');
    expect(calls[0]!.headers.get('x-trace')).toBe('abc');
  });

  it('does not let a caller header override authorization', async () => {
    const { client, calls } = makeClient(
      { json: { data: {} } },
      { defaultHeaders: { authorization: 'Bearer attacker' } },
    );

    await client.request({
      method: 'GET',
      path: '/x',
      headers: { authorization: 'Bearer also-attacker' },
    });

    expect(calls[0]!.headers.get('authorization')).toBe('Bearer sd_live_test');
  });

  it('sends a JSON body only when there is one', async () => {
    const { client, calls } = makeClient([{ json: { data: {} } }, { json: { data: {} } }]);

    await client.request({ method: 'POST', path: '/feedback', body: { title: 'Hi' } });
    await client.request({ method: 'GET', path: '/feedback' });

    expect(calls[0]!.headers.get('content-type')).toBe('application/json');
    expect(calls[0]!.body).toEqual({ title: 'Hi' });
    expect(calls[1]!.headers.get('content-type')).toBeNull();
    expect(calls[1]!.rawBody).toBeUndefined();
  });

  it('rejects a body over the 1 MB API limit before sending it', async () => {
    const { client, calls } = makeClient({ json: { data: {} } });

    const promise = client.request({
      method: 'POST',
      path: '/articles',
      body: { body: 'x'.repeat(MAX_REQUEST_BYTES + 1) },
    });

    await expect(promise).rejects.toBeInstanceOf(RequestTooLargeError);
    expect(calls).toHaveLength(0);
  });
});

describe('response handling', () => {
  it('parses a JSON body', async () => {
    const { client } = makeClient({ json: { data: { id: 'sub_1' } } });

    await expect(client.request({ method: 'GET', path: '/x' })).resolves.toEqual({
      data: { id: 'sub_1' },
    });
  });

  it('returns undefined for 204 No Content', async () => {
    const { client } = makeClient({ status: 204 });

    await expect(client.request({ method: 'DELETE', path: '/x/1' })).resolves.toBeUndefined();
  });

  it('returns undefined for an empty 200 body', async () => {
    const { client } = makeClient({ status: 200, text: '' });

    await expect(client.request({ method: 'GET', path: '/x' })).resolves.toBeUndefined();
  });

  it('reports unparseable success bodies as an API error, not a SyntaxError', async () => {
    const { client } = makeClient({ status: 200, text: '<html>nope</html>' });

    const error = await captureError(client.request({ method: 'GET', path: '/x' }));

    expect(error).toBeInstanceOf(InternalServerError);
    expect(error.body).toBe('<html>nope</html>');
  });

  it.each([
    [400, 'invalid_request'],
    [401, 'unauthorized'],
    [403, 'forbidden'],
    [404, 'not_found'],
  ] as const)('turns a %i envelope into a typed error', async (status, code) => {
    const { client } = makeClient({ status, json: errorBody(code, 'nope') });

    const error = await captureError(client.request({ method: 'GET', path: '/x' }));

    expect(error).toBeInstanceOf(SupDeskAPIError);
    expect(error.code).toBe(code);
    expect(error.status).toBe(status);
    expect(error.message).toBe('nope');
  });

  it('surfaces a paid-plan write rejection as ForbiddenError', async () => {
    const { client } = makeClient({
      status: 403,
      json: errorBody('forbidden', 'Writes require a paid plan.'),
    });

    await expect(
      client.request({ method: 'POST', path: '/articles', body: {} }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('keeps a non-JSON error body as text instead of throwing', async () => {
    // maxRetries: 0 — this asserts the parse, not the retry loop.
    const { client } = makeClient(
      { status: 502, text: '<html>bad gateway</html>' },
      { maxRetries: 0 },
    );

    const error = await captureError(client.request({ method: 'GET', path: '/x' }));

    expect(error).toBeInstanceOf(InternalServerError);
    expect(error.body).toBe('<html>bad gateway</html>');
    expect(error.message).toContain('502');
  });

  it('falls back to a readable message when the envelope has an empty one', async () => {
    const { client } = makeClient({
      status: 404,
      json: { error: { code: 'not_found', message: '' } },
    });

    const error = await captureError(client.request({ method: 'GET', path: '/x' }));

    expect(error).toBeInstanceOf(NotFoundError);
    expect(error.message).toContain('404');
  });

  it('handles an error body that is JSON but not an envelope', async () => {
    const { client } = makeClient({ status: 500, json: ['unexpected'] }, { maxRetries: 0 });

    const error = await captureError(client.request({ method: 'GET', path: '/x' }));

    expect(error).toBeInstanceOf(InternalServerError);
    expect(error.body).toEqual(['unexpected']);
  });

  it('parses a Response directly', async () => {
    const response = new Response(JSON.stringify({ data: 1 }), { status: 200 });

    await expect(parseResponse(response)).resolves.toEqual({ data: 1 });
  });
});

describe('retries', () => {
  it('retries a 5xx and returns the eventual success', async () => {
    const { client, calls, sleeps } = makeClient([
      { status: 500, json: errorBody('internal_error') },
      { status: 200, json: { data: 'ok' } },
    ]);

    await expect(client.request({ method: 'GET', path: '/x' })).resolves.toEqual({ data: 'ok' });
    expect(calls).toHaveLength(2);
    expect(sleeps).toEqual([500]);
  });

  it('gives up after maxRetries and throws the last error', async () => {
    const { client, calls } = makeClient(
      [
        { status: 500, json: errorBody('internal_error') },
        { status: 500, json: errorBody('internal_error') },
        { status: 500, json: errorBody('internal_error') },
      ],
      { maxRetries: 2 },
    );

    await expect(client.request({ method: 'GET', path: '/x' })).rejects.toBeInstanceOf(
      InternalServerError,
    );
    expect(calls).toHaveLength(3);
  });

  it('retries a throttled POST but not a quota-exhausted one', async () => {
    const throttled = makeClient([
      { status: 429, json: errorBody('rate_limited') },
      { status: 200, json: { data: 'ok' } },
    ]);
    await throttled.client.request({ method: 'POST', path: '/submissions', body: {} });
    expect(throttled.calls).toHaveLength(2);

    const quota = makeClient({ status: 429, json: errorBody('limit_reached') });
    await expect(
      quota.client.request({ method: 'POST', path: '/submissions', body: {} }),
    ).rejects.toBeInstanceOf(LimitReachedError);
    expect(quota.calls).toHaveLength(1);
  });

  it('does not replay a POST after a network failure', async () => {
    const { client, calls } = makeClient(new TypeError('fetch failed'));

    await expect(
      client.request({ method: 'POST', path: '/submissions', body: {} }),
    ).rejects.toBeInstanceOf(SupDeskConnectionError);
    expect(calls).toHaveLength(1);
  });

  it('replays a POST after a network failure when opted in', async () => {
    const { client, calls } = makeClient(
      [new TypeError('fetch failed'), { status: 200, json: { data: 'ok' } }],
      { retryUnsafeMethods: true },
    );

    await client.request({ method: 'POST', path: '/submissions', body: {} });

    expect(calls).toHaveLength(2);
  });

  it('honours Retry-After over the computed backoff', async () => {
    const { client, sleeps } = makeClient([
      { status: 429, json: errorBody('rate_limited'), headers: { 'retry-after': '3' } },
      { status: 200, json: { data: 'ok' } },
    ]);

    await client.request({ method: 'GET', path: '/x' });

    expect(sleeps).toEqual([3000]);
  });

  it('does not retry a 4xx', async () => {
    const { client, calls } = makeClient({ status: 404, json: errorBody('not_found') });

    await expect(client.request({ method: 'GET', path: '/x' })).rejects.toBeInstanceOf(
      NotFoundError,
    );
    expect(calls).toHaveLength(1);
  });

  it('retries a rate limit on a GET', async () => {
    const { client, calls } = makeClient([
      { status: 429, json: errorBody('rate_limited') },
      { status: 429, json: errorBody('rate_limited') },
      { status: 429, json: errorBody('rate_limited') },
    ]);

    await expect(client.request({ method: 'GET', path: '/x' })).rejects.toBeInstanceOf(
      RateLimitedError,
    );
    expect(calls).toHaveLength(3);
  });
});

describe('cancellation', () => {
  it('raises SupDeskTimeoutError when the deadline passes', async () => {
    const client = new HttpClient({ apiKey: 'k', fetch: createHangingFetch(), timeout: 10 });

    await expect(client.request({ method: 'GET', path: '/x' })).rejects.toBeInstanceOf(
      SupDeskTimeoutError,
    );
  });

  it('lets a per-request timeout override the client default', async () => {
    const client = new HttpClient({ apiKey: 'k', fetch: createHangingFetch(), timeout: 60_000 });

    const error = await captureError(client.request({ method: 'GET', path: '/x', timeout: 5 }));

    expect(error).toBeInstanceOf(SupDeskTimeoutError);
    expect(error.timeout).toBe(5);
  });

  it('passes a caller abort through untouched', async () => {
    const client = new HttpClient({ apiKey: 'k', fetch: createHangingFetch(), timeout: 0 });
    const controller = new AbortController();

    const promise = client.request({ method: 'GET', path: '/x', signal: controller.signal });
    controller.abort();

    // Caller cancellation is theirs to observe — it must not be rewrapped.
    await expect(promise).rejects.toMatchObject({ name: 'AbortError' });
  });

  it('short-circuits an already-aborted signal', async () => {
    const client = new HttpClient({ apiKey: 'k', fetch: createHangingFetch(), timeout: 0 });

    await expect(
      client.request({ method: 'GET', path: '/x', signal: AbortSignal.abort() }),
    ).rejects.toMatchObject({ name: 'AbortError' });
  });

  it('does not arm a timer when the timeout is disabled', async () => {
    const { client } = makeClient({ json: { data: 'ok' } }, { timeout: 0 });

    await expect(client.request({ method: 'GET', path: '/x' })).resolves.toEqual({ data: 'ok' });
  });
});

describe('defaults', () => {
  it('falls back to the global fetch', async () => {
    const globalFetch = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response(JSON.stringify({ data: 'ok' }), { status: 200 }));

    const client = new HttpClient({ apiKey: 'k' });
    await expect(client.request({ method: 'GET', path: '/x' })).resolves.toEqual({ data: 'ok' });

    expect(globalFetch).toHaveBeenCalledOnce();
    globalFetch.mockRestore();
  });

  it('defaults to the documented base URL', () => {
    expect(new HttpClient({ apiKey: 'k' }).config.baseUrl).toBe('https://api.supdesk.app/v1');
  });

  it('wraps a non-Error fetch rejection as a connection error', async () => {
    const client = new HttpClient({
      apiKey: 'k',
      fetch: () => Promise.reject('socket hang up'),
      maxRetries: 0,
    });

    const error = await captureError(client.request({ method: 'GET', path: '/x' }));

    expect(error).toBeInstanceOf(SupDeskConnectionError);
    expect(error.message).toContain('socket hang up');
  });
});
