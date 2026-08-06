# supdesk

TypeScript client for the [SupDesk API](https://docs.supdesk.app/en/api/authentication).

Runs unmodified in **Node 18+, Deno, Bun, and Cloudflare Workers** — it uses
nothing but WHATWG `fetch`, `AbortController` and Web Crypto, and ships zero runtime
dependencies.

> [!WARNING]
> **Server-side only. Never ship your API key to a browser.**
>
> A SupDesk API key authenticates as your entire project. Anything that reaches a
> browser is public — bundlers inline it, DevTools shows it, and users can read it
> straight out of the network tab. Use this SDK from a backend you control (an API
> route, a server action, a Worker, a cron job) and let your frontend talk to that.
>
> The constructor **throws** if it detects a DOM. See [Security](#security).

```bash
npm install supdesk
```

## Quick start

```ts
import { SupDesk } from "supdesk";

const supdesk = new SupDesk({ apiKey: process.env.SUPDESK_API_KEY! });

// Auto-pages: iterating walks every page for you.
for await (const submission of await supdesk.submissions.list({
  status: "open",
})) {
  console.log(submission.title);
}

await supdesk.submissions.create({
  type: "bug",
  title: "Export button does nothing",
  email: "user@example.com",
  body: "Clicking Export on the reports page has no effect.",
});
```

API keys come from **Workspace Settings → API Keys** in the SupDesk console and are
scoped to a single project. Reads work on every plan; **writes (`POST`/`PATCH`/`DELETE`)
require a paid plan** and otherwise raise a `ForbiddenError`.

Read the key from a server-side environment variable, as above — never from a
build-time constant or a client-exposed variable such as `NEXT_PUBLIC_*`, `VITE_*`,
`REACT_APP_*`, `PUBLIC_*` or `EXPO_PUBLIC_*`.

## Security

**The API key is a server-side secret.** It is project-scoped, and on a paid plan it can
create, edit and delete submissions, feedback, changelog entries, help center articles,
message threads, waitlist signups and beta programs — and read every end-user email
address in your project. It is not a publishable key, and SupDesk has no browser-safe
equivalent.

So the client refuses to start in a browser:

```ts
// In a React component, bundled and served to users:
new SupDesk({ apiKey: 'sd_live_…' });
// → SupDeskConfigurationError: SupDesk is a server-side SDK and was constructed
//   in a browser. …
```

Detection requires both `window` and `document`, so Node, Deno, Bun and Workers are
unaffected. If you hit this error, the key is already in your bundle — **rotate it** in
Workspace Settings → API Keys, then move the call behind your own endpoint:

```ts
// app/api/feedback/route.ts — runs on your server
import { SupDesk } from 'supdesk';

const supdesk = new SupDesk({ apiKey: process.env.SUPDESK_API_KEY! });

export async function POST(request: Request) {
  const { title, email } = await request.json();
  // Validate and rate-limit here — this endpoint is public, your key is not.
  await supdesk.feedback.create({ title, email });
  return Response.json({ ok: true });
}
```

`dangerouslyAllowBrowser: true` bypasses the check. It exists for cases where the key
genuinely is not a secret — an internal tool behind SSO, or a browser test harness
pointed at a mock `baseUrl` — and is named to make its use conspicuous in review.

Two related habits worth keeping: give each environment its own key so one can be
revoked without downtime elsewhere, and store the **webhook signing secret**
server-side too, since it is what proves a delivery actually came from SupDesk.

## Client options

```ts
const supdesk = new SupDesk({
  apiKey: "sd_live_…",
  baseUrl: "https://api.supdesk.app/v1", // default
  fetch: myFetch, // default: the runtime global
  timeout: 30_000, // ms; 0 disables
  maxRetries: 2, // retries after the first attempt
  retryUnsafeMethods: false,
  defaultHeaders: { "x-app": "my-service" },
  dangerouslyAllowBrowser: false, // default; see Security
});
```

Every method also takes per-call `{ signal, timeout, headers }` as a final argument.

## Resources

| Accessor            | Methods                                              |
| ------------------- | ---------------------------------------------------- |
| `submissions`       | `list` `get` `create`                                |
| `feedback`          | `list` `get` `create`                                |
| `changelog`         | `list` `get` `create` `update` `delete`              |
| `messages`          | `list` `get` `create` `update` `delete` `addMessage` |
| `waitlist`          | `list` `get` `create` `update` `delete`              |
| `beta.programs`     | `list` `get` `create` `update` `delete`              |
| `beta.testers`      | `list` `get` `create` `delete`                       |
| `articles`          | `list` `search` `get` `create` `update` `delete`     |
| `articleCategories` | `list` `get` `create` `update` `delete`              |

## Pagination

`list()` returns a `Page`, which is both the current page and an async iterable over
everything after it.

```ts
const page = await supdesk.articles.list({ status: "published" });

page.data; // just this page
page.pagination; // { limit, offset, has_more }
page.hasNextPage();
await page.getNextPage();

for await (const article of page) {
  /* every page */
}
await page.toArray(); // everything, in memory
```

`articles.search()` is the exception — it returns a plain ranked array, not a page.

## Errors

Every failure is a subclass of `SupDeskError`, so one `catch` covers the lot while
`instanceof` still narrows to the specific case.

```ts
import {
  ForbiddenError,
  LimitReachedError,
  NotFoundError,
  isSupDeskError,
} from "supdesk";

try {
  await supdesk.articles.create({ title: "How to export" });
} catch (error) {
  if (error instanceof ForbiddenError) {
    // Valid key, but writes need a paid plan.
  } else if (error instanceof LimitReachedError) {
    // Monthly submission quota exhausted.
  } else if (isSupDeskError(error)) {
    console.error(error.message);
  }
}
```

| Class                 | Status | Code              |
| --------------------- | ------ | ----------------- |
| `InvalidRequestError` | 400    | `invalid_request` |
| `UnauthorizedError`   | 401    | `unauthorized`    |
| `ForbiddenError`      | 403    | `forbidden`       |
| `NotFoundError`       | 404    | `not_found`       |
| `RateLimitedError`    | 429    | `rate_limited`    |
| `LimitReachedError`   | 429    | `limit_reached`   |
| `InternalServerError` | 5xx    | `internal_error`  |

Plus `SupDeskConnectionError`, `SupDeskTimeoutError`, `RequestTooLargeError` (the API
caps requests at 1 MB, checked before sending), `SupDeskConfigurationError` and
`SupDeskSignatureVerificationError`.

## Retries

The client retries with exponential backoff and jitter, honouring `Retry-After` when a
proxy supplies one. Two behaviours are worth knowing about:

- **`limit_reached` is never retried.** It shares HTTP 429 with `rate_limited`, but a
  monthly quota will not clear inside a backoff window — retrying just burns more of
  your 120-requests-per-minute budget. The two are told apart by `code`, not status.
- **`POST` is not replayed** on network errors or 5xx by default. SupDesk has no
  idempotency key, and `submissions.create` / `feedback.create` are metered, so a
  request that failed _after_ the server accepted it would double-charge your quota and
  file the end user's ticket twice. A 429 `rate_limited` is still retried on any method,
  because the server states it did not process the request. Opt in with
  `retryUnsafeMethods: true`.

## Webhooks

Verification is `async` because Web Crypto is — that is what lets the same code run in
Workers and Deno as in Node.

```ts
import { constructEventFromRequest } from "supdesk";

export default {
  async fetch(request: Request, env: Env) {
    const event = await constructEventFromRequest(
      request,
      env.SUPDESK_WEBHOOK_SECRET,
    );

    switch (event.event) {
      case "waitlist_signup.joined":
        console.log(event.data.email); // narrowed by the discriminated union
        break;
      case "post.status_changed":
        break;
    }

    return new Response(null, { status: 204 });
  },
};
```

> **Pass the raw body.** The signature covers the exact bytes SupDesk sent. Frameworks
> that parse JSON for you (Express's `express.json()`, Next.js route handlers using
> `await req.json()`) break verification, because `JSON.stringify` will not reproduce the
> original whitespace and key order. Capture the raw body first.

Lower-level helpers: `verifyWebhookSignature({ payload, signature, secret })` returns a
boolean, `constructEvent` throws on mismatch, `computeWebhookSignature` builds fixtures,
and `new Webhooks(secret)` binds all of them to one secret. Comparison is constant-time.

## Edge runtimes

"Edge" here means **server-side** edge runtimes — Cloudflare Workers, Deno Deploy and
similar — not the browser. The published bundle contains no `node:` imports, no `Buffer`
and no `process`. That is enforced three ways in CI, not just asserted:

- the whole suite runs inside **real workerd** with `nodejs_compat` deliberately **off**;
- a **Deno** job imports the built `dist/index.js` and exercises the client and webhook
  signing;
- a build check greps the bundle for Node-only globals and specifiers.

## Contributing

```bash
npm install
npm test                # unit suite
npm run test:coverage   # enforces the 80% threshold
npm run build
npm run test:workers    # real workerd, no nodejs_compat
npm run test:deno       # needs a prior build
```

The package has **zero runtime dependencies**, so `npm audit --omit=dev` should always be
clean and anything `npm audit` reports lives in the toolchain. One `overrides` entry
pins `undici` to `^7.29.0`: miniflare (via `@cloudflare/vitest-pool-workers`) pins the
vulnerable `7.28.0` exactly, and `npm audit fix --force` "resolves" that by downgrading
the pool to a vitest-3-only release, which breaks the workerd suite. Drop the override
once miniflare bumps its own pin.

## Releasing

Push a `v*` tag. The release workflow re-runs everything (typecheck, lint, coverage,
build, packaging checks, workerd, Deno), verifies the tag matches `package.json`, and
publishes with npm provenance. Requires an `NPM_TOKEN` repository secret; provenance
additionally requires the repository to be public.

## License

MIT
