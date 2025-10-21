import type { LiftType } from '@werewolf/domain';
import { ALL_LIFTS } from '@werewolf/domain/services/lifts';

export function parseStringArray(input: unknown): string[] {
  if (Array.isArray(input)) {
    return input.map(String);
  }
  if (typeof input === 'string') {
    try {
      const parsed = JSON.parse(input);
      return Array.isArray(parsed) ? parsed.map(String) : [];
    } catch {
      return [];
    }
  }
  return [];
}

export function parseLabels(input: unknown): string[] {
  return parseStringArray(input);
}

export function parseLifts(input: unknown): LiftType[] {
  const values = parseStringArray(input).map((value) => value.trim().toLowerCase()).filter(Boolean);
  const selected = ALL_LIFTS.filter((lift) => values.includes(lift.toLowerCase())) as LiftType[];
  return selected.length > 0 ? selected : [...ALL_LIFTS];
}

export function mapRegistrationRow(row: Record<string, any>): Record<string, any> {
  const normalised: Record<string, any> = { ...row };

  if ('labels' in normalised) {
    normalised['labels'] = parseLabels(normalised['labels']);
  }

  if ('lifts' in normalised) {
    normalised['lifts'] = parseLifts(normalised['lifts']);
  } else {
    normalised['lifts'] = [...ALL_LIFTS];
  }

  return normalised;
}
