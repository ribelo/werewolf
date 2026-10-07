import { executeQuery } from '../../utils/database';
import { invalidatePrefix, rankingsBundlePrefix } from '../../utils/cache';
import { calculateRegistrationResults, updateAllRankings } from '../results';

export interface RebuildContestOptions {
  /** Results of these registrations are recalculated (used after coefficient changes). */
  readonly recalculate?: readonly string[];
}

async function findRegistrationsWithoutResults(db: D1Database, contestId: string): Promise<string[]> {
  const rows = await executeQuery<{ id: string }>(
    db,
    `SELECT r.id
       FROM registrations r
      WHERE r.contest_id = ?
        AND NOT EXISTS (SELECT 1 FROM results res WHERE res.registration_id = r.id)`,
    [contestId],
  );
  return rows.map((row) => row.id);
}

/**
 * Bring stored results and rankings of a contest back in line and drop its
 * cached rankings. Existing result rows are kept as they are (they may carry
 * disqualification or record flags); only registrations without a result row
 * are calculated, unless explicit registrations are passed in.
 */
export async function rebuildContestResults(
  db: D1Database,
  kv: KVNamespace,
  contestId: string,
  options: RebuildContestOptions = {},
): Promise<void> {
  const registrationIds = options.recalculate ?? (await findRegistrationsWithoutResults(db, contestId));

  for (const registrationId of registrationIds) {
    await calculateRegistrationResults(db, registrationId);
  }

  await updateAllRankings(db, contestId);
  await invalidatePrefix(kv, rankingsBundlePrefix(contestId));
}
