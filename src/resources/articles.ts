import type { Page } from '../core/pagination.js';
import { encodePathSegment, toQuery } from '../core/query.js';
import type {
  Article,
  ArticleCreateParams,
  ArticleListParams,
  ArticleSearchParams,
  ArticleSearchResult,
  ArticleUpdateParams,
} from '../types/help-center.js';
import type { CallOptions } from './base.js';
import { APIResource } from './base.js';

/** Help center articles. */
export class Articles extends APIResource {
  /** `GET /articles` — auto-paging. */
  list(params: ArticleListParams = {}, options?: CallOptions): Promise<Page<Article>> {
    return this.listPage<Article>('/articles', toQuery(params), options);
  }

  /**
   * `GET /articles/search`
   *
   * Returns ranked projections rather than full articles, and is not paginated
   * — pass `limit` (max 100) to widen the result set.
   */
  search(params: ArticleSearchParams, options?: CallOptions): Promise<ArticleSearchResult[]> {
    return this.unwrap<ArticleSearchResult[]>('GET', '/articles/search', {
      query: toQuery(params),
      options,
    });
  }

  /** `GET /articles/:id` */
  get(id: string, options?: CallOptions): Promise<Article> {
    return this.unwrap<Article>('GET', `/articles/${encodePathSegment(id)}`, { options });
  }

  /** `POST /articles` — creates a draft. Requires a paid plan. */
  create(params: ArticleCreateParams, options?: CallOptions): Promise<Article> {
    return this.unwrap<Article>('POST', '/articles', { body: params, options });
  }

  /** `PATCH /articles/:id` — also how an article is published. Requires a paid plan. */
  update(id: string, params: ArticleUpdateParams, options?: CallOptions): Promise<Article> {
    return this.unwrap<Article>('PATCH', `/articles/${encodePathSegment(id)}`, {
      body: params,
      options,
    });
  }

  /** `DELETE /articles/:id` — requires a paid plan. */
  delete(id: string, options?: CallOptions): Promise<void> {
    return this.empty('DELETE', `/articles/${encodePathSegment(id)}`, { options });
  }
}
