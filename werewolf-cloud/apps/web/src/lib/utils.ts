// Utility functions for the Werewolf Powerlifting app

import type { WeightClass, AgeCategory } from './types';

/**
 * Get Tailwind CSS classes for status badges
 */
export function getStatusClasses(status: string): string {
  const statusKey = status.toLowerCase();
  const statusMap: Record<string, string> = {
    active: 'status-active',
    inprogress: 'status-active',
    setup: 'status-warning',
    paused: 'status-warning',
    completed: 'status-neutral',
    cancelled: 'status-error',
    healthy: 'status-active',
    unhealthy: 'status-error',
    ok: 'status-active',
    error: 'status-error'
  };

  const variant = statusMap[statusKey] ?? 'status-neutral';
  return `status-badge ${variant}`;
}

/**
 * Format attempt status for display
 */
export function formatStatus(status: string): string {
  const statusKey = status.toLowerCase();
  const statusMap: Record<string, string> = {
    successful: '✓',
    failed: '✗',
    pending: '○'
  };

  return statusMap[statusKey] ?? status;
}

/**
 * Format attempt weight and status
 */
export function formatAttempt(weight: number, status: string): string {
  const formattedWeight = formatWeight(weight);
  const statusSymbol = formatStatus(status);
  return statusSymbol ? `${formattedWeight}${statusSymbol}` : formattedWeight;
}

/**
 * Format competitor full name
 */
export function formatCompetitorName(firstName: string, lastName: string): string {
  return `${firstName} ${lastName}`.trim();
}

/**
 * Format weight with proper units (kg)
 */
export function formatWeight(weight: number): string {
  return `${weight}kg`;
}

/**
 * Format coefficient values with fixed precision
 */
export function formatCoefficient(value: number | null | undefined, options: { fallback?: string } = {}): string {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return options.fallback ?? '—';
  }
  return value.toFixed(3);
}

/**
 * Calculate age from birth date
 */
export function formatAge(birthDate: string): number {
  const birth = new Date(birthDate);
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const monthDiff = today.getMonth() - birth.getMonth();

  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
    age--;
  }

  return age;
}

/**
 * Format weight class ID into display text
 */
export function formatWeightClass(weightClassId: string, weightClasses: WeightClass[]): string {
  const weightClass = weightClasses.find((wc) => wc.id === weightClassId || wc.code === weightClassId);
  return weightClass ? weightClass.name : weightClassId;
}

export function normaliseAgeCategoryLabel(
  label: string | null | undefined,
  code: string | null | undefined = null
): string {
  const trimmedLabel = (label ?? '').trim();
  const upperCode = (code ?? '').trim().toUpperCase();

  if (upperCode === 'OPEN' || trimmedLabel.toLowerCase() === 'open') {
    return 'Senior (24-39)';
  }

  if (trimmedLabel.length > 0) {
    return trimmedLabel;
  }

  if (upperCode.length > 0) {
    return upperCode;
  }

  return '';
}

/**
 * Format age class ID into display text
 */
export function formatAgeClass(ageCategoryId: string, ageCategories: AgeCategory[]): string {
  const ageCategory = ageCategories.find((ac) => ac.id === ageCategoryId || ac.code === ageCategoryId);
  if (!ageCategory) {
    return ageCategoryId;
  }
  const label = normaliseAgeCategoryLabel(ageCategory.name, ageCategory.code);
  return label || ageCategoryId;
}
