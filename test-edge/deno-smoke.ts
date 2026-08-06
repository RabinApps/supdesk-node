/**
 * Deno smoke test — runs against the BUILT bundle, not the TypeScript source.
 *
 * Importing `dist/index.js` is the point: if a `node:` specifier survived the
 * build, or a Node-only global crept in, Deno fails here rather than in a
 * user's project. Run with:
 *
 *   deno run --allow-read test-edge/deno-smoke.ts
 */
import {
  ForbiddenError,
  LimitReachedError,
  Page,
  SUPDESK_SIGNATURE_HEADER,
  SupDesk,
  computeWebhookSignature,
  constructEventFromRequest,
  verifyWebhookSignature,
} from '../dist/index.js';

let failures = 0;

function check(label: string, condition: boolean): void {
  if (condition) {
    console.log(`  ✓ ${label}`);
  } else {
    console.error(`  ✗ ${label}`);
    failures += 1;
  }
}

async function expectRejection(
  label: string,
  promise: Promise<unknown>,
  type: new (...args: never[]) => Error,
) {
  try {
    await promise;
    check(label, false);
  } catch (error) {
    check(label, error instanceof type);
  }
}

/** Minimal stub `fetch` — no network access is needed or requested. */
function stubFetch(
  status: number,
  body: unknown,
  record?: { url?: string; auth?: string | null },
): typeof fetch {
  return (input, init) => {
    if (record) {
      record.url = String(input);
      record.auth = new Headers(init?.headers).get('authorization');
    }
    return Promise.resolve(
      new Response(JSON.stringify(body), {
        status,
        headers: { 'content-type': 'application/json' },
      }),
    );
  };
}

console.log('supdesk — Deno smoke test');
console.log(`  runtime: Deno ${Deno.version.deno}`);

// ── client ───────────────────────────────────────────────────────────────────
const record: { url?: string; auth?: string | null } = {};
const client = new SupDesk({
  apiKey: 'sd_live_deno',
  fetch: stubFetch(200, { data: { id: 'sub_1', title: 'Broken' } }, record),
});

const submission = await client.submissions.get('sub_1');
check('resolves and unwraps a single resource', submission.id === 'sub_1');
check('builds the documented URL', record.url === 'https://api.supdesk.app/v1/submissions/sub_1');
check('sends the bearer token', record.auth === 'Bearer sd_live_deno');

// ── pagination ───────────────────────────────────────────────────────────────
const paged = new SupDesk({
  apiKey: 'k',
  fetch: stubFetch(200, {
    data: [{ id: 'a_1' }],
    pagination: { limit: 25, offset: 0, has_more: false },
  }),
});

const page = await paged.articles.list();
check('list returns a Page', page instanceof Page);

const collected: string[] = [];
for await (const article of page) collected.push(article.id);
check('async iteration works', collected.length === 1 && collected[0] === 'a_1');

// ── typed errors ─────────────────────────────────────────────────────────────
const forbidden = new SupDesk({
  apiKey: 'k',
  fetch: stubFetch(403, { error: { code: 'forbidden', message: 'Paid plan required' } }),
});
await expectRejection(
  'maps 403 to ForbiddenError',
  forbidden.articles.create({ title: 'x' }),
  ForbiddenError,
);

const quota = new SupDesk({
  apiKey: 'k',
  fetch: stubFetch(429, { error: { code: 'limit_reached', message: 'Out of quota' } }),
});
await expectRejection(
  'maps 429 limit_reached to LimitReachedError without retrying',
  quota.submissions.create({ type: 'bug', title: 'x', email: 'a@example.com' }),
  LimitReachedError,
);

// ── webhooks on Deno's Web Crypto ────────────────────────────────────────────
const secret = 'whsec_deno';
const payload = JSON.stringify({
  event: 'waitlist_signup.joined',
  timestamp: '2026-08-05T12:00:00.000Z',
  project_id: 'proj_1',
  data: { id: 'wl_1', email: 'a@example.com' },
});

const signature = await computeWebhookSignature(payload, secret);
check('signature is sha256-prefixed hex', /^sha256=[0-9a-f]{64}$/.test(signature));
check('verifies a genuine signature', await verifyWebhookSignature({ payload, signature, secret }));
check(
  'rejects a tampered payload',
  !(await verifyWebhookSignature({ payload: `${payload} `, signature, secret })),
);

const request = new Request('https://example.com/hook', {
  method: 'POST',
  headers: { [SUPDESK_SIGNATURE_HEADER]: signature },
  body: payload,
});
const event = await constructEventFromRequest(request, secret);
check('parses a signed Request', event.event === 'waitlist_signup.joined');

// ── result ───────────────────────────────────────────────────────────────────
if (failures > 0) {
  console.error(`\n${failures} check(s) failed under Deno.`);
  Deno.exit(1);
}

console.log('\nAll Deno checks passed.');
