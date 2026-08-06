import type { Page } from '../core/pagination.js';
import { encodePathSegment, toQuery } from '../core/query.js';
import type {
  WaitlistCreateParams,
  WaitlistListParams,
  WaitlistSignup,
  WaitlistUpdateParams,
} from '../types/waitlist.js';
import type { CallOptions } from './base.js';
import { APIResource } from './base.js';

/** Waitlist signups. Signups are the only sub-resource, so the methods sit flat. */
export class Waitlist extends APIResource {
  /** `GET /waitlist/signups` — auto-paging. Note the default page size is 25 here, not 20. */
  list(params: WaitlistListParams = {}, options?: CallOptions): Promise<Page<WaitlistSignup>> {
    return this.listPage<WaitlistSignup>('/waitlist/signups', toQuery(params), options);
  }

  /** `GET /waitlist/signups/:id` */
  get(id: string, options?: CallOptions): Promise<WaitlistSignup> {
    return this.unwrap<WaitlistSignup>('GET', `/waitlist/signups/${encodePathSegment(id)}`, {
      options,
    });
  }

  /** `POST /waitlist/signups` — requires a paid plan. */
  create(params: WaitlistCreateParams, options?: CallOptions): Promise<WaitlistSignup> {
    return this.unwrap<WaitlistSignup>('POST', '/waitlist/signups', { body: params, options });
  }

  /** `PATCH /waitlist/signups/:id` — moves a signup between waiting/invited/joined. */
  update(
    id: string,
    params: WaitlistUpdateParams,
    options?: CallOptions,
  ): Promise<WaitlistSignup> {
    return this.unwrap<WaitlistSignup>('PATCH', `/waitlist/signups/${encodePathSegment(id)}`, {
      body: params,
      options,
    });
  }

  /** `DELETE /waitlist/signups/:id` — requires a paid plan. */
  delete(id: string, options?: CallOptions): Promise<void> {
    return this.empty('DELETE', `/waitlist/signups/${encodePathSegment(id)}`, { options });
  }
}
