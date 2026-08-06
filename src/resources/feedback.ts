import type { Page } from '../core/pagination.js';
import { encodePathSegment, toQuery } from '../core/query.js';
import type { Feedback, FeedbackCreateParams, FeedbackListParams } from '../types/feedback.js';
import type { CallOptions } from './base.js';
import { APIResource } from './base.js';

/** General product feedback, separate from bug/feature submissions. */
export class FeedbackResource extends APIResource {
  /** `GET /feedback` — auto-paging. */
  list(params: FeedbackListParams = {}, options?: CallOptions): Promise<Page<Feedback>> {
    return this.listPage<Feedback>('/feedback', toQuery(params), options);
  }

  /** `GET /feedback/:id` */
  get(id: string, options?: CallOptions): Promise<Feedback> {
    return this.unwrap<Feedback>('GET', `/feedback/${encodePathSegment(id)}`, { options });
  }

  /**
   * `POST /feedback`
   *
   * Metered against the same monthly submission quota as `submissions.create`
   * and requires a paid plan.
   */
  create(params: FeedbackCreateParams, options?: CallOptions): Promise<Feedback> {
    return this.unwrap<Feedback>('POST', '/feedback', { body: params, options });
  }
}
