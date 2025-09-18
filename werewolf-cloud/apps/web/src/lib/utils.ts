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
 * Format equipment flags into human-readable text
 */
export function formatEquipment(reg: Registration): string {
  const equipment = [];
  if (reg.equipmentM) equipment.push('Multi-ply');
  if (reg.equipmentSm) equipment.push('Single-ply');
  if (reg.equipmentT) equipment.push('Wraps');
  return equipment.length > 0 ? equipment.join(', ') : 'Raw';
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
