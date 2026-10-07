import { Database } from 'bun:sqlite';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';

const DB_PATH = 'tmp/import-validation.sqlite';
const MIGRATIONS_DIR = 'migrations';

const args = process.argv.slice(2);
const unknown = args.filter((arg) => arg !== '--reset');

if (unknown.length > 0) {
  console.error(`Unknown argument(s): ${unknown.join(', ')}`);
  console.error('Usage: bun run scripts/setup-local-d1.ts [--reset]');
  process.exit(1);
}

// The migrations are not idempotent, so an existing file is never reused: the
// script either stops or, with --reset, rebuilds the database from scratch.
if (existsSync(DB_PATH)) {
  if (!args.includes('--reset')) {
    console.error(`Refusing to reuse ${DB_PATH}: this script only builds a fresh database.`);
    console.error('Delete that file or re-run with --reset to rebuild it from scratch.');
    process.exit(1);
  }
  rmSync(DB_PATH);
  console.log(`Removed existing ${DB_PATH}`);
}

mkdirSync('tmp', { recursive: true });
const db = new Database(DB_PATH);

const files = readdirSync(MIGRATIONS_DIR)
  .filter((file) => file.endsWith('.sql'))
  .sort();

for (const file of files) {
  const sql = readFileSync(join(MIGRATIONS_DIR, file), 'utf-8');
  db.exec(sql);
}

db.close();
console.log('✅ Local test database initialised at', DB_PATH);
