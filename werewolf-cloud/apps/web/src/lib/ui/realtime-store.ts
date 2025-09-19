import { writable, derived, type Readable } from 'svelte/store';
import { realtimeClient } from '$lib/realtime';
import type { ConnectionStatus } from '$lib/types';

export interface RealtimeStatus {
  connectionStatus: ConnectionStatus;
  lastUpdate: string | null;
  reconnectAttempts: number;
  isConnected: boolean;
  statusMessage: string;
}

interface RealtimeStore extends Readable<RealtimeStatus> {
  subscribeToContest: (contestId: string) => void;
  disconnect: () => void;
  reset: () => void;
}

const initialState: RealtimeStatus = {
  connectionStatus: 'offline',
  lastUpdate: null,
  reconnectAttempts: 0,
  isConnected: false,
  statusMessage: 'Disconnected',
};

function createRealtimeStore(): RealtimeStore {
  const { subscribe, set, update } = writable<RealtimeStatus>(initialState);

  // Subscribe to realtime client events
  realtimeClient.connectionStatus.subscribe((status) => {
    update(state => ({
      ...state,
      connectionStatus: status,
      isConnected: status === 'connected',
      statusMessage: getStatusMessage(status, state.reconnectAttempts),
      lastUpdate: new Date().toISOString(),
    }));
  });

  realtimeClient.events.subscribe((event) => {
    if (event) {
      update(state => ({
        ...state,
        lastUpdate: new Date().toISOString(),
        // Reset reconnect attempts on successful event
        reconnectAttempts: state.connectionStatus === 'connected' ? 0 : state.reconnectAttempts,
      }));
    }
  });

  function getStatusMessage(status: ConnectionStatus, attempts: number): string {
    switch (status) {
      case 'connected':
        return 'Connected';
      case 'connecting':
        return attempts > 0 ? `Reconnecting... (${attempts})` : 'Connecting...';
      case 'offline':
        return attempts > 0 ? `Reconnecting... (${attempts})` : 'Disconnected';
      default:
        return 'Unknown';
    }
  }

  return {
    subscribe,

    subscribeToContest: (contestId: string) => {
      realtimeClient.connect(contestId);
      update(state => ({
        ...state,
        reconnectAttempts: 0, // Reset attempts when manually connecting
      }));
    },

    disconnect: () => {
      realtimeClient.disconnect();
    },

    reset: () => {
      set(initialState);
    },
  };
}



// Export singleton instance
export const realtimeStore = createRealtimeStore();

// Derived stores for convenience
export const connectionStatus = derived(realtimeStore, $state => $state.connectionStatus);
export const isRealtimeConnected = derived(realtimeStore, $state => $state.isConnected);
export const realtimeStatusMessage = derived(realtimeStore, $state => $state.statusMessage);
export const lastRealtimeUpdate = derived(realtimeStore, $state => $state.lastUpdate);