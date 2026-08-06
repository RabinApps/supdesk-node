import { describe, expect, it } from 'vitest';
import { SupDesk } from '../../src/client.js';
import { Page } from '../../src/core/pagination.js';
import { createMockFetch, pageOf, type MockResponseSpec } from '../helpers/mock-fetch.js';

/**
 * Resource classes are thin and highly repetitive, so they are covered by one
 * table rather than forty near-identical suites. Each row pins the wire
 * contract: method, path, query and body.
 */
interface EndpointCase {
  name: string;
  invoke: (client: SupDesk) => Promise<unknown>;
  response: MockResponseSpec;
  method: string;
  pathname: string;
  /** Expected query string, without the leading `?`. */
  search?: string;
  body?: unknown;
}

const listResponse = { json: pageOf([{ id: 'x_1' }]) };
const objectResponse = { json: { data: { id: 'x_1' } } };
const noContent = { status: 204 };

const CASES: EndpointCase[] = [
  // ── submissions ────────────────────────────────────────────────────────────
  {
    name: 'submissions.list',
    invoke: (c) => c.submissions.list(),
    response: listResponse,
    method: 'GET',
    pathname: '/v1/submissions',
  },
  {
    name: 'submissions.list with filters',
    invoke: (c) => c.submissions.list({ status: 'open', type: 'bug', limit: 50, offset: 10 }),
    response: listResponse,
    method: 'GET',
    pathname: '/v1/submissions',
    search: 'status=open&type=bug&limit=50&offset=10',
  },
  {
    name: 'submissions.get',
    invoke: (c) => c.submissions.get('sub_1'),
    response: objectResponse,
    method: 'GET',
    pathname: '/v1/submissions/sub_1',
  },
  {
    name: 'submissions.create',
    invoke: (c) =>
      c.submissions.create({ type: 'bug', title: 'Broken', email: 'a@example.com' }),
    response: objectResponse,
    method: 'POST',
    pathname: '/v1/submissions',
    body: { type: 'bug', title: 'Broken', email: 'a@example.com' },
  },

  // ── feedback ───────────────────────────────────────────────────────────────
  {
    name: 'feedback.list',
    invoke: (c) => c.feedback.list({ status: 'planned' }),
    response: listResponse,
    method: 'GET',
    pathname: '/v1/feedback',
    search: 'status=planned',
  },
  {
    name: 'feedback.get',
    invoke: (c) => c.feedback.get('fb_1'),
    response: objectResponse,
    method: 'GET',
    pathname: '/v1/feedback/fb_1',
  },
  {
    name: 'feedback.create',
    invoke: (c) => c.feedback.create({ title: 'Nice', email: 'a@example.com', locale: 'de' }),
    response: objectResponse,
    method: 'POST',
    pathname: '/v1/feedback',
    body: { title: 'Nice', email: 'a@example.com', locale: 'de' },
  },

  // ── changelog ──────────────────────────────────────────────────────────────
  {
    name: 'changelog.list',
    invoke: (c) => c.changelog.list({ locale: 'fr' }),
    response: listResponse,
    method: 'GET',
    pathname: '/v1/changelog',
    search: 'locale=fr',
  },
  {
    name: 'changelog.get with locale',
    invoke: (c) => c.changelog.get('cl_1', { locale: 'ja' }),
    response: objectResponse,
    method: 'GET',
    pathname: '/v1/changelog/cl_1',
    search: 'locale=ja',
  },
  {
    name: 'changelog.create',
    invoke: (c) => c.changelog.create({ title: 'v2', labels: ['New', 'Fixed'], version: '2.0.0' }),
    response: objectResponse,
    method: 'POST',
    pathname: '/v1/changelog',
    body: { title: 'v2', labels: ['New', 'Fixed'], version: '2.0.0' },
  },
  {
    name: 'changelog.update',
    invoke: (c) => c.changelog.update('cl_1', { status: 'published' }),
    response: objectResponse,
    method: 'PATCH',
    pathname: '/v1/changelog/cl_1',
    body: { status: 'published' },
  },
  {
    name: 'changelog.delete',
    invoke: (c) => c.changelog.delete('cl_1'),
    response: noContent,
    method: 'DELETE',
    pathname: '/v1/changelog/cl_1',
  },

  // ── messages ───────────────────────────────────────────────────────────────
  {
    name: 'messages.list',
    invoke: (c) => c.messages.list({ status: 'closed' }),
    response: listResponse,
    method: 'GET',
    pathname: '/v1/messages',
    search: 'status=closed',
  },
  {
    name: 'messages.get',
    invoke: (c) => c.messages.get('thr_1'),
    response: { json: { data: { id: 'thr_1', messages: [] } } },
    method: 'GET',
    pathname: '/v1/messages/thr_1',
  },
  {
    name: 'messages.create',
    invoke: (c) => c.messages.create({ email: 'a@example.com', subject: 'Help' }),
    response: objectResponse,
    method: 'POST',
    pathname: '/v1/messages',
    body: { email: 'a@example.com', subject: 'Help' },
  },
  {
    name: 'messages.update',
    invoke: (c) => c.messages.update('thr_1', { status: 'closed' }),
    response: objectResponse,
    method: 'PATCH',
    pathname: '/v1/messages/thr_1',
    body: { status: 'closed' },
  },
  {
    name: 'messages.delete',
    invoke: (c) => c.messages.delete('thr_1'),
    response: noContent,
    method: 'DELETE',
    pathname: '/v1/messages/thr_1',
  },
  {
    name: 'messages.addMessage',
    invoke: (c) => c.messages.addMessage('thr_1', { body: 'On it', sender: 'member' }),
    response: objectResponse,
    method: 'POST',
    pathname: '/v1/messages/thr_1/messages',
    body: { body: 'On it', sender: 'member' },
  },

  // ── waitlist ───────────────────────────────────────────────────────────────
  {
    name: 'waitlist.list',
    invoke: (c) => c.waitlist.list({ search: 'acme', status: 'waiting' }),
    response: listResponse,
    method: 'GET',
    pathname: '/v1/waitlist/signups',
    search: 'search=acme&status=waiting',
  },
  {
    name: 'waitlist.get',
    invoke: (c) => c.waitlist.get('wl_1'),
    response: objectResponse,
    method: 'GET',
    pathname: '/v1/waitlist/signups/wl_1',
  },
  {
    name: 'waitlist.create',
    invoke: (c) => c.waitlist.create({ email: 'a@example.com', referral_code: 'ref_9' }),
    response: objectResponse,
    method: 'POST',
    pathname: '/v1/waitlist/signups',
    body: { email: 'a@example.com', referral_code: 'ref_9' },
  },
  {
    name: 'waitlist.update',
    invoke: (c) => c.waitlist.update('wl_1', { status: 'invited' }),
    response: objectResponse,
    method: 'PATCH',
    pathname: '/v1/waitlist/signups/wl_1',
    body: { status: 'invited' },
  },
  {
    name: 'waitlist.delete',
    invoke: (c) => c.waitlist.delete('wl_1'),
    response: noContent,
    method: 'DELETE',
    pathname: '/v1/waitlist/signups/wl_1',
  },

  // ── beta programs ──────────────────────────────────────────────────────────
  {
    name: 'beta.programs.list',
    invoke: (c) => c.beta.programs.list({ status: 'active' }),
    response: listResponse,
    method: 'GET',
    pathname: '/v1/beta/programs',
    search: 'status=active',
  },
  {
    name: 'beta.programs.get',
    invoke: (c) => c.beta.programs.get('bp_1'),
    response: objectResponse,
    method: 'GET',
    pathname: '/v1/beta/programs/bp_1',
  },
  {
    name: 'beta.programs.create',
    invoke: (c) => c.beta.programs.create({ name: 'Beta 1', allow_public_signup: true }),
    response: objectResponse,
    method: 'POST',
    pathname: '/v1/beta/programs',
    body: { name: 'Beta 1', allow_public_signup: true },
  },
  {
    name: 'beta.programs.update',
    invoke: (c) => c.beta.programs.update('bp_1', { summary: 'Updated' }),
    response: objectResponse,
    method: 'PATCH',
    pathname: '/v1/beta/programs/bp_1',
    body: { summary: 'Updated' },
  },
  {
    name: 'beta.programs.delete',
    invoke: (c) => c.beta.programs.delete('bp_1'),
    response: noContent,
    method: 'DELETE',
    pathname: '/v1/beta/programs/bp_1',
  },

  // ── beta testers ───────────────────────────────────────────────────────────
  {
    name: 'beta.testers.list',
    invoke: (c) => c.beta.testers.list('bp_1', { limit: 5 }),
    response: listResponse,
    method: 'GET',
    pathname: '/v1/beta/programs/bp_1/testers',
    search: 'limit=5',
  },
  {
    name: 'beta.testers.get',
    invoke: (c) => c.beta.testers.get('bp_1', 'bt_1'),
    response: objectResponse,
    method: 'GET',
    pathname: '/v1/beta/programs/bp_1/testers/bt_1',
  },
  {
    name: 'beta.testers.create',
    invoke: (c) => c.beta.testers.create('bp_1', { email: 'a@example.com' }),
    response: objectResponse,
    method: 'POST',
    pathname: '/v1/beta/programs/bp_1/testers',
    body: { email: 'a@example.com' },
  },
  {
    name: 'beta.testers.delete',
    invoke: (c) => c.beta.testers.delete('bp_1', 'bt_1'),
    response: noContent,
    method: 'DELETE',
    pathname: '/v1/beta/programs/bp_1/testers/bt_1',
  },

  // ── help center ────────────────────────────────────────────────────────────
  {
    name: 'articles.list',
    invoke: (c) => c.articles.list({ status: 'published', category_id: 'cat_1' }),
    response: listResponse,
    method: 'GET',
    pathname: '/v1/articles',
    search: 'status=published&category_id=cat_1',
  },
  {
    name: 'articles.search',
    invoke: (c) => c.articles.search({ q: 'reset password', limit: 5 }),
    response: { json: { data: [{ id: 'a_1', rank: 0.9 }] } },
    method: 'GET',
    pathname: '/v1/articles/search',
    search: 'q=reset+password&limit=5',
  },
  {
    name: 'articles.get',
    invoke: (c) => c.articles.get('a_1'),
    response: objectResponse,
    method: 'GET',
    pathname: '/v1/articles/a_1',
  },
  {
    name: 'articles.create',
    invoke: (c) => c.articles.create({ title: 'How to', body: '# Steps' }),
    response: objectResponse,
    method: 'POST',
    pathname: '/v1/articles',
    body: { title: 'How to', body: '# Steps' },
  },
  {
    name: 'articles.update',
    invoke: (c) => c.articles.update('a_1', { status: 'published' }),
    response: objectResponse,
    method: 'PATCH',
    pathname: '/v1/articles/a_1',
    body: { status: 'published' },
  },
  {
    name: 'articles.delete',
    invoke: (c) => c.articles.delete('a_1'),
    response: noContent,
    method: 'DELETE',
    pathname: '/v1/articles/a_1',
  },
  {
    name: 'articleCategories.list',
    invoke: (c) => c.articleCategories.list({ limit: 100 }),
    response: listResponse,
    method: 'GET',
    pathname: '/v1/article-categories',
    search: 'limit=100',
  },
  {
    name: 'articleCategories.get',
    invoke: (c) => c.articleCategories.get('cat_1'),
    response: objectResponse,
    method: 'GET',
    pathname: '/v1/article-categories/cat_1',
  },
  {
    name: 'articleCategories.create',
    invoke: (c) => c.articleCategories.create({ name: 'Billing', sort_order: 2 }),
    response: objectResponse,
    method: 'POST',
    pathname: '/v1/article-categories',
    body: { name: 'Billing', sort_order: 2 },
  },
  {
    name: 'articleCategories.update',
    invoke: (c) => c.articleCategories.update('cat_1', { name: 'Payments' }),
    response: objectResponse,
    method: 'PATCH',
    pathname: '/v1/article-categories/cat_1',
    body: { name: 'Payments' },
  },
  {
    name: 'articleCategories.delete',
    invoke: (c) => c.articleCategories.delete('cat_1'),
    response: noContent,
    method: 'DELETE',
    pathname: '/v1/article-categories/cat_1',
  },
];

describe('endpoint wire contract', () => {
  it.each(CASES)('$name', async (testCase) => {
    const mock = createMockFetch(testCase.response);
    const client = new SupDesk({ apiKey: 'sd_live_test', fetch: mock.fetch });

    await testCase.invoke(client);

    expect(mock.calls).toHaveLength(1);
    const call = mock.calls[0]!;

    expect(call.method).toBe(testCase.method);
    expect(call.url.pathname).toBe(testCase.pathname);
    expect(call.url.search).toBe(testCase.search ? `?${testCase.search}` : '');
    expect(call.body).toEqual(testCase.body);
  });

  it('exercises every public method on every resource', () => {
    // Derived from the resources themselves rather than a hand-kept number, so
    // adding an endpoint without a row here fails instead of silently passing.
    const client = new SupDesk({ apiKey: 'k' });
    const groups: Record<string, object> = {
      submissions: client.submissions,
      feedback: client.feedback,
      changelog: client.changelog,
      messages: client.messages,
      waitlist: client.waitlist,
      'beta.programs': client.beta.programs,
      'beta.testers': client.beta.testers,
      articles: client.articles,
      articleCategories: client.articleCategories,
    };

    const expected = new Set<string>();
    for (const [prefix, resource] of Object.entries(groups)) {
      for (const method of Object.getOwnPropertyNames(Object.getPrototypeOf(resource))) {
        if (method !== 'constructor') expected.add(`${prefix}.${method}`);
      }
    }

    const covered = new Set(CASES.map((testCase) => testCase.name.split(' ')[0]));

    expect([...expected].filter((method) => !covered.has(method))).toEqual([]);
  });
});

describe('return values', () => {
  it('unwraps the data envelope on a single resource', async () => {
    const mock = createMockFetch({ json: { data: { id: 'sub_1', title: 'Broken' } } });
    const client = new SupDesk({ apiKey: 'k', fetch: mock.fetch });

    await expect(client.submissions.get('sub_1')).resolves.toEqual({
      id: 'sub_1',
      title: 'Broken',
    });
  });

  it('returns an auto-paging Page from list endpoints', async () => {
    const mock = createMockFetch({ json: pageOf([{ id: 'sub_1' }], { has_more: false }) });
    const client = new SupDesk({ apiKey: 'k', fetch: mock.fetch });

    const page = await client.submissions.list();

    expect(page).toBeInstanceOf(Page);
    expect(page.data).toEqual([{ id: 'sub_1' }]);
  });

  it('walks pages transparently while preserving the filters', async () => {
    const mock = createMockFetch([
      { json: pageOf([{ id: 'sub_1' }], { limit: 1, offset: 0, has_more: true }) },
      { json: pageOf([{ id: 'sub_2' }], { limit: 1, offset: 1, has_more: false }) },
    ]);
    const client = new SupDesk({ apiKey: 'k', fetch: mock.fetch });

    const ids: string[] = [];
    for await (const item of await client.submissions.list({ status: 'open', limit: 1 })) {
      ids.push((item as { id: string }).id);
    }

    expect(ids).toEqual(['sub_1', 'sub_2']);
    expect(mock.calls[1]!.url.search).toBe('?status=open&limit=1&offset=1');
  });

  it('returns undefined from delete endpoints', async () => {
    const mock = createMockFetch({ status: 204 });
    const client = new SupDesk({ apiKey: 'k', fetch: mock.fetch });

    await expect(client.articles.delete('a_1')).resolves.toBeUndefined();
  });

  it('returns a plain array from search, which is not paginated', async () => {
    const mock = createMockFetch({ json: { data: [{ id: 'a_1', rank: 1 }] } });
    const client = new SupDesk({ apiKey: 'k', fetch: mock.fetch });

    await expect(client.articles.search({ q: 'billing' })).resolves.toEqual([
      { id: 'a_1', rank: 1 },
    ]);
  });

  it('escapes ids so they cannot rewrite the route', async () => {
    const mock = createMockFetch({ json: { data: {} } });
    const client = new SupDesk({ apiKey: 'k', fetch: mock.fetch });

    await client.submissions.get('../../admin');

    expect(mock.calls[0]!.url.pathname).toBe('/v1/submissions/..%2F..%2Fadmin');
  });

  it('threads per-call options through to the request', async () => {
    const mock = createMockFetch({ json: { data: {} } });
    const client = new SupDesk({ apiKey: 'k', fetch: mock.fetch });

    await client.submissions.get('sub_1', { headers: { 'x-trace': 'abc' } });

    expect(mock.calls[0]!.headers.get('x-trace')).toBe('abc');
  });
});
