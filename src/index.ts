// Named export only, deliberately. Mixing a default export with named exports
// forces CJS consumers into `require('supdesk').default`, which is a wart that
// is much easier to avoid than to explain.
export { SupDesk, type SupDeskOptions } from './client.js';

export { VERSION } from './version.js';

export {
  DEFAULT_BASE_URL,
  DEFAULT_TIMEOUT_MS,
  MAX_REQUEST_BYTES,
  HttpClient,
  type HttpClientConfig,
  type HttpClientOptions,
  type HttpMethod,
  type RequestOptions,
} from './core/http.js';

export {
  ForbiddenError,
  InternalServerError,
  InvalidRequestError,
  LimitReachedError,
  NotFoundError,
  RateLimitedError,
  RequestTooLargeError,
  SupDeskAPIError,
  SupDeskConfigurationError,
  SupDeskConnectionError,
  SupDeskError,
  SupDeskSignatureVerificationError,
  SupDeskTimeoutError,
  UnauthorizedError,
  isSupDeskAPIError,
  isSupDeskError,
  type SupDeskErrorCode,
  type SupDeskErrorPayload,
} from './core/errors.js';

export { isBrowserLike } from './core/runtime.js';

export { Page } from './core/pagination.js';
export type { PageFetcher, PaginatedResponse, PaginationMeta, PaginationParams } from './core/pagination.js';

export { DEFAULT_MAX_RETRIES, MAX_RETRY_DELAY_MS } from './core/retry.js';

export { APIResource, type CallOptions } from './resources/base.js';
export { Articles } from './resources/articles.js';
export { ArticleCategories } from './resources/article-categories.js';
export { Beta, BetaPrograms, BetaTesters } from './resources/beta.js';
export { Changelog } from './resources/changelog.js';
export { FeedbackResource } from './resources/feedback.js';
export { Messages } from './resources/messages.js';
export { Submissions } from './resources/submissions.js';
export { Waitlist } from './resources/waitlist.js';

export {
  SUPDESK_SIGNATURE_HEADER,
  Webhooks,
  computeWebhookSignature,
  constructEvent,
  constructEventFromRequest,
  verifyWebhookSignature,
  type SupDeskWebhookEnvelope,
  type SupDeskWebhookEvent,
  type SupDeskWebhookEventType,
  type UnknownEventData,
  type VerifyWebhookOptions,
  type WebhookPayload,
} from './webhooks.js';

export type { Locale, Open, PostStatus } from './types/common.js';
export type * from './types/beta.js';
export type * from './types/changelog.js';
export type * from './types/feedback.js';
export type * from './types/help-center.js';
export type * from './types/messages.js';
export type * from './types/submissions.js';
export type * from './types/waitlist.js';
