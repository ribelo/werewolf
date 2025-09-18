import { Database } from 'bun:sqlite';
import { readdirSync, readFileSync, mkdirSync } from 'fs';
import { join } from 'path';

const dbPath = 'tmp/import-validation.sqlite';
mkdirSync('tmp', { recursive: true });
const db = new Database(dbPath);

const migrationsDir = 'migrations';
const files = readdirSync(migrationsDir)
  .filter((file) => file.endsWith('.sql'))
  .sort();

for (const file of files) {
  const sql = readFileSync(join(migrationsDir, file), 'utf-8');
  db.exec(sql);
}

db.close();
console.log('✅ Local test database initialised at', dbPath);
