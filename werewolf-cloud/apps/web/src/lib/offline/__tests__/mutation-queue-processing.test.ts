import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { get } from 'svelte/store';
import { openDB } from 'idb';

const toastInfo = vi.fn();
const toastSuccess = vi.fn();
const toastError = vi.fn();
const toastWarning = vi.fn();

vi.mock('$lib/ui/toast', () => ({
  toast: {
    info: toastInfo,
    success: toastSuccess,
    error: toastError,
    warning: toastWarning,
    subscribe: () => () => undefined,
    clear: vi.fn(),
    remove: vi.fn(),
    push: vi.fn(),
  },
}));

const translateSpy = vi.fn((key: string, params?: { values?: Record<string, unknown> }) =>
  params?.values ? `${key}:${JSON.stringify(params.values)}` : key,
);

vi.mock('svelte-i18n', async () => {
  const { writable } = await import('svelte/store');
  const store = writable(translateSpy);
  return { _: store };
});

const DB_NAME = 'werewolf_mutations';
const DB_VERSION = 1;

interface StoredMutation {
  id: string;
  createdAt: number;
  retryCount: number;
  status: 'pending' | 'in-flight' | 'failed';
  method: 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  endpoint: string;
  body: string | null;
  headers: Record<string, string>;
  lastError?: string | null;
}

const realSetTimeout = globalThis.setTimeout;

async function flushQueue(iterations = 10) {
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

async function seedMutation(record: StoredMutation) {
  const db = await openQueueDb();
  await db.put('mutations', record);
  db.close();
}

function queueableInput(endpoint: string, body: string | null = JSON.stringify({ value: 1 })) {
  return {
    method: 'PATCH' as const,
    endpoint,
    body,
    headers: { 'Content-Type': 'application/json' },
  };
}

let online = true;
const originalOnLineDescriptor = Object.getOwnPropertyDescriptor(window.navigator, 'onLine');

function setOnline(value: boolean) {
  online = value;
}

beforeEach(async () => {
  vi.resetModules();
  vi.restoreAllMocks();
  toastInfo.mockReset();
  toastSuccess.mockReset();
  toastError.mockReset();
  toastWarning.mockReset();
  translateSpy.mockClear();
  setOnline(true);
  Object.defineProperty(window.navigator, 'onLine', {
    configurable: true,
    get: () => online,
  });
  await resetDatabase();
});

afterEach(async () => {
  setOnline(false);
  await flushQueue(4);
  await resetDatabase();
  setOnline(true);
  if (originalOnLineDescriptor) {
    Object.defineProperty(window.navigator, 'onLine', originalOnLineDescriptor);
  } else {
    Object.defineProperty(window.navigator, 'onLine', {
      configurable: true,
      get: () => true,
    });
  }
});

describe('mutation queue processing', () => {
  it('delivers every queued mutation, not only the first one', async () => {
    const module = await import('../mutation-queue');
    await module.initializeMutationQueue();
    setOnline(false);

    await module.enqueueMutation(queueableInput('/registrations/r1'));
    await module.enqueueMutation(queueableInput('/attempts/a1/result'));
    await module.enqueueMutation(queueableInput('/competitors/c1'));

    expect(get(module.mutationQueueState).pending).toHaveLength(3);

    setOnline(true);
    const executor = vi.fn().mockResolvedValue({ data: null, error: null });
    module.registerMutationExecutor(executor);
    await flushQueue(12);

    expect(executor).toHaveBeenCalledTimes(3);
    const endpoints = executor.mock.calls.map(call => (call[0] as StoredMutation).endpoint).sort();
    expect(endpoints).toEqual(['/attempts/a1/result', '/competitors/c1', '/registrations/r1']);

    const state = get(module.mutationQueueState);
    expect(state.pending).toHaveLength(0);
    expect(state.inFlight).toHaveLength(0);
    expect(state.failed).toHaveLength(0);
    expect(await readMutations()).toHaveLength(0);
  });

  it('reschedules a network failure after the backoff delay and delivers it on retry', async () => {
    const module = await import('../mutation-queue');
    await module.initializeMutationQueue();
    setOnline(false);
    await module.enqueueMutation(queueableInput('/registrations/r2'));

    setOnline(true);
    const networkError = Object.assign(new Error('Failed to fetch'), { kind: 'network', status: 0 });
    const executor = vi
      .fn()
      .mockRejectedValueOnce(networkError)
      .mockResolvedValue({ data: null, error: null });

    const setTimeoutSpy = vi.spyOn(globalThis, 'setTimeout');

    module.registerMutationExecutor(executor);
    await flushQueue(12);

    expect(executor).toHaveBeenCalledTimes(1);

    const retryIndex = setTimeoutSpy.mock.calls.findIndex(entry => entry[1] === 2000);
    expect(retryIndex, 'a retry should be scheduled with the backoff delay').toBeGreaterThanOrEqual(0);
    const retryCallback = setTimeoutSpy.mock.calls[retryIndex]?.[0];
    const retryTimer = setTimeoutSpy.mock.results[retryIndex]?.value;
    if (retryTimer !== undefined) {
      clearTimeout(retryTimer as ReturnType<typeof setTimeout>);
    }

    const afterFailure = get(module.mutationQueueState);
    expect(afterFailure.pending).toHaveLength(1);
    expect(afterFailure.inFlight).toHaveLength(0);
    expect(afterFailure.failed).toHaveLength(0);
    const [pendingRow] = await readMutations();
    expect(pendingRow?.retryCount).toBe(1);

    retryCallback?.();
    await flushQueue(12);

    expect(executor).toHaveBeenCalledTimes(2);
    expect(get(module.mutationQueueState).pending).toHaveLength(0);
    expect(await readMutations()).toHaveLength(0);
  });

  it('recovers mutations left in-flight by a reload', async () => {
    await seedMutation({
      id: 'stuck-mutation',
      createdAt: Date.now(),
      retryCount: 0,
      status: 'in-flight',
      method: 'PATCH',
      endpoint: '/registrations/r3',
      body: JSON.stringify({ bodyweight: 82.5 }),
      headers: { 'Content-Type': 'application/json' },
      lastError: null,
    });

    const module = await import('../mutation-queue');
    const executor = vi.fn().mockResolvedValue({ data: null, error: null });
    module.registerMutationExecutor(executor);
    await module.initializeMutationQueue();
    await flushQueue(12);

    expect(executor).toHaveBeenCalledTimes(1);
    const delivered = executor.mock.calls[0]?.[0] as StoredMutation | undefined;
    expect(delivered?.endpoint).toBe('/registrations/r3');

    const state = get(module.mutationQueueState);
    expect(state.inFlight).toHaveLength(0);
    expect(state.pending).toHaveLength(0);
    expect(state.failed).toHaveLength(0);
    expect(await readMutations()).toHaveLength(0);
  });
});
