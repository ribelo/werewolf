import type { LiftType } from '@werewolf/domain';
import { resolveContestLifts, ensureLiftsWithinContest, ALL_LIFTS } from '@werewolf/domain/services/lifts';
import { executeMutation, executeQuery } from './database';
import { publishEvent } from '../live/publish';
import type { WerewolfBindings } from '../env';
import { finalizeAttemptMutation } from '../services/attempts';

export function contestLiftsFromRow(contest: { discipline?: string | null; competition_type?: string | null }): LiftType[] {
  return resolveContestLifts({
    competitionType: contest?.competition_type ?? null,
    discipline: contest?.discipline ?? null,
  });
}

export function normaliseLiftList(lifts: readonly LiftType[]): LiftType[] {
  return ALL_LIFTS.filter((lift) => lifts.includes(lift));
}

export function liftsEqual(a: readonly LiftType[], b: readonly LiftType[]): boolean {
  if (a.length !== b.length) return false;
  for (let index = 0; index < a.length; index += 1) {
    if (a[index] !== b[index]) {
      return false;
    }
  }
  return true;
}

export async function replaceRegistrationLifts(db: D1Database, registrationId: string, lifts: LiftType[]) {
  await executeMutation(
    db,
    'DELETE FROM registration_lifts WHERE registration_id = ?',
    [registrationId]
  );

  for (const lift of lifts) {
    await executeMutation(
      db,
      'INSERT INTO registration_lifts (registration_id, lift_type) VALUES (?, ?)',
      [registrationId, lift]
    );
  }
}

type RemovedAttempt = { id: string; lift_type: LiftType };

/**
 * Delete the attempts of the lifts a registration no longer competes in and run
 * the shared attempt-mutation sequence, so stored results, contest rankings and
 * the cached rankings payloads follow the deletion. Returns true when attempts
 * were deleted, which tells the caller the result of this registration has
 * already been rebuilt.
 */
export async function removeAttemptsForInactiveLifts(
  env: WerewolfBindings,
  contestId: string,
  db: D1Database,
  registrationId: string,
  activeLifts: LiftType[],
): Promise<boolean> {
  if (activeLifts.length >= ALL_LIFTS.length) {
    return false;
  }

  // An empty lift list has no IN clause to build; it removes every attempt.
  const inactiveClause =
    activeLifts.length === 0 ? '' : ` AND lift_type NOT IN (${activeLifts.map(() => '?').join(',')})`;
  const params = [registrationId, ...activeLifts];

  const removed = await executeQuery<RemovedAttempt>(
    db,
    `SELECT id, lift_type FROM attempts WHERE registration_id = ?${inactiveClause}`,
    params
  );

  if (removed.length === 0) {
    return false;
  }

  await executeMutation(
    db,
    `DELETE FROM attempts WHERE registration_id = ?${inactiveClause}`,
    params
  );

  await finalizeAttemptMutation({
    env,
    db,
    contestId,
    registrationId,
    publish: async () => {
      for (const attempt of removed) {
        await publishEvent(env, contestId, {
          type: 'attempt.deleted',
          payload: {
            attemptId: attempt.id,
            registrationId,
            liftType: attempt.lift_type,
          },
        });
      }
    },
  });

  return true;
}

export function ensureLiftsForContest(
  requested: readonly (string | LiftType)[] | undefined,
  contestLifts: LiftType[],
): LiftType[] {
  const resolved = requested
    ? ensureLiftsWithinContest(requested, contestLifts)
    : ensureLiftsWithinContest(contestLifts, contestLifts);
  if (resolved.length > 0) {
    return resolved;
  }
  if (contestLifts.length > 0) {
    return [...contestLifts];
  }
  return [...ALL_LIFTS];
}
