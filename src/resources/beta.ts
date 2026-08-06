import type { HttpClient } from '../core/http.js';
import type { Page } from '../core/pagination.js';
import { encodePathSegment, toQuery } from '../core/query.js';
import type {
  BetaProgram,
  BetaProgramCreateParams,
  BetaProgramListParams,
  BetaProgramUpdateParams,
  BetaTester,
  BetaTesterCreateParams,
  BetaTesterListParams,
} from '../types/beta.js';
import type { CallOptions } from './base.js';
import { APIResource } from './base.js';

/** `/beta/programs` */
export class BetaPrograms extends APIResource {
  /** `GET /beta/programs` — auto-paging. */
  list(params: BetaProgramListParams = {}, options?: CallOptions): Promise<Page<BetaProgram>> {
    return this.listPage<BetaProgram>('/beta/programs', toQuery(params), options);
  }

  /** `GET /beta/programs/:id` */
  get(id: string, options?: CallOptions): Promise<BetaProgram> {
    return this.unwrap<BetaProgram>('GET', `/beta/programs/${encodePathSegment(id)}`, { options });
  }

  /** `POST /beta/programs` — requires a paid plan. */
  create(params: BetaProgramCreateParams, options?: CallOptions): Promise<BetaProgram> {
    return this.unwrap<BetaProgram>('POST', '/beta/programs', { body: params, options });
  }

  /** `PATCH /beta/programs/:id` — requires a paid plan. */
  update(
    id: string,
    params: BetaProgramUpdateParams,
    options?: CallOptions,
  ): Promise<BetaProgram> {
    return this.unwrap<BetaProgram>('PATCH', `/beta/programs/${encodePathSegment(id)}`, {
      body: params,
      options,
    });
  }

  /** `DELETE /beta/programs/:id` — requires a paid plan. */
  delete(id: string, options?: CallOptions): Promise<void> {
    return this.empty('DELETE', `/beta/programs/${encodePathSegment(id)}`, { options });
  }
}

/**
 * `/beta/programs/:programId/testers`
 *
 * Testers are nested under a program, so every method takes the program id
 * first. There is no documented update endpoint for testers.
 */
export class BetaTesters extends APIResource {
  /** `GET /beta/programs/:programId/testers` — auto-paging. */
  list(
    programId: string,
    params: BetaTesterListParams = {},
    options?: CallOptions,
  ): Promise<Page<BetaTester>> {
    return this.listPage<BetaTester>(this.#path(programId), toQuery(params), options);
  }

  /** `GET /beta/programs/:programId/testers/:id` */
  get(programId: string, id: string, options?: CallOptions): Promise<BetaTester> {
    return this.unwrap<BetaTester>('GET', `${this.#path(programId)}/${encodePathSegment(id)}`, {
      options,
    });
  }

  /** `POST /beta/programs/:programId/testers` — requires a paid plan. */
  create(
    programId: string,
    params: BetaTesterCreateParams,
    options?: CallOptions,
  ): Promise<BetaTester> {
    return this.unwrap<BetaTester>('POST', this.#path(programId), { body: params, options });
  }

  /** `DELETE /beta/programs/:programId/testers/:id` — requires a paid plan. */
  delete(programId: string, id: string, options?: CallOptions): Promise<void> {
    return this.empty('DELETE', `${this.#path(programId)}/${encodePathSegment(id)}`, { options });
  }

  #path(programId: string): string {
    return `/beta/programs/${encodePathSegment(programId)}/testers`;
  }
}

/** Groups the beta programs and testers resources. */
export class Beta {
  readonly programs: BetaPrograms;
  readonly testers: BetaTesters;

  constructor(http: HttpClient) {
    this.programs = new BetaPrograms(http);
    this.testers = new BetaTesters(http);
  }
}
