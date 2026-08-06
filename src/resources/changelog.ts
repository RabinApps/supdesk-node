import type { Page } from '../core/pagination.js';
import { encodePathSegment, toQuery } from '../core/query.js';
import type {
  ChangelogCreateParams,
  ChangelogEntry,
  ChangelogGetParams,
  ChangelogListParams,
  ChangelogUpdateParams,
} from '../types/changelog.js';
import type { CallOptions } from './base.js';
import { APIResource } from './base.js';

/** Public changelog entries. */
export class Changelog extends APIResource {
  /** `GET /changelog` — auto-paging. */
  list(params: ChangelogListParams = {}, options?: CallOptions): Promise<Page<ChangelogEntry>> {
    return this.listPage<ChangelogEntry>('/changelog', toQuery(params), options);
  }

  /** `GET /changelog/:id` */
  get(
    id: string,
    params: ChangelogGetParams = {},
    options?: CallOptions,
  ): Promise<ChangelogEntry> {
    return this.unwrap<ChangelogEntry>('GET', `/changelog/${encodePathSegment(id)}`, {
      query: toQuery(params),
      options,
    });
  }

  /** `POST /changelog` — requires a paid plan. */
  create(params: ChangelogCreateParams, options?: CallOptions): Promise<ChangelogEntry> {
    return this.unwrap<ChangelogEntry>('POST', '/changelog', { body: params, options });
  }

  /** `PATCH /changelog/:id` — requires a paid plan. */
  update(
    id: string,
    params: ChangelogUpdateParams,
    options?: CallOptions,
  ): Promise<ChangelogEntry> {
    return this.unwrap<ChangelogEntry>('PATCH', `/changelog/${encodePathSegment(id)}`, {
      body: params,
      options,
    });
  }

  /** `DELETE /changelog/:id` — requires a paid plan. */
  delete(id: string, options?: CallOptions): Promise<void> {
    return this.empty('DELETE', `/changelog/${encodePathSegment(id)}`, { options });
  }
}
