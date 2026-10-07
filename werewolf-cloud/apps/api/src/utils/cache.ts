export const MIN_KV_EXPIRATION_TTL_SECONDS = 60;

const KV_LIST_PAGE_SIZE = 1000;
const KV_DELETE_BATCH_SIZE = 128;

export type CacheWriteOutcome = 'written' | 'skipped' | 'failed';

export type ResultsView = 'open' | 'age' | 'weight' | 'tag' | 'bundle';

export type ResultsCacheKeyInput =
  | {
      contestId: string;
      view: Exclude<ResultsView, 'tag'>;
      tag?: string | null;
      label?: string | null;
    }
  | {
      contestId: string;
      view: 'tag';
      tag: string;
      label?: string | null;
    };

/**
 * Cloudflare KV rejects every expirationTtl below 60 seconds, so a shorter
 * request means "do not cache" rather than a second-long cache window.
 */
export function resolveKvExpirationTtl(ttlSeconds: number): number | null {
  if (!Number.isFinite(ttlSeconds) || ttlSeconds < MIN_KV_EXPIRATION_TTL_SECONDS) {
    return null;
  }

  return Math.ceil(ttlSeconds);
}

export async function putJson(
  kv: KVNamespace,
  key: string,
  value: unknown,
  ttlSeconds: number,
): Promise<CacheWriteOutcome> {
  const expirationTtl = resolveKvExpirationTtl(ttlSeconds);

  if (expirationTtl === null) {
    return 'skipped';
  }

  try {
    await kv.put(key, JSON.stringify(value), { expirationTtl });
    return 'written';
  } catch (err) {
    console.warn('KV put failed:', key, err instanceof Error ? err.message : String(err));
    return 'failed';
  }
}

export async function getJson<T>(kv: KVNamespace, key: string): Promise<T | null> {
  try {
    const val = await kv.get<T>(key, { type: 'json' });
    return (val as T) ?? null;
  } catch (err) {
    console.warn('KV get failed:', key, err instanceof Error ? err.message : String(err));
    return null;
  }
}

async function deleteKeys(kv: KVNamespace, keys: readonly string[]): Promise<void> {
  for (let index = 0; index < keys.length; index += KV_DELETE_BATCH_SIZE) {
    const batch = keys.slice(index, index + KV_DELETE_BATCH_SIZE);
    await Promise.all(batch.map((key) => kv.delete(key)));
  }
}

async function listKeyNames(kv: KVNamespace, prefix: string): Promise<string[]> {
  const names: string[] = [];
  let cursor: string | undefined;

  for (;;) {
    const page = cursor === undefined
      ? await kv.list({ prefix, limit: KV_LIST_PAGE_SIZE })
      : await kv.list({ prefix, limit: KV_LIST_PAGE_SIZE, cursor });

    for (const key of page.keys) {
      names.push(key.name);
    }

    const nextCursor = page.list_complete ? undefined : page.cursor;
    if (!nextCursor) {
      return names;
    }

    cursor = nextCursor;
  }
}

export async function invalidatePrefix(kv: KVNamespace, prefix: string): Promise<void> {
  try {
    const names = await listKeyNames(kv, prefix);
    await deleteKeys(kv, names);
  } catch (err) {
    console.warn('KV invalidate failed:', prefix, err instanceof Error ? err.message : String(err));
  }
}

export function resultsCachePrefix(contestId: string): string {
  return `rankings:${contestId}:`;
}

export function publicResultsCacheKey(contestId: string): string {
  return `public-results:${contestId}`;
}

function normalizeTag(value: string | null | undefined): string | null {
  const trimmed = value?.trim() ?? '';
  return trimmed.length > 0 ? trimmed : null;
}

export function resultsCacheKey(input: ResultsCacheKeyInput): string {
  const contestId = input.contestId.trim();
  const tag = normalizeTag(input.tag ?? input.label ?? null);

  if (input.view === 'tag') {
    return `rankings:${contestId}:tag:${tag ?? ''}`;
  }

  return tag === null
    ? `rankings:${contestId}:${input.view}`
    : `rankings:${contestId}:${input.view}:tag:${tag}`;
}

export async function invalidateResultsCache(kv: KVNamespace, contestId: string): Promise<void> {
  await invalidatePrefix(kv, resultsCachePrefix(contestId));

  try {
    await kv.delete(publicResultsCacheKey(contestId));
  } catch (err) {
    console.warn(
      'KV invalidate failed:',
      publicResultsCacheKey(contestId),
      err instanceof Error ? err.message : String(err),
    );
  }
}

/**
 * Legacy two-argument helper kept for existing callers. New code should use
 * resultsCacheKey so every input that shapes the payload is part of the key.
 */
export function rankingsCacheKey(contestId: string, variant: string): string {
  return `rankings:${contestId}:${variant}`;
}

export function rankingsBundlePrefix(contestId: string): string {
  return resultsCachePrefix(contestId);
}
