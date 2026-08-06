import type { Locale, Open, PaginationParams, PostStatus } from './common.js';

export interface Feedback {
  id: string;
  type: Open<'feedback'>;
  title: string;
  body: string;
  status: Open<PostStatus>;
  /** ISO 8601 timestamp. */
  created_at: string;
}

export interface FeedbackListParams extends PaginationParams {
  status?: PostStatus;
}

export interface FeedbackCreateParams {
  title: string;
  /** End-user email address. */
  email: string;
  body?: string;
  name?: string;
  locale?: Locale;
}
