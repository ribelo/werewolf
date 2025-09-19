// Utility functions for the Werewolf Powerlifting app

import type { WeightClass, AgeCategory, Registration } from './types';

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
    pending: '○',
    skipped: '-',
    good: '✓',
    bad: '✗',
    current: '●',
    none: ''
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
 * Format equipment type for display
 */
export function formatEquipment(equipment: string): string;
export function formatEquipment(reg: Registration): string;
export function formatEquipment(equipmentOrReg: string | Registration): string {
  if (typeof equipmentOrReg === 'string') {
    // Handle string equipment type
    const equipmentKey = equipmentOrReg.toLowerCase();
    const equipmentMap: Record<string, string> = {
      raw: 'Raw',
      'single-ply': 'Single-ply',
      'multi-ply': 'Multi-ply',
      wraps: 'Wraps',
      'raw-with-wraps': 'Raw with Wraps'
    };
    return equipmentMap[equipmentKey] ?? equipmentOrReg;
  } else {
    // Handle Registration object (existing logic)
    const equipment: string[] = [];
    if (equipmentOrReg.equipmentM) equipment.push('Multi-ply');
    if (equipmentOrReg.equipmentSm) equipment.push('Single-ply');
    if (equipmentOrReg.equipmentT) equipment.push('Wraps');
    return equipment.length > 0 ? equipment.join(', ') : 'Raw';
  }
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
  const weightClass = weightClasses.find(wc => wc.id === weightClassId);
  return weightClass ? weightClass.name : weightClassId;
}

/**
 * Format age class ID into display text
 */
export function formatAgeClass(ageClassId: string, ageCategories: AgeCategory[]): string {
  const ageCategory = ageCategories.find(ac => ac.id === ageClassId);
  return ageCategory ? ageCategory.name : ageClassId;
}
