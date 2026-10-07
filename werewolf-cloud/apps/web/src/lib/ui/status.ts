import { get } from 'svelte/store';
import { _ } from 'svelte-i18n';

export type NormalizedAttemptStatus = 'pending' | 'successful' | 'failed';

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
