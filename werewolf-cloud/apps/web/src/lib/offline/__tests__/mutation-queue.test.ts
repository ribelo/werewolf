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

const translateSpy = vi.fn((key: string, params?: { values?: Record<string, unknown> }) => {
  if (params?.values) {
    return `${key}:${JSON.stringify(params.values)}`;
  }
  return key;
});

vi.setConfig({ testTimeout: 15000, hookTimeout: 15000 });

async function flushQueue(iterations = 3) {
  for (let i = 0; i < iterations; i += 1) {
    await new Promise(resolve => setTimeout(resolve, 0));
  }
}

vi.mock('svelte-i18n', async () => {
  const { writable } = await import('svelte/store');
  const store = writable(translateSpy);
  return {
    _: store,
  };
});

const DB_NAME = 'werewolf_mutations';
const DB_VERSION = 1;

async function resetDatabase() {
  const db = await openDB(DB_NAME, DB_VERSION, {
    upgrade(database) {
      if (!database.objectStoreNames.contains('mutations')) {
        const store = database.createObjectStore('mutations', { keyPath: 'id' });
        store.createIndex('by-status', 'status');
        store.createIndex('by-status-createdAt', ['status', 'createdAt']);
      }
    },
  });
  await db.clear('mutations');
  db.close();
}

let online = true;
const originalOnLineDescriptor = Object.getOwnPropertyDescriptor(window.navigator, 'onLine');

beforeEach(async () => {
  vi.resetModules();
  toastInfo.mockReset();
  toastSuccess.mockReset();
  toastError.mockReset();
  toastWarning.mockReset();
  translateSpy.mockClear();
  online = true;
  Object.defineProperty(window.navigator, 'onLine', {
    configurable: true,
    get: () => online,
  });
  await resetDatabase();
});

afterEach(async () => {
  online = false;
  await flushQueue();
  await resetDatabase();
  online = true;
  if (originalOnLineDescriptor) {
    Object.defineProperty(window.navigator, 'onLine', originalOnLineDescriptor);
  } else {
    Object.defineProperty(window.navigator, 'onLine', {
      configurable: true,
      get: () => true,
    });
  }
});

function setOnline(value: boolean) {
  online = value;
}

describe('mutation queue', () => {
  it('queues a mutation when offline and updates state', async () => {
    const module = await import('../mutation-queue');
    const { initializeMutationQueue, enqueueMutation, mutationQueueState } = module;

    await initializeMutationQueue();
    setOnline(false);

    const result = await enqueueMutation({
      method: 'POST',
      endpoint: '/api/test',
      body: JSON.stringify({ foo: 'bar' }),
    headers: { 'content-type': 'application/json' },
  });

    expect(result.queued).toBe(true);
    await flushQueue();

    const state = get(mutationQueueState);
    expect(state.pending).toHaveLength(1);
    expect(state.failed).toHaveLength(0);
    expect(toastInfo).toHaveBeenCalledWith('queue.toast.saved');
  });

  it('replays queued mutations when back online', async () => {
    const module = await import('../mutation-queue');
    const { initializeMutationQueue, enqueueMutation, mutationQueueState, registerMutationExecutor } = module;

    await initializeMutationQueue();
    setOnline(false);

    await enqueueMutation({
      method: 'PATCH',
      endpoint: '/api/resource',
      body: JSON.stringify({ value: 1 }),
      headers: { 'content-type': 'application/json' },
    });

    setOnline(true);
    const executor = vi.fn().mockResolvedValue({ data: null, error: null });
    registerMutationExecutor(executor);

    await flushQueue(5);

    const state = get(mutationQueueState);
    expect(executor).toHaveBeenCalledTimes(1);
    expect(state.pending).toHaveLength(0);
    expect(state.failed).toHaveLength(0);
    expect(toastSuccess).toHaveBeenCalledWith('queue.toast.synced_single');
  });

  it('marks mutations as failed when executor returns fatal error', async () => {
    const module = await import('../mutation-queue');
    const { initializeMutationQueue, enqueueMutation, mutationQueueState, registerMutationExecutor } = module;

    await initializeMutationQueue();
    setOnline(false);

    await enqueueMutation({
      method: 'PUT',
      endpoint: '/api/fail',
      body: JSON.stringify({ data: true }),
      headers: { 'content-type': 'application/json' },
    });

    setOnline(true);
    registerMutationExecutor(async () => {
      throw { status: 500, message: 'fatal' };
    });

    await flushQueue(5);

    const state = get(mutationQueueState);
    expect(state.pending).toHaveLength(0);
    expect(state.failed).toHaveLength(1);
    expect(toastError).toHaveBeenCalledWith('queue.toast.failed:{"endpoint":"/api/fail"}');
  });

  it('retries failed mutations after manual retry', async () => {
    const module = await import('../mutation-queue');
    const {
      initializeMutationQueue,
      enqueueMutation,
      retryMutation,
      mutationQueueState,
      registerMutationExecutor,
    } = module;

    await initializeMutationQueue();
    setOnline(false);

    await enqueueMutation({
      method: 'DELETE',
      endpoint: '/api/retry',
      body: null,
      headers: {},
    });

    setOnline(true);
    const executor = vi
      .fn()
      .mockRejectedValueOnce({ status: 500, message: 'boom' })
      .mockResolvedValue({ data: null, error: null });

    registerMutationExecutor(executor);
    await flushQueue(5);

    const failedState = get(mutationQueueState);
    expect(failedState.failed).toHaveLength(1);
    const [failedEntry] = failedState.failed;
    if (!failedEntry) {
      throw new Error('expected a failed mutation entry');
    }
    const failedId = failedEntry.id;

    toastError.mockClear();
    toastSuccess.mockClear();

    await retryMutation(failedId);
    await flushQueue(5);

    const finalState = get(mutationQueueState);
    expect(finalState.failed).toHaveLength(0);
    expect(finalState.pending).toHaveLength(0);
    expect(executor).toHaveBeenCalledTimes(2);
    expect(toastSuccess).toHaveBeenCalledWith('queue.toast.synced_single');
  });
});
