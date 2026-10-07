import type { D1Database } from '@cloudflare/workers-types';
import { convertKeysToCamelCase, executeQuery, executeQueryOne } from '../../utils/database';
import { mapRegistrationRow, type RegistrationRecord, type RegistrationRow } from '../../utils/registration-map';

/**
 * Active lifts of one registration as a JSON array ordered Squat, Bench,
 * Deadlift – the order the UI expects.
 */
const LIFTS_JSON_SELECT = `(
        SELECT json_group_array(lift_type)
        FROM (
          SELECT lift_type
          FROM registration_lifts rl
          WHERE rl.registration_id = r.id
          ORDER BY
            CASE rl.lift_type
              WHEN 'Squat' THEN 1
              WHEN 'Bench' THEN 2
              WHEN 'Deadlift' THEN 3
            END
        )
      ) AS lifts`;

/**
 * Every column of the registration payload. Joined-registration reads must use
 * this list so a payload looks the same wherever it is produced.
 */
const REGISTRATION_COLUMNS = `SELECT
      r.id, r.contest_id, r.competitor_id, r.age_category_id, r.weight_class_id,
      r.bodyweight, r.reshel_coefficient, r.mccullough_coefficient,
      r.rack_height_squat, r.rack_height_bench, r.created_at,
      r.flight_code, r.flight_order, COALESCE(r.labels, '[]') AS labels,
      ${LIFTS_JSON_SELECT},
      c.first_name, c.last_name, c.gender, c.birth_date, c.club, c.city,
      cac.name AS age_category_name,
      cwc.name AS weight_class_name`;

const REGISTRATION_JOINS = `FROM registrations r
    JOIN competitors c ON r.competitor_id = c.id
    LEFT JOIN contest_age_categories cac ON r.age_category_id = cac.id
    LEFT JOIN contest_weight_classes cwc ON r.weight_class_id = cwc.id`;

const REGISTRATION_ORDER = `ORDER BY
      CASE WHEN r.flight_code IS NULL THEN 1 ELSE 0 END,
      r.flight_code ASC,
      COALESCE(r.flight_order, 0) ASC,
      cac.sort_order ASC,
      cwc.sort_order ASC,
      c.last_name ASC,
      c.first_name ASC`;

/** D1 rows are snake_case; the shared mapper reads the camelCase shape. */
function toRegistrationRecord(row: unknown): RegistrationRecord {
  return mapRegistrationRow(convertKeysToCamelCase(row) as RegistrationRow);
}

/** Registration payload for one registration, or null when it does not exist. */
export async function selectRegistration(
  db: D1Database,
  registrationId: string,
): Promise<RegistrationRecord | null> {
  const row = await executeQueryOne(
    db,
    `${REGISTRATION_COLUMNS}
    ${REGISTRATION_JOINS}
    WHERE r.id = ?`,
    [registrationId],
  );

  return row ? toRegistrationRecord(row) : null;
}

/** Registration payloads of one contest in flight order. */
export async function selectContestRegistrations(
  db: D1Database,
  contestId: string,
): Promise<RegistrationRecord[]> {
  const rows = await executeQuery(
    db,
    `${REGISTRATION_COLUMNS}
    ${REGISTRATION_JOINS}
    WHERE r.contest_id = ?
    ${REGISTRATION_ORDER}`,
    [contestId],
  );

  return rows.map(toRegistrationRecord);
}

/** Registration payloads of one competitor, across every contest. */
export async function selectCompetitorRegistrations(
  db: D1Database,
  competitorId: string,
): Promise<RegistrationRecord[]> {
  const rows = await executeQuery(
    db,
    `${REGISTRATION_COLUMNS}
    ${REGISTRATION_JOINS}
    WHERE r.competitor_id = ?`,
    [competitorId],
  );

  return rows.map(toRegistrationRecord);
}
