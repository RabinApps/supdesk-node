import { describe, expect, it } from 'vitest';
import { SupDesk } from '../src/client.js';
import { SupDeskConfigurationError } from '../src/core/errors.js';
import { isBrowserLike } from '../src/core/runtime.js';
import { DEFAULT_BASE_URL, DEFAULT_TIMEOUT_MS } from '../src/core/http.js';
import { DEFAULT_MAX_RETRIES } from '../src/core/retry.js';
import { createMockFetch } from './helpers/mock-fetch.js';

describe('SupDesk', () => {
  it('requires an API key', () => {
    expect(() => new SupDesk({ apiKey: '' })).toThrow(SupDeskConfigurationError);
    expect(() => new SupDesk({} as { apiKey: string })).toThrow(SupDeskConfigurationError);
    expect(() => new SupDesk(undefined as unknown as { apiKey: string })).toThrow(
      SupDeskConfigurationError,
    );
  });

  it('points at the documented base URL by default', () => {
    const client = new SupDesk({ apiKey: 'k' });

    expect(client.http.config.baseUrl).toBe(DEFAULT_BASE_URL);
    expect(client.http.config.timeout).toBe(DEFAULT_TIMEOUT_MS);
    expect(client.http.config.maxRetries).toBe(DEFAULT_MAX_RETRIES);
    expect(client.http.config.retryUnsafeMethods).toBe(false);
  });

  it('accepts a custom base URL, for a mock server or a proxy', async () => {
    const mock = createMockFetch({ json: { data: {} } });
    const client = new SupDesk({
      apiKey: 'k',
      baseUrl: 'http://localhost:8787/api',
      fetch: mock.fetch,
    });

    await client.submissions.get('sub_1');

    expect(mock.calls[0]!.url.href).toBe('http://localhost:8787/api/submissions/sub_1');
  });

  it('exposes every documented resource', () => {
    const client = new SupDesk({ apiKey: 'k' });

    expect(Object.keys(client).filter((key) => key !== 'http').sort()).toEqual([
      'articleCategories',
      'articles',
      'beta',
      'changelog',
      'feedback',
      'messages',
      'submissions',
      'waitlist',
    ]);
    expect(client.beta.programs).toBeDefined();
    expect(client.beta.testers).toBeDefined();
  });

  it('carries option overrides into the HTTP layer', () => {
    const client = new SupDesk({
      apiKey: 'k',
      timeout: 5000,
      maxRetries: 5,
      retryUnsafeMethods: true,
      defaultHeaders: { 'x-app': 'demo' },
    });

    expect(client.http.config).toMatchObject({
      timeout: 5000,
      maxRetries: 5,
      retryUnsafeMethods: true,
      defaultHeaders: { 'x-app': 'demo' },
    });
  });

  it('shares one HTTP client across all resources', async () => {
    const mock = createMockFetch([{ json: { data: {} } }, { json: { data: {} } }]);
    const client = new SupDesk({ apiKey: 'k', fetch: mock.fetch, defaultHeaders: { 'x-app': 'demo' } });

    await client.submissions.get('sub_1');
    await client.articles.get('a_1');

    expect(mock.calls.map((c) => c.headers.get('x-app'))).toEqual(['demo', 'demo']);
  });
});

describe('browser guard', () => {
  /** Fakes a DOM for the duration of `run`. */
  function inBrowser<T>(run: () => T): T {
    const globals = globalThis as Record<string, unknown>;
    const hadWindow = 'window' in globals;
    const hadDocument = 'document' in globals;

    globals.window = globals;
    globals.document = {};

    try {
      return run();
    } finally {
      if (!hadWindow) delete globals.window;
      if (!hadDocument) delete globals.document;
    }
  }

  it('refuses to construct in a browser', () => {
    // The key is project-wide; shipping it to end users must not be silent.
    inBrowser(() => {
      expect(() => new SupDesk({ apiKey: 'sd_live_secret' })).toThrow(SupDeskConfigurationError);
      expect(() => new SupDesk({ apiKey: 'sd_live_secret' })).toThrow(/server-side SDK/);
    });
  });

  it('tells the caller to rotate the key and move the call server-side', () => {
    inBrowser(() => {
      const error = (() => {
        try {
          new SupDesk({ apiKey: 'sd_live_secret' });
        } catch (caught) {
          return caught as Error;
        }
        throw new Error('expected construction to throw');
      })();

      expect(error.message).toMatch(/rotate/);
      expect(error.message).toMatch(/backend/);
      expect(error.message).toMatch(/dangerouslyAllowBrowser/);
      // The key itself must never appear in a message that may get logged.
      expect(error.message).not.toContain('sd_live_secret');
    });
  });

  it('allows an explicit opt-out', () => {
    inBrowser(() => {
      expect(() => new SupDesk({ apiKey: 'k', dangerouslyAllowBrowser: true })).not.toThrow();
    });
  });

  it('checks the missing API key first, so the clearer error wins', () => {
    inBrowser(() => {
      expect(() => new SupDesk({ apiKey: '' })).toThrow(/API key is required/);
    });
  });

  it('does not fire on a server runtime', () => {
    expect(() => new SupDesk({ apiKey: 'k' })).not.toThrow();
  });
});

describe('isBrowserLike', () => {
  it('is false on this Node runtime', () => {
    expect(isBrowserLike()).toBe(false);
  });

  it('requires a document, not just a window', () => {
    // Deno 1.x defined `window` with no DOM; treating that as a browser would
    // break a legitimate server runtime.
    const globals = globalThis as Record<string, unknown>;
    globals.window = globals;

    try {
      expect(isBrowserLike()).toBe(false);
    } finally {
      delete globals.window;
    }
  });

  it('is true when both window and document exist', () => {
    const globals = globalThis as Record<string, unknown>;
    globals.window = globals;
    globals.document = {};

    try {
      expect(isBrowserLike()).toBe(true);
    } finally {
      delete globals.window;
      delete globals.document;
    }
  });
});
