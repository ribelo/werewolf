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

/**
 * Receipt for a mutation that was stored locally instead of being sent.
 * Nothing has reached the server yet, so there is no response data and no
 * server request id - only the id of the queued entry.
 */
export interface QueuedMutationReceipt {
  queued: true;
  data: null;
  error: null;
  requestId: null;
  mutationId: string;
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
const MAX_RETRY_DELAY_MS = 120000;

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
let rerunRequested = false;
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

/**
 * Applies one update to a record inside a single short transaction, so the
 * store is never left with a half-written entry. Returns the stored record, or
 * null when the record no longer exists.
 */
async function updateMutationRecord(
  id: string,
  update: (mutation: QueuedMutation) => QueuedMutation | null,
): Promise<QueuedMutation | null> {
  if (!supportsIndexedDb) return null;
  const db = await getDB();
  const tx = db.transaction('mutations', 'readwrite');
  const store = tx.objectStore('mutations');
  const existing = await store.get(id);
  let next: QueuedMutation | null = null;
  if (existing) {
    next = update(existing);
    if (next) {
      await store.put(next);
    } else {
      await store.delete(id);
    }
  }
  await tx.done;
  await refreshState();
  return next;
}

async function setMutationStatus(id: string, status: MutationStatus, updates: Partial<QueuedMutation> = {}) {
  await updateMutationRecord(id, existing => ({ ...existing, status, ...updates }));
}

async function removeMutation(id: string) {
  await updateMutationRecord(id, () => null);
}

async function markInFlight(id: string): Promise<boolean> {
  const updated = await updateMutationRecord(id, existing => ({ ...existing, status: 'in-flight' }));
  return updated !== null;
}

/**
 * A reload can interrupt a run between the in-flight write and the response;
 * those rows would otherwise stay invisible to processQueue forever.
 */
async function recoverInterruptedMutations() {
  if (!supportsIndexedDb) return;
  const db = await getDB();
  const tx = db.transaction('mutations', 'readwrite');
  const store = tx.objectStore('mutations');
  const interrupted = await store.index('by-status').getAll('in-flight');
  for (const mutation of interrupted) {
    await store.put({ ...mutation, status: 'pending' });
  }
  await tx.done;
}

function scheduleProcessing(delay = 0) {
  if (!hasWindow || !supportsIndexedDb) return;
  if (processing) {
    rerunRequested = true;
    return;
  }
  if (processTimer) {
    clearTimeout(processTimer);
  }
  processTimer = setTimeout(() => {
    processTimer = null;
    void processQueue();
  }, delay);
}

function isNetworkError(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false;
  const candidate = error as { kind?: unknown; status?: unknown };
  if (candidate.kind === 'network') return true;
  return typeof candidate.status === 'number' && candidate.status === 0;
}

async function processQueue() {
  if (!hasWindow || !supportsIndexedDb || processing) return;
  if (!executor) return;
  if (!navigator.onLine) return;

  processing = true;
  let processedInRun = 0;
  let retryDelay: number | null = null;

  try {
    const db = await getDB();
    // Read the batch up front: a cursor cannot stay open across the network
    // calls below (the transaction expires and cursor.continue() throws).
    const batch = await db.getAllFromIndex(
      'mutations',
      'by-status-createdAt',
      IDBKeyRange.bound(['pending', -Infinity], ['pending', Infinity]),
    );

    for (const mutation of batch) {
      const claimed = await markInFlight(mutation.id);
      if (!claimed) continue;

      try {
        await executor(mutation);
        await removeMutation(mutation.id);
        processedInRun += 1;
      } catch (error) {
        if (isNetworkError(error) || !navigator.onLine) {
          const retryCount = mutation.retryCount + 1;
          retryDelay = Math.min(MAX_RETRY_DELAY_MS, 1000 * 2 ** retryCount);
          await setMutationStatus(mutation.id, 'pending', {
            retryCount,
            lastError: error instanceof Error ? error.message : null,
          });
          break;
        }
        await setMutationStatus(mutation.id, 'failed', {
          lastError: error instanceof Error ? error.message : null,
        });
        toast.error(translate('queue.toast.failed', { endpoint: mutation.endpoint }));
      }
    }
  } finally {
    processing = false;
    if (processedInRun > 0) {
      toast.success(
        translate(
          processedInRun === 1 ? 'queue.toast.synced_single' : 'queue.toast.synced_multi',
          processedInRun > 1 ? { count: processedInRun } : undefined,
        ),
      );
    }
    // The scheduler ignores calls made while processing, so a retry (or a run
    // requested by a mutation queued mid-flight) has to be scheduled here.
    if (retryDelay !== null) {
      rerunRequested = false;
      scheduleProcessing(retryDelay);
    } else if (rerunRequested) {
      rerunRequested = false;
      scheduleProcessing();
    }
  }
}

async function loadExisting() {
  if (!supportsIndexedDb) return;
  await recoverInterruptedMutations();
  await refreshState();
  scheduleProcessing();
}

function handleOnline() {
  scheduleProcessing();
}

export async function initializeMutationQueue() {
  if (!hasWindow || initialized) return;
  initialized = true;
  if (!supportsIndexedDb) {
    return;
  }
  await getDB();
  await loadExisting();
  window.addEventListener('online', handleOnline);
}

export function registerMutationExecutor(fn: MutationExecutor) {
  executor = fn;
  scheduleProcessing();
}

export async function enqueueMutation(input: MutationInput): Promise<QueuedMutationReceipt> {
  if (!hasWindow) {
    throw new Error('Mutation queue is not available in this environment');
  }

  if (!supportsIndexedDb) {
    throw new Error(translate('queue.error.unsupported'));
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
    queued: true,
    data: null,
    error: null,
    requestId: null,
    mutationId: mutation.id,
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
