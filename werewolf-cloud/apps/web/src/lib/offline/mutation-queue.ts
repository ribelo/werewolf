import { writable, derived, get as getStore } from 'svelte/store';
import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { ApiResponse } from '$lib/api';
import { toast } from '$lib/ui/toast';
import { _ } from 'svelte-i18n';

const hasWindow = typeof window !== 'undefined';
const supportsIndexedDb = hasWindow && typeof indexedDB !== 'undefined';

export type HttpMutationMethod = 'POST' | 'PUT' | 'PATCH' | 'DELETE';
export type MutationStatus = 'pending' | 'in-flight' | 'failed';

export interface MutationInput {
  method: HttpMutationMethod;
  endpoint: string;
  body: string | null;
  headers: Record<string, string>;
}

export interface QueuedMutation extends MutationInput {
  id: string;
  createdAt: number;
  retryCount: number;
  status: MutationStatus;
  lastError?: string | null;
}

interface MutationQueueDB extends DBSchema {
  mutations: {
    key: string;
    value: QueuedMutation;
    indexes: {
      'by-status': MutationStatus;
      'by-status-createdAt': [MutationStatus, number];
    };
  };
}

type MutationExecutor = (mutation: QueuedMutation) => Promise<ApiResponse<unknown>>;

const DB_NAME = 'werewolf_mutations';
const DB_VERSION = 1;

const queueState = writable<{ pending: QueuedMutation[]; failed: QueuedMutation[]; inFlight: QueuedMutation[] }>({
  pending: [],
  failed: [],
  inFlight: [],
});

export const queueCounts = derived(queueState, state => {
  const pending = state.pending.length;
  const failed = state.failed.length;
  const inFlight = state.inFlight.length;
  return {
    pending,
    failed,
    inFlight,
    total: pending + failed,
  };
});

export const pendingCount = derived(queueCounts, state => state.pending);
export const failedMutations = derived(queueState, state => state.failed);

let dbPromise: Promise<IDBPDatabase<MutationQueueDB>> | null = null;
let executor: MutationExecutor | null = null;
let initialized = false;
let processing = false;
let processTimer: ReturnType<typeof setTimeout> | null = null;

async function getDB(): Promise<IDBPDatabase<MutationQueueDB>> {
  if (!supportsIndexedDb) {
    throw new Error('IndexedDB not supported');
  }
  if (!dbPromise) {
    dbPromise = openDB<MutationQueueDB>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains('mutations')) {
          const store = db.createObjectStore('mutations', { keyPath: 'id' });
          store.createIndex('by-status', 'status');
          store.createIndex('by-status-createdAt', ['status', 'createdAt']);
        }
      },
    });
  }
  return dbPromise;
}

function translate(key: string, values?: Record<string, string | number>): string {
  const translateFn = getStore(_);
  return translateFn(key, values ? { values } : undefined);
}

async function refreshState() {
  if (!initialized || !supportsIndexedDb) {
    return;
  }
  const db = await getDB();
  const all = await db.getAll('mutations');
  queueState.set({
    pending: all.filter(m => m.status === 'pending').sort((a, b) => a.createdAt - b.createdAt),
    failed: all.filter(m => m.status === 'failed').sort((a, b) => b.createdAt - a.createdAt),
    inFlight: all.filter(m => m.status === 'in-flight'),
  });
}

async function setMutationStatus(id: string, status: MutationStatus, updates: Partial<QueuedMutation> = {}) {
  if (!supportsIndexedDb) return;
  const db = await getDB();
  const existing = await db.get('mutations', id);
  if (!existing) return;
  await db.put('mutations', { ...existing, status, ...updates });
  await refreshState();
}

async function removeMutation(id: string) {
  if (!supportsIndexedDb) return;
  const db = await getDB();
  await db.delete('mutations', id);
  await refreshState();
}

function scheduleProcessing(delay = 0) {
  if (!hasWindow || !supportsIndexedDb || processing) return;
  if (processTimer) {
    clearTimeout(processTimer);
  }
  processTimer = setTimeout(() => {
    void processQueue();
  }, delay);
}

function isNetworkError(error: unknown): boolean {
  if (typeof error === 'object' && error !== null && 'status' in error) {
    const status = (error as { status?: unknown }).status;
    return typeof status === 'number' && status === 0;
  }
  return false;
}

async function processQueue() {
  if (!hasWindow || !supportsIndexedDb || processing) return;
  if (!executor) return;
  if (!navigator.onLine) return;

  processing = true;
  let processedInRun = 0;

  try {
    const db = await getDB();
    const index = db.transaction('mutations').store.index('by-status-createdAt');
    let cursor = await index.openCursor(IDBKeyRange.bound(['pending', -Infinity], ['pending', Infinity]));
    while (cursor) {
      const mutation = cursor.value;
      await setMutationStatus(mutation.id, 'in-flight');
      try {
        await executor(mutation);
        await removeMutation(mutation.id);
        processedInRun += 1;
      } catch (error) {
        if (isNetworkError(error) || !navigator.onLine) {
          const retry = mutation.retryCount + 1;
          const backoff = Math.min(120000, 1000 * 2 ** retry);
          await setMutationStatus(mutation.id, 'pending', { retryCount: retry, lastError: (error as Error)?.message ?? null });
          if (processedInRun > 0) {
            toast.success(
              translate(
                processedInRun === 1 ? 'queue.toast.synced_single' : 'queue.toast.synced_multi',
                processedInRun > 1 ? { count: processedInRun } : undefined
              )
            );
            processedInRun = 0;
          }
          scheduleProcessing(backoff);
          return;
        }
        await setMutationStatus(mutation.id, 'failed', { lastError: (error as Error)?.message ?? null });
        toast.error(translate('queue.toast.failed', { endpoint: mutation.endpoint }));
      }
      try {
        cursor = await cursor.continue();
      } catch {
        cursor = null;
      }
    }
  } finally {
    processing = false;
    if (processedInRun > 0) {
      toast.success(
        translate(
          processedInRun === 1 ? 'queue.toast.synced_single' : 'queue.toast.synced_multi',
          processedInRun > 1 ? { count: processedInRun } : undefined
        )
      );
    }
  }
}

async function loadExisting() {
  if (!supportsIndexedDb) return;
  await refreshState();
  scheduleProcessing();
}

function handleOnline() {
  scheduleProcessing();
}

export async function initializeMutationQueue() {
  if (!hasWindow || initialized) return;
  if (!supportsIndexedDb) {
    initialized = true;
    return;
  }
  initialized = true;
  await getDB();
  await loadExisting();
  window.addEventListener('online', handleOnline);
}

export function registerMutationExecutor(fn: MutationExecutor) {
  executor = fn;
  scheduleProcessing();
}

export async function enqueueMutation<T>(input: MutationInput): Promise<ApiResponse<T>> {
  if (!hasWindow) {
    throw new Error('Mutation queue is not available in this environment');
  }

  if (!supportsIndexedDb) {
    toast.warning(translate('queue.toast.unsupported'));
    return {
      data: undefined as T,
      error: null,
      requestId: crypto.randomUUID(),
      queued: true,
    };
  }

  await initializeMutationQueue();
  const mutation: QueuedMutation = {
    id: crypto.randomUUID(),
    createdAt: Date.now(),
    status: 'pending',
    retryCount: 0,
    lastError: null,
    ...input,
  };

  const db = await getDB();
  await db.put('mutations', mutation);
  await refreshState();
  toast.info(translate('queue.toast.saved'));
  scheduleProcessing();
  return {
    data: undefined as T,
    error: null,
    requestId: crypto.randomUUID(),
    queued: true,
  };
}

export async function retryMutation(id: string) {
  if (!supportsIndexedDb) return;
  await setMutationStatus(id, 'pending', { lastError: null });
  scheduleProcessing();
}

export async function discardMutation(id: string) {
  if (!supportsIndexedDb) {
    toast.info(translate('queue.toast.discarded'));
    return;
  }
  await removeMutation(id);
  toast.info(translate('queue.toast.discarded'));
}

export const mutationQueueState = queueState;
