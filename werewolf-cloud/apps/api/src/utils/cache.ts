import type { KVNamespace } from '@cloudflare/workers-types';

export async function putJson(
  kv: KVNamespace,
  key: string,
  value: unknown,
  ttlSeconds: number,
): Promise<void> {
  try {
    await kv.put(key, JSON.stringify(value), { expirationTtl: ttlSeconds });
  } catch (err) {
    // Best-effort cache; never throw
    console.warn('KV put failed:', key, err instanceof Error ? err.message : String(err));
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

export async function invalidatePrefix(kv: KVNamespace, prefix: string): Promise<void> {
  try {
    const list = await kv.list({ prefix });
    if (!list.keys?.length) return;
    await Promise.all(list.keys.map((k) => kv.delete(k.name)));
  } catch (err) {
    console.warn('KV invalidate failed:', prefix, err instanceof Error ? err.message : String(err));
  }
}

export function rankingsCacheKey(contestId: string, variant: string): string {
  return `rankings:${contestId}:${variant}`;
}

export function rankingsBundlePrefix(contestId: string): string {
  return `rankings:${contestId}:`;
}

