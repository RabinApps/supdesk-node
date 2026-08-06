/**
 * Runs inside real workerd, without `nodejs_compat`.
 *
 * This is the job that actually proves the Cloudflare Workers claim: the Node
 * suite would happily pass on code that secretly depends on `node:crypto` or
 * `Buffer`, because Node provides them. Here, nothing does.
 */
import { describe, expect, it } from 'vitest';
import {
  ForbiddenError,
  LimitReachedError,
  Page,
  RateLimitedError,
  SupDesk,
  Webhooks,
  computeWebhookSignature,
  constructEventFromRequest,
  verifyWebhookSignature,
  SUPDESK_SIGNATURE_HEADER,
} from '../src/index.js';
import { createMockFetch, errorBody, pageOf } from '../test/helpers/mock-fetch.js';

const SECRET = 'whsec_workers';

describe('runtime', () => {
  it('is really workerd, not Node in disguise', () => {
    // Without this the whole suite could pass under Node and prove nothing.
    expect(navigator.userAgent).toBe('Cloudflare-Workers');
    expect('WebSocketPair' in globalThis).toBe(true);
  });

  it('provides Web Crypto without a Node compatibility flag', () => {
    // `nodejs_compat` is off in the config, so this is workerd's own
    // implementation — the one webhook verification has to work against.
    //
    // Note: the absence of Node globals is *not* asserted here. The pool
    // injects a `process` shim for the vitest runner itself, so a check here
    // would test the harness rather than the library. That guarantee comes
    // from scripts/check-edge-safe.mjs, which greps the built bundle.
    expect(typeof globalThis.crypto.subtle.importKey).toBe('function');
  });
});

describe('client in workerd', () => {
  it('issues a request and unwraps the response', async () => {
    const mock = createMockFetch({ json: { data: { id: 'sub_1', title: 'Broken' } } });
    const client = new SupDesk({ apiKey: 'sd_live_test', fetch: mock.fetch });

    await expect(client.submissions.get('sub_1')).resolves.toEqual({
      id: 'sub_1',
      title: 'Broken',
    });
    expect(mock.calls[0]!.headers.get('authorization')).toBe('Bearer sd_live_test');
  });

  it('auto-pages with async iteration', async () => {
    const mock = createMockFetch([
      { json: pageOf([{ id: 'a' }], { limit: 1, offset: 0, has_more: true }) },
      { json: pageOf([{ id: 'b' }], { limit: 1, offset: 1, has_more: false }) },
    ]);
    const client = new SupDesk({ apiKey: 'k', fetch: mock.fetch });

    const page = await client.articles.list({ limit: 1 });
    expect(page).toBeInstanceOf(Page);

    const ids: string[] = [];
    for await (const article of page) ids.push(article.id);

    expect(ids).toEqual(['a', 'b']);
  });

  it('maps error envelopes to typed errors', async () => {
    const forbidden = createMockFetch({ status: 403, json: errorBody('forbidden', 'Paid plan required') });
    const quota = createMockFetch({ status: 429, json: errorBody('limit_reached', 'Out of quota') });

    await expect(
      new SupDesk({ apiKey: 'k', fetch: forbidden.fetch }).articles.create({ title: 'x' }),
    ).rejects.toBeInstanceOf(ForbiddenError);

    await expect(
      new SupDesk({ apiKey: 'k', fetch: quota.fetch }).submissions.create({
        type: 'bug',
        title: 'x',
        email: 'a@example.com',
      }),
    ).rejects.toBeInstanceOf(LimitReachedError);
  });

  it('retries a throttled request using the runtime timers', async () => {
    const mock = createMockFetch([
      { status: 429, json: errorBody('rate_limited'), headers: { 'retry-after': '0' } },
      { json: { data: { id: 'sub_1' } } },
    ]);
    const client = new SupDesk({ apiKey: 'k', fetch: mock.fetch });

    await expect(client.submissions.get('sub_1')).resolves.toEqual({ id: 'sub_1' });
    expect(mock.calls).toHaveLength(2);
  });

  it('surfaces a persistent throttle as RateLimitedError', async () => {
    const mock = createMockFetch([
      { status: 429, json: errorBody('rate_limited'), headers: { 'retry-after': '0' } },
      { status: 429, json: errorBody('rate_limited'), headers: { 'retry-after': '0' } },
      { status: 429, json: errorBody('rate_limited'), headers: { 'retry-after': '0' } },
    ]);
    const client = new SupDesk({ apiKey: 'k', fetch: mock.fetch });

    await expect(client.submissions.get('sub_1')).rejects.toBeInstanceOf(RateLimitedError);
  });
});

describe('webhooks on workerd crypto.subtle', () => {
  const payload = JSON.stringify({
    event: 'waitlist_signup.joined',
    timestamp: '2026-08-05T12:00:00.000Z',
    project_id: 'proj_1',
    data: { id: 'wl_1', email: 'a@example.com' },
  });

  it('signs and verifies with the platform Web Crypto', async () => {
    const signature = await computeWebhookSignature(payload, SECRET);

    expect(signature).toMatch(/^sha256=[0-9a-f]{64}$/);
    await expect(verifyWebhookSignature({ payload, signature, secret: SECRET })).resolves.toBe(true);
  });

  it('rejects a tampered payload', async () => {
    const signature = await computeWebhookSignature(payload, SECRET);

    await expect(
      verifyWebhookSignature({ payload: `${payload} `, signature, secret: SECRET }),
    ).resolves.toBe(false);
  });

  it('handles a Request the way a Worker fetch handler would', async () => {
    const request = new Request('https://worker.example/webhooks/supdesk', {
      method: 'POST',
      headers: { [SUPDESK_SIGNATURE_HEADER]: await new Webhooks(SECRET).sign(payload) },
      body: payload,
    });

    const event = await constructEventFromRequest(request, SECRET);

    expect(event.event).toBe('waitlist_signup.joined');
  });
});
