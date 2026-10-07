import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { ConnectionStatus, LiveEvent } from '$lib/types';

// Shared mocks reused across tests
const connectionSubscribe = vi.fn();
const eventsSubscribe = vi.fn();
const contestSubscribe = vi.fn();
const unsubscribeFn = vi.fn();

const toastMock = {
  success: vi.fn(),
  error: vi.fn(),
  warning: vi.fn(),
  info: vi.fn(),
};

// Register module mocks
vi.mock('$lib/realtime', () => ({
  realtimeClient: {
    connectionStatus: { subscribe: connectionSubscribe },
    events: { subscribe: eventsSubscribe },
  },
}));

vi.mock('$lib/ui/toast', () => ({ toast: toastMock }));

vi.mock('$lib/ui/contest-store', () => ({
  contestStore: { subscribe: contestSubscribe },
}));

describe('notification-bridge', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    connectionSubscribe.mockReturnValue(unsubscribeFn);
    eventsSubscribe.mockReturnValue(unsubscribeFn);
    contestSubscribe.mockReturnValue(unsubscribeFn);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  async function loadBridge() {
    return await import('$lib/ui/notification-bridge');
  }

  it('initialises subscriptions once and returns cleanup', async () => {
    const { initializeNotificationBridge } = await loadBridge();

    const cleanup = initializeNotificationBridge();

    expect(connectionSubscribe).toHaveBeenCalledTimes(1);
    expect(eventsSubscribe).toHaveBeenCalledTimes(1);
    expect(contestSubscribe).toHaveBeenCalledTimes(1);
    expect(typeof cleanup).toBe('function');

    cleanup();

    expect(unsubscribeFn).toHaveBeenCalledTimes(3);
  });

  it('is idempotent on repeated initialise calls', async () => {
    const { initializeNotificationBridge } = await loadBridge();

    const cleanupFirst = initializeNotificationBridge();
    const cleanupSecond = initializeNotificationBridge();

    expect(connectionSubscribe).toHaveBeenCalledTimes(1);
    expect(eventsSubscribe).toHaveBeenCalledTimes(1);
    expect(contestSubscribe).toHaveBeenCalledTimes(1);

    cleanupSecond();
    cleanupFirst();
  });

  it('emits toast notifications on connection status changes', async () => {
    let statusCallback: (status: ConnectionStatus) => void = () => {};
    connectionSubscribe.mockImplementation((cb) => {
      statusCallback = cb;
      return unsubscribeFn;
    });

    const { initializeNotificationBridge } = await loadBridge();
    const cleanup = initializeNotificationBridge();

    statusCallback('connected');
    expect(toastMock.success).toHaveBeenCalledWith('Real-time connection established', { duration: 3000 });

    statusCallback('offline');
    expect(toastMock.warning).toHaveBeenCalledWith('Real-time connection lost. Using polling fallback.', { duration: 5000 });

    cleanup();
  });

  it('handles attempt events for the active contest', async () => {
    let eventsCallback: (event: LiveEvent | null) => void = () => {};
    eventsSubscribe.mockImplementation((cb) => {
      eventsCallback = cb;
      return unsubscribeFn;
    });

    // Simulate contest subscription updating current contest id
    contestSubscribe.mockImplementation((cb) => {
      cb({ contest: { id: 'contest-1' } });
      return unsubscribeFn;
    });

    const { initializeNotificationBridge } = await loadBridge();
    const cleanup = initializeNotificationBridge();

    eventsCallback({
      type: 'attempt.upserted',
      contestId: 'contest-1',
      timestamp: new Date().toISOString(),
      data: { id: 'attempt-1', liftType: 'Squat', attemptNumber: 1, weight: 150, status: 'Successful' },
    });

    expect(toastMock.success).toHaveBeenCalledWith('Squat 1: 150kg - SUCCESS!', { duration: 4000 });

    toastMock.info.mockClear();
    eventsCallback({
      type: 'attempt.currentCleared',
      contestId: 'contest-1',
      timestamp: new Date().toISOString(),
      data: null,
    });

    expect(toastMock.info).toHaveBeenCalledWith('Current attempt cleared', { duration: 3000 });

    // Event for different contest should be ignored
    toastMock.success.mockClear();
    eventsCallback({
      type: 'attempt.upserted',
      contestId: 'contest-2',
      timestamp: new Date().toISOString(),
      data: { id: 'attempt-2', liftType: 'Bench Press', attemptNumber: 1, weight: 100, status: 'Successful' },
    });

    expect(toastMock.success).not.toHaveBeenCalled();

    cleanup();
  });

  it('notifies for a current attempt bundle event', async () => {
    let eventsCallback: (event: LiveEvent | null) => void = () => {};
    eventsSubscribe.mockImplementation((cb) => {
      eventsCallback = cb;
      return unsubscribeFn;
    });

    contestSubscribe.mockImplementation((cb) => {
      cb({ contest: { id: 'contest-1' } });
      return unsubscribeFn;
    });

    const { initializeNotificationBridge } = await loadBridge();
    const cleanup = initializeNotificationBridge();

    const bundle = {
      contest: {
        id: 'contest-1', name: 'Cup', date: '2026-01-01', location: 'Gym',
        discipline: 'powerlifting', status: 'live',
      },
      attempt: {
        id: 'attempt-1', registrationId: 'registration-1', liftType: 'Squat',
        attemptNumber: 1, weight: 100, status: 'Pending',
        createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
      },
      registration: {
        id: 'registration-1', contestId: 'contest-1', bodyweight: 80,
        weightClassId: null, lifts: ['Squat'],
      },
      competitor: {
        id: 'competitor-1', firstName: 'Jane', lastName: 'Doe',
        birthDate: '1990-01-01', gender: 'F',
      },
      attemptsByLift: { Squat: [], Bench: [], Deadlift: [] },
      platePlan: {
        plates: [], exact: true, total: 100, increment: 2.5, targetWeight: 100,
        barWeight: 20, weightToLoad: 80, clampWeight: 0,
      },
      highlight: { liftType: 'Squat', attemptNumber: 1 },
    };

    eventsCallback({
      type: 'attempt.currentSet',
      contestId: 'contest-1',
      timestamp: new Date().toISOString(),
      data: bundle,
    });

    expect(toastMock.info).toHaveBeenCalledWith('Next: Doe Jane - Squat 1 (100kg)', { duration: 5000 });

    cleanup();
  });

  it('stays silent for snapshot and deletion events', async () => {
    let eventsCallback: (event: LiveEvent | null) => void = () => {};
    eventsSubscribe.mockImplementation((cb) => {
      eventsCallback = cb;
      return unsubscribeFn;
    });

    contestSubscribe.mockImplementation((cb) => {
      cb({ contest: { id: 'contest-1' } });
      return unsubscribeFn;
    });

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const { initializeNotificationBridge } = await loadBridge();
    const cleanup = initializeNotificationBridge();

    eventsCallback({
      type: 'snapshot',
      contestId: 'contest-1',
      timestamp: new Date().toISOString(),
      data: {
        contestId: 'contest-1',
        attempts: [],
        currentAttempt: null,
        fetchedAt: new Date().toISOString(),
      },
    });

    eventsCallback({
      type: 'attempt.deleted',
      contestId: 'contest-1',
      timestamp: new Date().toISOString(),
      data: { attemptId: 'attempt-1' },
    });

    expect(toastMock.success).not.toHaveBeenCalled();
    expect(toastMock.info).not.toHaveBeenCalled();
    expect(toastMock.warning).not.toHaveBeenCalled();
    expect(toastMock.error).not.toHaveBeenCalled();
    expect(warnSpy).not.toHaveBeenCalled();

    warnSpy.mockRestore();
    cleanup();
  });
});
