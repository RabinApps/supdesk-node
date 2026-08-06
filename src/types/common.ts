/**
 * A string union that still accepts unknown values.
 *
 * Response fields use this so that a new status or type added server-side is a
 * runtime detail rather than a type error, while editors keep autocompleting
 * the documented values. Request parameters stay strict.
 */
export type Open<T extends string> = T | (string & {});

/** Locales SupDesk accepts for end-user notification emails and content. */
export type Locale = 'en' | 'de' | 'es' | 'fr' | 'it' | 'ja' | 'ru' | 'zh';

/** Shared workflow status across submissions and feedback. */
export type PostStatus = 'open' | 'planned' | 'in_progress' | 'done';

export type { PaginatedResponse, PaginationMeta, PaginationParams } from '../core/pagination.js';
