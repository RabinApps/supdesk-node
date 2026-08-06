import type { Locale, Open, PaginationParams } from './common.js';

export type ThreadStatus = 'open' | 'closed';
export type MessageSender = 'end_user' | 'member' | 'system';

export interface Message {
  id: string;
  sender: Open<MessageSender>;
  /** Set when a workspace member sent the message, `null` otherwise. */
  member_id: string | null;
  body: string;
  /** Channel the message arrived through. */
  via: string;
  /** ISO 8601 timestamp. */
  created_at: string;
}

export interface Thread {
  id: string;
  end_user_id: string;
  subject: string;
  status: Open<ThreadStatus>;
  /** ISO 8601 timestamp. */
  created_at: string;
}

/** A thread fetched by id, which includes its messages. */
export interface ThreadWithMessages extends Thread {
  messages: Message[];
}

export interface ThreadListParams extends PaginationParams {
  status?: ThreadStatus;
}

export interface ThreadCreateParams {
  /** End-user email address. */
  email: string;
  name?: string;
  subject?: string;
  body?: string;
  locale?: Locale;
}

export interface ThreadUpdateParams {
  status?: ThreadStatus;
  subject?: string;
}

export interface MessageCreateParams {
  body: string;
  /** Defaults to `member`. */
  sender?: MessageSender;
  locale?: Locale;
}
