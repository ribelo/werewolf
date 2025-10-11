import { get } from 'svelte/store';
import { _ } from 'svelte-i18n';

export type StatusTone = 'active' | 'warning' | 'error' | 'neutral';

export type NormalizedAttemptStatus = 'pending' | 'successful' | 'failed';

export function statusBadgeClass(status: string): string {
  const key = status.toLowerCase();
  if (key === 'active' || key === 'live' || key === 'connected') return 'status-badge status-active';
  if (key === 'paused' || key === 'warning' || key === 'connecting') return 'status-badge status-warning';
  if (key === 'error' || key === 'offline' || key === 'failed') return 'status-badge status-error';
  return 'status-badge status-neutral';
}

export function attemptToneClass(status: string): string {
  const normalized = status.toLowerCase() as NormalizedAttemptStatus | string;
  if (normalized === 'successful') return 'text-green-200 bg-green-600/30 border border-green-500';
  if (normalized === 'failed') return 'text-red-200 bg-red-600/30 border border-red-500';
  return 'text-gray-400 bg-element-bg border border-border-color';
}

/**
 * Get CSS classes for attempt status - Blood Theme dark styling
 */
export function getAttemptStatusClass(status: string): string {
  const normalized = status.toLowerCase() as NormalizedAttemptStatus | string;

  switch (normalized) {
    case 'successful':
      return 'text-green-200 bg-green-600/30 border border-green-500';
    case 'failed':
      return 'text-red-200 bg-red-600/30 border border-red-500';
    case 'pending':
    default:
      return 'text-gray-400 bg-element-bg border border-border-color';
  }
}

/**
 * Get icon for attempt status
 */
export function getAttemptStatusIcon(status: string): string {
  const normalized = status.toLowerCase() as NormalizedAttemptStatus | string;
  const iconMap: Record<NormalizedAttemptStatus, string> = {
    successful: '✓',
    failed: '✗',
    pending: '○'
  };

  if (normalized in iconMap) {
    return iconMap[normalized as NormalizedAttemptStatus];
  }

  return '';
}

/**
 * Get human-readable label for attempt status
 */
export function getAttemptStatusLabel(status: string): string {
  const normalized = status.toLowerCase() as NormalizedAttemptStatus | string;
  const labelFallback: Record<NormalizedAttemptStatus, string> = {
    successful: 'Successful',
    failed: 'Failed',
    pending: 'Pending'
  };

  const translate = get(_);
  const key = `attempt.status.${normalized}`;
  const fallback =
    normalized in labelFallback ? labelFallback[normalized as NormalizedAttemptStatus] : status;

  try {
    return translate(key, { default: fallback });
  } catch {
    return fallback;
  }
}

/**
 * Check if attempt is complete
 */
export function isAttemptComplete(status: string): boolean {
  const normalized = status.toLowerCase();
  return normalized === 'successful' || normalized === 'failed';
}

/**
 * Get next logical status in attempt progression
 */
export function getNextAttemptStatus(current: string): NormalizedAttemptStatus {
  const normalized = current.toLowerCase();
  if (normalized === 'pending') return 'successful';
  if (normalized === 'successful') return 'failed';
  return 'pending';
}
