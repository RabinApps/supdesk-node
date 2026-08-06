/**
 * Detects a browser-like environment.
 *
 * Both `window` and `document` must be present. Checking only `window` would
 * produce false positives: Deno 1.x defined a `window` global with no DOM, and
 * some bundlers shim `window` for compatibility. Cloudflare Workers, Deno 2 and
 * Node define neither.
 */
export function isBrowserLike(): boolean {
  const global = globalThis as { window?: unknown; document?: unknown };

  return typeof global.window !== 'undefined' && typeof global.document !== 'undefined';
}
