import {
  buildUnifiedRows,
  sortUnifiedRows,
  type LiftKind,
  type UnifiedRow,
} from '$lib/contest-table';
import { applyRegistrationFilters, type RegistrationFilterState } from '$lib/filters/registrations';
import type { Attempt, ContestDetail, Registration } from '$lib/types';

export interface DisplayTableRowInput {
  registrations: Registration[];
  attempts: Attempt[];
  contest: ContestDetail | null;
  sortColumn: string;
  sortDirection: 'asc' | 'desc';
  filters: RegistrationFilterState;
  selectedLift: LiftKind | null;
}

/**
 * Builds the rows the table screen renders: unified contest rows, sorted, then
 * filtered by the synced registration filters and the selected lift.
 */
export function buildDisplayTableRows(input: DisplayTableRowInput): UnifiedRow[] {
  const unifiedRows = buildUnifiedRows({
    registrations: input.registrations,
    attempts: input.attempts,
    contest: input.contest,
  });

  const sortedRows = sortUnifiedRows(unifiedRows, input.sortColumn, input.sortDirection);
  const registrationFilteredRows = applyRegistrationFilters(sortedRows, input.filters);
  const selectedLift = input.selectedLift;

  if (selectedLift == null) {
    return registrationFilteredRows;
  }

  return registrationFilteredRows.filter((row) => row.registration.lifts?.includes(selectedLift));
}
