import { Database } from 'bun:sqlite';

// Read-only: reporting must never create or modify the validation database.
const db = new Database('tmp/import-validation.sqlite', { readonly: true });

const tables = [
  'contests',
  'competitors',
  'registrations',
  'attempts',
  'contest_age_categories',
  'contest_weight_classes'
];

for (const table of tables) {
  const row = db.query(`SELECT COUNT(*) as count FROM ${table}`).get() as { count: number };
  console.log(`${table}: ${row.count}`);
}

db.close();
