import { describe, expect, it } from 'vitest';
import {
  SUPDESK_SIGNATURE_HEADER,
  Webhooks,
  computeWebhookSignature,
  constructEvent,
  constructEventFromRequest,
  verifyWebhookSignature,
} from '../src/webhooks.js';
import { SupDeskError, SupDeskSignatureVerificationError } from '../src/core/errors.js';

const SECRET = 'whsec_test_secret';

const EVENT = {
  event: 'waitlist_signup.joined',
  timestamp: '2026-08-05T12:00:00.000Z',
  project_id: '2f7b1c2a-0000-4000-8000-000000000001',
  data: { id: 'wl_1', email: 'a@example.com', status: 'joined' },
};

// Deliberately non-canonical spacing: the signature is over these exact bytes,
// so any test that re-stringifies the object would silently pass for the wrong
// reason.
const RAW_PAYLOAD = JSON.stringify(EVENT, null, 2);

async function sign(payload: string, secret = SECRET) {
  return computeWebhookSignature(payload, secret);
}

describe('computeWebhookSignature', () => {
  it('produces a sha256-prefixed 64-character hex digest', async () => {
    const signature = await sign(RAW_PAYLOAD);

    expect(signature).toMatch(/^sha256=[0-9a-f]{64}$/);
  });

  it('is deterministic for the same payload and secret', async () => {
    expect(await sign(RAW_PAYLOAD)).toBe(await sign(RAW_PAYLOAD));
  });

  it('changes with the secret', async () => {
    expect(await sign(RAW_PAYLOAD, 'other')).not.toBe(await sign(RAW_PAYLOAD));
  });

  it('accepts a string, an ArrayBuffer and a typed-array view alike', async () => {
    const bytes = new TextEncoder().encode(RAW_PAYLOAD);
    const expected = await sign(RAW_PAYLOAD);

    expect(await computeWebhookSignature(bytes, SECRET)).toBe(expected);
    expect(await computeWebhookSignature(bytes.buffer as ArrayBuffer, SECRET)).toBe(expected);

    // A view with a non-zero byteOffset must hash only its own window.
    const padded = new Uint8Array(bytes.byteLength + 4);
    padded.set(bytes, 4);
    const view = new Uint8Array(padded.buffer, 4, bytes.byteLength);
    expect(await computeWebhookSignature(view, SECRET)).toBe(expected);
  });
});

describe('verifyWebhookSignature', () => {
  it('accepts a genuine signature', async () => {
    const signature = await sign(RAW_PAYLOAD);

    await expect(verifyWebhookSignature({ payload: RAW_PAYLOAD, signature, secret: SECRET })).resolves.toBe(
      true,
    );
  });

  it('accepts an uppercase hex digest', async () => {
    const signature = (await sign(RAW_PAYLOAD)).toUpperCase().replace('SHA256=', 'sha256=');

    await expect(verifyWebhookSignature({ payload: RAW_PAYLOAD, signature, secret: SECRET })).resolves.toBe(
      true,
    );
  });

  it('rejects a tampered payload', async () => {
    const signature = await sign(RAW_PAYLOAD);
    const tampered = RAW_PAYLOAD.replace('a@example.com', 'attacker@example.com');

    await expect(
      verifyWebhookSignature({ payload: tampered, signature, secret: SECRET }),
    ).resolves.toBe(false);
  });

  it('rejects a signature made with the wrong secret', async () => {
    const signature = await sign(RAW_PAYLOAD, 'wrong-secret');

    await expect(
      verifyWebhookSignature({ payload: RAW_PAYLOAD, signature, secret: SECRET }),
    ).resolves.toBe(false);
  });

  it('rejects a re-serialized body', async () => {
    // The most common integration mistake: a framework parsed the JSON, and the
    // handler stringified it again. The bytes differ, so the digest differs.
    const signature = await sign(RAW_PAYLOAD);

    await expect(
      verifyWebhookSignature({ payload: JSON.stringify(EVENT), signature, secret: SECRET }),
    ).resolves.toBe(false);
  });

  it.each([
    ['missing prefix', 'a'.repeat(64)],
    ['wrong algorithm', `sha1=${'a'.repeat(40)}`],
    ['non-hex digest', `sha256=${'z'.repeat(64)}`],
    ['empty', ''],
    ['prefix only', 'sha256='],
    ['truncated digest', 'sha256=abcd'],
  ])('returns false for a %s header', async (_label, signature) => {
    await expect(
      verifyWebhookSignature({ payload: RAW_PAYLOAD, signature, secret: SECRET }),
    ).resolves.toBe(false);
  });

  it('returns false rather than throwing when the secret is empty', async () => {
    const signature = await sign(RAW_PAYLOAD);

    await expect(verifyWebhookSignature({ payload: RAW_PAYLOAD, signature, secret: '' })).resolves.toBe(
      false,
    );
  });

  it('rejects a valid-looking digest of the right length', async () => {
    await expect(
      verifyWebhookSignature({
        payload: RAW_PAYLOAD,
        signature: `sha256=${'0'.repeat(64)}`,
        secret: SECRET,
      }),
    ).resolves.toBe(false);
  });
});

describe('constructEvent', () => {
  it('returns the parsed event for a valid signature', async () => {
    const signature = await sign(RAW_PAYLOAD);
    const event = await constructEvent({ payload: RAW_PAYLOAD, signature, secret: SECRET });

    expect(event.event).toBe('waitlist_signup.joined');
    expect(event.project_id).toBe(EVENT.project_id);
    if (event.event === 'waitlist_signup.joined') {
      expect(event.data.email).toBe('a@example.com');
    }
  });

  it('throws on a bad signature', async () => {
    await expect(
      constructEvent({ payload: RAW_PAYLOAD, signature: 'sha256=deadbeef', secret: SECRET }),
    ).rejects.toBeInstanceOf(SupDeskSignatureVerificationError);
  });

  it('throws when a correctly signed payload is not JSON', async () => {
    const payload = 'not json at all';
    const signature = await sign(payload);

    await expect(constructEvent({ payload, signature, secret: SECRET })).rejects.toThrow(
      /not valid JSON/,
    );
  });

  it('decodes a binary payload before parsing', async () => {
    const bytes = new TextEncoder().encode(RAW_PAYLOAD);
    const signature = await computeWebhookSignature(bytes, SECRET);

    const event = await constructEvent({ payload: bytes, signature, secret: SECRET });

    expect(event.event).toBe('waitlist_signup.joined');
  });
});

describe('constructEventFromRequest', () => {
  it('verifies and parses straight off a Request', async () => {
    const signature = await sign(RAW_PAYLOAD);
    const request = new Request('https://example.com/webhooks/supdesk', {
      method: 'POST',
      headers: { [SUPDESK_SIGNATURE_HEADER]: signature },
      body: RAW_PAYLOAD,
    });

    const event = await constructEventFromRequest(request, SECRET);

    expect(event.event).toBe('waitlist_signup.joined');
  });

  it('rejects a request with no signature header', async () => {
    const request = new Request('https://example.com/webhooks/supdesk', {
      method: 'POST',
      body: RAW_PAYLOAD,
    });

    await expect(constructEventFromRequest(request, SECRET)).rejects.toBeInstanceOf(
      SupDeskSignatureVerificationError,
    );
  });
});

describe('Webhooks', () => {
  it('binds a secret to the helpers', async () => {
    const webhooks = new Webhooks(SECRET);
    const signature = await webhooks.sign(RAW_PAYLOAD);

    await expect(webhooks.verify(RAW_PAYLOAD, signature)).resolves.toBe(true);
    await expect(webhooks.constructEvent(RAW_PAYLOAD, signature)).resolves.toMatchObject({
      event: 'waitlist_signup.joined',
    });
  });

  it('works from a Request', async () => {
    const webhooks = new Webhooks(SECRET);
    const request = new Request('https://example.com/hook', {
      method: 'POST',
      headers: { [SUPDESK_SIGNATURE_HEADER]: await webhooks.sign(RAW_PAYLOAD) },
      body: RAW_PAYLOAD,
    });

    await expect(webhooks.constructEventFromRequest(request)).resolves.toMatchObject({
      event: 'waitlist_signup.joined',
    });
  });

  it('refuses an empty secret at construction time', () => {
    expect(() => new Webhooks('')).toThrow(SupDeskError);
  });
});

describe('runtimes without Web Crypto', () => {
  it('explains what is missing instead of failing on undefined', async () => {
    const original = Object.getOwnPropertyDescriptor(globalThis, 'crypto');
    Object.defineProperty(globalThis, 'crypto', { value: undefined, configurable: true });

    try {
      await expect(computeWebhookSignature('x', SECRET)).rejects.toThrow(/Web Crypto is unavailable/);
    } finally {
      if (original) Object.defineProperty(globalThis, 'crypto', original);
    }
  });
});
