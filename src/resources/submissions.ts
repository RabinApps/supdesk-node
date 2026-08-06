import type { Page } from '../core/pagination.js';
import { encodePathSegment, toQuery } from '../core/query.js';
import type {
  Submission,
  SubmissionCreateParams,
  SubmissionListParams,
} from '../types/submissions.js';
import type { CallOptions } from './base.js';
import { APIResource } from './base.js';

/** Bug reports and feature requests. */
export class Submissions extends APIResource {
  /** `GET /submissions` — auto-paging. */
  list(params: SubmissionListParams = {}, options?: CallOptions): Promise<Page<Submission>> {
    return this.listPage<Submission>('/submissions', toQuery(params), options);
  }

  /** `GET /submissions/:id` */
  get(id: string, options?: CallOptions): Promise<Submission> {
    return this.unwrap<Submission>('GET', `/submissions/${encodePathSegment(id)}`, { options });
  }

  /**
   * `POST /submissions`
   *
   * Counts against the monthly submission quota and requires a paid plan.
   */
  create(params: SubmissionCreateParams, options?: CallOptions): Promise<Submission> {
    return this.unwrap<Submission>('POST', '/submissions', { body: params, options });
  }
}
