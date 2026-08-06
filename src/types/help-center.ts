import type { Open, PaginationParams } from './common.js';

export type ArticleStatus = 'draft' | 'published' | 'archived';

export interface Article {
  id: string;
  title: string;
  slug: string;
  /** Markdown. */
  body: string;
  excerpt: string;
  status: Open<ArticleStatus>;
  category_id: string | null;
  /** ISO 8601 timestamp, or `null` while unpublished. */
  published_at: string | null;
  helpful_count: number;
  not_helpful_count: number;
  created_at: string;
  updated_at: string;
}

/** Search hits are a projection, not full articles. */
export interface ArticleSearchResult {
  id: string;
  title: string;
  slug: string;
  category_slug: string | null;
  category_name: string | null;
  /** Matching excerpt with the query term in context. */
  snippet: string;
  /** Relevance score. */
  rank: number;
}

export interface ArticleCategory {
  id: string;
  name: string;
  slug: string;
  description: string;
  sort_order: number;
  created_at: string;
}

export interface ArticleListParams extends PaginationParams {
  status?: ArticleStatus;
  category_id?: string;
}

export interface ArticleSearchParams {
  /** Search query. Required. */
  q: string;
  /** Defaults to 25, capped at 100 by the API. */
  limit?: number;
}

export interface ArticleCreateParams {
  /** Max 200 characters. */
  title: string;
  /** Markdown, max 50,000 characters. */
  body?: string;
  /** Max 300 characters. */
  excerpt?: string;
  /** Max 80 characters. */
  slug?: string;
  category_id?: string;
}

export interface ArticleUpdateParams extends Partial<ArticleCreateParams> {
  status?: ArticleStatus;
}

export type ArticleCategoryListParams = PaginationParams;

export interface ArticleCategoryCreateParams {
  /** Max 80 characters. */
  name: string;
  /** Max 300 characters. */
  description?: string;
  /** Defaults to 0. */
  sort_order?: number;
}

export type ArticleCategoryUpdateParams = Partial<ArticleCategoryCreateParams>;
