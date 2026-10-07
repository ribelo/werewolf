import type { Database } from './database';
import { executeQuery, executeQueryOne, executeMutation, generateId, getCurrentTimestamp } from './database';
import { parseLabels } from './registration-map';

export const MANDATORY_TAG_LABEL = 'Open';

export interface ContestTagRow {
  id: string;
  contest_id: string;
  label: string;
  created_at: string;
  updated_at: string;
}

interface RegistrationLabelRow {
  id: string;
  labels: string | null;
}

export async function seedContestTags(db: Database, contestId: string): Promise<void> {
  const existing = await executeQueryOne<{ id: string }>(
    db,
    'SELECT id FROM contest_tags WHERE contest_id = ? AND label = ?',
    [contestId, MANDATORY_TAG_LABEL]
  );

  if (!existing) {
    const timestamp = getCurrentTimestamp();
    await executeMutation(
      db,
      `INSERT INTO contest_tags (id, contest_id, label, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?)`,
      [generateId(), contestId, MANDATORY_TAG_LABEL, timestamp, timestamp]
    );
  }
}

export async function listContestTags(db: Database, contestId: string): Promise<ContestTagRow[]> {
  await seedContestTags(db, contestId);

  return executeQuery<ContestTagRow>(
    db,
    `SELECT id, contest_id, label, created_at, updated_at
     FROM contest_tags
     WHERE contest_id = ?
     ORDER BY datetime(created_at) ASC, label ASC`,
    [contestId]
  );
}

export async function assertContestTags(db: Database, contestId: string, labels: readonly string[]): Promise<void> {
  if (labels.length === 0) {
    return;
  }

  const unique = Array.from(new Set(labels.map((label) => label.trim()))).filter(Boolean);
  if (unique.length === 0) {
    return;
  }

  const rows = await executeQuery<{ label: string }>(
    db,
    `SELECT label FROM contest_tags WHERE contest_id = ? AND label IN (${unique.map(() => '?').join(',')})`,
    [contestId, ...unique]
  );

  const allowed = new Set(rows.map((row) => row.label));
  const missing = unique.filter((label) => !allowed.has(label));

  if (missing.length > 0) {
    throw new Error(`Unknown contest tags: ${missing.join(', ')}`);
  }
}

async function listRegistrationLabels(db: Database, contestId: string): Promise<RegistrationLabelRow[]> {
  return executeQuery<RegistrationLabelRow>(
    db,
    'SELECT id, labels FROM registrations WHERE contest_id = ?',
    [contestId]
  );
}

/**
 * Build the label rewrites for a contest. `rewrite` returns the next label
 * array, or null when the row must stay untouched.
 */
function rewriteLabelStatements(
  db: Database,
  registrations: readonly RegistrationLabelRow[],
  rewrite: (labels: string[]) => string[] | null,
): D1PreparedStatement[] {
  const statements: D1PreparedStatement[] = [];

  for (const registration of registrations) {
    const labels = parseLabels(registration.labels);
    const next = rewrite(labels);
    if (next === null) {
      continue;
    }

    statements.push(
      db
        .prepare('UPDATE registrations SET labels = ? WHERE id = ?')
        .bind(JSON.stringify(next), registration.id)
    );
  }

  return statements;
}

export async function removeContestTag(
  db: Database,
  contestId: string,
  tagId: string,
  label: string,
): Promise<void> {
  const registrations = await listRegistrationLabels(db, contestId);

  // One batch keeps the tag row and every label array in step: D1 rolls the
  // whole batch back when any statement fails.
  await db.batch([
    db.prepare('DELETE FROM contest_tags WHERE contest_id = ? AND id = ?').bind(contestId, tagId),
    ...rewriteLabelStatements(db, registrations, (labels) =>
      labels.includes(label) ? labels.filter((item) => item !== label) : null
    ),
  ]);
}

export async function renameContestTag(
  db: Database,
  contestId: string,
  tagId: string,
  previousLabel: string,
  nextLabel: string,
): Promise<void> {
  const registrations = await listRegistrationLabels(db, contestId);
  const timestamp = getCurrentTimestamp();

  await db.batch([
    db
      .prepare('UPDATE contest_tags SET label = ?, updated_at = ? WHERE contest_id = ? AND id = ?')
      .bind(nextLabel, timestamp, contestId, tagId),
    ...rewriteLabelStatements(db, registrations, (labels) =>
      labels.includes(previousLabel)
        ? labels.map((item) => (item === previousLabel ? nextLabel : item))
        : null
    ),
  ]);
}
