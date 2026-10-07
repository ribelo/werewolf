#!/usr/bin/env bun

/**
 * SQLite to D1 Import Script
 * 
 * Imports data from the legacy SQLite database (werewolf_full_export.sql)
 * into the Cloudflare D1 database for the Werewolf Cloud migration.
 * 
 * Uses Bun's built-in SQLite bindings for proper SQL parsing.
 */

import { Database, type SQLQueryBindings } from 'bun:sqlite';
import { readFileSync } from 'fs';

// Configuration
const D1_ACCOUNT_ID = process.env['CLOUDFLARE_ACCOUNT_ID'];
const D1_DATABASE_ID = process.env['CLOUDFLARE_D1_DATABASE_ID'];
const D1_API_TOKEN = process.env['CLOUDFLARE_API_TOKEN'];

const SQL_FILE_PATH = '../werewolf_full_export.sql';

// Parse command line arguments
const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const resetDb = args.includes('--reset');

function getArgValue(flag: string): string | null {
  const index = args.indexOf(flag);
  if (index === -1) return null;
  if (index === args.length - 1) {
    console.error(`❌ Missing value for ${flag}`);
    process.exit(1);
  }
  return args[index + 1] ?? null;
}

const localPath = getArgValue('--local-path');

/** One row as read back from SQLite: columns are only known at runtime. */
type TableRow = Record<string, unknown>;

interface TableData {
  [tableName: string]: TableRow[];
}

interface D1Error {
  code?: number;
  message?: string;
}

interface D1QueryResponse {
  errors?: D1Error[];
  messages?: string[];
  result?: unknown;
  success?: boolean;
}

const IMPORT_ORDER = [
  'settings',
  'contests',
  'contest_age_categories',
  'contest_weight_classes',
  'competitors',
  'registrations',
  'attempts',
  'contest_states',
  'current_lifts',
  'results',
  'plate_sets',
  'system_logs'
];

async function main() {
  console.log("🐺 Werewolf SQLite → D1 Import Tool");
  console.log("=====================================");

  if (!dryRun && !localPath && (!D1_ACCOUNT_ID || !D1_DATABASE_ID || !D1_API_TOKEN)) {
    console.error("❌ Missing required environment variables:");
    console.error("   CLOUDFLARE_ACCOUNT_ID");
    console.error("   CLOUDFLARE_D1_DATABASE_ID");
    console.error("   CLOUDFLARE_API_TOKEN");
    process.exit(1);
  }

  try {
    // Read and parse SQL export using Bun's SQLite
    console.log("📖 Reading SQLite export file...");
    const sqlContent = readFileSync(SQL_FILE_PATH, 'utf-8');

    // Create in-memory SQLite database
    const db = new Database(':memory:');
    
    // Execute the SQL dump to populate the database
    console.log("🔧 Executing SQL dump...");
    db.exec(sqlContent);

    // Extract data from all tables
    const tableData = extractTableData(db);
    console.log(`✅ Extracted data for ${Object.keys(tableData).length} tables`);

    // Show summary
    for (const [table, records] of Object.entries(tableData)) {
      console.log(`   ${table}: ${records.length} records`);
    }

    if (dryRun) {
      console.log("\n🔍 DRY RUN MODE - No data will be imported");
      console.log("Run without --dry-run to perform actual import");
      return;
    }

    if (localPath) {
      console.log(`\n📦 Importing data into local SQLite database: ${localPath}`);
      await importToLocalSqlite(tableData, localPath, resetDb);
      console.log("🎉 Local import completed successfully!");
      return;
    }

    if (resetDb) {
      console.log("\n🗑️  Resetting database...");
      await resetDatabase();
      console.log("✅ Database reset complete");
    }

    // Import data
    console.log("\n📤 Importing data to D1...");
    await importToD1(tableData);

    console.log("🎉 Import completed successfully!");
    console.log("\n📋 Next steps:");
    console.log("   1. Verify data in D1 dashboard");
    console.log("   2. Test API endpoints");
    console.log("   3. Update DNS and deploy frontend");

  } catch (error) {
    console.error("❌ Import failed:", error);
    process.exit(1);
  }
}

function extractTableData(db: Database): TableData {
  const tables: TableData = {};
  
  // Get all table names
  const tableNames = db.query('SELECT name FROM sqlite_master WHERE type="table" AND name NOT LIKE "sqlite_%"').all() as { name: string }[];
  
  for (const { name: tableName } of tableNames) {
    console.log(`📊 Extracting ${tableName}...`);
    
    // Get all rows from the table
    const rows = db.query(`SELECT * FROM ${tableName}`).all();
    
    // Transform rows to plain objects
    tables[tableName] = rows.map((row) => ({ ...(row as TableRow) }));
  }
  
  return tables;
}

async function resetDatabase() {
  // Clear all tables in correct order (respecting foreign keys)
  const tables = [
    'attempts',
    'registrations', 
    'competitors',
    'contests',
    'contest_age_categories',
    'contest_weight_classes',
    'settings',
    'contest_states',
    'current_lifts',
    'results',
    'plate_sets',
    'system_logs'
  ];

  for (const table of tables) {
    await executeD1Query(`DELETE FROM ${table}`);
  }
}

async function importToD1(tableData: TableData) {
  // Import in dependency order
  for (const tableName of IMPORT_ORDER) {
    const records = tableData[tableName];
    if (!records || records.length === 0) {
      console.log(`⏭️  Skipping ${tableName} (no data)`);
      continue;
    }

    console.log(`📊 Importing ${records.length} records to ${tableName}...`);

    // Transform records for D1 schema
    const transformedRecords = records.map(record => transformRecord(tableName, record));

    // Batch insert
    const batchSize = 100;
    for (let i = 0; i < transformedRecords.length; i += batchSize) {
      const batch = transformedRecords.slice(i, i + batchSize);
      await insertBatch(tableName, batch);
    }

    console.log(`✅ Imported ${records.length} records to ${tableName}`);
  }
}

async function importToLocalSqlite(tableData: TableData, targetPath: string, resetDb: boolean) {
  const db = new Database(targetPath);

  try {
    db.exec('PRAGMA foreign_keys = OFF;');

    if (resetDb) {
      console.log('🧹 Clearing existing data in local database...');
      resetLocalDatabase(db);
    }

    for (const tableName of IMPORT_ORDER) {
      const records = tableData[tableName];
      if (!records || records.length === 0) {
        console.log(`⏭️  Skipping ${tableName} (no data)`);
        continue;
      }

      console.log(`📊 Importing ${records.length} records to ${tableName}...`);
      const transformedRecords = records.map((record) => transformRecord(tableName, { ...record }));
      insertBatchLocal(db, tableName, transformedRecords);
      console.log(`✅ Imported ${records.length} records to ${tableName}`);
    }

    db.exec('PRAGMA foreign_keys = ON;');
  } finally {
    db.close();
  }
}

function resetLocalDatabase(db: Database) {
  const tables = [
    'attempts',
    'registrations',
    'competitors',
    'contests',
    'contest_age_categories',
    'contest_weight_classes',
    'settings',
    'contest_states',
    'current_lifts',
    'results',
    'plate_sets',
    'system_logs'
  ];

  const tx = db.transaction(() => {
    for (const table of tables) {
      db.prepare(`DELETE FROM ${table}`).run();
    }
  });

  tx();
}

function transformRecord(tableName: string, record: TableRow): TableRow {
  // Apply transformations based on table
  switch (tableName) {
    case 'contests':
      // Map legacy bar_weight column into gender-specific values
      if (record['bar_weight'] !== undefined) {
        record['mens_bar_weight'] = record['bar_weight'] || 20.0;
        record['womens_bar_weight'] = record['bar_weight'] || 15.0;
        delete record['bar_weight'];
      }
      break;
    case 'competitors':
      // Remove fields not in D1 schema
      delete record['email'];
      delete record['phone'];
      delete record['license_number'];
      break;
    case 'attempts':
      // Map result to status if needed
      if (record['result'] && !record['status']) {
        record['status'] = record['result'];
      }
      // Map judge_notes to notes
      if (record['judge_notes'] && !record['notes']) {
        record['notes'] = record['judge_notes'];
      }
      break;
  }

  return record;
}

async function insertBatch(tableName: string, records: TableRow[]) {
  const first = records[0];
  if (first === undefined) return;

  // Get column names from first record
  const columns = Object.keys(first);
  const placeholders = records.map(() => `(${columns.map(() => '?').join(',')})`).join(',');
  const sql = `INSERT OR REPLACE INTO ${tableName} (${columns.join(',')}) VALUES ${placeholders}`;

  const params: unknown[] = [];
  for (const record of records) {
    for (const column of columns) {
      params.push(record[column] ?? null);
    }
  }

  await executeD1Query(sql, params);
}

async function executeD1Query(sql: string, params: unknown[] = []): Promise<D1QueryResponse> {
  const url = `https://api.cloudflare.com/client/v4/accounts/${D1_ACCOUNT_ID}/d1/database/${D1_DATABASE_ID}/query`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${D1_API_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      sql,
      params
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`D1 API error: ${response.status} ${error}`);
  }

  const result = (await response.json()) as D1QueryResponse;
  if (result.errors && result.errors.length > 0) {
    throw new Error(`D1 query error: ${JSON.stringify(result.errors)}`);
  }

  return result;
}

function insertBatchLocal(db: Database, tableName: string, records: TableRow[]) {
  const first = records[0];
  if (first === undefined) return;

  const columns = Object.keys(first);
  const placeholders = columns.map(() => '?').join(',');
  const statement = db.prepare<unknown, SQLQueryBindings[]>(
    `INSERT OR REPLACE INTO ${tableName} (${columns.join(',')}) VALUES (${placeholders})`,
  );

  const insertMany = db.transaction((rows: TableRow[]) => {
    for (const row of rows) {
      const values = columns.map((column) => row[column] ?? null) as SQLQueryBindings[];
      statement.run(...values);
    }
  });

  insertMany(records);
  statement.finalize();
}

// Run the import
main().catch(console.error);
