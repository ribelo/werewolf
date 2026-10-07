import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Miniflare } from 'miniflare';
import type { D1Database, KVNamespace } from '@cloudflare/workers-types';
import { createApp } from '../../src/app';
import type { WerewolfBindings, WerewolfEnvironment } from '../../src/env';
import { BACKUP_TABLES } from '../../src/services/backup';
import { createLiveRecorder, type LiveRecorder } from './live';

const HERE = path.dirname(fileURLToPath(import.meta.url));

/** `werewolf-cloud/migrations` – the SQL D1 applies in production. */
export const MIGRATIONS_DIR = path.resolve(HERE, '../../../../migrations');

/** Migration file names in the order D1 applies them. */
export function listMigrationFiles(): string[] {
  return readdirSync(MIGRATIONS_DIR)
    .filter((file) => file.endsWith('.sql'))
    .sort();
}

/**
 * Split one migration file into statements. Comments are dropped and
 * semicolons inside string literals or quoted identifiers do not split.
 */
export function splitSqlStatements(sql: string): string[] {
  const statements: string[] = [];
  let current = '';
  let quote: string | null = null;
  let inLineComment = false;

  for (let index = 0; index < sql.length; index += 1) {
    const char = sql.charAt(index);
    const next = sql.charAt(index + 1);

    if (inLineComment) {
      if (char === '\n') {
        inLineComment = false;
        current += char;
      }
      continue;
    }

    if (quote !== null) {
      current += char;
      if (char === quote) {
        if (next === quote) {
          current += next;
          index += 1;
        } else {
          quote = null;
        }
      }
      continue;
    }

    if (char === '-' && next === '-') {
      inLineComment = true;
      index += 1;
      continue;
    }

    if (char === "'" || char === '"') {
      quote = char;
      current += char;
      continue;
    }

    if (char === ';') {
      const statement = current.trim();
      if (statement.length > 0) {
        statements.push(statement);
      }
      current = '';
      continue;
    }

    current += char;
  }

  const tail = current.trim();
  if (tail.length > 0) {
    statements.push(tail);
  }

  return statements;
}

/**
 * Replay real migration files against a D1 database, one statement at a time –
 * the same way D1 applies them. Pass a slice of `listMigrationFiles()` to stop
 * at an intermediate schema version.
 */
export async function applyMigrations(
  db: D1Database,
  files: readonly string[] = listMigrationFiles(),
): Promise<void> {
  for (const file of files) {
    const sql = readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');

    for (const statement of splitSqlStatements(sql)) {
      await db.prepare(statement).run();
    }
  }
}

/** Delete every row of the migrated schema, children before parents. */
export async function wipeDatabase(db: D1Database): Promise<void> {
  for (const table of [...BACKUP_TABLES].reverse()) {
    await db.prepare(`DELETE FROM ${table.name}`).run();
  }
}

export type TestDatabase = {
  mf: Miniflare;
  db: D1Database;
  kv: KVNamespace;
  dispose: () => Promise<void>;
};

/** Start Miniflare with empty (unmigrated) D1 and KV bindings. */
export async function createTestDatabase(): Promise<TestDatabase> {
  const mf = new Miniflare({
    modules: true,
    compatibilityDate: '2024-01-01',
    script: 'export default { async fetch() { return new Response("ok") } }',
    d1Databases: { DB: ':memory:' },
    kvNamespaces: ['KV'],
  });

  const db = (await mf.getD1Database('DB')) as unknown as D1Database;
  const kv = (await mf.getKVNamespace('KV')) as unknown as KVNamespace;

  return { mf, db, kv, dispose: () => mf.dispose() };
}

export type CreateTestEnvOptions = {
  /** Extra bindings, e.g. `{ ENV: 'development' }` to exercise auth. */
  bindings?: Partial<WerewolfBindings>;
  /** Share a recorder with the caller; a fresh one is created by default. */
  live?: LiveRecorder;
};

export type TestEnvironment = TestDatabase & {
  app: ReturnType<typeof createApp>;
  env: WerewolfEnvironment;
  live: LiveRecorder;
};

/**
 * Build a test environment: Miniflare D1/KV, the real migrations applied, a
 * Hono app and a recording live-event namespace.
 */
export async function createTestEnv(options: CreateTestEnvOptions = {}): Promise<TestEnvironment> {
  const database = await createTestDatabase();
  await applyMigrations(database.db);

  const live = options.live ?? createLiveRecorder();
  const env = {
    DB: database.db,
    KV: database.kv,
    ENV: 'test',
    ADMIN_PASSWORD: 'test-password',
    'werewolf-contest-room': live.namespace,
    ...options.bindings,
  } as unknown as WerewolfEnvironment;

  return {
    ...database,
    app: createApp(),
    env,
    live,
  };
}
