/**
 * Specialized formatting functions for the Werewolf Powerlifting web app
 */

/**
 * Format contest date for display
 */
export function formatContestDate(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });
}

/**
 * Format contest date with time
 */
export function formatContestDateTime(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

/**
 * Format relative time (e.g., "2 hours ago")
 */
export function formatRelativeTime(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffInMs = now.getTime() - date.getTime();
  const diffInMinutes = Math.floor(diffInMs / (1000 * 60));
  const diffInHours = Math.floor(diffInMs / (1000 * 60 * 60));
  const diffInDays = Math.floor(diffInMs / (1000 * 60 * 60 * 24));

  if (diffInMinutes < 1) return 'Just now';
  if (diffInMinutes < 60) return `${diffInMinutes}m ago`;
  if (diffInHours < 24) return `${diffInHours}h ago`;
  if (diffInDays < 7) return `${diffInDays}d ago`;

  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined
  });
}

/**
 * Format weight with proper units and precision
 */
export function formatWeightPrecise(weight: number, precision: number = 1): string {
  return `${weight.toFixed(precision)}kg`;
}

/**
 * Format percentage for display
 */
export function formatPercentage(value: number): string {
  return `${value.toFixed(1)}%`;
}

/**
 * Format ranking/position (1st, 2nd, 3rd, etc.)
 */
export function formatRanking(position: number): string {
  if (position === 1) return '1st';
  if (position === 2) return '2nd';
  if (position === 3) return '3rd';
  return `${position}th`;
}

/**
 * Format attempt with competition notation (125✓ for successful, 125✗ for failed)
 */
export function formatAttemptNotation(weight: number, status: string): string {
  const normalized = status.toLowerCase();
  const statusSymbol = normalized === 'successful' ? '✓' :
                      normalized === 'failed' ? '✗' : '';
  return `${weight}${statusSymbol}`;
}

/**
 * Format lift type for display
 */
export function formatLiftType(liftType: string): string {
  const liftMap: Record<string, string> = {
    squat: 'Squat',
    bench: 'Bench Press',
    deadlift: 'Deadlift'
  };

  return liftMap[liftType.toLowerCase()] ?? liftType;
}

/**
 * Format attempt number (1st, 2nd, 3rd)
 */
export function formatAttemptNumber(attemptNumber: number): string {
  const attemptMap: Record<number, string> = {
    1: '1st',
    2: '2nd',
    3: '3rd'
  };

  return attemptMap[attemptNumber] ?? `${attemptNumber}th`;
}

/**
 * Format bodyweight with appropriate precision
 */
export function formatBodyweight(weight: number): string {
  // Use 0.1kg precision for bodyweight
  return `${weight.toFixed(1)}kg`;
}

/**
 * Format total weight lifted (sum of best attempts)
 */
export function formatTotal(total: number | null): string {
  return total ? `${total}kg` : '-';
}

/**
 * Format coefficient/multiplier
 */
export function formatCoefficient(coefficient: number): string {
  return coefficient.toFixed(3);
}

/**
 * Format duration in minutes and seconds
 */
export function formatDuration(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
}

/**
 * Format competition order/lot number
 */
