import type { Page } from '../core/pagination.js';
import { encodePathSegment, toQuery } from '../core/query.js';
import type {
  ArticleCategory,
  ArticleCategoryCreateParams,
  ArticleCategoryListParams,
  ArticleCategoryUpdateParams,
} from '../types/help-center.js';
import type { CallOptions } from './base.js';
import { APIResource } from './base.js';

/** Help center categories. */
export class ArticleCategories extends APIResource {
  /** `GET /article-categories` — auto-paging. */
  list(
    params: ArticleCategoryListParams = {},
    options?: CallOptions,
  ): Promise<Page<ArticleCategory>> {
    return this.listPage<ArticleCategory>('/article-categories', toQuery(params), options);
  }

  /** `GET /article-categories/:id` */
  get(id: string, options?: CallOptions): Promise<ArticleCategory> {
    return this.unwrap<ArticleCategory>('GET', `/article-categories/${encodePathSegment(id)}`, {
      options,
    });
  }

  /** `POST /article-categories` — requires a paid plan. */
  create(params: ArticleCategoryCreateParams, options?: CallOptions): Promise<ArticleCategory> {
    return this.unwrap<ArticleCategory>('POST', '/article-categories', {
      body: params,
      options,
    });
  }

  /** `PATCH /article-categories/:id` — requires a paid plan. */
  update(
    id: string,
    params: ArticleCategoryUpdateParams,
    options?: CallOptions,
  ): Promise<ArticleCategory> {
    return this.unwrap<ArticleCategory>('PATCH', `/article-categories/${encodePathSegment(id)}`, {
      body: params,
      options,
    });
  }

  /** `DELETE /article-categories/:id` — requires a paid plan. */
  delete(id: string, options?: CallOptions): Promise<void> {
    return this.empty('DELETE', `/article-categories/${encodePathSegment(id)}`, { options });
  }
}
