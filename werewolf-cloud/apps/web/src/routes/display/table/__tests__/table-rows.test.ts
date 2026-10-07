import { describe, expect, it } from 'vitest';

import { applyRegistrationFilters, type RegistrationFilterState } from '$lib/filters/registrations';
import { buildUnifiedRows, sortUnifiedRows, type LiftKind } from '$lib/contest-table';
import type { Attempt, ContestDetail, Registration } from '$lib/types';

import { buildDisplayTableRows } from '../table-rows';

const CONTEST_ID = 'contest-1';

function makeRegistration(
  id: string,
  lastName: string,
  gender: string,
  weightClassId: string,
  ageCategoryId: string,
  labels: string[],
  competitionOrder: number,
  lifts: LiftKind[]
): Registration {
  return {
    id,
    competitorId: `competitor-${id}`,
    firstName: 'Jane',
    lastName,
    birthDate: '1995-05-05',
    gender,
    club: 'Werewolf',
    city: 'Warsaw',
    weightClassId,
    weightClassName: weightClassId,
    ageCategoryId,
    ageCategoryName: ageCategoryId,
    bodyweight: 70,
    rackHeightSquat: 10,
    rackHeightBench: 5,
    reshelCoefficient: null,
    mcculloughCoefficient: null,
    competitionOrder,
    labels,
    lifts,
  };
}

const registrations: Registration[] = [
  makeRegistration('reg-1', 'Doe', 'Female', 'wc-67.5', 'ac-senior', ['Masters'], 1, ['Squat', 'Bench', 'Deadlift']),
  makeRegistration('reg-2', 'Smith', 'Female', 'wc-60', 'ac-junior', [], 2, ['Squat', 'Bench', 'Deadlift']),
  makeRegistration('reg-3', 'Roe', 'Male', 'wc-82.5', 'ac-senior', [], 3, ['Squat', 'Bench']),
  makeRegistration('reg-4', 'Nowak', 'Male', 'wc-82.5', 'ac-junior', ['Open'], 4, ['Bench', 'Deadlift']),
  makeRegistration('reg-5', 'Kowalski', 'Male', 'wc-93', '', [], 5, ['Squat', 'Bench', 'Deadlift']),
];

const attempts: Attempt[] = [
  { id: 'a-1', registrationId: 'reg-1', liftType: 'Squat', attemptNumber: 1, weight: 100, status: 'Successful', createdAt: '', updatedAt: '2024-01-01T10:00:00Z' },
  { id: 'a-2', registrationId: 'reg-1', liftType: 'Bench', attemptNumber: 1, weight: 60, status: 'Failed', createdAt: '', updatedAt: '2024-01-01T10:01:00Z' },
  { id: 'a-3', registrationId: 'reg-2', liftType: 'Squat', attemptNumber: 1, weight: 90, status: 'Pending', createdAt: '', updatedAt: '2024-01-01T10:02:00Z' },
  { id: 'a-4', registrationId: 'reg-3', liftType: 'Bench', attemptNumber: 1, weight: 80, status: 'Successful', createdAt: '', updatedAt: '2024-01-01T10:03:00Z' },
  { id: 'a-5', registrationId: 'reg-4', liftType: 'Deadlift', attemptNumber: 1, weight: 120, status: 'Successful', createdAt: '', updatedAt: '2024-01-01T10:04:00Z' },
  { id: 'a-6', registrationId: 'reg-4', liftType: 'Squat', attemptNumber: 1, weight: 140, status: 'Failed', createdAt: '', updatedAt: '2024-01-01T10:05:00Z' },
];

const contest: ContestDetail = {
  id: CONTEST_ID,
  name: 'Test Meet',
  date: '2024-01-01',
  location: 'Warsaw',
  discipline: 'Powerlifting',
  status: 'Live',
  mensBarWeight: 20,
  womensBarWeight: 15,
  clampWeight: 2.5,
  competitionType: 'Powerlifting',
  registrations: [],
};

const ALL_FILTERS: RegistrationFilterState = { weight: 'ALL', age: 'ALL', label: 'ALL' };

/**
 * The row pipeline exactly as display/table/+page.svelte built it before the
 * extraction. Kept here as the reference implementation the extracted module
 * has to match.
 */
function legacyRows(
  filters: RegistrationFilterState,
  selectedLift: LiftKind | null,
  sortColumn: string,
  sortDirection: 'asc' | 'desc'
) {
  const unifiedRows = buildUnifiedRows({ registrations, attempts, contest });
  const sortedRows = sortUnifiedRows(unifiedRows, sortColumn, sortDirection);
  const registrationFilteredRows = applyRegistrationFilters(sortedRows, filters);
  return selectedLift != null
    ? registrationFilteredRows.filter((row) => row.registration.lifts?.includes(selectedLift))
    : registrationFilteredRows;
}

function extractedRows(
  filters: RegistrationFilterState,
  selectedLift: LiftKind | null,
  sortColumn: string,
  sortDirection: 'asc' | 'desc'
) {
  return buildDisplayTableRows({
    registrations,
    attempts,
    contest,
    sortColumn,
    sortDirection,
    filters,
    selectedLift,
  });
}

function ids(rows: ReturnType<typeof buildDisplayTableRows>): string[] {
  return rows.map((row) => row.registration.id);
}

describe('display table rows', () => {
  it.each([
    ['all rows', ALL_FILTERS, null, 'order', 'asc' as const],
    ['weight class filter', { ...ALL_FILTERS, weight: 'wc-82.5' }, null, 'order', 'asc' as const],
    ['female open filter', { ...ALL_FILTERS, weight: 'FEMALE_OPEN' }, null, 'order', 'asc' as const],
    ['age filter', { ...ALL_FILTERS, age: 'ac-junior' }, null, 'order', 'asc' as const],
    ['unassigned age filter', { ...ALL_FILTERS, age: 'UNASSIGNED' }, null, 'order', 'asc' as const],
    ['label filter', { ...ALL_FILTERS, label: 'LABEL:Masters' }, null, 'order', 'asc' as const],
    ['squat lift filter', ALL_FILTERS, 'Squat' as LiftKind, 'order', 'asc' as const],
    ['deadlift sort', ALL_FILTERS, null, 'max:Deadlift', 'desc' as const],
    ['squat filter with age filter', { ...ALL_FILTERS, age: 'ac-junior' }, 'Squat' as LiftKind, 'order', 'desc' as const],
  ])('matches the pre-extraction pipeline: %s', (_label, filters, selectedLift, sortColumn, sortDirection) => {
    expect(extractedRows(filters, selectedLift, sortColumn, sortDirection)).toEqual(
      legacyRows(filters, selectedLift, sortColumn, sortDirection)
    );
  });

  it('keeps the expected row order and selection', () => {
    expect(ids(extractedRows(ALL_FILTERS, null, 'order', 'asc'))).toEqual([
      'reg-1',
      'reg-2',
      'reg-3',
      'reg-4',
      'reg-5',
    ]);
    expect(ids(extractedRows({ ...ALL_FILTERS, weight: 'wc-82.5' }, null, 'order', 'asc'))).toEqual([
      'reg-3',
      'reg-4',
    ]);
    expect(ids(extractedRows(ALL_FILTERS, 'Squat', 'order', 'asc'))).toEqual([
      'reg-1',
      'reg-2',
      'reg-3',
      'reg-5',
    ]);
    expect(ids(extractedRows({ ...ALL_FILTERS, label: 'LABEL:Masters' }, null, 'order', 'asc'))).toEqual([
      'reg-1',
    ]);
    expect(ids(extractedRows(ALL_FILTERS, null, 'max:Deadlift', 'desc'))).toEqual([
      'reg-4',
      'reg-1',
      'reg-5',
      'reg-2',
      'reg-3',
    ]);
  });

  it('returns an empty list when nothing matches', () => {
    expect(extractedRows({ ...ALL_FILTERS, weight: 'wc-missing' }, null, 'order', 'asc')).toEqual([]);
  });
});
