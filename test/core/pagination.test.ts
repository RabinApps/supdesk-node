import { describe, expect, it, vi } from 'vitest';
import { Page } from '../../src/core/pagination.js';
import type { PaginatedResponse } from '../../src/core/pagination.js';

interface Item {
  id: string;
}

const envelope = (
  ids: string[],
  overrides: Partial<{ limit: number; offset: number; has_more: boolean }> = {},
): PaginatedResponse<Item> => ({
  data: ids.map((id) => ({ id })),
  pagination: {
    limit: overrides.limit ?? 2,
    offset: overrides.offset ?? 0,
    has_more: overrides.has_more ?? false,
  },
});

/** Builds a page backed by a fetcher that replays the given envelopes in order. */
function pageWith(first: PaginatedResponse<Item>, rest: PaginatedResponse<Item>[] = []) {
  const queue = [...rest];
  const fetchPage = vi.fn(async () => {
    const next = queue.shift();
    if (!next) throw new Error('fetcher called more times than expected');
    return next;
  });

  return { page: new Page<Item>(first, fetchPage, { limit: 2 }), fetchPage };
}

describe('Page', () => {
  it('exposes the first page without fetching anything', () => {
    const { page, fetchPage } = pageWith(envelope(['a', 'b']));

    expect(page.data).toEqual([{ id: 'a' }, { id: 'b' }]);
    expect(page.pagination.has_more).toBe(false);
    expect(fetchPage).not.toHaveBeenCalled();
  });

  it('tolerates a malformed envelope', () => {
    const page = new Page<Item>({} as PaginatedResponse<Item>, vi.fn(), {});

    expect(page.data).toEqual([]);
    expect(page.hasNextPage()).toBe(false);
  });

  it('reports no next page on the last page', () => {
    const { page } = pageWith(envelope(['a'], { has_more: false }));

    expect(page.hasNextPage()).toBe(false);
    expect(page.nextPageParams()).toBeUndefined();
  });

  it('advances the offset by the number of items actually returned', () => {
    // Using data.length rather than limit means a short page never skips items.
    const { page } = pageWith(envelope(['a', 'b', 'c'], { limit: 10, offset: 20, has_more: true }));

    expect(page.nextPageParams()).toEqual({ limit: 10, offset: 23 });
  });

  it('preserves filter parameters across pages', async () => {
    const fetchPage = vi.fn(async () => envelope(['c'], { has_more: false }));
    const page = new Page<Item>(envelope(['a', 'b'], { has_more: true }), fetchPage, {
      status: 'open',
      limit: 2,
    });

    await page.getNextPage();

    expect(fetchPage).toHaveBeenCalledWith({ status: 'open', limit: 2, offset: 2 });
  });

  it('throws rather than guessing when there is no next page', async () => {
    const { page } = pageWith(envelope(['a']));

    await expect(page.getNextPage()).rejects.toThrow(RangeError);
  });

  it('iterates every item across every page', async () => {
    const { page } = pageWith(envelope(['a', 'b'], { has_more: true }), [
      envelope(['c', 'd'], { offset: 2, has_more: true }),
      envelope(['e'], { offset: 4, has_more: false }),
    ]);

    const ids: string[] = [];
    for await (const item of page) ids.push(item.id);

    expect(ids).toEqual(['a', 'b', 'c', 'd', 'e']);
  });

  it('stops on an empty page even when the server still says has_more', async () => {
    // Trusting the flag alone would loop forever against a buggy response.
    const fetchPage = vi.fn(async () => envelope([], { has_more: true }));
    const page = new Page<Item>(envelope([], { has_more: true }), fetchPage, {});

    expect(await page.toArray()).toEqual([]);
    expect(fetchPage).not.toHaveBeenCalled();
  });

  it('collects everything with toArray', async () => {
    const { page } = pageWith(envelope(['a'], { has_more: true }), [
      envelope(['b'], { offset: 1, has_more: false }),
    ]);

    expect(await page.toArray()).toEqual([{ id: 'a' }, { id: 'b' }]);
  });

  it('does not fetch beyond the last page', async () => {
    const { page, fetchPage } = pageWith(envelope(['a'], { has_more: true }), [
      envelope(['b'], { offset: 1, has_more: false }),
    ]);

    await page.toArray();

    expect(fetchPage).toHaveBeenCalledTimes(1);
  });
});
