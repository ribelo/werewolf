import { resetCoefficientCaches } from '../coefficients';
import { BackupPayloadError } from './errors';
import {
  BACKUP_FORMAT_VERSION,
  BACKUP_TABLES,
  backupManifestSchema,
  base64ToBytes,
  formatValidationIssues,
  type BackupColumn,
  type BackupRow,
} from './schema';

export interface RestoreOutcome {
  readonly counts: Record<string, number>;
  readonly contestIds: string[];
  readonly timestamp: string | null;
  readonly version: string;
}

function bindValue(column: BackupColumn, value: unknown): unknown {
  if (column.type === 'blob' && typeof value === 'string') {
    return base64ToBytes(value);
  }
  return value;
}

/**
 * Replace the whole database with the contents of a manifest.
 *
 * The payload is validated in full before anything is written and every
 * statement runs inside a single D1 batch, so a failure leaves the previous
 * contents untouched.
 */
export async function restoreDatabase(db: D1Database, manifest: unknown): Promise<RestoreOutcome> {
  const parsed = backupManifestSchema.safeParse(manifest);
  if (!parsed.success) {
    throw new BackupPayloadError(`Invalid backup payload: ${formatValidationIssues(parsed.error)}`);
  }

  const data = parsed.data.data;
  const statements: D1PreparedStatement[] = [];

  // D1 batch() executes every statement in one transaction.
  for (const table of [...BACKUP_TABLES].reverse()) {
    statements.push(db.prepare(`DELETE FROM ${table.name}`));
  }

  const counts: Record<string, number> = {};
  for (const table of BACKUP_TABLES) {
    const rows: BackupRow[] = data[table.name] ?? [];
    counts[table.name] = rows.length;

    const columnNames = table.columns.map((column) => column.name);
    const placeholders = columnNames.map(() => '?').join(', ');
    const insert = `INSERT INTO ${table.name} (${columnNames.join(', ')}) VALUES (${placeholders})`;

    for (const row of rows) {
      const values = table.columns.map((column) => bindValue(column, row[column.name]));
      statements.push(db.prepare(insert).bind(...values));
    }
  }

  await db.batch(statements);
  resetCoefficientCaches();

  return {
    counts,
    contestIds: (data['contests'] ?? []).map((contest) => String(contest['id'])),
    timestamp: parsed.data.timestamp ?? null,
    version: parsed.data.version ?? BACKUP_FORMAT_VERSION,
  };
}
