import { describe, expect, it } from 'vitest';
import {
  applyOptimisticAttempts,
  applySnapshot,
  attemptKeyFromAttempt,
  buildAttemptKey,
  captureAttemptState,
  isQueuedReceipt,
  removeAttemptById,
  restoreAttemptSnapshot,
  runAttemptMutation,
  setPendingFlag,
  shouldRefreshAfterAttemptMutation,
} from '../attempt-commands';
import type { Attempt, CurrentAttempt, CurrentAttemptBundle } from '$lib/types';

function attempt(overrides: Partial<Attempt> = {}): Attempt {
  return {
    id: 'attempt-1',
    registrationId: 'reg-1',
    liftType: 'Squat',
    attemptNumber: 1,
    weight: 100,
    status: 'Pending',
    createdAt: '2024-03-01T10:00:00Z',
    updatedAt: '2024-03-01T10:00:00Z',
    ...overrides,
  };
}

function current(overrides: Partial<CurrentAttempt> = {}): CurrentAttempt {
  return {
    id: 'attempt-1',
    registrationId: 'reg-1',
    competitorName: 'Anna Nowak',
    liftType: 'Squat',
    attemptNumber: 1,
    weight: 100,
    status: 'Pending',
    competitionOrder: 1,
    updatedAt: '2024-03-01T10:00:00Z',
    ...overrides,
  };
}

describe('restoreAttemptSnapshot', () => {
  it('restores an originally null current attempt instead of keeping the failed selection', () => {
    const snapshot = captureAttemptState([attempt()], null);

    // The optimistic "set current attempt" step selects an attempt that was not selected before.
    const optimistic = applyOptimisticAttempts(snapshot, [attempt()]);
    const selected: { attempts: Attempt[]; current: CurrentAttempt | null } = {
      attempts: optimistic.attempts,
      current: current({ id: 'attempt-1', weight: 250 }),
    };
    expect(selected.current).not.toBeNull();

    const restored = restoreAttemptSnapshot(snapshot);
    expect(restored.current).toBeNull();
    expect(restored.attempts).toHaveLength(1);
  });

  it('restores a non-null current attempt and the attempt list exactly', () => {
    const snapshot = captureAttemptState([attempt()], current({ weight: 100 }));
    const optimistic = applyOptimisticAttempts(snapshot, [
      attempt({ weight: 250 }),
      attempt({ id: 'attempt-2', attemptNumber: 2, weight: 120 }),
    ]);
    expect(optimistic.attempts).toHaveLength(2);
    expect(optimistic.current?.weight).toBe(250);

    const restored = restoreAttemptSnapshot(snapshot);
    expect(restored.attempts).toEqual([attempt()]);
    expect(restored.current).toEqual(current({ weight: 100 }));
  });

  it('returns a copy, so later mutations cannot modify the snapshot', () => {
    const snapshot = captureAttemptState([attempt()], current());
    const restored = restoreAttemptSnapshot(snapshot);
    restored.attempts[0]!.weight = 999;
    restored.current!.weight = 999;
    expect(snapshot.attempts[0]?.weight).toBe(100);
    expect(snapshot.current?.weight).toBe(100);
  });
});

describe('applyOptimisticAttempts', () => {
  it('updates an existing attempt in place and appends new ones', () => {
    const state = captureAttemptState([attempt()], null);
    const next = applyOptimisticAttempts(state, [
      attempt({ weight: 105 }),
      attempt({ id: 'attempt-2', attemptNumber: 2 }),
    ]);
    expect(next.attempts.map((entry) => entry.id)).toEqual(['attempt-1', 'attempt-2']);
    expect(next.attempts[0]?.weight).toBe(105);
  });

  it('keeps the current attempt in sync when it is the edited one', () => {
    const state = captureAttemptState([attempt()], current());
    const next = applyOptimisticAttempts(state, [attempt({ status: 'Successful' })]);
    expect(next.current?.status).toBe('Successful');
  });
});

describe('runAttemptMutation', () => {
  it('puts the current attempt back to null when setting it fails', async () => {
    const snapshot = captureAttemptState([attempt()], null);

    const result = await runAttemptMutation({
      snapshot,
      optimistically: (state) => ({
        attempts: state.attempts,
        current: current({ id: 'attempt-1', weight: 250 }),
      }),
      action: async () => {
        throw new Error('rejected');
      },
    });

    expect(result.state.current).toBeNull();
    expect(result.state.attempts).toEqual([attempt()]);
  });

  it('puts the previously selected attempt back when setting another one fails', async () => {
    const snapshot = captureAttemptState(
      [attempt(), attempt({ id: 'attempt-2', attemptNumber: 2, weight: 120 })],
      current({ id: 'attempt-1', weight: 100 }),
    );

    const result = await runAttemptMutation({
      snapshot,
      optimistically: (state) => ({
        attempts: state.attempts,
        current: current({ id: 'attempt-2', attemptNumber: 2, weight: 120 }),
      }),
      action: async () => {
        throw new Error('rejected');
      },
    });

    expect(result.state.current?.id).toBe('attempt-1');
    expect(result.state.current?.weight).toBe(100);
  });

  it('keeps the optimistic row and skips the refresh when the mutation was queued', async () => {
    const snapshot = captureAttemptState([], null);
    const optimisticRow = attempt({ id: 'temp-1' });

    const result = await runAttemptMutation({
      snapshot,
      optimistically: (state) => applyOptimisticAttempts(state, [optimisticRow]),
      action: async () => ({ queued: true as const, data: null, error: null }),
    });

    expect(result.ok).toBe(true);
    expect(result.queued).toBe(true);
    expect(isQueuedReceipt(result.outcome)).toBe(true);
    expect(result.state.attempts).toEqual([optimisticRow]);
    // The refresh triggered by an applied mutation would wipe the queued row.
    expect(shouldRefreshAfterAttemptMutation(result)).toBe(false);
  });

  it('renders the optimistic state before the action settles', async () => {
    const snapshot = captureAttemptState([], null);
    const seen: string[][] = [];

    const result = await runAttemptMutation({
      snapshot,
      optimistically: (state) => applyOptimisticAttempts(state, [attempt({ id: 'temp-1' })]),
      onOptimistic: (state) => seen.push(state.attempts.map((entry) => entry.id)),
      action: async () => {
        expect(seen).toEqual([['temp-1']]);
        return { queued: false as const, data: null, error: null };
      },
    });

    expect(result.state.attempts.map((entry) => entry.id)).toEqual(['temp-1']);
  });

  it('reports applied mutations as refresh-worthy and marks them not queued', async () => {
    const snapshot = captureAttemptState([], null);
    const result = await runAttemptMutation({
      snapshot,
      optimistically: (state) => applyOptimisticAttempts(state, [attempt({ id: 'temp-1' })]),
      action: async () => ({ queued: false as const, data: { id: 'server-1' }, error: null }),
    });

    expect(result.ok).toBe(true);
    expect(result.queued).toBe(false);
    expect(isQueuedReceipt(result.outcome)).toBe(false);
    expect(shouldRefreshAfterAttemptMutation(result)).toBe(true);
  });

  it('rolls back to the exact pre-mutation state when the action fails', async () => {
    const snapshot = captureAttemptState([attempt()], null);
    const result = await runAttemptMutation({
      snapshot,
      optimistically: (state) => applyOptimisticAttempts(state, [attempt({ id: 'attempt-2', attemptNumber: 2 })]),
      action: async () => {
        throw new Error('offline');
      },
    });

    expect(result.ok).toBe(false);
    expect(result.error).toBeInstanceOf(Error);
    expect(result.state.attempts).toEqual([attempt()]);
    expect(result.state.current).toBeNull();
    expect(shouldRefreshAfterAttemptMutation(result)).toBe(false);
  });
});

describe('applySnapshot', () => {
  const toCurrent = (bundle: CurrentAttemptBundle): CurrentAttempt =>
    current({ id: bundle.attempt.id, weight: bundle.attempt.weight });

  it('replaces attempts and the current attempt with the snapshot', () => {
    const state = applySnapshot(
      {
        attempts: [attempt({ id: 'attempt-9', attemptNumber: 3 })],
        currentAttempt: {
          attempt: attempt({ id: 'attempt-9', attemptNumber: 3, weight: 150 }),
        } as CurrentAttemptBundle,
      },
      toCurrent,
    );

    expect(state.attempts.map((entry) => entry.id)).toEqual(['attempt-9']);
    expect(state.current?.id).toBe('attempt-9');
    expect(state.current?.weight).toBe(150);
  });

  it('clears the current attempt when the snapshot has none and drops deleted attempts', () => {
    const state = applySnapshot({ attempts: [], currentAttempt: null }, toCurrent);
    expect(state.attempts).toEqual([]);
    expect(state.current).toBeNull();
  });
});

describe('keys, pending flags and removal', () => {
  it('builds stable attempt keys', () => {
    expect(buildAttemptKey('reg-1', 'Bench', 2)).toBe('reg-1:Bench:2');
    expect(attemptKeyFromAttempt(attempt())).toBe('reg-1:Squat:1');
  });

  it('sets and clears a single pending flag', () => {
    const flagged = setPendingFlag({}, 'attempt-1', true);
    expect(flagged).toEqual({ 'attempt-1': true });
    expect(setPendingFlag(flagged, 'attempt-1', false)).toEqual({});
  });

  it('removes an attempt by id only when present', () => {
    const attempts = [attempt(), attempt({ id: 'attempt-2', attemptNumber: 2 })];
    expect(removeAttemptById(attempts, 'attempt-2').map((entry) => entry.id)).toEqual(['attempt-1']);
    expect(removeAttemptById(attempts, 'missing')).toBe(attempts);
  });
});
