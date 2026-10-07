import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { openDB } from 'idb';
import { apiClient, ApiError } from '$lib/api';

vi.mock('$lib/ui/toast', () => ({
  toast: {
    info: vi.fn(),
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
    subscribe: () => () => undefined,
    clear: vi.fn(),
    remove: vi.fn(),
    push: vi.fn(),
  },
}));

vi.mock('svelte-i18n', async () => {
  const { writable } = await import('svelte/store');
  const translate = (key: string) => key;
  return { _: writable(translate), t: writable(translate) };
});

const DB_NAME = 'werewolf_mutations';
const DB_VERSION = 1;

interface StoredMutation {
  id: string;
  status: 'pending' | 'in-flight' | 'failed';
  method: string;
  endpoint: string;
  body: string | null;
  headers: Record<string, string>;
}

const realSetTimeout = globalThis.setTimeout;
let online = true;

async function flushQueue(iterations = 6) {
  for (let i = 0; i < iterations; i += 1) {
    await new Promise(resolve => realSetTimeout(resolve, 0));
  }
}

function openQueueDb() {
  return openDB(DB_NAME, DB_VERSION, {
    upgrade(database) {
      if (!database.objectStoreNames.contains('mutations')) {
        const store = database.createObjectStore('mutations', { keyPath: 'id' });
        store.createIndex('by-status', 'status');
        store.createIndex('by-status-createdAt', ['status', 'createdAt']);
      }
    },
  });
}

async function resetDatabase() {
  const db = await openQueueDb();
  await db.clear('mutations');
  db.close();
}

async function readMutations(): Promise<StoredMutation[]> {
  const db = await openQueueDb();
  const all = (await db.getAll('mutations')) as StoredMutation[];
  db.close();
  return all;
}

function setOnline(value: boolean) {
  online = value;
  Object.defineProperty(window.navigator, 'onLine', {
    configurable: true,
    get: () => online,
  });
}

function stubFetch(handler: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>) {
  const spy = vi.fn(handler);
  vi.stubGlobal('fetch', spy);
  return spy;
}

function jsonResponse(payload: unknown, status = 200, statusText = 'OK') {
  return new Response(JSON.stringify(payload), {
    status,
    statusText,
    headers: { 'Content-Type': 'application/json' },
  });
}

type MutationMethod = 'POST' | 'PUT' | 'PATCH' | 'DELETE';

function callMutation(method: MutationMethod, endpoint: string, body?: unknown) {
  switch (method) {
    case 'POST':
      return apiClient.post(endpoint, body);
    case 'PUT':
      return apiClient.put(endpoint, body);
    case 'PATCH':
      return apiClient.patch(endpoint, body);
    case 'DELETE':
      return apiClient.delete(endpoint);
  }
}

beforeEach(async () => {
  setOnline(true);
  stubFetch(() => Promise.reject(new TypeError('Failed to fetch')));
  await resetDatabase();
});

afterEach(async () => {
  setOnline(false);
  await flushQueue(4);
  await resetDatabase();
  vi.unstubAllGlobals();
});

describe('api mutation queueing', () => {
  it('refuses to queue auth, settings, backup and reset mutations while offline', async () => {
    setOnline(false);
    const fetchSpy = stubFetch(() => Promise.reject(new TypeError('Failed to fetch')));

    const nonQueueable: Array<[MutationMethod, string]> = [
      ['POST', '/auth/login'],
      ['POST', '/auth/logout'],
      ['POST', '/system/database/reset'],
      ['POST', '/system/backups/b1/restore'],
      ['POST', '/system/backups/import'],
      ['DELETE', '/contests/c1'],
      ['PATCH', '/settings/scoring'],
      ['PATCH', '/contests/c1/platesets/20'],
    ];

    for (const [method, endpoint] of nonQueueable) {
      await expect(callMutation(method, endpoint, { value: 1 })).rejects.toMatchObject({
        name: 'ApiError',
        kind: 'offline',
        status: 0,
      });
    }

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(await readMutations()).toHaveLength(0);
  });

  it('never stores login credentials in the mutation queue', async () => {
    setOnline(false);
    await expect(apiClient.post('/auth/login', { password: 'super-secret' })).rejects.toThrow();
    expect(JSON.stringify(await readMutations())).not.toContain('super-secret');
  });

  it('queues allowlisted meet-day edits while offline and returns a queued receipt', async () => {
    setOnline(false);
    const allowlisted: Array<[MutationMethod, string]> = [
      ['POST', '/contests/c1/registrations/r1/attempts'],
      ['PATCH', '/attempts/a1/result'],
      ['PATCH', '/registrations/r1'],
      ['PATCH', '/registrations/r1/labels'],
      ['POST', '/contests/c1/registrations/bulk-flight'],
      ['PATCH', '/competitors/p1'],
    ];

    for (const [method, endpoint] of allowlisted) {
      const outcome = await callMutation(method, endpoint, { value: 1 });
      if (!outcome.queued) {
        throw new Error(`expected ${method} ${endpoint} to be queued`);
      }
      expect(outcome.data).toBeNull();
      expect(outcome.error).toBeNull();
      expect(outcome.requestId).toBeNull();
      expect(typeof outcome.mutationId).toBe('string');
    }

    const rows = await readMutations();
    expect(rows.map(row => row.endpoint).sort()).toEqual(allowlisted.map(([, e]) => e).sort());
    expect(rows.every(row => row.status === 'pending')).toBe(true);
    expect(rows[0]?.body).toBe(JSON.stringify({ value: 1 }));
    expect(rows[0]?.headers['content-type']).toBe('application/json');
  });

  it('queues an allowlisted mutation when the transport fails while online', async () => {
    stubFetch(() => Promise.reject(new TypeError('Failed to fetch')));

    const outcome = await apiClient.patch('/registrations/r1', { bodyweight: 82.5 });

    if (!outcome.queued) {
      throw new Error('expected the mutation to be queued');
    }
    expect(await readMutations()).toHaveLength(1);
  });

  it('reports transport failures for endpoints that must not be queued', async () => {
    stubFetch(() => Promise.reject(new TypeError('Failed to fetch')));

    await expect(apiClient.post('/auth/login', { password: 'x' })).rejects.toMatchObject({
      name: 'ApiError',
      kind: 'offline',
      status: 0,
    });
    expect(await readMutations()).toHaveLength(0);
  });

  it('preserves the server error envelope for HTTP errors', async () => {
    stubFetch(() =>
      Promise.resolve(
        jsonResponse(
          { data: null, error: 'Bodyweight must be positive', requestId: 'req-42' },
          400,
          'Bad Request',
        ),
      ),
    );

    try {
      await apiClient.patch('/registrations/r1', { bodyweight: -1 });
      throw new Error('expected the request to reject');
    } catch (error) {
      expect(error).toBeInstanceOf(ApiError);
      const apiError = error as ApiError;
      expect(apiError.message).toBe('Bodyweight must be positive');
      expect(apiError.kind).toBe('http');
      expect(apiError.status).toBe(400);
      expect(apiError.requestId).toBe('req-42');
    }

    expect(await readMutations()).toHaveLength(0);
  });

  it('falls back to the HTTP status when an error body is not an envelope', async () => {
    stubFetch(() =>
      Promise.resolve(new Response('<html>boom</html>', { status: 502, statusText: 'Bad Gateway' })),
    );

    await expect(apiClient.patch('/attempts/a1/result', { status: 'good' })).rejects.toMatchObject({
      kind: 'http',
      status: 502,
      message: 'HTTP 502: Bad Gateway',
    });
    expect(await readMutations()).toHaveLength(0);
  });

  it('never queues a mutation whose success response cannot be decoded', async () => {
    stubFetch(() => Promise.resolve(new Response('{not json', { status: 200, statusText: 'OK' })));

    await expect(apiClient.patch('/attempts/a1/result', { status: 'good' })).rejects.toMatchObject({
      kind: 'decode',
      status: 200,
    });
    expect(await readMutations()).toHaveLength(0);
  });

  it('returns the decoded envelope for successful mutations', async () => {
    stubFetch(() =>
      Promise.resolve(jsonResponse({ data: { id: 'a1' }, error: null, requestId: 'req-7' })),
    );

    const outcome = await apiClient.patch<{ id: string }>('/attempts/a1/result', { status: 'good' });

    expect(outcome.queued).toBeUndefined();
    expect(outcome.data).toEqual({ id: 'a1' });
    expect(outcome.error).toBeNull();
    expect(outcome.requestId).toBe('req-7');
  });
});
