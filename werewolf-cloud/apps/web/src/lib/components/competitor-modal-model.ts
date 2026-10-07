import type { AgeCategory, Attempt, CompetitorDetail, LiftType, Registration, WeightClass } from '$lib/types';
import type { AgeCategoryDescriptor, WeightClassDescriptor } from '@werewolf/domain';

/** Competitor fields edited by CompetitorModal (everything except the photo). */
export type CompetitorDraft = {
  firstName: string;
  lastName: string;
  birthDate: string;
  gender: string;
  club: string;
  city: string;
  notes: string;
};

/** Meet-specific registration fields edited by CompetitorModal. */
export type RegistrationDraft = {
  bodyweight: string;
  rackHeightSquat: string;
  rackHeightBench: string;
  weightClassId: string;
  ageCategoryId: string;
};

/** Opening attempt weight per lift, as typed by the operator. */
export type OpeningAttempts = Record<LiftType, string>;

export type CompetitorPayload = {
  firstName: string;
  lastName: string;
  birthDate: string;
  gender: string;
  club: string | null;
  city: string | null;
  notes: string | null;
};

export type RegistrationPayload = {
  bodyweight: number | null;
  rackHeightSquat: number | null;
  rackHeightBench: number | null;
  lifts: LiftType[];
  labels: string[];
};

export type RegistrationCreatePayload = RegistrationPayload & {
  competitorId: string;
};

export type OpeningAttemptPayload = {
  registrationId: string;
  liftType: LiftType;
  attemptNumber: 1;
  weight: number;
};

/** Value resolved into the modal promise by CompetitorModal. */
export type CompetitorModalResult = {
  registration?: Registration;
  deletedCompetitorId?: string;
  deletedRegistrationId?: string;
};

export function createEmptyCompetitorDraft(): CompetitorDraft {
  return {
    firstName: '',
    lastName: '',
    birthDate: '',
    gender: 'Male',
    club: '',
    city: '',
    notes: '',
  };
}

export function competitorDraftFromDetail(detail: CompetitorDetail): CompetitorDraft {
  return {
    firstName: detail.firstName ?? '',
    lastName: detail.lastName ?? '',
    birthDate: detail.birthDate ?? '',
    gender: detail.gender ?? 'Male',
    club: detail.club ?? '',
    city: detail.city ?? '',
    notes: detail.notes ?? '',
  };
}

export function createRegistrationDraft(source: Registration | null | undefined): RegistrationDraft {
  return {
    bodyweight: source?.bodyweight != null ? String(source.bodyweight) : '',
    rackHeightSquat: source?.rackHeightSquat != null ? String(source.rackHeightSquat) : '',
    rackHeightBench: source?.rackHeightBench != null ? String(source.rackHeightBench) : '',
    weightClassId: source?.weightClassId ?? '',
    ageCategoryId: source?.ageCategoryId ?? '',
  };
}

export function createOpeningAttempts(): OpeningAttempts {
  return { Squat: '', Bench: '', Deadlift: '' };
}

/**
 * Text typed into a number input. Svelte binds `<input type="number">` to a
 * number (and to undefined when cleared), so drafts typed as strings still
 * receive numbers at runtime.
 */
export type NumericInput = string | number | null | undefined;

export function parseFloatInput(value: NumericInput): number | null {
  if (value === null || value === undefined) {
    return null;
  }
  const trimmed = String(value).trim();
  if (trimmed === '') {
    return null;
  }
  const parsed = Number.parseFloat(trimmed.replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : null;
}

export function parseIntInput(value: NumericInput): number | null {
  if (value === null || value === undefined) {
    return null;
  }
  const trimmed = String(value).trim();
  if (trimmed === '') {
    return null;
  }
  const parsed = Number.parseInt(trimmed, 10);
  return Number.isNaN(parsed) ? null : parsed;
}

export function buildCompetitorPayload(draft: CompetitorDraft): CompetitorPayload {
  return {
    firstName: draft.firstName.trim(),
    lastName: draft.lastName.trim(),
    birthDate: draft.birthDate,
    gender: draft.gender,
    club: draft.club.trim() || null,
    city: draft.city.trim() || null,
    notes: draft.notes.trim() || null,
  };
}

export function buildRegistrationPayload(
  draft: RegistrationDraft,
  lifts: readonly LiftType[],
  labels: readonly string[],
): RegistrationPayload {
  return {
    bodyweight: parseFloatInput(draft.bodyweight),
    rackHeightSquat: parseIntInput(draft.rackHeightSquat),
    rackHeightBench: parseIntInput(draft.rackHeightBench),
    lifts: [...lifts],
    labels: [...labels],
  };
}

/** Reads the first attempts already stored for `lifts`; other lifts stay empty. */
export function openingAttemptsFromAttempts(
  attempts: readonly Attempt[],
  lifts: readonly LiftType[],
): OpeningAttempts {
  const next = createOpeningAttempts();
  for (const attempt of attempts) {
    if (attempt.attemptNumber === 1 && lifts.includes(attempt.liftType)) {
      next[attempt.liftType] = String(attempt.weight);
    }
  }
  return next;
}

export function toWeightClassDescriptors(classes: readonly WeightClass[]): WeightClassDescriptor[] {
  return classes
    .filter((cls) => Boolean(cls.id ?? cls.code))
    .map((cls) => ({
      id: cls.id ?? cls.code,
      code: cls.code,
      gender: cls.gender,
      minWeight: cls.minWeight,
      maxWeight: cls.maxWeight,
      sortOrder: cls.sortOrder ?? null,
    }));
}

export function toAgeCategoryDescriptors(categories: readonly AgeCategory[]): AgeCategoryDescriptor[] {
  return categories
    .filter((category) => Boolean(category.id ?? category.code))
    .map((category) => ({
      id: category.id ?? category.code,
      code: category.code,
      minAge: category.minAge,
      maxAge: category.maxAge,
      sortOrder: category.sortOrder ?? null,
    }));
}
