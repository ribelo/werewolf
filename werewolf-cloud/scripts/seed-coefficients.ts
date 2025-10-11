import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';

interface ReshelDataset {
  gender: 'male' | 'female';
  source: string;
  retrievedAt: string;
  entries: Array<{ bodyweightKg: number; coefficient: number }>;
}

interface McCulloughDataset {
  source: string;
  retrievedAt: string;
  entries: Array<{ age: number; coefficient: number }>;
}

async function loadJson<T>(path: string): Promise<T> {
  const { readFile } = await import('node:fs/promises');
  const data = await readFile(path, 'utf8');
  return JSON.parse(data) as T;
}

function quote(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

function buildSql(
  reshelMen: ReshelDataset,
  reshelWomen: ReshelDataset,
  mc: McCulloughDataset,
): string {
  const lines: string[] = [];
  lines.push('BEGIN TRANSACTION;');
  lines.push("DELETE FROM reshel_coefficients WHERE gender = 'male';");
  for (const entry of reshelMen.entries) {
    lines.push(
      `INSERT INTO reshel_coefficients (gender, bodyweight_kg, coefficient, source, retrieved_at) VALUES ('male', ${entry.bodyweightKg.toFixed(2)}, ${entry.coefficient.toFixed(3)}, ${quote(reshelMen.source)}, ${quote(reshelMen.retrievedAt)});`,
    );
  }
  lines.push("DELETE FROM reshel_coefficients WHERE gender = 'female';");
  for (const entry of reshelWomen.entries) {
    lines.push(
      `INSERT INTO reshel_coefficients (gender, bodyweight_kg, coefficient, source, retrieved_at) VALUES ('female', ${entry.bodyweightKg.toFixed(2)}, ${entry.coefficient.toFixed(3)}, ${quote(reshelWomen.source)}, ${quote(reshelWomen.retrievedAt)});`,
    );
  }
  lines.push('DELETE FROM mccullough_coefficients;');
  for (const entry of mc.entries) {
    lines.push(
      `INSERT INTO mccullough_coefficients (age, coefficient, source, retrieved_at) VALUES (${entry.age}, ${entry.coefficient.toFixed(3)}, ${quote(mc.source)}, ${quote(mc.retrievedAt)});`,
    );
  }
  lines.push('COMMIT;');
  return lines.join('\n');
}

async function main() {
  const args = process.argv.slice(2);
  const options: {
    database: string;
    config?: string;
    env?: string;
    local?: boolean;
  } = { database: 'werewolf-d1-dev' };

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    switch (arg) {
      case '--database':
        options.database = args[++i];
        break;
      case '--config':
        options.config = args[++i];
        break;
      case '--env':
        options.env = args[++i];
        break;
      case '--local':
        options.local = true;
        break;
      default:
        throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (!options.config) {
    options.config = options.local ? 'wrangler.dev.toml' : 'wrangler.toml';
  }

  const reshelMen = await loadJson<ReshelDataset>('packages/domain/src/data/reshel-men.json');
  const reshelWomen = await loadJson<ReshelDataset>('packages/domain/src/data/reshel-women.json');
  const mccullough = await loadJson<McCulloughDataset>('packages/domain/src/data/mccullough.json');

  const sql = buildSql(reshelMen, reshelWomen, mccullough);
  const tmp = await mkdtemp(join(tmpdir(), 'werewolf-coefficients-'));
  const sqlPath = join(tmp, 'seed.sql');
  await writeFile(sqlPath, sql, 'utf8');

  const argsList = ['d1', 'execute', options.database, '--config', options.config, '--file', sqlPath];
  if (options.local) {
    argsList.push('--local');
  } else if (options.env) {
    argsList.push('--env', options.env);
  }

  await new Promise<void>((resolve, reject) => {
    const child = spawn('wrangler', argsList, { stdio: 'inherit' });
    child.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`wrangler exited with code ${code}`));
      }
    });
  });

  console.log('Coefficient tables seeded successfully.');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
