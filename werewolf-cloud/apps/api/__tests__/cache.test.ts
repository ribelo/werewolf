import { describe, it, expect } from 'vitest';
import type { KVNamespace } from '@cloudflare/workers-types';
import {
  MIN_KV_EXPIRATION_TTL_SECONDS,
  invalidatePrefix,
  invalidateResultsCache,
  publicResultsCacheKey,
  putJson,
  rankingsBundlePrefix,
  rankingsCacheKey,
  resolveKvExpirationTtl,
  resultsCacheKey,
  resultsCachePrefix,
} from '../src/utils/cache';

type PutCall = { key: string; value: string; expirationTtl: number | undefined };

const createFakeKv = (initialKeys: readonly string[] = [], pageSize = 1000) => {
  const store = new Map<string, string>(initialKeys.map((key) => [key, 'stored']));
  const puts: PutCall[] = [];
  const deleted: string[] = [];
  let failNextPut = false;

  const kv = {
    put: async (key: string, value: string, options?: { expirationTtl?: number }) => {
      if (failNextPut) {
        throw new Error('KV put failed');
      }

      puts.push({ key, value, expirationTtl: options?.expirationTtl });
      store.set(key, value);
    },
    get: async (key: string) => store.get(key) ?? null,
    delete: async (key: string) => {
      deleted.push(key);
      store.delete(key);
    },
    list: async (options?: { prefix?: string; limit?: number; cursor?: string }) => {
      const prefix = options?.prefix ?? '';
      const names = Array.from(store.keys())
        .filter((name) => name.startsWith(prefix))
        .sort();
      const offset = options?.cursor ? Number(options.cursor) : 0;
      const limit = options?.limit ?? pageSize;
      const page = names.slice(offset, offset + limit);
      const nextOffset = offset + page.length;
      const complete = nextOffset >= names.length || page.length === 0;

      return {
        keys: page.map((name) => ({ name })),
        list_complete: complete,
        cursor: complete ? '' : String(nextOffset),
      };
    },
  };

  return {
    kv: kv as unknown as KVNamespace,
    puts,
    deleted,
    remaining: () => Array.from(store.keys()).sort(),
    failNextPut: () => {
      failNextPut = true;
    },
  };
};

describe('results cache keys', () => {
  it('separates every input that shapes the payload', () => {
    const plain = resultsCacheKey({ contestId: 'contest-1', view: 'open' });

    expect(resultsCacheKey({ contestId: 'contest-2', view: 'open' })).not.toBe(plain);
    expect(resultsCacheKey({ contestId: 'contest-1', view: 'age' })).not.toBe(plain);
    expect(resultsCacheKey({ contestId: 'contest-1', view: 'open', tag: 'Junior' })).not.toBe(plain);
    expect(resultsCacheKey({ contestId: 'contest-1', view: 'open', tag: 'Junior' }))
      .not.toBe(resultsCacheKey({ contestId: 'contest-1', view: 'open', tag: 'Senior' }));
  });

  it('keeps the keys the results routes already write readable', () => {
    expect(resultsCacheKey({ contestId: 'contest-1', view: 'open' })).toBe(rankingsCacheKey('contest-1', 'open'));
    expect(resultsCacheKey({ contestId: 'contest-1', view: 'bundle' })).toBe(rankingsCacheKey('contest-1', 'bundle'));
    expect(resultsCacheKey({ contestId: 'contest-1', view: 'tag', tag: 'Junior' }))
      .toBe(rankingsCacheKey('contest-1', 'tag:Junior'));
  });

  it('treats the label alias and surrounding whitespace as the same filter', () => {
    const tagged = resultsCacheKey({ contestId: 'contest-1', view: 'weight', tag: 'Junior' });

    expect(resultsCacheKey({ contestId: 'contest-1', view: 'weight', label: 'Junior' })).toBe(tagged);
    expect(resultsCacheKey({ contestId: 'contest-1', view: 'weight', tag: '  Junior ' })).toBe(tagged);
    expect(resultsCacheKey({ contestId: 'contest-1', view: 'weight', tag: '   ' })).not.toBe(tagged);
  });

  it('shares one invalidation prefix across every variant', () => {
    const prefix = resultsCachePrefix('contest-1');

    expect(prefix).toBe(rankingsBundlePrefix('contest-1'));
    for (const key of [
      resultsCacheKey({ contestId: 'contest-1', view: 'open' }),
      resultsCacheKey({ contestId: 'contest-1', view: 'age', tag: 'Junior' }),
      resultsCacheKey({ contestId: 'contest-1', view: 'tag', tag: 'Junior' }),
      resultsCacheKey({ contestId: 'contest-1', view: 'bundle' }),
    ]) {
      expect(key.startsWith(prefix)).toBe(true);
    }
  });
});

describe('KV TTL handling', () => {
  it('refuses a TTL that Cloudflare KV cannot store', () => {
    expect(resolveKvExpirationTtl(2)).toBeNull();
    expect(resolveKvExpirationTtl(0)).toBeNull();
    expect(resolveKvExpirationTtl(-5)).toBeNull();
    expect(resolveKvExpirationTtl(Number.NaN)).toBeNull();
    expect(MIN_KV_EXPIRATION_TTL_SECONDS).toBe(60);
  });

  it('rounds a usable TTL up to whole seconds', () => {
    expect(resolveKvExpirationTtl(60)).toBe(60);
    expect(resolveKvExpirationTtl(60.5)).toBe(61);
  });

  it('skips the write instead of storing below the KV minimum', async () => {
    const fake = createFakeKv();

    await expect(putJson(fake.kv, 'rankings:contest-1:open', { open: [] }, 2)).resolves.toBe('skipped');
    expect(fake.puts).toHaveLength(0);
  });

  it('writes with the clamped TTL', async () => {
    const fake = createFakeKv();

    await expect(putJson(fake.kv, 'rankings:contest-1:open', { open: [] }, 90)).resolves.toBe('written');
    expect(fake.puts).toEqual([
      { key: 'rankings:contest-1:open', value: JSON.stringify({ open: [] }), expirationTtl: 90 },
    ]);
  });

  it('reports a failed write instead of throwing', async () => {
    const fake = createFakeKv();
    fake.failNextPut();

    await expect(putJson(fake.kv, 'rankings:contest-1:open', { open: [] }, 90)).resolves.toBe('failed');
  });
});

describe('cache invalidation', () => {
  it('walks every KV list page', async () => {
    const keys = ['rankings:contest-1:open', 'rankings:contest-1:age', 'rankings:contest-1:weight'];
    const fake = createFakeKv([...keys, 'rankings:contest-2:open'], 2);

    await invalidatePrefix(fake.kv, resultsCachePrefix('contest-1'));

    expect(fake.deleted.sort()).toEqual([...keys].sort());
    expect(fake.remaining()).toEqual(['rankings:contest-2:open']);
  });

  it('drops every results variant of a contest together with its public snapshot', async () => {
    const contestKeys = [
      resultsCacheKey({ contestId: 'contest-1', view: 'open' }),
      resultsCacheKey({ contestId: 'contest-1', view: 'age', tag: 'Junior' }),
      resultsCacheKey({ contestId: 'contest-1', view: 'tag', tag: 'Junior' }),
      resultsCacheKey({ contestId: 'contest-1', view: 'bundle' }),
      publicResultsCacheKey('contest-1'),
    ];
    const foreignKeys = [
      resultsCacheKey({ contestId: 'contest-10', view: 'open' }),
      publicResultsCacheKey('contest-10'),
    ];
    const fake = createFakeKv([...contestKeys, ...foreignKeys]);

    await invalidateResultsCache(fake.kv, 'contest-1');

    expect(fake.remaining()).toEqual([...foreignKeys].sort());
  });
});
