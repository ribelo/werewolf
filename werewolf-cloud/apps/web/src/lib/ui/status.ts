export type StatusTone = 'active' | 'warning' | 'error' | 'neutral';

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
