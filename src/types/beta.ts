import type { Open, PaginationParams } from './common.js';

export interface BetaProgram {
  id: string;
  project_id: string;
  name: string;
  version: string;
  slug: string;
  summary: string;
  access_url: string;
  access_instructions: string;
  status: string;
  allow_public_signup: boolean;
  /** ISO 8601 timestamp. */
  feedback_deadline: string | null;
  created_at: string;
}

export interface BetaTester {
  id: string;
  beta_program_id: string;
  email: string;
  token: string;
  source: string;
  status: Open<'invited' | 'joined'>;
  end_user_id: string | null;
  invited_at: string | null;
  joined_at: string | null;
}

export interface BetaProgramListParams extends PaginationParams {
  status?: string;
}

export interface BetaProgramCreateParams {
  name: string;
  version?: string;
  summary?: string;
  access_url?: string;
  access_instructions?: string;
  status?: string;
  allow_public_signup?: boolean;
  /** ISO 8601 timestamp. */
  feedback_deadline?: string;
}

export type BetaProgramUpdateParams = Partial<BetaProgramCreateParams>;

export interface BetaTesterListParams extends PaginationParams {
  status?: string;
}

export interface BetaTesterCreateParams {
  email: string;
}
