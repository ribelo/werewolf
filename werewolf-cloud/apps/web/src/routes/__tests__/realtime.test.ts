import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock getApiBase at module scope before importing realtime
vi.mock('$lib/config', () => ({
  getApiBase: vi.fn(() => 'http://127.0.0.1:8787'),
}));

import { realtimeClient } from '$lib/realtime';
import type { LiveEvent, ConnectionStatus } from '$lib/types';

// Mock WebSocket constructor with required readyState constants
const WebSocketCtor = vi.fn();
(WebSocketCtor as unknown as { OPEN: number; CLOSED: number; CLOSING: number; CONNECTING: number }).OPEN = 1;
(WebSocketCtor as unknown as { OPEN: number; CLOSED: number; CLOSING: number; CONNECTING: number }).CLOSED = 3;
(WebSocketCtor as unknown as { OPEN: number; CLOSED: number; CLOSING: number; CONNECTING: number }).CLOSING = 2;
(WebSocketCtor as unknown as { OPEN: number; CLOSED: number; CLOSING: number; CONNECTING: number }).CONNECTING = 0;

let mockWebSocket: {
  readyState: number;
  send: ReturnType<typeof vi.fn>;
  close: ReturnType<typeof vi.fn>;
  onopen: () => void;
  onmessage: (event: { data: string }) => void;
  onclose: (event: { code: number; reason?: string }) => void;
  onerror: (error: unknown) => void;
};

// Assign mocked constructor to global WebSocket
(globalThis as any).WebSocket = WebSocketCtor as unknown as typeof WebSocket;

// Mock localStorage
const localStorageMock = {
  getItem: vi.fn(),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn(),
};
(globalThis as any).localStorage = localStorageMock as any;

describe('RealtimeClient', () => {
  beforeEach(() => {
    vi.useFakeTimers();

    mockWebSocket = {
      readyState: (WebSocket as any).OPEN ?? 1,
      send: vi.fn(),
      close: vi.fn(),
      onopen: () => undefined,
      onmessage: () => undefined,
      onclose: () => undefined,
      onerror: () => undefined,
    };

    WebSocketCtor.mockClear();
    WebSocketCtor.mockImplementation(() => mockWebSocket);

    localStorageMock.getItem.mockReset();
    localStorageMock.setItem.mockReset();
    localStorageMock.removeItem.mockReset();
    localStorageMock.clear.mockReset();

    vi.clearAllMocks();

    // Provide default fetch stub (tests can override)
    (globalThis as any).fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ data: null }),
    });

    // Reset client state
    realtimeClient.disconnect();
    (realtimeClient as any).__setEventForTests?.(null);
    (realtimeClient as any).__setConnectionStatusForTests?.('offline');
  });

  afterEach(() => {
    realtimeClient.disconnect();
    vi.runOnlyPendingTimers();
    vi.clearAllTimers();
    vi.useRealTimers();
    delete (globalThis as any).fetch;
  });

  describe('Connection Management', () => {
    it('should connect to WebSocket with correct URL for dev environment', () => {
      realtimeClient.connect('test-contest-id');

      expect(global.WebSocket).toHaveBeenCalledWith(
        'ws://127.0.0.1:8787/ws/contests/test-contest-id'
      );
    });

    it('should connect to WebSocket with correct URL for prod environment', async () => {
      // Mock prod environment for this test
      const { getApiBase } = await import('$lib/config');
      vi.mocked(getApiBase).mockReturnValue('https://api.example.com');

      realtimeClient.connect('test-contest-id');

      expect(global.WebSocket).toHaveBeenCalledWith(
        'wss://werewolf.r-krzywaznia-2c4.workers.dev/ws/contests/test-contest-id'
      );
    });

    it('should update connection status to connected when WebSocket opens', () => {
      let currentStatus: ConnectionStatus = 'offline';
      const unsubscribe = realtimeClient.connectionStatus.subscribe(status => {
        currentStatus = status;
      });

      realtimeClient.connect('test-contest-id');

      // Simulate WebSocket open
      mockWebSocket.onopen();

      expect(currentStatus).toBe('connected');

      unsubscribe();
    });

    it('should disconnect and clean up resources', () => {
      realtimeClient.connect('test-contest-id');
      realtimeClient.disconnect();

      expect(mockWebSocket.close).toHaveBeenCalled();
    });
  });

  describe('Event Handling', () => {
    it('should emit events when receiving WebSocket messages', () => {
      let receivedEvent: LiveEvent | null = null;
      const unsubscribe = realtimeClient.events.subscribe(event => {
        receivedEvent = event;
      });

      realtimeClient.connect('test-contest-id');

      const testEvent: LiveEvent = {
        type: 'attempt.upserted',
        contestId: 'test-contest-id',
        timestamp: new Date().toISOString(),
        data: { id: 'test-attempt', weight: 100 },
      };

      // Simulate WebSocket message
      mockWebSocket.onmessage({ data: JSON.stringify(testEvent) });

      expect(receivedEvent).toEqual(testEvent);

      unsubscribe();
    });

    it('should ignore events for other contests', () => {
      const received: LiveEvent[] = [];
      const unsubscribe = realtimeClient.events.subscribe((event) => {
        if (event) received.push(event);
      });

      realtimeClient.connect('contest-a');

      const foreignEvent: LiveEvent = {
        type: 'attempt.upserted',
        contestId: 'contest-b',
        timestamp: new Date().toISOString(),
        data: { id: 'foreign', weight: 100 },
      };

      mockWebSocket.onmessage({ data: JSON.stringify(foreignEvent) });
      expect(received).toHaveLength(0);

      const localEvent: LiveEvent = {
        type: 'attempt.upserted',
        contestId: 'contest-a',
        timestamp: new Date().toISOString(),
        data: { id: 'local', weight: 120 },
      };

      mockWebSocket.onmessage({ data: JSON.stringify(localEvent) });
      expect(received).toHaveLength(1);
      expect(received[0]?.data).toMatchObject({ id: 'local' });

      unsubscribe();
    });
  });

  describe('Reconnection Logic', () => {
    it('should attempt reconnection on WebSocket close with exponential backoff', () => {
      realtimeClient.connect('test-contest-id');

      // Simulate WebSocket close
      mockWebSocket.onclose({ code: 1006, reason: 'Connection lost' });

      // Fast-forward time for first reconnection attempt
      vi.advanceTimersByTime(1000);

      expect(global.WebSocket).toHaveBeenCalledTimes(2); // Original + 1 reconnection
    });

    it('should stop reconnection attempts after max attempts', () => {
      realtimeClient.connect('test-contest-id');

      // Simulate multiple connection failures
      for (let i = 0; i < 6; i++) {
        mockWebSocket.onclose({ code: 1006, reason: 'Connection lost' });
        vi.advanceTimersByTime(1000 * Math.pow(2, i)); // Exponential backoff
      }

      // Should have stopped after 5 attempts (maxReconnectAttempts)
      expect(global.WebSocket).toHaveBeenCalledTimes(6); // Original + 5 reconnection attempts
    });
  });

  describe('Polling Fallback', () => {
    it('should start polling when WebSocket connection fails', () => {
      // Mock fetch for polling
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ data: null }),
      });

      realtimeClient.connect('test-contest-id');

      // Simulate WebSocket error
      mockWebSocket.onerror(new Error('Connection failed'));

      // Fast-forward time for polling interval
      vi.advanceTimersByTime(2000);

      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/contests/test-contest-id/attempts/current'),
        expect.any(Object)
      );
    });

    it('should start polling when connection fails', () => {
      // Mock fetch for polling
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ data: null }),
      });

      realtimeClient.connect('test-contest-id');

      // Simulate WebSocket close to trigger polling
      mockWebSocket.onclose({ code: 1006, reason: 'Connection lost' } as any);

      // Fast-forward time for polling
      vi.advanceTimersByTime(2000);

      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/contests/test-contest-id/attempts/current'),
        expect.any(Object)
      );
    });
  });

  describe('Heartbeat', () => {
    it('should send heartbeat ping while connected', () => {
      realtimeClient.connect('contest-heartbeat');
      mockWebSocket.onopen();

      vi.advanceTimersByTime(30000);
      expect(mockWebSocket.send).toHaveBeenCalledWith(JSON.stringify({ type: 'ping' }));

      vi.advanceTimersByTime(30000);
      expect(mockWebSocket.send).toHaveBeenCalledTimes(2);
    });
  });
});
