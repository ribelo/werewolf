import { realtimeClient } from '$lib/realtime';
import { toast } from './toast';
import { contestStore } from './contest-store';
import type { Attempt, CurrentAttempt, CurrentAttemptBundle, LiveEvent } from '$lib/types';
import { bundleToCurrentAttempt } from '$lib/current-attempt';

// Track last notification timestamps to avoid spam
const notificationCooldowns = new Map<string, number>();
const COOLDOWN_MS = 5000; // 5 seconds between similar notifications

// Track active subscriptions to prevent memory leaks
let connectionUnsubscribe: (() => void) | null = null;
let attemptUnsubscribe: (() => void) | null = null;
let contestUnsubscribe: (() => void) | null = null;
let isInitialized = false;

function shouldShowNotification(key: string): boolean {
  const now = Date.now();
  const lastTime = notificationCooldowns.get(key) || 0;

  if (now - lastTime < COOLDOWN_MS) {
    return false;
  }

  notificationCooldowns.set(key, now);
  return true;
}

function handleConnectionEvents() {
  connectionUnsubscribe = realtimeClient.connectionStatus.subscribe((status) => {
    switch (status) {
      case 'connected':
        if (shouldShowNotification('connection-established')) {
          toast.success('Real-time connection established', {
            duration: 3000,
          });
        }
        break;

      case 'connecting':
        // Only show reconnecting message if we've been offline
        if (shouldShowNotification('connection-reconnecting')) {
          toast.info('Reconnecting to real-time updates...', {
            duration: 2000,
          });
        }
        break;

      case 'offline':
        if (shouldShowNotification('connection-lost')) {
          toast.warning('Real-time connection lost. Using polling fallback.', {
            duration: 5000,
          });
        }
        break;
    }
  });
}

let currentContestId: string | null = null;

function subscribeContestStore() {
  contestUnsubscribe = contestStore.subscribe((state) => {
    currentContestId = state.contest?.id || null;
  });
}

function handleAttemptEvents() {
  attemptUnsubscribe = realtimeClient.events.subscribe((event: LiveEvent | null) => {
    if (!event) return;

    // Only show notifications for current contest
    if (currentContestId && event.contestId !== currentContestId) {
      return;
    }

    switch (event.type) {
      case 'attempt.upserted':
        handleAttemptUpserted(event as LiveEvent<Attempt>);
        break;

      case 'attempt.resultUpdated':
        handleAttemptResultUpdated(event as LiveEvent<Attempt>);
        break;

      case 'attempt.currentSet':
        handleCurrentAttemptSet(event as LiveEvent<CurrentAttemptBundle | CurrentAttempt | Attempt>);
        break;

      case 'attempt.currentCleared':
        handleCurrentAttemptCleared(event as LiveEvent<Attempt | null>);
        break;

      case 'heartbeat':
        // Heartbeat events don't need notifications
        break;

      case 'registration.upserted':
      case 'registration.deleted':
        // Registration events currently do not trigger notifications
        break;

      default:
        console.warn('Unknown event type:', event.type);
    }
  });
}

function handleAttemptUpserted(event: LiveEvent<Attempt>) {
  const attempt = event.data as Attempt | undefined;
  if (!attempt) return;

  const liftType = attempt.liftType || 'Unknown';
  const attemptNumber = attempt.attemptNumber || '?';
  const weight = attempt.weight || 0;

  // Only show notifications for recent attempts (within last minute)
  const eventTime = new Date(event.timestamp);
  const now = new Date();
  const timeDiff = now.getTime() - eventTime.getTime();

  if (timeDiff > 60000) return; // Older than 1 minute

  const notificationKey = `attempt-${attempt.id}-${attempt.status}`;
  if (!shouldShowNotification(notificationKey)) return;

  let message = '';
  let level: 'success' | 'error' | 'warning' | 'info' = 'info';

  switch (attempt.status) {
    case 'Successful':
      message = `${liftType} ${attemptNumber}: ${weight}kg - SUCCESS!`;
      level = 'success';
      break;

    case 'Failed':
      message = `${liftType} ${attemptNumber}: ${weight}kg - Failed`;
      level = 'error';
      break;

    case 'Pending':
      message = `${liftType} ${attemptNumber}: ${weight}kg - Ready`;
      level = 'info';
      break;

    default:
      return; // Don't show notifications for unknown statuses
  }

  toast[level](message, {
    duration: level === 'success' ? 4000 : 3000,
  });
}

function handleAttemptResultUpdated(event: LiveEvent<Attempt>) {
  const attempt = event.data as Attempt | undefined;
  if (!attempt) return;

  // This is similar to upserted but specifically for result changes
  // For now, let the upserted handler deal with it
  handleAttemptUpserted(event);
}

function handleCurrentAttemptSet(event: LiveEvent<CurrentAttemptBundle | CurrentAttempt | Attempt>) {
  const payload = event.data as (CurrentAttemptBundle | CurrentAttempt | Attempt | undefined);
  if (!payload) return;

  let currentAttempt: CurrentAttempt;

  if ('attempt' in (payload as any)) {
    currentAttempt = bundleToCurrentAttempt(payload as CurrentAttemptBundle);
  } else if ('competitorName' in (payload as any) && (payload as CurrentAttempt).competitorName) {
    currentAttempt = payload as CurrentAttempt;
  } else {
    const attempt = payload as Attempt;
    const competitorName = attempt.competitorName
      || `${attempt.lastName ?? ''} ${attempt.firstName ?? ''}`.trim()
      || 'Unknown Competitor';
    currentAttempt = {
      id: attempt.id,
      registrationId: attempt.registrationId,
      competitorName,
      liftType: attempt.liftType,
      attemptNumber: attempt.attemptNumber as CurrentAttempt['attemptNumber'],
      weight: attempt.weight,
      status: attempt.status,
      competitionOrder: attempt.competitionOrder ?? null,
      updatedAt: attempt.updatedAt ?? null,
    };
  }

  const notificationKey = `current-attempt-${currentAttempt.id}`;
  if (!shouldShowNotification(notificationKey)) return;

  const competitorName = currentAttempt.competitorName || 'Unknown Competitor';
  const liftType = currentAttempt.liftType || 'Unknown';
  const attemptNumber = currentAttempt.attemptNumber || '?';
  const weight = currentAttempt.weight || 0;

  toast.info(`Next: ${competitorName} - ${liftType} ${attemptNumber} (${weight}kg)`, {
    duration: 5000,
  });
}

function handleCurrentAttemptCleared(_event: LiveEvent<Attempt | null>) {
  if (!shouldShowNotification('current-attempt-cleared')) return;

  toast.info('Current attempt cleared', {
    duration: 3000,
  });
}

// Initialize the notification bridge
export function initializeNotificationBridge(): () => void {
  // Idempotent guard - don't initialize if already done
  if (isInitialized) {
    return () => {}; // Return no-op cleanup if already initialized
  }

  isInitialized = true;
  handleConnectionEvents();
  subscribeContestStore();
  handleAttemptEvents();

  // Clean up old cooldown entries periodically
  const cleanupInterval = setInterval(() => {
    const now = Date.now();
    for (const [key, timestamp] of notificationCooldowns.entries()) {
      if (now - timestamp > COOLDOWN_MS * 2) {
        notificationCooldowns.delete(key);
      }
    }
  }, 30000); // Clean up every 30 seconds

  // Return cleanup function
  return () => {
    if (connectionUnsubscribe) {
      connectionUnsubscribe();
      connectionUnsubscribe = null;
    }
    if (attemptUnsubscribe) {
      attemptUnsubscribe();
      attemptUnsubscribe = null;
    }
    if (contestUnsubscribe) {
      contestUnsubscribe();
      contestUnsubscribe = null;
    }
    clearInterval(cleanupInterval);
    isInitialized = false;
  };
}

// Export for manual control if needed
export function showConnectionError(message: string) {
  if (shouldShowNotification('connection-error')) {
    toast.error(`Connection Error: ${message}`, {
      duration: 7000,
    });
  }
}

export function showAttemptError(message: string) {
  if (shouldShowNotification('attempt-error')) {
    toast.error(`Attempt Error: ${message}`, {
      duration: 5000,
    });
  }
}
