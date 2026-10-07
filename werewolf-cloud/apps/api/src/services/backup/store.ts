import { executeQuery, getCurrentTimestamp } from '../../utils/database';
import { BackupCorruptError, BackupNotFoundError, BackupPayloadError } from './errors';
import {
  BACKUP_FORMAT_VERSION,
  BACKUP_TABLES,
  backupDataSchema,
  backupManifestSchema,
  countBackupRecords,
  formatValidationIssues,
  type BackupData,
  type BackupRecordCounts,
} from './schema';

const BACKUP_PREFIX = 'backup:';
const BACKUP_META_PREFIX = 'backup_meta:';

/** Keys that describe a manifest rather than one of its tables. */
const MANIFEST_KEYS = new Set(['id', 'timestamp', 'version', 'size', 'recordCounts']);

export interface BackupRecord {
  id: string;
  timestamp: string;
  version: string;
  size: number;
  recordCounts: BackupRecordCounts;
}

export interface BackupManifest {
  id: string;
  timestamp: string;
  version: string;
  data: BackupData;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function toSnakeCaseKey(key: string): string {
  return key.replace(/([A-Z])/g, (match) => `_${match.toLowerCase()}`).replace(/__/g, '_');
}

/** Downloaded manifests use camelCase keys; stored manifests always use column names. */
function convertToSnakeCase(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => convertToSnakeCase(item));
  }
  if (isPlainObject(value)) {
    const result: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value)) {
      result[toSnakeCaseKey(key)] = convertToSnakeCase(item);
    }
    return result;
  }
  return value;
}

/** Dump every table of the schema, validating the result against the manifest schema. */
export async function exportDatabase(db: D1Database): Promise<BackupData> {
  const tables: Record<string, unknown> = {};
  for (const table of BACKUP_TABLES) {
    tables[table.name] = await executeQuery(db, `SELECT * FROM ${table.name}`);
  }

  const parsed = backupDataSchema.safeParse(tables);
  if (!parsed.success) {
    throw new Error(
      `Database does not match the backup format: ${formatValidationIssues(parsed.error)}`,
    );
  }
  return parsed.data;
}

export async function createBackup(db: D1Database, kv: KVNamespace): Promise<BackupRecord> {
  const data = await exportDatabase(db);
  const id = `backup_${Date.now()}`;
  const timestamp = getCurrentTimestamp();
  const manifest: BackupManifest = { id, timestamp, version: BACKUP_FORMAT_VERSION, data };
  const json = JSON.stringify(manifest);
  const record: BackupRecord = {
    id,
    timestamp,
    version: BACKUP_FORMAT_VERSION,
    size: json.length,
    recordCounts: countBackupRecords(data),
  };

  await kv.put(`${BACKUP_PREFIX}${id}`, json);
  await kv.put(`${BACKUP_META_PREFIX}${id}`, JSON.stringify(record));

  return record;
}

/**
 * Validate an uploaded manifest and store it under a fresh backup id.
 * A payload without a "data" envelope is treated as the data itself.
 */
export async function importBackup(kv: KVNamespace, payload: unknown): Promise<BackupRecord> {
  if (!isPlainObject(payload)) {
    throw new BackupPayloadError('Invalid backup payload');
  }

  const normalised = convertToSnakeCase(payload) as Record<string, unknown>;
  let data: Record<string, unknown>;
  const envelope = normalised['data'];
  if (isPlainObject(envelope)) {
    data = envelope;
  } else {
    data = {};
    for (const [key, value] of Object.entries(normalised)) {
      if (!MANIFEST_KEYS.has(key)) {
        data[key] = value;
      }
    }
  }

  const parsed = backupManifestSchema.safeParse({
    id: normalised['id'],
    timestamp: normalised['timestamp'],
    version: normalised['version'],
    data,
  });
  if (!parsed.success) {
    throw new BackupPayloadError(`Invalid backup payload: ${formatValidationIssues(parsed.error)}`);
  }

  const timestamp = parsed.data.timestamp ?? getCurrentTimestamp();
  const version = parsed.data.version ?? BACKUP_FORMAT_VERSION;
  const requestedId = parsed.data.id ?? '';
  let id = requestedId.startsWith('backup_') ? requestedId : `backup_${requestedId || Date.now()}`;
  if (await kv.get(`${BACKUP_PREFIX}${id}`)) {
    id = `${id}_${Date.now()}`;
  }

  const manifest: BackupManifest = { id, timestamp, version, data: parsed.data.data };
  const json = JSON.stringify(manifest);
  const record: BackupRecord = {
    id,
    timestamp,
    version,
    size: json.length,
    recordCounts: countBackupRecords(parsed.data.data),
  };

  await kv.put(`${BACKUP_PREFIX}${id}`, json);
  await kv.put(`${BACKUP_META_PREFIX}${id}`, JSON.stringify(record));

  return record;
}

export async function listBackups(kv: KVNamespace): Promise<BackupRecord[]> {
  const keys = await kv.list({ prefix: BACKUP_META_PREFIX });
  const records: BackupRecord[] = [];

  for (const key of keys.keys) {
    const metadata = await kv.get(key.name);
    if (!metadata) continue;
    try {
      records.push(JSON.parse(metadata) as BackupRecord);
    } catch (error) {
      console.warn(`Failed to parse backup metadata for ${key.name}:`, error);
    }
  }

  records.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  return records;
}

export async function readBackup(kv: KVNamespace, backupId: string): Promise<BackupManifest> {
  const stored = await kv.get(`${BACKUP_PREFIX}${backupId}`);
  if (!stored) {
    throw new BackupNotFoundError();
  }

  try {
    return JSON.parse(stored) as BackupManifest;
  } catch {
    throw new BackupCorruptError();
  }
}

export async function deleteBackup(kv: KVNamespace, backupId: string): Promise<boolean> {
  const backupKey = `${BACKUP_PREFIX}${backupId}`;
  const metadataKey = `${BACKUP_META_PREFIX}${backupId}`;
  const [stored, metadata] = await Promise.all([kv.get(backupKey), kv.get(metadataKey)]);

  if (!stored && !metadata) {
    return false;
  }

  await Promise.all([kv.delete(backupKey), kv.delete(metadataKey)]);
  return true;
}
