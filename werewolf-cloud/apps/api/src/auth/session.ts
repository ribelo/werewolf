import type { WerewolfBindings } from '../env';

export const SESSION_COOKIE_NAME = 'werewolf_session';
export const SESSION_TTL_SECONDS = 14 * 24 * 60 * 60; // 14 days

const sessionKey = (id: string) => `session:${id}`;

export type SessionRecord = {
  id: string;
  createdAt: string;
  userAgentHash?: string;
  ipHash?: string;
};

export const generateSessionId = () => {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
};

export const hashValue = async (value: string) => {
  const encoder = new TextEncoder();
  const data = encoder.encode(value);
  const digest = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(digest));
  return hashArray.map((byte) => byte.toString(16).padStart(2, '0')).join('');
};

export const createSession = async (
  env: WerewolfBindings,
  metadata: { userAgent?: string; ip?: string },
): Promise<SessionRecord> => {
  const id = generateSessionId();

  const record: SessionRecord = {
    id,
    createdAt: new Date().toISOString(),
  };

  if (metadata.userAgent) {
    record.userAgentHash = await hashValue(metadata.userAgent);
  }

  if (metadata.ip) {
    record.ipHash = await hashValue(metadata.ip);
  }

  await env.KV.put(sessionKey(id), JSON.stringify(record), {
    expirationTtl: SESSION_TTL_SECONDS,
  });

  return record;
};

export const getSession = async (
  env: WerewolfBindings,
  id: string,
): Promise<SessionRecord | null> => {
  const value = await env.KV.get(sessionKey(id));
  if (!value) {
    return null;
  }

  try {
    const parsed = JSON.parse(value) as SessionRecord;
    return parsed;
  } catch {
    await env.KV.delete(sessionKey(id)).catch(() => {});
    return null;
  }
};

export const deleteSession = async (env: WerewolfBindings, id: string) => {
  await env.KV.delete(sessionKey(id));
};

export const refreshSession = async (
  env: WerewolfBindings,
  record: SessionRecord,
  metadata: { userAgent?: string; ip?: string },
) => {
  const updated: SessionRecord = {
    ...record,
  };

  if (metadata.userAgent) {
    const hash = await hashValue(metadata.userAgent);
    if (record.userAgentHash !== hash) {
      updated.userAgentHash = hash;
    }
  }

  if (metadata.ip) {
    const hash = await hashValue(metadata.ip);
    if (record.ipHash !== hash) {
      updated.ipHash = hash;
    }
  }

  await env.KV.put(sessionKey(record.id), JSON.stringify(updated), {
    expirationTtl: SESSION_TTL_SECONDS,
  });

  return updated;
};
