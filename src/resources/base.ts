import type { HttpClient, HttpMethod } from '../core/http.js';
import type { PageFetcher, PaginatedResponse } from '../core/pagination.js';
import { Page } from '../core/pagination.js';
import type { QueryParams } from '../core/query.js';

/** Per-call overrides available on every resource method. */
export interface CallOptions {
  /** Cancels the request. Composed with the client-level timeout. */
  signal?: AbortSignal;
  /** Overrides the client-level timeout in milliseconds. `0` disables it. */
  timeout?: number;
  /** Extra headers for this request only. */
  headers?: Record<string, string>;
}

/**
 * Shared plumbing for resource classes.
 *
 * Every SupDesk read wraps its payload in `{ data: … }` and every list adds
 * `{ pagination: … }`, so unwrapping and paging live here rather than being
 * repeated across nine resources.
 */
export abstract class APIResource {
  protected readonly http: HttpClient;

  constructor(http: HttpClient) {
    this.http = http;
  }

  /** Issues a request and unwraps the `data` envelope. */
  protected async unwrap<T>(
    method: HttpMethod,
    path: string,
    init: { query?: QueryParams; body?: unknown; options?: CallOptions } = {},
  ): Promise<T> {
    const response = await this.http.request<{ data: T }>({
      method,
      path,
      ...(init.query === undefined ? {} : { query: init.query }),
      ...(init.body === undefined ? {} : { body: init.body }),
      ...init.options,
    });

    return response?.data;
  }

  /** Issues a request that returns no content. */
  protected async empty(
    method: HttpMethod,
    path: string,
    init: { body?: unknown; options?: CallOptions } = {},
  ): Promise<void> {
    await this.http.request<void>({
      method,
      path,
      ...(init.body === undefined ? {} : { body: init.body }),
      ...init.options,
    });
  }

  /** Fetches the first page of a list endpoint as an auto-paging {@link Page}. */
  protected async listPage<T>(
    path: string,
    params: QueryParams = {},
    options?: CallOptions,
  ): Promise<Page<T>> {
    const fetchPage: PageFetcher<T> = (query) =>
      this.http.request<PaginatedResponse<T>>({
        method: 'GET',
        path,
        query,
        ...options,
      });

    return new Page<T>(await fetchPage(params), fetchPage, params);
  }
}
