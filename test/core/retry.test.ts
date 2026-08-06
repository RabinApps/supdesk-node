import { describe, expect, it } from 'vitest';
import {
  BASE_RETRY_DELAY_MS,
  MAX_RETRY_DELAY_MS,
  backoffDelay,
  parseRetryAfter,
  shouldRetry,
  sleep,
} from '../../src/core/retry.js';
import {
  SupDeskConnectionError,
  SupDeskTimeoutError,
  createAPIError,
} from '../../src/core/errors.js';

const apiError = (status: number, code: string) => createAPIError({ status, code, message: 'x' });

const decide = (error: unknown, overrides: Partial<Parameters<typeof shouldRetry>[0]> = {}) =>
  shouldRetry({
    error,
    method: 'GET',
    attempt: 0,
    maxRetries: 2,
    retryUnsafeMethods: false,
    ...overrides,
  });

describe('shouldRetry', () => {
  it('stops once the attempt budget is spent', () => {
    const error = apiError(500, 'internal_error');

    expect(decide(error, { attempt: 1 })).toBe(true);
    expect(decide(error, { attempt: 2 })).toBe(false);
    expect(decide(error, { attempt: 0, maxRetries: 0 })).toBe(false);
  });

  it('retries 5xx and connection failures on safe methods', () => {
    expect(decide(apiError(500, 'internal_error'))).toBe(true);
    expect(decide(apiError(503, ''))).toBe(true);
    expect(decide(apiError(408, ''))).toBe(true);
    expect(decide(new SupDeskConnectionError())).toBe(true);
  });

  it('never retries a quota failure, even though it is a 429', () => {
    // A monthly quota will not clear inside a backoff window; retrying only
    // spends more of the caller's rate-limit budget.
    expect(decide(apiError(429, 'limit_reached'))).toBe(false);
    expect(decide(apiError(429, 'limit_reached'), { method: 'POST' })).toBe(false);
    expect(decide(apiError(429, 'limit_reached'), { retryUnsafeMethods: true })).toBe(false);
  });

  it('retries a throttle on any method, including POST', () => {
    // The server states it did not process the request, so replaying is safe.
    expect(decide(apiError(429, 'rate_limited'), { method: 'POST' })).toBe(true);
    expect(decide(apiError(429, 'rate_limited'), { method: 'GET' })).toBe(true);
  });

  it('does not replay a POST on a network error or 5xx by default', () => {
    // SupDesk has no idempotency key and creates are metered, so a request that
    // failed after the server accepted it must not be sent twice.
    expect(decide(new SupDeskConnectionError(), { method: 'POST' })).toBe(false);
    expect(decide(apiError(500, 'internal_error'), { method: 'POST' })).toBe(false);
  });

  it('replays POSTs when the caller opts in', () => {
    expect(decide(new SupDeskConnectionError(), { method: 'POST', retryUnsafeMethods: true })).toBe(
      true,
    );
    expect(
      decide(apiError(500, 'internal_error'), { method: 'POST', retryUnsafeMethods: true }),
    ).toBe(true);
  });

  it.each(['get', 'GET', 'delete', 'PATCH', 'put', 'head'])('treats %s as safe', (method) => {
    expect(decide(apiError(500, 'internal_error'), { method })).toBe(true);
  });

  it('never retries ordinary client errors', () => {
    for (const status of [400, 401, 403, 404, 422]) {
      expect(decide(apiError(status, ''))).toBe(false);
    }
  });

  it('surfaces timeouts instead of retrying them', () => {
    // The caller chose the deadline; spending it several times over defeats it.
    expect(decide(new SupDeskTimeoutError(1000))).toBe(false);
  });

  it('does not retry errors it does not recognise', () => {
    expect(decide(new Error('something else'))).toBe(false);
  });
});

describe('parseRetryAfter', () => {
  it('reads a delay in seconds', () => {
    expect(parseRetryAfter('5')).toBe(5000);
    expect(parseRetryAfter('  2.5  ')).toBe(2500);
    expect(parseRetryAfter('0')).toBe(0);
  });

  it('reads an HTTP-date relative to now', () => {
    const now = Date.parse('2026-01-01T00:00:00Z');
    expect(parseRetryAfter('Thu, 01 Jan 2026 00:00:30 GMT', now)).toBe(30_000);
  });

  it('clamps a date already in the past to zero', () => {
    const now = Date.parse('2026-01-01T00:01:00Z');
    expect(parseRetryAfter('Thu, 01 Jan 2026 00:00:00 GMT', now)).toBe(0);
  });

  it.each([undefined, null, '', '   ', 'soon', 'NaN'])('ignores %s', (value) => {
    expect(parseRetryAfter(value)).toBeUndefined();
  });
});

describe('backoffDelay', () => {
  it('grows exponentially from the base delay', () => {
    // random() pinned to 1 removes jitter, leaving the raw exponential term.
    const noJitter = () => 1;

    expect(backoffDelay({ attempt: 0, random: noJitter })).toBe(BASE_RETRY_DELAY_MS);
    expect(backoffDelay({ attempt: 1, random: noJitter })).toBe(BASE_RETRY_DELAY_MS * 2);
    expect(backoffDelay({ attempt: 2, random: noJitter })).toBe(BASE_RETRY_DELAY_MS * 4);
  });

  it('clamps to the maximum delay', () => {
    expect(backoffDelay({ attempt: 30, random: () => 1 })).toBe(MAX_RETRY_DELAY_MS);
  });

  it('applies jitter between half and all of the computed delay', () => {
    // Jitter keeps a fleet of rate-limited workers from retrying in lockstep.
    expect(backoffDelay({ attempt: 0, random: () => 0 })).toBe(BASE_RETRY_DELAY_MS / 2);

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const delay = backoffDelay({ attempt });
      const ceiling = Math.min(BASE_RETRY_DELAY_MS * 2 ** attempt, MAX_RETRY_DELAY_MS);

      expect(delay).toBeGreaterThanOrEqual(ceiling / 2);
      expect(delay).toBeLessThanOrEqual(ceiling);
    }
  });

  it('prefers a server-supplied Retry-After', () => {
    expect(backoffDelay({ attempt: 0, retryAfterMs: 3000 })).toBe(3000);
  });

  it('still clamps a Retry-After to the maximum', () => {
    expect(backoffDelay({ attempt: 0, retryAfterMs: 60_000 })).toBe(MAX_RETRY_DELAY_MS);
  });
});

describe('sleep', () => {
  it('resolves after the requested delay', async () => {
    const started = Date.now();
    await sleep(5);
    expect(Date.now() - started).toBeGreaterThanOrEqual(1);
  });
});
