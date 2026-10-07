import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Attempt, ConnectionStatus, LiveEvent, RealtimeSnapshot } from '$lib/types';

// Mock getApiBase at module scope before importing realtime
vi.mock('$lib/config', () => ({
  getApiBase: vi.fn(() => 'http://127.0.0.1:8787'),
}));

import { getApiBase } from '$lib/config';
import { realtimeClient } from '$lib/realtime';

const DEV_API_BASE = 'http://127.0.0.1:8787';

class MockWebSocket {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSING = 2;
  static readonly CLOSED = 3;
  static instances: MockWebSocket[] = [];

  readyState: number = MockWebSocket.CONNECTING;
  readonly sent: string[] = [];
  closed = false;

  onopen: ((event: Event) => void) | null = null;
  onmessage: ((event: MessageEvent) => void) | null = null;
  onclose: ((event: CloseEvent) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;

  constructor(readonly url: string) {
    MockWebSocket.instances.push(this);
  }

  send(data: string): void {
    this.sent.push(data);
  }

  close(): void {
    this.closed = true;
    this.readyState = MockWebSocket.CLOSED;
  }

  open(): void {
    this.readyState = MockWebSocket.OPEN;
    this.onopen?.(new Event('open'));
  }

  message(payload: unknown): void {
    this.onmessage?.({ data: JSON.stringify(payload) } as unknown as MessageEvent);
  }

  serverClose(code = 1006, reason = 'connection lost'): void {
    this.readyState = MockWebSocket.CLOSED;
    this.onclose?.({ code, reason } as unknown as CloseEvent);
  }

  fail(): void {
    this.onerror?.(new Event('error'));
  }
}

(globalThis as unknown as { WebSocket: typeof WebSocket }).WebSocket =
  MockWebSocket as unknown as typeof WebSocket;

interface FetchStubResponses {
  attempts?: Attempt[];
  current?: unknown;
}

function stubFetch(responses: FetchStubResponses = {}) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = typeof input === 'string'
      ? input
      : input instanceof URL
        ? input.toString()
        : input.url;
    const data = url.includes('/attempts/current')
      ? responses.current ?? null
      : responses.attempts ?? null;

    const body = { data, error: null, requestId: 'test-request' };
    const bodyText = JSON.stringify(body);

    // Shaped like a real Response: the api client may read text() or json().
    return {
      ok: true,
      status: 200,
      statusText: 'OK',
      headers: new Headers({ 'content-type': 'application/json' }),
      text: async () => bodyText,
      json: async () => body,
    } as unknown as Response;
  });

  globalThis.fetch = fetchMock as unknown as typeof fetch;
  return fetchMock;
}

function collectEvents(): LiveEvent[] {
  const events: LiveEvent[] = [];
  realtimeClient.events.subscribe((event) => {
    if (event) events.push(event);
  });
  return events;
}

function snapshotEvents(events: LiveEvent[]): LiveEvent<RealtimeSnapshot>[] {
  return events.filter((event): event is LiveEvent<RealtimeSnapshot> => event.type === 'snapshot');
}

function attemptFixture(id: string, overrides: Partial<Attempt> = {}): Attempt {
  return {
    id,
    registrationId: 'registration-1',
    liftType: 'Squat',
    attemptNumber: 1,
    weight: 100,
    status: 'Pending',
    createdAt: '2026-01-01T00:00:00.000Z',
    // Deliberately old: a snapshot must include attempts that were not updated recently.
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function lastSocket(): MockWebSocket {
  const socket = MockWebSocket.instances[MockWebSocket.instances.length - 1];
  if (!socket) throw new Error('No WebSocket instance was created');
  return socket;
}

async function flushAsyncWork(): Promise<void> {
  await vi.advanceTimersByTimeAsync(0);
  // Let the stubbed fetch/json promise chain settle.
  for (let tick = 0; tick < 20; tick++) {
    await Promise.resolve();
  }
}

describe('RealtimeClient', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    MockWebSocket.instances = [];
    vi.mocked(getApiBase).mockReturnValue(DEV_API_BASE);
    stubFetch();

    realtimeClient.disconnect();
    realtimeClient.__setEventForTests(null);
    realtimeClient.__setConnectionStatusForTests('offline');
  });

  afterEach(() => {
    realtimeClient.disconnect();
    vi.runOnlyPendingTimers();
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  describe('Connection Management', () => {
    it('derives the WebSocket URL from the configured API base', () => {
      realtimeClient.connect('test-contest-id');

      expect(MockWebSocket.instances.map(socket => socket.url)).toEqual([
        'ws://127.0.0.1:8787/ws/contests/test-contest-id',
      ]);
    });

    it('uses wss and the configured host for https API bases', () => {
      vi.mocked(getApiBase).mockReturnValue('https://api.example.com');

      realtimeClient.connect('test-contest-id');

      expect(MockWebSocket.instances.map(socket => socket.url)).toEqual([
        'wss://api.example.com/ws/contests/test-contest-id',
      ]);
    });

    it('keeps a base path and drops a trailing slash when building the URL', () => {
      vi.mocked(getApiBase).mockReturnValue('https://api.example.com/base/');

      realtimeClient.connect('test-contest-id');

      expect(MockWebSocket.instances.map(socket => socket.url)).toEqual([
        'wss://api.example.com/base/ws/contests/test-contest-id',
      ]);
    });

    it('connects once per contest and reports connecting then connected', async () => {
      const statuses: ConnectionStatus[] = [];
      realtimeClient.connectionStatus.subscribe(status => statuses.push(status));

      realtimeClient.connect('test-contest-id');
      realtimeClient.connect('test-contest-id');

      expect(MockWebSocket.instances).toHaveLength(1);
      expect(statuses).toContain('connecting');

      lastSocket().open();
      await flushAsyncWork();

      expect(statuses[statuses.length - 1]).toBe('connected');
    });

    it('disconnects and cleans up resources', () => {
      realtimeClient.connect('test-contest-id');
      const socket = lastSocket();

      realtimeClient.disconnect();

      expect(socket.closed).toBe(true);
      expect(lastSocket().url).toContain('/ws/contests/test-contest-id');
    });
  });

  describe('Snapshot reconciliation', () => {
    it('fetches a full snapshot when the socket opens', async () => {
      const events = collectEvents();
      const fetchMock = stubFetch({ attempts: [attemptFixture('attempt-1')], current: null });

      realtimeClient.connect('test-contest-id');
      lastSocket().open();
      await flushAsyncWork();

      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('/contests/test-contest-id/attempts/current'),
        expect.any(Object)
      );
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('/contests/test-contest-id/attempts'),
        expect.any(Object)
      );

      const snapshots = snapshotEvents(events);
      expect(snapshots).toHaveLength(1);
      expect(snapshots[0]?.contestId).toBe('test-contest-id');
      expect(snapshots[0]?.data.attempts.map(attempt => attempt.id)).toEqual(['attempt-1']);
      expect(snapshots[0]?.data.currentAttempt).toBeNull();
    });

    it('stops polling and reconciles with a snapshot when the socket reopens', async () => {
      const events = collectEvents();
      const fetchMock = stubFetch();

      realtimeClient.connect('test-contest-id');
      lastSocket().serverClose(1006);

      await vi.advanceTimersByTimeAsync(2000);
      const callsWhilePolling = fetchMock.mock.calls.length;
      expect(callsWhilePolling).toBeGreaterThan(0);

      await vi.advanceTimersByTimeAsync(1000);
      lastSocket().open();
      await flushAsyncWork();

      expect(fetchMock.mock.calls.length).toBeGreaterThan(callsWhilePolling);
      expect(snapshotEvents(events).length).toBeGreaterThan(0);

      const callsAfterReconnect = fetchMock.mock.calls.length;
      await vi.advanceTimersByTimeAsync(10000);

      expect(fetchMock.mock.calls.length).toBe(callsAfterReconnect);
    });

    it('recovers deletions and clears through full snapshots while polling', async () => {
      const events = collectEvents();
      stubFetch({
        attempts: [attemptFixture('attempt-stays'), attemptFixture('attempt-deleted')],
        current: { attempt: attemptFixture('attempt-deleted') },
      });

      realtimeClient.connect('test-contest-id');
      lastSocket().serverClose(1006);
      await flushAsyncWork();

      expect(snapshotEvents(events)[0]?.data.attempts.map(attempt => attempt.id))
        .toEqual(['attempt-stays', 'attempt-deleted']);
      expect(snapshotEvents(events)[0]?.data.currentAttempt).not.toBeNull();

      // Server-side deletion and current-attempt clear, with no recently updated attempt.
      stubFetch({ attempts: [attemptFixture('attempt-stays')], current: null });
      await vi.advanceTimersByTimeAsync(2000);

      const snapshots = snapshotEvents(events);
      expect(snapshots).toHaveLength(2);
      expect(snapshots[1]?.data.attempts.map(attempt => attempt.id)).toEqual(['attempt-stays']);
      expect(snapshots[1]?.data.currentAttempt).toBeNull();
    });

    it('emits a snapshot even when the current attempt and attempts are empty', async () => {
      const events = collectEvents();
      stubFetch({ attempts: [], current: null });

      realtimeClient.connect('test-contest-id');
      lastSocket().serverClose(1006);
      await flushAsyncWork();

      const snapshots = snapshotEvents(events);
      expect(snapshots).toHaveLength(1);
      expect(snapshots[0]?.data.attempts).toEqual([]);
      expect(snapshots[0]?.data.currentAttempt).toBeNull();
    });
  });

  describe('Reconnection and stale sockets', () => {
    it('ignores the close of an old socket after switching contests', async () => {
      const statuses: ConnectionStatus[] = [];
      realtimeClient.connectionStatus.subscribe(status => statuses.push(status));
      const fetchMock = stubFetch();

      realtimeClient.connect('contest-a');
      const firstSocket = lastSocket();

      realtimeClient.connect('contest-b');
      const secondSocket = lastSocket();

      expect(firstSocket).not.toBe(secondSocket);
      expect(firstSocket.closed).toBe(true);

      secondSocket.open();
      await flushAsyncWork();
      const callsWhileConnected = fetchMock.mock.calls.length;

      firstSocket.serverClose(1006, 'late close from contest-a');

      expect(statuses[statuses.length - 1]).toBe('connected');
      await vi.advanceTimersByTimeAsync(60000);

      expect(MockWebSocket.instances).toHaveLength(2);
      expect(fetchMock.mock.calls.length).toBe(callsWhileConnected);
    });

    it('ignores messages from a socket that belongs to a previous contest', async () => {
      const events = collectEvents();

      realtimeClient.connect('contest-a');
      const firstSocket = lastSocket();

      realtimeClient.connect('contest-b');

      firstSocket.message({
        type: 'attempt.upserted',
        contestId: 'contest-a',
        timestamp: new Date().toISOString(),
        payload: { id: 'stale-attempt' },
      });

      expect(events).toHaveLength(0);
    });

    it('does not reconnect or poll after disconnecting during a retry', async () => {
      const events = collectEvents();
      const fetchMock = stubFetch();

      realtimeClient.connect('test-contest-id');
      lastSocket().serverClose(1006);

      const callsBeforeDisconnect = fetchMock.mock.calls.length;
      realtimeClient.disconnect();

      await vi.advanceTimersByTimeAsync(60000);
      await flushAsyncWork();

      expect(MockWebSocket.instances).toHaveLength(1);
      expect(fetchMock.mock.calls.length).toBe(callsBeforeDisconnect);
      expect(snapshotEvents(events)).toHaveLength(0);
    });

    it('retries with exponential backoff and then falls back to polling', async () => {
      const fetchMock = stubFetch();

      realtimeClient.connect('test-contest-id');

      for (let attempt = 0; attempt < 6; attempt++) {
        lastSocket().serverClose(1006, 'Connection lost');
        await vi.advanceTimersByTimeAsync(1000 * 2 ** attempt);
      }

      // Original socket + 5 reconnection attempts, no sixth retry.
      expect(MockWebSocket.instances).toHaveLength(6);
      expect(fetchMock.mock.calls.length).toBeGreaterThan(0);
    });

    it('starts polling when the socket errors', async () => {
      const fetchMock = stubFetch();

      realtimeClient.connect('test-contest-id');
      lastSocket().fail();
      await flushAsyncWork();

      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('/contests/test-contest-id/attempts/current'),
        expect.any(Object)
      );
    });
  });

  describe('Event Handling', () => {
    it('emits WebSocket events and normalises payload to data', async () => {
      const events = collectEvents();

      realtimeClient.connect('test-contest-id');
      lastSocket().open();
      await flushAsyncWork();

      const testEvent = {
        type: 'attempt.upserted',
        contestId: 'test-contest-id',
        timestamp: new Date().toISOString(),
        payload: { id: 'test-attempt', weight: 100 },
      };

      lastSocket().message(testEvent);

      const received = events[events.length - 1];
      expect(received?.type).toBe('attempt.upserted');
      expect(received?.contestId).toBe('test-contest-id');
      expect(received?.data).toEqual({ id: 'test-attempt', weight: 100 });
    });

    it('ignores events for other contests', async () => {
      const events = collectEvents();

      realtimeClient.connect('contest-a');
      lastSocket().open();
      await flushAsyncWork();

      lastSocket().message({
        type: 'attempt.upserted',
        contestId: 'contest-b',
        timestamp: new Date().toISOString(),
        payload: { id: 'foreign' },
      });
      expect(events.filter(event => event.type === 'attempt.upserted')).toHaveLength(0);

      lastSocket().message({
        type: 'attempt.upserted',
        contestId: 'contest-a',
        timestamp: new Date().toISOString(),
        payload: { id: 'local' },
      });

      const localEvents = events.filter(event => event.type === 'attempt.upserted');
      expect(localEvents).toHaveLength(1);
      expect(localEvents[0]?.data).toMatchObject({ id: 'local' });
    });

    it('ignores malformed WebSocket messages', async () => {
      const events = collectEvents();

      realtimeClient.connect('test-contest-id');
      lastSocket().open();
      await flushAsyncWork();
      const callsBefore = events.length;

      lastSocket().onmessage?.({ data: 'not json' } as unknown as MessageEvent);
      lastSocket().onmessage?.({ data: JSON.stringify({ missing: 'type' }) } as unknown as MessageEvent);

      expect(events).toHaveLength(callsBefore);
    });
  });

  describe('Heartbeat', () => {
    it('sends heartbeat ping while connected', async () => {
      realtimeClient.connect('contest-heartbeat');
      lastSocket().open();
      await flushAsyncWork();

      await vi.advanceTimersByTimeAsync(30000);
      expect(lastSocket().sent).toContain(JSON.stringify({ type: 'ping' }));

      await vi.advanceTimersByTimeAsync(30000);
      expect(lastSocket().sent.filter(message => message === JSON.stringify({ type: 'ping' }))).toHaveLength(2);
    });
  });
});
