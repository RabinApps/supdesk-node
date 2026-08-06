import { describe, expect, it } from 'vitest';
import { buildQueryString, encodePathSegment, joinUrl, toQuery } from '../../src/core/query.js';

describe('buildQueryString', () => {
  it('returns an empty string when there is nothing to send', () => {
    expect(buildQueryString()).toBe('');
    expect(buildQueryString({})).toBe('');
    expect(buildQueryString({ status: undefined })).toBe('');
  });

  it('drops undefined but keeps other falsy values', () => {
    // `offset=0` and `has_more=false` are meaningful; only "not set" is dropped.
    expect(buildQueryString({ offset: 0, draft: false, status: undefined })).toBe(
      '?offset=0&draft=false',
    );
  });

  it('sends null as an empty value', () => {
    expect(buildQueryString({ category_id: null })).toBe('?category_id=');
  });

  it('repeats array values', () => {
    expect(buildQueryString({ labels: ['New', 'Fixed'] })).toBe('?labels=New&labels=Fixed');
  });

  it('percent-encodes keys and values', () => {
    expect(buildQueryString({ q: 'how do i & why' })).toBe('?q=how+do+i+%26+why');
  });
});

describe('joinUrl', () => {
  it.each([
    ['https://api.supdesk.app/v1', '/submissions'],
    ['https://api.supdesk.app/v1/', '/submissions'],
    ['https://api.supdesk.app/v1', 'submissions'],
    ['https://api.supdesk.app/v1///', '///submissions'],
  ])('joins %s + %s with a single slash', (base, path) => {
    expect(joinUrl(base, path)).toBe('https://api.supdesk.app/v1/submissions');
  });
});

describe('encodePathSegment', () => {
  it('stops an id from escaping its path segment', () => {
    expect(encodePathSegment('../../admin')).toBe('..%2F..%2Fadmin');
    expect(encodePathSegment('id?x=1')).toBe('id%3Fx%3D1');
  });

  it('accepts numeric ids', () => {
    expect(encodePathSegment(42)).toBe('42');
  });
});

describe('toQuery', () => {
  it('copies rather than aliasing the caller object', () => {
    const params = { status: 'open' };
    const query = toQuery(params);

    query.status = 'done';

    expect(params.status).toBe('open');
  });

  it('handles undefined input', () => {
    expect(toQuery()).toEqual({});
  });
});
