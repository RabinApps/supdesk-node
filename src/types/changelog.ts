import type { Locale, Open, PaginationParams } from './common.js';

export type ChangelogStatus = 'draft' | 'scheduled' | 'published';

export interface ChangelogEntry {
  id: string;
  title: string;
  body: string;
  /** Free-form labels such as `New`, `Improved`, `Fixed`. */
  labels: string[];
  /** ISO 8601 timestamp, or `null` while the entry is a draft. */
  published_at: string | null;
  locale: Open<Locale>;
  /** Semver string. */
  version: string;
}

export interface ChangelogListParams extends PaginationParams {
  locale?: Locale;
}

export interface ChangelogGetParams {
  locale?: Locale;
}

export interface ChangelogCreateParams {
  title: string;
  /** Markdown. */
  body?: string;
  labels?: string[];
  /** Semver. Defaults to `1.0.0`. */
  version?: string;
  /** Defaults to `draft`. */
  status?: ChangelogStatus;
  /** Defaults to `en`. */
  locale?: Locale;
}

export type ChangelogUpdateParams = Partial<ChangelogCreateParams>;
