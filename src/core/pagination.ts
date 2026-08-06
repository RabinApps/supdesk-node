import type { QueryParams } from './query.js';

/** The `pagination` object every SupDesk list endpoint returns. */
export interface PaginationMeta {
  limit: number;
  offset: number;
  has_more: boolean;
}

/** The envelope every SupDesk list endpoint returns. */
export interface PaginatedResponse<T> {
  data: T[];
  pagination: PaginationMeta;
}

/** Shared shape of the `limit`/`offset` parameters on every list endpoint. */
export interface PaginationParams {
  limit?: number;
  offset?: number;
}

export type PageFetcher<T> = (params: QueryParams) => Promise<PaginatedResponse<T>>;

/**
 * One page of results, which also knows how to fetch the next one.
 *
 * Iterating a page walks *every* remaining page, so callers rarely need to
 * touch offsets by hand:
 *
 * ```ts
 * for await (const submission of await client.submissions.list({ status: 'open' })) {
 *   console.log(submission.title);
 * }
 * ```
 */
export class Page<T> implements PaginatedResponse<T> {
  readonly data: T[];
  readonly pagination: PaginationMeta;

  readonly #fetchPage: PageFetcher<T>;
  readonly #params: QueryParams;

  constructor(response: PaginatedResponse<T>, fetchPage: PageFetcher<T>, params: QueryParams) {
    this.data = response.data ?? [];
    this.pagination = response.pagination ?? {
      limit: this.data.length,
      offset: 0,
      has_more: false,
    };
    this.#fetchPage = fetchPage;
    this.#params = params;
  }

  /**
   * Whether another page exists.
   *
   * An empty page is treated as the end even when the server says `has_more`.
   * Trusting the flag alone would spin forever against a buggy or racing
   * response, which is a much worse failure than stopping one page early.
   */
  hasNextPage(): boolean {
    return this.pagination.has_more === true && this.data.length > 0;
  }

  /** Query parameters that would fetch the next page, or `undefined` if there is none. */
  nextPageParams(): QueryParams | undefined {
    if (!this.hasNextPage()) return undefined;

    return {
      ...this.#params,
      // Advance by what was actually returned rather than by `limit`, so a
      // short page never causes items to be skipped.
      offset: this.pagination.offset + this.data.length,
      limit: this.pagination.limit,
    };
  }

  /** Fetches the next page. Throws if there is not one — check {@link hasNextPage} first. */
  async getNextPage(): Promise<Page<T>> {
    const params = this.nextPageParams();
    if (!params) {
      throw new RangeError('No next page: this is the last page of results.');
    }

    return new Page(await this.#fetchPage(params), this.#fetchPage, params);
  }

  /** Iterates every item across every remaining page. */
  async *[Symbol.asyncIterator](): AsyncIterableIterator<T> {
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    let page: Page<T> = this;

    for (;;) {
      for (const item of page.data) yield item;
      if (!page.hasNextPage()) return;
      page = await page.getNextPage();
    }
  }

  /**
   * Collects every remaining item into an array.
   *
   * Convenience for small result sets — this buys the whole collection into
   * memory and issues one request per page, so prefer iteration for large ones.
   */
  async toArray(): Promise<T[]> {
    const items: T[] = [];
    for await (const item of this) items.push(item);
    return items;
  }
}
