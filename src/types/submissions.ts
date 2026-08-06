import type { Locale, Open, PaginationParams, PostStatus } from './common.js';

export type SubmissionType = 'bug' | 'feature';

export interface Submission {
  id: string;
  type: Open<SubmissionType>;
  title: string;
  body: string;
  status: Open<PostStatus>;
  /** ISO 8601 timestamp. */
  created_at: string;
}

export interface SubmissionListParams extends PaginationParams {
  status?: PostStatus;
  type?: SubmissionType;
}

export interface SubmissionCreateParams {
  type: SubmissionType;
  title: string;
  /** End-user email address. */
  email: string;
  body?: string;
  /** Display name for the end user. */
  name?: string;
  /** Language for notification emails. Defaults to `en`. */
  locale?: Locale;
}
