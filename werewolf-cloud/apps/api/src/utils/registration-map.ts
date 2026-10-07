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

/**
 * Row returned by the joined registration SELECT in
 * services/registrations/reader, after convertKeysToCamelCase. The two JSON
 * columns still hold whatever the driver returned: a JSON string, an array or
 * null.
 */
export type RegistrationRow = {
  id: string;
  contestId: string;
  competitorId: string;
  ageCategoryId: string;
  weightClassId: string | null;
  bodyweight: number | null;
  reshelCoefficient: number | null;
  mcculloughCoefficient: number | null;
  rackHeightSquat: number | null;
  rackHeightBench: number | null;
  createdAt: string;
  flightCode: string | null;
  flightOrder: number | null;
  firstName: string;
  lastName: string;
  gender: string;
  birthDate: string;
  club: string | null;
  city: string | null;
  ageCategoryName: string | null;
  weightClassName: string | null;
  labels?: unknown;
  lifts?: unknown;
};

/** The registration payload every route response and live event carries. */
export type RegistrationRecord = Omit<RegistrationRow, 'labels' | 'lifts'> & {
  labels: string[];
  lifts: LiftType[];
};

export function mapRegistrationRow(row: RegistrationRow): RegistrationRecord {
  const { labels, lifts, ...rest } = row;

  return {
    ...rest,
    labels: parseLabels(labels),
    lifts: lifts === undefined ? [...ALL_LIFTS] : parseLifts(lifts),
  };
}
