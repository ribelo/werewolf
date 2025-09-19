export type StatusTone = 'active' | 'warning' | 'error' | 'neutral';

export type AttemptStatus = 'good' | 'bad' | 'pending' | 'current' | 'none';

export function statusBadgeClass(status: string): string {
  const key = status.toLowerCase();
  if (key === 'active' || key === 'live' || key === 'connected') return 'status-badge status-active';
  if (key === 'paused' || key === 'warning' || key === 'connecting') return 'status-badge status-warning';
  if (key === 'error' || key === 'offline' || key === 'failed') return 'status-badge status-error';
  return 'status-badge status-neutral';
}

export function attemptToneClass(status: string): string {
  const normalized = status.toLowerCase();
  if (normalized === 'successful') return 'text-green-200 bg-green-600/30 border border-green-500';
  if (normalized === 'failed') return 'text-red-200 bg-red-600/30 border border-red-500';
  return 'text-yellow-200 bg-yellow-600/30 border border-yellow-500';
}

/**
 * Get CSS classes for attempt status
 */
export function getAttemptStatusClass(status: string): string {
  const normalized = status.toLowerCase();

  switch (normalized) {
    case 'successful':
    case 'good':
      return 'text-green-600 bg-green-50 border border-green-200';
    case 'failed':
    case 'bad':
      return 'text-red-600 bg-red-50 border border-red-200';
    case 'pending':
      return 'text-yellow-600 bg-yellow-50 border border-yellow-200';
    case 'current':
      return 'text-blue-600 bg-blue-50 border border-blue-200 font-semibold';
    case 'skipped':
      return 'text-gray-500 bg-gray-50 border border-gray-200';
    case 'none':
    default:
      return 'text-gray-400 bg-gray-25 border border-gray-100';
  }
}

/**
 * Get icon for attempt status
 */
export function getAttemptStatusIcon(status: string): string {
  const normalized = status.toLowerCase();
  const iconMap: Record<string, string> = {
    successful: '✓',
    good: '✓',
    failed: '✗',
    bad: '✗',
    pending: '○',
    current: '●',
    skipped: '-',
    none: ''
  };

  return iconMap[normalized] ?? '';
}

/**
 * Get human-readable label for attempt status
 */
export function getAttemptStatusLabel(status: string): string {
  const normalized = status.toLowerCase();
  const labelMap: Record<string, string> = {
    successful: 'Good Lift',
    good: 'Good Lift',
    failed: 'No Lift',
    bad: 'No Lift',
    pending: 'Pending',
    current: 'Current',
    skipped: 'Skipped',
    none: 'Not Set'
  };

  return labelMap[normalized] ?? status;
}

/**
 * Check if attempt is complete
 */
export function isAttemptComplete(status: string): boolean {
  const normalized = status.toLowerCase();
  return ['successful', 'good', 'failed', 'bad', 'skipped'].includes(normalized);
}

/**
 * Get next logical status in attempt progression
 */
export function getNextAttemptStatus(current: string): string {
  const normalized = current.toLowerCase();
  const progressionMap: Record<string, string> = {
    none: 'pending',
    pending: 'current',
    current: 'successful', // Default to successful, UI can override
    successful: 'successful',
    good: 'good',
    failed: 'failed',
    bad: 'bad',
    skipped: 'skipped'
  };

  return progressionMap[normalized] ?? 'none';
}
