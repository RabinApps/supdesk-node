import { SupDeskConfigurationError } from './core/errors.js';
import { DEFAULT_BASE_URL, DEFAULT_TIMEOUT_MS, HttpClient } from './core/http.js';
import { DEFAULT_MAX_RETRIES } from './core/retry.js';
import { isBrowserLike } from './core/runtime.js';
import { ArticleCategories } from './resources/article-categories.js';
import { Articles } from './resources/articles.js';
import { Beta } from './resources/beta.js';
import { Changelog } from './resources/changelog.js';
import { FeedbackResource } from './resources/feedback.js';
import { Messages } from './resources/messages.js';
import { Submissions } from './resources/submissions.js';
import { Waitlist } from './resources/waitlist.js';

export interface SupDeskOptions {
  /**
   * Project-scoped API key from Workspace Settings → API Keys (e.g. `sd_live_…`).
   *
   * **Server-side only.** This key authenticates as your whole project — on a
   * paid plan it can create, edit and delete submissions, changelog entries,
   * help center articles, message threads, waitlist signups and beta programs.
   * Anything shipped to a browser is public, so never put it in client-side
   * code, a bundler `define`, or a `NEXT_PUBLIC_*` / `VITE_*` environment
   * variable. Call SupDesk from your own backend and expose only what your
   * frontend needs.
   */
  apiKey: string;
  /** Defaults to `https://api.supdesk.app/v1`. */
  baseUrl?: string;
  /**
   * Custom `fetch`. Defaults to the runtime global.
   *
   * This is the seam for tests, for a Workers `fetch` bound to a service
   * binding, or for a proxy-aware implementation in Node.
   */
  fetch?: typeof globalThis.fetch;
  /** Per-request timeout in milliseconds. Defaults to 30000. `0` disables it. */
  timeout?: number;
  /** Retries after the first attempt. Defaults to 2 (3 attempts total). */
  maxRetries?: number;
  /**
   * Replay `POST` requests on network errors and 5xx responses.
   *
   * Off by default. SupDesk has no idempotency key, and creating a submission
   * or feedback item consumes monthly quota, so a replayed POST can duplicate
   * an end user's ticket. A 429 `rate_limited` is always retried regardless,
   * because the server states it did not process the request.
   */
  retryUnsafeMethods?: boolean;
  /** Extra headers applied to every request. `authorization` cannot be overridden. */
  defaultHeaders?: Record<string, string>;

  /**
   * Permit construction in a browser. **Almost certainly a mistake.**
   *
   * By default the constructor throws when it detects a DOM, because reaching
   * that code path means an API key with full project write access has been
   * shipped to end users, where anyone can read it out of the bundle or the
   * network tab. Revoking and rotating the key is the only remedy.
   *
   * Enable this only when the key genuinely is not a secret in your context —
   * an internal tool behind SSO on a trusted network, or a browser test harness
   * pointed at a mock `baseUrl`.
   */
  dangerouslyAllowBrowser?: boolean;
}

/**
 * The SupDesk API client.
 *
 * **Server-side only.** A SupDesk API key grants project-wide access; it must
 * stay on a machine you control — a backend, an API route, a Worker, a cron
 * job. Constructing this in a browser throws by default; see
 * {@link SupDeskOptions.dangerouslyAllowBrowser}.
 *
 * ```ts
 * const supdesk = new SupDesk({ apiKey: 'sd_live_…' });
 *
 * for await (const submission of await supdesk.submissions.list({ status: 'open' })) {
 *   console.log(submission.title);
 * }
 * ```
 */
export class SupDesk {
  readonly submissions: Submissions;
  readonly feedback: FeedbackResource;
  readonly changelog: Changelog;
  readonly messages: Messages;
  readonly waitlist: Waitlist;
  readonly beta: Beta;
  readonly articles: Articles;
  readonly articleCategories: ArticleCategories;

  /** @internal Exposed for advanced use and for calling undocumented routes. */
  readonly http: HttpClient;

  constructor(options: SupDeskOptions) {
    if (!options?.apiKey || typeof options.apiKey !== 'string') {
      throw new SupDeskConfigurationError(
        'A SupDesk API key is required. Create one under Workspace Settings → API Keys.',
      );
    }

    // Fail loudly rather than let a project-wide key ship to end users. By the
    // time this runs in a browser the key is already in the bundle, so the
    // error names the remedy: move the call server-side and rotate the key.
    if (!options.dangerouslyAllowBrowser && isBrowserLike()) {
      throw new SupDeskConfigurationError(
        'SupDesk is a server-side SDK and was constructed in a browser. Your API key ' +
          'grants project-wide access, and anything shipped to a browser is public — ' +
          'assume any key already bundled this way is compromised and rotate it in ' +
          'Workspace Settings → API Keys. Call SupDesk from your backend (an API route, ' +
          'a server action, a Worker) and have the browser talk to that instead. If the ' +
          'key genuinely is not a secret here, pass `dangerouslyAllowBrowser: true`.',
      );
    }

    this.http = new HttpClient({
      apiKey: options.apiKey,
      baseUrl: options.baseUrl ?? DEFAULT_BASE_URL,
      ...(options.fetch ? { fetch: options.fetch } : {}),
      timeout: options.timeout ?? DEFAULT_TIMEOUT_MS,
      maxRetries: options.maxRetries ?? DEFAULT_MAX_RETRIES,
      retryUnsafeMethods: options.retryUnsafeMethods ?? false,
      defaultHeaders: options.defaultHeaders ?? {},
    });

    this.submissions = new Submissions(this.http);
    this.feedback = new FeedbackResource(this.http);
    this.changelog = new Changelog(this.http);
    this.messages = new Messages(this.http);
    this.waitlist = new Waitlist(this.http);
    this.beta = new Beta(this.http);
    this.articles = new Articles(this.http);
    this.articleCategories = new ArticleCategories(this.http);
  }
}
