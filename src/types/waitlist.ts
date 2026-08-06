import type { Open, PaginationParams } from './common.js';

export type WaitlistStatus = 'waiting' | 'invited' | 'joined';

export interface WaitlistSignup {
  id: string;
  email: string;
  status: Open<WaitlistStatus>;
  /** Queue position, or `null` once the signup leaves the queue. */
  position: number | null;
  referral_count: number;
  referral_code: string;
  token: string;
  source: string;
  /** ISO 8601 timestamp. */
  created_at: string;
  invited_at: string | null;
  joined_at: string | null;
}

export interface WaitlistListParams extends PaginationParams {
  /** Filters by email substring. */
  search?: string;
  status?: WaitlistStatus;
}

export interface WaitlistCreateParams {
  email: string;
  /** Referral code taken from a share link. */
  referral_code?: string;
}

export interface WaitlistUpdateParams {
  status: WaitlistStatus;
}
