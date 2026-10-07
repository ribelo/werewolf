/**
 * Attempt projections and the shared post-mutation sequence.
 *
 * Every attempt mutation (weight upsert, result update, current set/clear) ends
 * through `finalizeAttemptMutation`, so stored results, contest rankings, the
 * cached rankings payloads and the live event stream cannot drift apart.
 */
import type { AttemptNumber, AttemptStatus, LiftType } from '@werewolf/domain/models/attempt';
import type { WerewolfBindings } from '../env';
import type { Database } from '../utils/database';
import { executeQuery, executeQueryOne, convertKeysToCamelCase } from '../utils/database';
import { parseLabels } from '../utils/registration-map';
import { invalidateResultsCache } from '../utils/cache';
import { buildPlatePlan } from './plate-plan';
import type { PlatePlan } from './plate-plan';
import { calculateRegistrationResults, updateAllRankings } from './results';

/** SQLite stores booleans as 0/1 and D1 hands them back as numbers. */
export type SqliteBoolean = number | null;

/** Columns of one attempt, qualified for a query that aliases `attempts` as `a`. */
export const ATTEMPT_PROJECTION_COLUMNS = `a.id, a.registration_id, a.lift_type, a.attempt_number, a.weight,
        a.status, a.timestamp, a.judge1_decision, a.judge2_decision, a.judge3_decision,
        a.notes, a.created_at, a.updated_at`;

/** Row returned by ATTEMPT_PROJECTION_COLUMNS. */
export type AttemptRow = {
  id: string;
  registration_id: string;
  lift_type: LiftType;
  attempt_number: AttemptNumber;
  weight: number | null;
  status: AttemptStatus;
  timestamp: string | null;
  judge1_decision: SqliteBoolean;
  judge2_decision: SqliteBoolean;
  judge3_decision: SqliteBoolean;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

/** One attempt as the API returns it: AttemptRow with camelCase keys. */
export type AttemptView = {
  id: string;
  registrationId: string;
  liftType: LiftType;
  attemptNumber: AttemptNumber;
  weight: number | null;
  status: AttemptStatus;
  timestamp: string | null;
  judge1Decision: SqliteBoolean;
  judge2Decision: SqliteBoolean;
  judge3Decision: SqliteBoolean;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
};

export function mapAttemptRow(row: AttemptRow): AttemptView {
  return {
    id: row.id,
    registrationId: row.registration_id,
    liftType: row.lift_type,
    attemptNumber: row.attempt_number,
    weight: row.weight,
    status: row.status,
    timestamp: row.timestamp,
    judge1Decision: row.judge1_decision,
    judge2Decision: row.judge2_decision,
    judge3Decision: row.judge3_decision,
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function mapAttemptRows(rows: readonly AttemptRow[]): AttemptView[] {
  return rows.map(mapAttemptRow);
}

/** Attempt columns plus the competitor columns the desk-facing lists show. */
export const CONTEST_ATTEMPT_COLUMNS = `${ATTEMPT_PROJECTION_COLUMNS},
        comp.first_name, comp.last_name,
        comp.first_name || ' ' || comp.last_name AS competitor_name`;

export type ContestAttemptRow = AttemptRow & {
  first_name: string;
  last_name: string;
  competitor_name: string;
};

export type ContestAttemptView = AttemptView & {
  firstName: string;
  lastName: string;
  competitorName: string;
};

export function mapContestAttemptRow(row: ContestAttemptRow): ContestAttemptView {
  return {
    ...mapAttemptRow(row),
    firstName: row.first_name,
    lastName: row.last_name,
    competitorName: row.competitor_name,
  };
}

/** Attempt plus competitor and flight columns of the rising-bar queue. */
const ATTEMPT_QUEUE_COLUMNS = `${CONTEST_ATTEMPT_COLUMNS},
        r.flight_code, r.flight_order,
        COALESCE(r.labels, '[]') AS labels`;

export type AttemptQueueRow = ContestAttemptRow & {
  flight_code: string | null;
  flight_order: number | null;
  labels: unknown;
};

export type AttemptQueueEntry = ContestAttemptView & {
  flightCode: string | null;
  flightOrder: number | null;
  labels: string[];
};

export function mapAttemptQueueRow(row: AttemptQueueRow): AttemptQueueEntry {
  return {
    ...mapContestAttemptRow(row),
    flightCode: row.flight_code,
    flightOrder: row.flight_order,
    labels: parseLabels(row.labels),
  };
}

export type AttemptQueueFilter = {
  liftType: string;
  /** Round (attempt number) to list; a null round matches nothing, as before. */
  attemptNumber: number | null;
  /** Restrict the queue to one flight when the contest has an active flight. */
  flightCode?: string | null;
};

/**
 * Pending attempts of the current lift and round, ordered the way the platform
 * loads them: lightest first, then flight order and name.
 */
export async function listAttemptQueue(
  db: Database,
  contestId: string,
  filter: AttemptQueueFilter,
): Promise<AttemptQueueEntry[]> {
  const params: (string | number | null)[] = [contestId, filter.liftType, filter.attemptNumber];
  let flightClause = '';

  if (filter.flightCode) {
    flightClause = 'AND r.flight_code = ?';
    params.push(filter.flightCode);
  }

  const rows = await executeQuery<AttemptQueueRow>(
    db,
    `
    SELECT
      ${ATTEMPT_QUEUE_COLUMNS}
    FROM attempts a
    JOIN registrations r ON a.registration_id = r.id
    JOIN competitors comp ON r.competitor_id = comp.id
    WHERE r.contest_id = ?
      AND a.lift_type = ?
      AND a.attempt_number = ?
      AND a.status = 'Pending'
      AND a.weight IS NOT NULL
      ${flightClause}
    ORDER BY a.weight ASC,
      COALESCE(r.flight_order, 9999) ASC,
      comp.last_name ASC,
      comp.first_name ASC
    `,
    params,
  );

  return rows.map(mapAttemptQueueRow);
}

/** Row of the attempt plus its registration and competitor context. */
export type AttemptContextRow = AttemptRow & {
  contest_id: string;
  bodyweight: number | null;
  weight_class_id: string | null;
  weight_class_name: string | null;
  age_category_id: string | null;
  age_category_name: string | null;
  rack_height_squat: number | null;
  rack_height_bench: number | null;
  flight_code: string | null;
  flight_order: number | null;
  /** Raw registrations.labels JSON; the payload carries it through untouched. */
  labels: unknown;
  competitor_id: string;
  first_name: string;
  last_name: string;
  club: string | null;
  city: string | null;
  gender: string | null;
  birth_date: string | null;
};

/** The attempt of the current-attempt bundle, camelCase, labels kept raw. */
export type AttemptContextView = AttemptView & {
  contestId: string;
  bodyweight: number | null;
  weightClassId: string | null;
  weightClassName: string | null;
  ageCategoryId: string | null;
  ageCategoryName: string | null;
  rackHeightSquat: number | null;
  rackHeightBench: number | null;
  flightCode: string | null;
  flightOrder: number | null;
  labels: unknown;
  competitorId: string;
  firstName: string;
  lastName: string;
  club: string | null;
  city: string | null;
  gender: string | null;
  birthDate: string | null;
};

export async function getAttemptWithRelations(
  db: Database,
  attemptId: string,
  contestId?: string
): Promise<AttemptContextRow | null> {
  const params: string[] = contestId ? [attemptId, contestId] : [attemptId];
  return executeQueryOne<AttemptContextRow>(
    db,
    `
      SELECT
        a.id,
        a.registration_id,
        a.lift_type,
        a.attempt_number,
        a.weight,
        a.status,
        a.timestamp,
        a.judge1_decision,
        a.judge2_decision,
        a.judge3_decision,
        a.notes,
        a.created_at,
        a.updated_at,
        r.contest_id,
        r.bodyweight,
        r.weight_class_id,
        r.age_category_id,
        r.rack_height_squat,
        r.rack_height_bench,
        r.flight_code,
        r.flight_order,
        COALESCE(r.labels, '[]') AS labels,
        comp.id AS competitor_id,
        comp.first_name,
        comp.last_name,
        comp.club,
        comp.city,
        comp.gender,
        comp.birth_date,
        wc.name AS weight_class_name,
        ac.name AS age_category_name
      FROM attempts a
      JOIN registrations r ON a.registration_id = r.id
      JOIN competitors comp ON r.competitor_id = comp.id
      LEFT JOIN contest_weight_classes wc ON r.weight_class_id = wc.id
      LEFT JOIN contest_age_categories ac ON r.age_category_id = ac.id
      WHERE a.id = ?
      ${contestId ? 'AND r.contest_id = ?' : ''}
    `,
    params
  );
}

/** Row of one attempt in the per-lift list of the current-attempt bundle. */
export type AttemptSnapshotRow = {
  id: string;
  lift_type: LiftType;
  attempt_number: AttemptNumber;
  weight: number | null;
  status: AttemptStatus;
  updated_at: string | null;
  judge1_decision: SqliteBoolean;
  judge2_decision: SqliteBoolean;
  judge3_decision: SqliteBoolean;
  notes: string | null;
};

export type AttemptSnapshot = {
  id: string;
  liftType: LiftType;
  attemptNumber: AttemptNumber;
  weight: number | null;
  status: AttemptStatus;
  updatedAt: string | null;
  judge1Decision: SqliteBoolean;
  judge2Decision: SqliteBoolean;
  judge3Decision: SqliteBoolean;
  notes: string | null;
};

/** Every attempt of one registration, grouped by lift, in the bundle shape. */
export type AttemptsByLift = Record<LiftType, AttemptSnapshot[]>;

function mapAttemptSnapshot(row: AttemptSnapshotRow): AttemptSnapshot {
  return {
    id: row.id,
    liftType: row.lift_type,
    attemptNumber: row.attempt_number,
    weight: row.weight,
    status: row.status,
    updatedAt: row.updated_at,
    judge1Decision: row.judge1_decision,
    judge2Decision: row.judge2_decision,
    judge3Decision: row.judge3_decision,
    notes: row.notes,
  };
}

type ContestLiveSnapshot = {
  id: string;
  name: string;
  date: string;
  location: string;
  discipline: string;
  status: string | null;
  mensBarWeight: number | null;
  womensBarWeight: number | null;
};

export type CurrentAttemptRegistration = {
  id: string;
  contestId: string;
  bodyweight: number | null;
  weightClassId: string | null;
  weightClassName: string | null;
  ageCategoryId: string | null;
  ageCategoryName: string | null;
  rackHeightSquat: number | null;
  rackHeightBench: number | null;
  flightCode: string | null;
  flightOrder: number | null;
  labels: string[];
};

export type CurrentAttemptCompetitor = {
  id: string;
  firstName: string;
  lastName: string;
  club: string | null;
  city: string | null;
  gender: string | null;
  birthDate: string | null;
};

/** The bundle published as attempt.currentSet and served by GET attempts/current. */
export type CurrentAttemptPayload = {
  contest: ContestLiveSnapshot;
  attempt: AttemptContextView;
  registration: CurrentAttemptRegistration;
  competitor: CurrentAttemptCompetitor;
  attemptsByLift: AttemptsByLift;
  platePlan: PlatePlan | null;
  highlight: {
    liftType: LiftType;
    attemptNumber: AttemptNumber;
  };
};

type ContestLiveRow = {
  id: string;
  name: string;
  date: string;
  location: string;
  discipline: string;
  status: string | null;
  mens_bar_weight: number | null;
  womens_bar_weight: number | null;
};

export async function buildCurrentAttemptPayload(
  db: Database,
  contestId: string,
  attemptId: string
): Promise<CurrentAttemptPayload | null> {
  const attempt = await getAttemptWithRelations(db, attemptId, contestId);
  if (!attempt) {
    return null;
  }

  const contest = await executeQueryOne<ContestLiveRow>(
    db,
    `
      SELECT
        id,
        name,
        date,
        location,
        discipline,
        status,
        mens_bar_weight,
        womens_bar_weight
      FROM contests
      WHERE id = ?
    `,
    [contestId]
  );

  if (!contest) {
    return null;
  }

  const registrationAttempts = await executeQuery<AttemptSnapshotRow>(
    db,
    `
      SELECT
        id,
        lift_type,
        attempt_number,
        weight,
        status,
        updated_at,
        judge1_decision,
        judge2_decision,
        judge3_decision,
        notes
      FROM attempts
      WHERE registration_id = ?
      ORDER BY lift_type ASC, attempt_number ASC
    `,
    [attempt.registration_id]
  );

  const attemptsByLift: AttemptsByLift = {
    Squat: [],
    Bench: [],
    Deadlift: [],
  };

  for (const row of registrationAttempts) {
    attemptsByLift[row.lift_type].push(mapAttemptSnapshot(row));
  }

  let platePlan: PlatePlan | null = null;
  try {
    platePlan = await buildPlatePlan(db, contestId, Number(attempt.weight ?? 0), {
      gender: attempt.gender,
    });
  } catch (error) {
    console.error('Failed to build plate plan', { contestId, attemptId, error });
    platePlan = null;
  }

  // The payload is built with the stored column names and converted once, which
  // is what the live event and the HTTP response carry over the wire.
  const payload = {
    contest,
    attempt,
    registration: {
      id: attempt.registration_id,
      contest_id: attempt.contest_id,
      bodyweight: attempt.bodyweight,
      weight_class_id: attempt.weight_class_id,
      weight_class_name: attempt.weight_class_name,
      age_category_id: attempt.age_category_id,
      age_category_name: attempt.age_category_name,
      rack_height_squat: attempt.rack_height_squat,
      rack_height_bench: attempt.rack_height_bench,
      flight_code: attempt.flight_code,
      flight_order: attempt.flight_order,
      labels: parseLabels(attempt.labels),
    },
    competitor: {
      id: attempt.competitor_id,
      first_name: attempt.first_name,
      last_name: attempt.last_name,
      club: attempt.club,
      city: attempt.city,
      gender: attempt.gender,
      birth_date: attempt.birth_date,
    },
    attempts_by_lift: attemptsByLift,
    plate_plan: platePlan,
    highlight: {
      lift_type: attempt.lift_type,
      attempt_number: attempt.attempt_number,
    },
  };

  return convertKeysToCamelCase(payload) as unknown as CurrentAttemptPayload;
}

export type AttemptMutationInput = {
  env: WerewolfBindings;
  db: Database;
  contestId: string;
  registrationId: string;
  /**
   * Publishes the live event(s) of this mutation. Runs last, after the stored
   * rows and the cached rankings have caught up.
   */
  publish?: () => Promise<void>;
};

/**
 * The single post-mutation sequence shared by every attempt mutation: recalculate
 * the registration result, recompute contest rankings, drop the cached results and
 * publish the live event.
 */
export async function finalizeAttemptMutation(input: AttemptMutationInput): Promise<void> {
  await calculateRegistrationResults(input.db, input.registrationId);
  await updateAllRankings(input.db, input.contestId);
  await invalidateResultsCache(input.env.KV, input.contestId);
  await input.publish?.();
}
