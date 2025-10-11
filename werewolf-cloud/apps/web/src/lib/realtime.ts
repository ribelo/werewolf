import { writable, type Readable } from 'svelte/store';
import { getApiBase } from './config';
import type { LiveEvent, ConnectionStatus, Attempt, CurrentAttemptBundle } from './types';
import { apiClient } from './api';

class RealtimeClientImpl {
  private ws: WebSocket | null = null;
  private contestId: string | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 1000; // Start with 1 second
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
    if (this.contestId === contestId && this.ws?.readyState === WebSocket.OPEN) {
      return; // Already connected to the same contest
    }

    this.disconnect();
    this.contestId = contestId;
    this._connectionStatus.set('connecting');
    this.connectWebSocket();
  }

  disconnect(): void {
    this.contestId = null;
    this.reconnectAttempts = 0;

    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }

    if (this.pollingInterval) {
      clearInterval(this.pollingInterval);
      this.pollingInterval = null;
    }

    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }

    this._connectionStatus.set('offline');
  }

  private getWebSocketUrl(contestId: string): string {
    const apiBase = getApiBase();
    const isDev = apiBase.includes('127.0.0.1') || apiBase.includes('localhost');

    if (isDev) {
      return `ws://127.0.0.1:8787/ws/contests/${contestId}`;
    } else {
      return `wss://werewolf.r-krzywaznia-2c4.workers.dev/ws/contests/${contestId}`;
    }
  }

  private connectWebSocket(): void {
    if (!this.contestId) return;

    try {
      const wsUrl = this.getWebSocketUrl(this.contestId);
      this.ws = new WebSocket(wsUrl);

      this.ws.onopen = () => {
        console.log('WebSocket connected');
        this.reconnectAttempts = 0;
        this.reconnectDelay = 1000;
        this._connectionStatus.set('connected');

        // Start heartbeat
        this.startHeartbeat();

        // Stop polling if it was running
        if (this.pollingInterval) {
          clearInterval(this.pollingInterval);
          this.pollingInterval = null;
        }
      };

      this.ws.onmessage = (event) => {
        try {
          const raw = JSON.parse(event.data);
          // Normalise backend payload shape to frontend LiveEvent shape { data: ... }
          const liveEvent: LiveEvent = raw && typeof raw === 'object'
            ? { ...raw, data: raw.payload ?? raw.data }
            : raw;

          // Filter events for current contest to avoid cross-talk
          if (this.contestId && liveEvent?.contestId !== this.contestId) return;

          this._events.set(liveEvent);
        } catch (error) {
          console.error('Failed to parse WebSocket message:', error);
        }
      };

      this.ws.onclose = (event) => {
        console.log('WebSocket closed:', event.code, event.reason);
        this.ws = null;
        this._connectionStatus.set('offline');

        // Stop heartbeat
        if (this.heartbeatInterval) {
          clearInterval(this.heartbeatInterval);
          this.heartbeatInterval = null;
        }

        // Start polling fallback immediately while we also try to reconnect
        this.startPolling();

        // Attempt to reconnect if not intentional close
        if (this.contestId && event.code !== 1000) {
          this.attemptReconnect();
        }
      };

      this.ws.onerror = (error) => {
        console.error('WebSocket error:', error);
        this._connectionStatus.set('offline');
        // Ensure polling kicks in if connection is unstable
        this.startPolling();
      };

    } catch (error) {
      console.error('Failed to create WebSocket connection:', error);
      this._connectionStatus.set('offline');
      this.startPolling();
    }
  }

  private attemptReconnect(): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.log('Max reconnection attempts reached, falling back to polling');
      this.startPolling();
      return;
    }

    this.reconnectAttempts++;
    console.log(`Attempting to reconnect (${this.reconnectAttempts}/${this.maxReconnectAttempts}) in ${this.reconnectDelay}ms`);

    setTimeout(() => {
      if (this.contestId) {
        this.connectWebSocket();
      }
    }, this.reconnectDelay);

    // Exponential backoff
    this.reconnectDelay = Math.min(this.reconnectDelay * 2, 30000); // Max 30 seconds
  }

  private startPolling(): void {
    if (!this.contestId || this.pollingInterval) return;

    console.log('Starting polling fallback');
    this._connectionStatus.set('offline');

    this.pollingInterval = window.setInterval(async () => {
      if (!this.contestId) return;

      try {
        // Poll current attempt
        const currentResponse = await apiClient.get<CurrentAttemptBundle | null>(`/contests/${this.contestId}/attempts/current`);
        if (currentResponse.data) {
          const liveEvent: LiveEvent = {
            type: 'attempt.currentSet',
            contestId: this.contestId,
            timestamp: new Date().toISOString(),
            data: currentResponse.data,
            payload: currentResponse.data
          };
          this._events.set(liveEvent);
        }

        // Poll all attempts for changes
        const attemptsResponse = await apiClient.get<Attempt[]>(`/contests/${this.contestId}/attempts`);
        if (attemptsResponse.data) {
          // Emit events for recent attempts (last 5 minutes)
          const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
          const recentAttempts = attemptsResponse.data.filter(
            attempt => new Date(attempt.updatedAt) > fiveMinutesAgo
          );

          recentAttempts.forEach(attempt => {
            const liveEvent: LiveEvent = {
              type: 'attempt.upserted',
              contestId: this.contestId!,
              timestamp: attempt.updatedAt,
              data: attempt,
              payload: attempt
            };
            this._events.set(liveEvent);
          });
        }
      } catch (error) {
        console.error('Polling error:', error);
      }
    }, 2000); // Poll every 2 seconds
  }

  private startHeartbeat(): void {
    if (this.heartbeatInterval) return;

    this.heartbeatInterval = window.setInterval(() => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({ type: 'ping' }));
      }
    }, 30000); // Send heartbeat every 30 seconds
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
