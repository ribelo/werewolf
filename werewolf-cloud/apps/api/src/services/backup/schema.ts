import { z } from 'zod';

/**
 * Version of the backup manifest format.
 *
 * 2.0 covers every column of every table in the migrated D1 schema and encodes
 * binary columns (photo_data) as base64 strings.
 */
export const BACKUP_FORMAT_VERSION = '2.0';

export type BackupColumnType = 'id' | 'text' | 'integer' | 'real' | 'boolean' | 'json' | 'blob';

export interface BackupColumn {
  readonly name: string;
  readonly type: BackupColumnType;
  readonly nullable?: boolean;
}

export interface BackupTable {
  readonly name: string;
  readonly columns: readonly BackupColumn[];
}

export type BackupRow = Record<string, unknown>;
export type BackupData = Record<string, BackupRow[]>;
export type BackupRecordCounts = Record<string, number>;

const required = (name: string, type: BackupColumnType): BackupColumn => ({ name, type });
const nullable = (name: string, type: BackupColumnType): BackupColumn => ({ name, type, nullable: true });

/**
 * Every table of the migrated schema, ordered so that inserts satisfy foreign
 * keys; deletes run through the same list in reverse.
 */
export const BACKUP_TABLES: readonly BackupTable[] = [
  {
    name: 'contests',
    columns: [
      required('id', 'id'),
      required('name', 'text'),
      required('date', 'text'),
      required('location', 'text'),
      required('discipline', 'text'),
      required('status', 'text'),
      nullable('federation_rules', 'text'),
      nullable('competition_type', 'text'),
      nullable('organizer', 'text'),
      nullable('notes', 'text'),
      required('is_archived', 'boolean'),
      required('created_at', 'text'),
      required('updated_at', 'text'),
      nullable('bar_weight', 'real'),
      nullable('mens_bar_weight', 'real'),
      nullable('womens_bar_weight', 'real'),
      nullable('active_flight', 'text'),
      nullable('clamp_weight', 'real'),
    ],
  },
  {
    name: 'competitors',
    columns: [
      required('id', 'id'),
      required('first_name', 'text'),
      required('last_name', 'text'),
      required('birth_date', 'text'),
      required('gender', 'text'),
      nullable('club', 'text'),
      nullable('city', 'text'),
      nullable('notes', 'text'),
      nullable('photo_data', 'blob'),
      nullable('photo_format', 'text'),
      nullable('photo_metadata', 'text'),
      required('created_at', 'text'),
      required('updated_at', 'text'),
    ],
  },
  {
    name: 'contest_age_categories',
    columns: [
      required('id', 'id'),
      required('contest_id', 'text'),
      required('code', 'text'),
      required('name', 'text'),
      nullable('min_age', 'integer'),
      nullable('max_age', 'integer'),
      required('sort_order', 'integer'),
      nullable('metadata', 'text'),
    ],
  },
  {
    name: 'contest_weight_classes',
    columns: [
      required('id', 'id'),
      required('contest_id', 'text'),
      required('gender', 'text'),
      required('code', 'text'),
      required('name', 'text'),
      nullable('min_weight', 'real'),
      nullable('max_weight', 'real'),
      required('sort_order', 'integer'),
      nullable('metadata', 'text'),
    ],
  },
  {
    name: 'contest_tags',
    columns: [
      required('id', 'id'),
      required('contest_id', 'text'),
      required('label', 'text'),
      required('created_at', 'text'),
      required('updated_at', 'text'),
    ],
  },
  {
    name: 'plate_sets',
    columns: [
      required('id', 'id'),
      required('contest_id', 'text'),
      required('plate_weight', 'real'),
      required('quantity', 'integer'),
      required('created_at', 'text'),
      required('updated_at', 'text'),
      nullable('color', 'text'),
    ],
  },
  {
    name: 'contest_states',
    columns: [
      required('contest_id', 'id'),
      required('status', 'text'),
      nullable('current_round', 'integer'),
      nullable('current_lift', 'text'),
      nullable('current_attempt_number', 'integer'),
      required('updated_at', 'text'),
    ],
  },
  {
    name: 'settings',
    columns: [
      required('id', 'integer'),
      required('data', 'text'),
      required('created_at', 'text'),
      required('updated_at', 'text'),
    ],
  },
  {
    name: 'reshel_coefficients',
    columns: [
      required('gender', 'text'),
      required('bodyweight_kg', 'real'),
      required('coefficient', 'real'),
      required('source', 'text'),
      required('retrieved_at', 'text'),
      nullable('notes', 'text'),
    ],
  },
  {
    name: 'mccullough_coefficients',
    columns: [
      required('age', 'integer'),
      required('coefficient', 'real'),
      required('source', 'text'),
      required('retrieved_at', 'text'),
      nullable('notes', 'text'),
    ],
  },
  {
    name: 'system_logs',
    columns: [
      required('id', 'integer'),
      required('level', 'text'),
      required('message', 'text'),
      nullable('metadata', 'text'),
      required('created_at', 'text'),
    ],
  },
  {
    name: 'registrations',
    columns: [
      required('id', 'id'),
      required('contest_id', 'text'),
      required('competitor_id', 'text'),
      required('age_category_id', 'text'),
      nullable('weight_class_id', 'text'),
      nullable('bodyweight', 'real'),
      nullable('reshel_coefficient', 'real'),
      nullable('mccullough_coefficient', 'real'),
      nullable('rack_height_squat', 'integer'),
      nullable('rack_height_bench', 'integer'),
      required('created_at', 'text'),
      nullable('flight_code', 'text'),
      nullable('flight_order', 'integer'),
      nullable('labels', 'json'),
    ],
  },
  {
    name: 'registration_lifts',
    columns: [
      required('registration_id', 'text'),
      required('lift_type', 'text'),
      required('created_at', 'text'),
    ],
  },
  {
    name: 'attempts',
    columns: [
      required('id', 'id'),
      required('registration_id', 'text'),
      required('lift_type', 'text'),
      required('attempt_number', 'integer'),
      required('weight', 'real'),
      required('status', 'text'),
      nullable('timestamp', 'text'),
      nullable('judge1_decision', 'boolean'),
      nullable('judge2_decision', 'boolean'),
      nullable('judge3_decision', 'boolean'),
      nullable('notes', 'text'),
      required('created_at', 'text'),
      required('updated_at', 'text'),
    ],
  },
  {
    name: 'results',
    columns: [
      required('id', 'id'),
      required('registration_id', 'text'),
      required('contest_id', 'text'),
      nullable('best_bench', 'real'),
      nullable('best_squat', 'real'),
      nullable('best_deadlift', 'real'),
      required('total_weight', 'real'),
      required('coefficient_points', 'real'),
      nullable('place_open', 'integer'),
      nullable('place_in_age_class', 'integer'),
      nullable('place_in_weight_class', 'integer'),
      required('is_disqualified', 'boolean'),
      nullable('disqualification_reason', 'text'),
      required('broke_record', 'boolean'),
      nullable('record_type', 'text'),
      required('calculated_at', 'text'),
      nullable('squat_points', 'real'),
      nullable('bench_points', 'real'),
      nullable('deadlift_points', 'real'),
    ],
  },
  {
    name: 'current_lifts',
    columns: [
      required('id', 'integer'),
      required('contest_id', 'text'),
      required('registration_id', 'text'),
      required('lift_type', 'text'),
      required('attempt_number', 'integer'),
      required('weight', 'real'),
      nullable('timer_start', 'text'),
      required('timer_duration', 'integer'),
      nullable('rack_height', 'integer'),
      required('is_active', 'boolean'),
      required('created_at', 'text'),
      required('updated_at', 'text'),
    ],
  },
];

const BASE64_PATTERN = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunkSize = 0x8000;
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
  }
  return btoa(binary);
}

export function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

/** D1 returns BLOBs as ArrayBuffer, Uint8Array or a plain number array; all three are accepted. */
const blobSchema = z
  .union([
    z.string().regex(BASE64_PATTERN, 'must be a base64 string'),
    z.instanceof(ArrayBuffer),
    z.instanceof(Uint8Array),
    z.array(z.number().int().min(0).max(255)),
  ])
  .transform((value) => {
    if (typeof value === 'string') return value;
    if (value instanceof ArrayBuffer) return bytesToBase64(new Uint8Array(value));
    if (value instanceof Uint8Array) return bytesToBase64(value);
    return bytesToBase64(Uint8Array.from(value));
  });

/** JSON columns are stored as text; arrays are accepted for hand-edited payloads. */
const jsonTextSchema = z
  .union([z.string(), z.array(z.string())])
  .transform((value) => (Array.isArray(value) ? JSON.stringify(value) : value));

const COLUMN_SCHEMAS: Record<BackupColumnType, z.ZodTypeAny> = {
  id: z.string().min(1),
  text: z.string(),
  integer: z.number().int(),
  real: z.number(),
  boolean: z.union([z.boolean(), z.literal(0), z.literal(1)]),
  json: jsonTextSchema,
  blob: blobSchema,
};

function columnSchema(column: BackupColumn): z.ZodTypeAny {
  const schema = COLUMN_SCHEMAS[column.type];
  return column.nullable ? schema.nullable() : schema;
}

function tableRowSchema(table: BackupTable): z.ZodTypeAny {
  const shape: Record<string, z.ZodTypeAny> = {};
  for (const column of table.columns) {
    shape[column.name] = columnSchema(column);
  }
  return z.object(shape).strict();
}

const dataShape: Record<string, z.ZodTypeAny> = {};
for (const table of BACKUP_TABLES) {
  dataShape[table.name] = z.array(tableRowSchema(table));
}

/** Every table must be present; rows must carry exactly the schema columns. */
export const backupDataSchema: z.ZodType<BackupData> = z.object(dataShape).strict();

/**
 * The single backup manifest format. An entry without a version is treated as
 * the current format; any other version is rejected as unrecognised.
 */
export const backupManifestSchema = z.object({
  id: z.string().trim().min(1).optional(),
  timestamp: z.string().trim().min(1).optional(),
  version: z.literal(BACKUP_FORMAT_VERSION).optional(),
  data: backupDataSchema,
});

export function formatValidationIssues(error: z.ZodError): string {
  return error.issues
    .slice(0, 5)
    .map((issue) => {
      const path = issue.path.length > 0 ? issue.path.join('.') : '(root)';
      return `${path}: ${issue.message}`;
    })
    .join('; ');
}

export function countBackupRecords(data: BackupData): BackupRecordCounts {
  const counts: BackupRecordCounts = {};
  for (const table of BACKUP_TABLES) {
    counts[table.name] = data[table.name]?.length ?? 0;
  }
  return counts;
}
