import { ageOnDate } from '@werewolf/domain';

/**
 * Age in whole years on the contest date, or null when either date is missing
 * or is not a real calendar date.
 */
export function resolveAgeOnContestDate(
  birthDate: string | null | undefined,
  contestDate: string | null | undefined,
): number | null {
  if (!birthDate || !contestDate) {
    return null;
  }

  return ageOnDate(birthDate, contestDate);
}
