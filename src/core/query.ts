/** A value that can appear in a SupDesk query string. */
export type QueryValue = string | number | boolean | null | undefined | readonly string[];

export type QueryParams = Record<string, QueryValue>;

/**
 * Serializes query parameters, dropping only `undefined`.
 *
 * `null`, `false` and `0` are all meaningful values to send, so they are kept;
 * `undefined` means "the caller did not set this" and is omitted. Array values
 * are repeated (`?labels=a&labels=b`).
 *
 * Returns `''` when there is nothing to append, so callers can concatenate
 * unconditionally.
 */
export function buildQueryString(params?: QueryParams): string {
  if (!params) return '';

  const search = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (value === undefined) continue;

    if (Array.isArray(value)) {
      for (const item of value) search.append(key, String(item));
      continue;
    }

    search.append(key, value === null ? '' : String(value));
  }

  const serialized = search.toString();
  return serialized ? `?${serialized}` : '';
}

/**
 * Widens a typed parameter interface into a plain query bag.
 *
 * TypeScript does not give interfaces an implicit index signature, so a typed
 * `…ListParams` is not directly assignable to `QueryParams`. Copying it is both
 * the fix and good hygiene — the caller's object is never mutated. This is the
 * one place the cast lives.
 */
export function toQuery(params?: object): QueryParams {
  return { ...params } as QueryParams;
}

/**
 * Joins a base URL and a path with exactly one slash between them, so both
 * `https://api.supdesk.app/v1` and `https://api.supdesk.app/v1/` behave the same.
 */
export function joinUrl(baseUrl: string, path: string): string {
  return `${baseUrl.replace(/\/+$/, '')}/${path.replace(/^\/+/, '')}`;
}

/**
 * Percent-encodes a path segment.
 *
 * Ids come from the caller, so an id containing `/` or `?` must not be able to
 * escape its segment and rewrite the route.
 */
export function encodePathSegment(segment: string | number): string {
  return encodeURIComponent(String(segment));
}
