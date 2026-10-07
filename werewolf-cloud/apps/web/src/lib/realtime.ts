import { writable, type Readable } from 'svelte/store';
import { getApiBase } from './config';
import type {
  Attempt,
  ConnectionStatus,
  CurrentAttemptBundle,
  LiveEvent,
  LiveEventType,
  RealtimeClient,
  RealtimeSnapshot,
} from './types';
import { apiClient } from './api';

const POLL_INTERVAL_MS = 2000;
const HEARTBEAT_INTERVAL_MS = 30000;
const MAX_RECONNECT_ATTEMPTS = 5;
const INITIAL_RECONNECT_DELAY_MS = 1000;
const MAX_RECONNECT_DELAY_MS = 30000;
const INTENTIONAL_CLOSE_CODE = 1000;

class RealtimeClientImpl implements RealtimeClient {
  private ws: WebSocket | null = null;
  private contestId: string | null = null;
  /**
   * Bumped whenever the active connection is torn down. Socket callbacks and
   * reconnect timers capture the generation they were created for and become
   * no-ops once it changes, so a stale socket can never clobber live state.
   */
  private generation = 0;
  private reconnectAttempts = 0;
  private reconnectDelay = INITIAL_RECONNECT_DELAY_MS;
  private reconnectTimer: number | null = null;
  private pollingInterval: number | null = null;
  private heartbeatInterval: number | null = null;

  // Svelte stores
  private _connectionStatus = writable<ConnectionStatus>('offline');
  private _events = writable<LiveEvent | null>(null);

  // Public getters for stores
  get connectionStatus(): Readable<ConnectionStatus> {
    return { subscribe: this._connectionStatus.subscribe };
  }

  get events(): Readable<LiveEvent | null> {
    return { subscribe: this._events.subscribe };
  }

  connect(contestId: string): void {
    const readyState = this.ws?.readyState;
    if (
      this.contestId === contestId &&
      (readyState === WebSocket.OPEN || readyState === WebSocket.CONNECTING)
    ) {
      return; // Already connected (or connecting) to the same contest
    }

    this.teardownSession();
    this.contestId = contestId;
    this._connectionStatus.set('connecting');
    this.connectWebSocket();
  }

  disconnect(): void {
    this.teardownSession();
    this.contestId = null;
    this._connectionStatus.set('offline');
  }

  /** Drops the current socket and every timer owned by it, without changing contestId. */
  private teardownSession(): void {
    this.generation++;
    this.reconnectAttempts = 0;
    this.reconnectDelay = INITIAL_RECONNECT_DELAY_MS;
    this.clearReconnectTimer();
    this.stopPolling();
    this.stopHeartbeat();

    const socket = this.ws;
    this.ws = null;
    if (socket) {
      try {
        socket.close();
      } catch (error) {
        console.error('Failed to close WebSocket:', error);
      }
    }
  }

  private isCurrentGeneration(generation: number): boolean {
    return generation === this.generation;
  }

  private getWebSocketUrl(contestId: string): string {
    const url = new URL(getApiBase());
    url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
    url.pathname = `${url.pathname.replace(/\/+$/, '')}/ws/contests/${encodeURIComponent(contestId)}`;
    url.search = '';
    url.hash = '';
    return url.toString();
  }

  private connectWebSocket(): void {
    const contestId = this.contestId;
    if (!contestId) return;

    const generation = this.generation;
    let socket: WebSocket;

    try {
      socket = new WebSocket(this.getWebSocketUrl(contestId));
    } catch (error) {
      console.error('Failed to create WebSocket connection:', error);
      this.handleConnectionLoss(generation);
      return;
    }

    this.ws = socket;

    socket.onopen = () => {
      if (!this.isCurrentGeneration(generation)) return;
      console.log('WebSocket connected');
      this.reconnectAttempts = 0;
      this.reconnectDelay = INITIAL_RECONNECT_DELAY_MS;
      this._connectionStatus.set('connected');
      this.stopPolling();
      this.startHeartbeat();
      // Reconcile everything that changed while we were disconnected.
      void this.emitSnapshot(contestId);
    };

    socket.onmessage = (event) => {
      if (!this.isCurrentGeneration(generation)) return;
      this.handleMessage(event.data, contestId);
    };

    socket.onclose = (event) => {
      if (!this.isCurrentGeneration(generation)) return;
      console.log('WebSocket closed:', event.code, event.reason);
      this.ws = null;
      this.stopHeartbeat();
      this.startPolling();

      // Attempt to reconnect if not intentional close
      if (event.code !== INTENTIONAL_CLOSE_CODE) {
        this.attemptReconnect();
      }
    };

    socket.onerror = (error) => {
      if (!this.isCurrentGeneration(generation)) return;
      console.error('WebSocket error:', error);
      // Ensure polling kicks in if connection is unstable
      this.handleConnectionLoss(generation);
    };
  }

  private handleConnectionLoss(generation: number): void {
    if (!this.isCurrentGeneration(generation)) return;
    this._connectionStatus.set('offline');
    this.startPolling();
  }

  private handleMessage(raw: unknown, contestId: string): void {
    if (typeof raw !== 'string') return;

    try {
      const parsed: unknown = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object') return;

      // Normalise backend payload shape to frontend LiveEvent shape { data: ... }
      const message = parsed as Record<string, unknown>;
      const type = message['type'];
      const eventContestId = message['contestId'];
      if (typeof type !== 'string' || typeof eventContestId !== 'string') return;
      if (eventContestId !== contestId) return; // Ignore cross-talk from other contests

      const data = message['payload'] ?? message['data'];
      const timestamp = message['timestamp'];
      const liveEvent: LiveEvent = {
        ...message,
        type: type as LiveEventType,
        contestId: eventContestId,
        timestamp: typeof timestamp === 'string' ? timestamp : new Date().toISOString(),
        data,
      };

      this._events.set(liveEvent);
    } catch (error) {
      console.error('Failed to parse WebSocket message:', error);
    }
  }

  private attemptReconnect(): void {
    if (!this.contestId || this.reconnectTimer !== null) return;

    if (this.reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
      console.log('Max reconnection attempts reached, falling back to polling');
      this.startPolling();
      return;
    }

    this.reconnectAttempts++;
    const generation = this.generation;
    const delay = this.reconnectDelay;
    console.log(`Attempting to reconnect (${this.reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS}) in ${delay}ms`);

    this.reconnectTimer = window.setTimeout(() => {
      this.reconnectTimer = null;
      if (!this.isCurrentGeneration(generation) || !this.contestId) return;
      this.connectWebSocket();
    }, delay);

    // Exponential backoff
    this.reconnectDelay = Math.min(this.reconnectDelay * 2, MAX_RECONNECT_DELAY_MS);
  }

  private clearReconnectTimer(): void {
    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  private startPolling(): void {
    if (!this.contestId || this.pollingInterval !== null) return;

    console.log('Starting polling fallback');
    this._connectionStatus.set('offline');

    void this.emitSnapshot(this.contestId);
    this.pollingInterval = window.setInterval(() => {
      void this.emitSnapshot(this.contestId);
    }, POLL_INTERVAL_MS);
  }

  private stopPolling(): void {
    if (this.pollingInterval !== null) {
      clearInterval(this.pollingInterval);
      this.pollingInterval = null;
    }
  }

  /**
   * Fetches the latest full contest state and emits it as a single `snapshot`
   * event. Consumers replace their state with it, so deletions, clears and
   * changes to old attempts are all recovered - including while the socket is
   * down and this runs on a polling interval.
   */
  private async emitSnapshot(contestId: string | null): Promise<void> {
    if (!contestId) return;

    try {
      const [currentResponse, attemptsResponse] = await Promise.all([
        apiClient.get<CurrentAttemptBundle | null>(`/contests/${contestId}/attempts/current`),
        apiClient.get<Attempt[]>(`/contests/${contestId}/attempts`),
      ]);

      if (this.contestId !== contestId) return; // Contest switched while fetching

      const snapshot: RealtimeSnapshot = {
        contestId,
        attempts: attemptsResponse.data ?? [],
        currentAttempt: currentResponse.data ?? null,
        fetchedAt: new Date().toISOString(),
      };

      this._events.set({
        type: 'snapshot',
        contestId,
        timestamp: snapshot.fetchedAt,
        data: snapshot,
        payload: snapshot,
      });
    } catch (error) {
      console.error('Failed to fetch realtime snapshot:', error);
    }
  }

  private startHeartbeat(): void {
    if (this.heartbeatInterval !== null) return;

    this.heartbeatInterval = window.setInterval(() => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({ type: 'ping' }));
      }
    }, HEARTBEAT_INTERVAL_MS);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatInterval !== null) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }

  // Test helpers
  __setConnectionStatusForTests(value: ConnectionStatus): void {
    this._connectionStatus.set(value);
  }

  __setEventForTests(value: LiveEvent | null): void {
    this._events.set(value);
  }

  __resetForTests(): void {
    this.disconnect();
    this._connectionStatus.set('connected');
    this._events.set(null);
  }
}

// Export singleton instance
export const realtimeClient: RealtimeClientImpl = new RealtimeClientImpl();

export const realtimeTestHelpers = {
  setConnection(value: ConnectionStatus) {
    realtimeClient.__setConnectionStatusForTests(value);
  },
  setEvent(value: LiveEvent | null) {
    realtimeClient.__setEventForTests(value);
  },
  reset() {
    realtimeClient.__resetForTests();
  },
};
