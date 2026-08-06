import type { Page } from '../core/pagination.js';
import { encodePathSegment, toQuery } from '../core/query.js';
import type {
  Message,
  MessageCreateParams,
  Thread,
  ThreadCreateParams,
  ThreadListParams,
  ThreadUpdateParams,
  ThreadWithMessages,
} from '../types/messages.js';
import type { CallOptions } from './base.js';
import { APIResource } from './base.js';

/**
 * Support conversations.
 *
 * A thread is the conversation; `addMessage` appends a reply to one.
 */
export class Messages extends APIResource {
  /** `GET /messages` — auto-paging over threads. */
  list(params: ThreadListParams = {}, options?: CallOptions): Promise<Page<Thread>> {
    return this.listPage<Thread>('/messages', toQuery(params), options);
  }

  /** `GET /messages/:threadId` — includes the thread's messages. */
  get(threadId: string, options?: CallOptions): Promise<ThreadWithMessages> {
    return this.unwrap<ThreadWithMessages>('GET', `/messages/${encodePathSegment(threadId)}`, {
      options,
    });
  }

  /** `POST /messages` — opens a thread with its initial message. Requires a paid plan. */
  create(params: ThreadCreateParams, options?: CallOptions): Promise<ThreadWithMessages> {
    return this.unwrap<ThreadWithMessages>('POST', '/messages', { body: params, options });
  }

  /** `PATCH /messages/:threadId` — requires a paid plan. */
  update(
    threadId: string,
    params: ThreadUpdateParams,
    options?: CallOptions,
  ): Promise<ThreadWithMessages> {
    return this.unwrap<ThreadWithMessages>('PATCH', `/messages/${encodePathSegment(threadId)}`, {
      body: params,
      options,
    });
  }

  /** `DELETE /messages/:threadId` — requires a paid plan. */
  delete(threadId: string, options?: CallOptions): Promise<void> {
    return this.empty('DELETE', `/messages/${encodePathSegment(threadId)}`, { options });
  }

  /** `POST /messages/:threadId/messages` — appends a reply. Requires a paid plan. */
  addMessage(
    threadId: string,
    params: MessageCreateParams,
    options?: CallOptions,
  ): Promise<Message> {
    return this.unwrap<Message>('POST', `/messages/${encodePathSegment(threadId)}/messages`, {
      body: params,
      options,
    });
  }
}
