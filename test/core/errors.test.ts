import { describe, expect, it } from 'vitest';
import {
  ForbiddenError,
  InternalServerError,
  InvalidRequestError,
  LimitReachedError,
  NotFoundError,
  RateLimitedError,
  SupDeskAPIError,
  SupDeskConnectionError,
  SupDeskError,
  SupDeskTimeoutError,
  UnauthorizedError,
  createAPIError,
  isSupDeskAPIError,
  isSupDeskError,
} from '../../src/core/errors.js';

describe('createAPIError', () => {
  it.each([
    ['invalid_request', 400, InvalidRequestError],
    ['unauthorized', 401, UnauthorizedError],
    ['forbidden', 403, ForbiddenError],
    ['not_found', 404, NotFoundError],
    ['rate_limited', 429, RateLimitedError],
    ['limit_reached', 429, LimitReachedError],
    ['internal_error', 500, InternalServerError],
  ] as const)('maps %s to the right class', (code, status, expected) => {
    const error = createAPIError({ status, code, message: 'boom' });

    expect(error).toBeInstanceOf(expected);
    expect(error.code).toBe(code);
    expect(error.status).toBe(status);
    expect(error.message).toBe('boom');
  });

  it('distinguishes the two 429s by code, not status', () => {
    const throttled = createAPIError({ status: 429, code: 'rate_limited', message: 'slow down' });
    const quota = createAPIError({ status: 429, code: 'limit_reached', message: 'out of quota' });

    expect(throttled).toBeInstanceOf(RateLimitedError);
    expect(quota).toBeInstanceOf(LimitReachedError);
    // Same status — only the code separates a temporary throttle from a hard cap.
    expect(throttled.status).toBe(quota.status);
  });

  it.each([
    [400, InvalidRequestError],
    [401, UnauthorizedError],
    [403, ForbiddenError],
    [404, NotFoundError],
    [429, RateLimitedError],
    [502, InternalServerError],
    [503, InternalServerError],
  ])('falls back to the status when the code is missing (%i)', (status, expected) => {
    expect(createAPIError({ status, code: '', message: 'x' })).toBeInstanceOf(expected);
  });

  it('falls back to the base class for an unmapped status', () => {
    const error = createAPIError({ status: 418, code: '', message: 'teapot' });

    expect(error).toBeInstanceOf(SupDeskAPIError);
    expect(error.constructor).toBe(SupDeskAPIError);
  });

  it('captures headers, request id and raw body', () => {
    const headers = new Headers({ 'x-request-id': 'req_123' });
    const error = createAPIError({
      status: 404,
      code: 'not_found',
      message: 'gone',
      headers,
      body: { error: { code: 'not_found', message: 'gone' } },
    });

    expect(error.requestId).toBe('req_123');
    expect(error.headers).toBe(headers);
    expect(error.body).toEqual({ error: { code: 'not_found', message: 'gone' } });
  });

  it('reads the vendor-prefixed request id when the generic one is absent', () => {
    const error = createAPIError({
      status: 500,
      code: 'internal_error',
      message: 'x',
      headers: new Headers({ 'x-supdesk-request-id': 'sd_abc' }),
    });

    expect(error.requestId).toBe('sd_abc');
  });

  it('leaves requestId undefined when no header is present', () => {
    expect(createAPIError({ status: 500, code: '', message: 'x' }).requestId).toBeUndefined();
  });
});

describe('error hierarchy', () => {
  it('keeps every error catchable as SupDeskError', () => {
    const errors = [
      createAPIError({ status: 500, code: 'internal_error', message: 'x' }),
      new SupDeskConnectionError(),
      new SupDeskTimeoutError(1000),
    ];

    for (const error of errors) {
      expect(error).toBeInstanceOf(SupDeskError);
      expect(error).toBeInstanceOf(Error);
      expect(isSupDeskError(error)).toBe(true);
    }
  });

  it('sets a useful name on each class', () => {
    expect(new SupDeskConnectionError().name).toBe('SupDeskConnectionError');
    expect(new SupDeskTimeoutError(500).name).toBe('SupDeskTimeoutError');
    expect(createAPIError({ status: 403, code: 'forbidden', message: 'x' }).name).toBe(
      'ForbiddenError',
    );
  });

  it('records the timeout that elapsed', () => {
    const error = new SupDeskTimeoutError(2500);

    expect(error.timeout).toBe(2500);
    expect(error.message).toContain('2500ms');
  });

  it('preserves the underlying cause on connection errors', () => {
    const cause = new Error('ECONNRESET');
    expect(new SupDeskConnectionError('failed', { cause }).cause).toBe(cause);
  });

  it('narrows API errors separately from transport errors', () => {
    expect(isSupDeskAPIError(createAPIError({ status: 400, code: '', message: 'x' }))).toBe(true);
    expect(isSupDeskAPIError(new SupDeskConnectionError())).toBe(false);
    expect(isSupDeskError(new Error('unrelated'))).toBe(false);
    expect(isSupDeskError(null)).toBe(false);
  });
});
