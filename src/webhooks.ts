import { SupDeskError, SupDeskSignatureVerificationError } from './core/errors.js';
import type { WaitlistSignup } from './types/waitlist.js';

/** The header SupDesk signs every webhook delivery with. */
export const SUPDESK_SIGNATURE_HEADER = 'X-SupDesk-Signature';

/** Every event type SupDesk documents. */
export type SupDeskWebhookEventType =
  | 'post.created'
  | 'post.updated'
  | 'post.deleted'
  | 'post.status_changed'
  | 'comment.created'
  | 'comment.updated'
  | 'comment.deleted'
  | 'message.created'
  | 'message.updated'
  | 'message.deleted'
  | 'beta_feedback.created'
  | 'beta_feedback.deleted'
  | 'waitlist_signup.created'
  | 'waitlist_signup.invited'
  | 'waitlist_signup.joined'
  | 'csat_survey.completed';

/**
 * SupDesk does not publish per-event `data` schemas, so anything without a
 * documented model stays an open record rather than an invented interface.
 * Narrow it yourself at the call site.
 */
export type UnknownEventData = Record<string, unknown>;

export interface SupDeskWebhookEnvelope<
  TType extends SupDeskWebhookEventType = SupDeskWebhookEventType,
  TData = UnknownEventData,
> {
  event: TType;
  /** ISO 8601 timestamp. */
  timestamp: string;
  project_id: string;
  data: TData;
}

/** Discriminated union over `event`, so a `switch` narrows `data`. */
export type SupDeskWebhookEvent =
  | SupDeskWebhookEnvelope<'post.created'>
  | SupDeskWebhookEnvelope<'post.updated'>
  | SupDeskWebhookEnvelope<'post.deleted'>
  | SupDeskWebhookEnvelope<'post.status_changed'>
  | SupDeskWebhookEnvelope<'comment.created'>
  | SupDeskWebhookEnvelope<'comment.updated'>
  | SupDeskWebhookEnvelope<'comment.deleted'>
  | SupDeskWebhookEnvelope<'message.created'>
  | SupDeskWebhookEnvelope<'message.updated'>
  | SupDeskWebhookEnvelope<'message.deleted'>
  | SupDeskWebhookEnvelope<'beta_feedback.created'>
  | SupDeskWebhookEnvelope<'beta_feedback.deleted'>
  | SupDeskWebhookEnvelope<'waitlist_signup.created', WaitlistSignup>
  | SupDeskWebhookEnvelope<'waitlist_signup.invited', WaitlistSignup>
  | SupDeskWebhookEnvelope<'waitlist_signup.joined', WaitlistSignup>
  | SupDeskWebhookEnvelope<'csat_survey.completed'>;

/** Raw request body. Must be the exact bytes SupDesk sent. */
export type WebhookPayload = string | ArrayBuffer | ArrayBufferView;

export interface VerifyWebhookOptions {
  /**
   * The raw request body.
   *
   * Re-serializing a parsed object will not match: `JSON.stringify` does not
   * reproduce the original whitespace or key order.
   */
  payload: WebhookPayload;
  /** The `X-SupDesk-Signature` header value, e.g. `sha256=abc…`. */
  signature: string;
  /** The webhook's signing secret. */
  secret: string;
}

const encoder = new TextEncoder();

function subtle(): SubtleCrypto {
  const webcrypto = globalThis.crypto;
  if (!webcrypto?.subtle) {
    throw new SupDeskError(
      'Web Crypto is unavailable. Webhook verification needs globalThis.crypto.subtle ' +
        '(Node 18+, Deno, Bun, Cloudflare Workers, or a secure browser context).',
    );
  }
  return webcrypto.subtle;
}

function toBytes(payload: WebhookPayload): Uint8Array<ArrayBuffer> {
  if (typeof payload === 'string') return encoder.encode(payload);
  if (payload instanceof ArrayBuffer) return new Uint8Array(payload);

  // A view may be backed by a SharedArrayBuffer, which Web Crypto rejects, so
  // copy into a plain ArrayBuffer. Webhook payloads are small enough that the
  // extra allocation does not matter.
  const copy = new Uint8Array(payload.byteLength);
  copy.set(new Uint8Array(payload.buffer, payload.byteOffset, payload.byteLength));
  return copy;
}

function toHex(bytes: Uint8Array): string {
  let hex = '';
  for (const byte of bytes) hex += byte.toString(16).padStart(2, '0');
  return hex;
}

/**
 * Compares two hex digests without an early return.
 *
 * A plain `===` short-circuits on the first differing character, which leaks
 * how much of a forged signature was correct and makes the digest guessable
 * byte by byte. Comparing digests (not raw secrets) makes the length check
 * harmless: SHA-256 hex is always 64 characters.
 */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;

  let mismatch = 0;
  for (let i = 0; i < a.length; i += 1) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }

  return mismatch === 0;
}

/** Extracts the hex digest from a `sha256=…` header value. */
function parseSignatureHeader(signature: string): string | undefined {
  if (typeof signature !== 'string') return undefined;

  const trimmed = signature.trim();
  const match = /^sha256=([0-9a-f]+)$/i.exec(trimmed);

  return match?.[1]?.toLowerCase();
}

/**
 * Computes the signature SupDesk would send for a payload.
 *
 * Exported mainly for building test fixtures; verification should go through
 * {@link verifyWebhookSignature}, which compares in constant time.
 */
export async function computeWebhookSignature(
  payload: WebhookPayload,
  secret: string,
): Promise<string> {
  const key = await subtle().importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );

  const signature = await subtle().sign('HMAC', key, toBytes(payload));
  return `sha256=${toHex(new Uint8Array(signature))}`;
}

/**
 * Verifies a webhook signature. Async because Web Crypto is async — that is
 * the price of running the same code in Workers and Deno as in Node.
 *
 * Returns `false` rather than throwing for any invalid signature, including a
 * malformed header.
 */
export async function verifyWebhookSignature(options: VerifyWebhookOptions): Promise<boolean> {
  const provided = parseSignatureHeader(options.signature);
  if (!provided || !options.secret) return false;

  const expected = (await computeWebhookSignature(options.payload, options.secret)).slice(
    'sha256='.length,
  );

  return timingSafeEqual(expected, provided);
}

/**
 * Verifies a payload and parses it into a typed event.
 *
 * @throws {SupDeskSignatureVerificationError} if the signature does not match,
 * or if the verified payload is not valid JSON.
 */
export async function constructEvent(
  options: VerifyWebhookOptions,
): Promise<SupDeskWebhookEvent> {
  if (!(await verifyWebhookSignature(options))) {
    throw new SupDeskSignatureVerificationError(
      'Webhook signature does not match the payload. Make sure you are passing the raw ' +
        'request body — a re-serialized JSON object will never verify.',
    );
  }

  const text =
    typeof options.payload === 'string'
      ? options.payload
      : new TextDecoder().decode(toBytes(options.payload));

  try {
    return JSON.parse(text) as SupDeskWebhookEvent;
  } catch {
    throw new SupDeskSignatureVerificationError(
      'Webhook payload passed signature verification but is not valid JSON.',
    );
  }
}

/**
 * Verifies and parses a webhook straight from a `Request`.
 *
 * Reads the body, so pass `request.clone()` if you need to read it again.
 *
 * ```ts
 * export default {
 *   async fetch(request: Request, env: Env) {
 *     const event = await constructEventFromRequest(request, env.SUPDESK_WEBHOOK_SECRET);
 *     if (event.event === 'waitlist_signup.joined') { … }
 *     return new Response(null, { status: 204 });
 *   },
 * };
 * ```
 */
export async function constructEventFromRequest(
  request: Request,
  secret: string,
): Promise<SupDeskWebhookEvent> {
  const signature = request.headers.get(SUPDESK_SIGNATURE_HEADER) ?? '';
  const payload = await request.text();

  return constructEvent({ payload, signature, secret });
}

/** A signing secret bound to the webhook helpers, for callers who prefer an object. */
export class Webhooks {
  readonly #secret: string;

  constructor(secret: string) {
    if (!secret) {
      throw new SupDeskError('A webhook signing secret is required.');
    }
    this.#secret = secret;
  }

  verify(payload: WebhookPayload, signature: string): Promise<boolean> {
    return verifyWebhookSignature({ payload, signature, secret: this.#secret });
  }

  constructEvent(payload: WebhookPayload, signature: string): Promise<SupDeskWebhookEvent> {
    return constructEvent({ payload, signature, secret: this.#secret });
  }

  constructEventFromRequest(request: Request): Promise<SupDeskWebhookEvent> {
    return constructEventFromRequest(request, this.#secret);
  }

  sign(payload: WebhookPayload): Promise<string> {
    return computeWebhookSignature(payload, this.#secret);
  }
}
