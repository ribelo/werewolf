import { Database } from 'bun:sqlite';

const db = new Database('tmp/import-validation.sqlite');

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
