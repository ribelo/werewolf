import type { LiftType } from '@werewolf/domain';
import { resolveContestLifts, ensureLiftsWithinContest, ALL_LIFTS } from '@werewolf/domain/services/lifts';
import { executeMutation, executeQuery } from './database';
import { publishEvent } from '../live/publish';
import type { WerewolfBindings } from '../env';
import { calculateRegistrationResults, updateAllRankings } from '../services/results';

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

export async function removeAttemptsForInactiveLifts(
  env: WerewolfBindings,
  contestId: string,
  db: D1Database,
  registrationId: string,
  activeLifts: LiftType[],
) {
  if (activeLifts.length >= ALL_LIFTS.length) {
    return;
  }

  if (activeLifts.length === 0) {
    const removed = await executeQuery(
      db,
      'SELECT id, lift_type FROM attempts WHERE registration_id = ?',
      [registrationId]
    );

    if (removed.length === 0) {
      return;
    }

    await executeMutation(db, 'DELETE FROM attempts WHERE registration_id = ?', [registrationId]);
    await calculateRegistrationResults(db, registrationId);
    await updateAllRankings(db, contestId);

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
    return;
  }

  const placeholders = activeLifts.map(() => '?').join(',');
  const params = [registrationId, ...activeLifts];

  const removedAttempts = await executeQuery(
    db,
    `
    SELECT id, lift_type
    FROM attempts
    WHERE registration_id = ?
      AND lift_type NOT IN (${placeholders})
    `,
    params
  );

  if (removedAttempts.length === 0) {
    return;
  }

  await executeMutation(
    db,
    `
    DELETE FROM attempts
    WHERE registration_id = ?
      AND lift_type NOT IN (${placeholders})
    `,
    params
  );
  await calculateRegistrationResults(db, registrationId);
  await updateAllRankings(db, contestId);

  for (const attempt of removedAttempts) {
    await publishEvent(env, contestId, {
      type: 'attempt.deleted',
      payload: {
        attemptId: attempt.id,
        registrationId,
        liftType: attempt.lift_type,
      },
    });
  }
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
