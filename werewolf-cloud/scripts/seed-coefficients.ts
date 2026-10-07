import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn, type ChildProcess } from 'node:child_process';

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

const USAGE = `Usage: bun run scripts/seed-coefficients.ts (--local | --remote) [options]

  --local            seed the local wrangler D1 state (wrangler.dev.toml)
  --remote           seed the deployed D1 database, looked up by name (needs Cloudflare
                     credentials for wrangler, e.g. CLOUDFLARE_API_TOKEN)
  --database <name>  D1 database name (default: werewolf-d1-dev)
  --config <path>    wrangler config file (default: wrangler.dev.toml for --local, none for --remote)
  --env <name>       wrangler environment, --remote only`;

/** Reads the value following a flag (for example `--database <name>`) or reports the flag as incomplete. */
function requireArgValue(args: string[], index: number, flag: string): string {
  const value = args[index];

  if (value === undefined) {
    throw new Error(`Missing value for ${flag}\n\n${USAGE}`);
  }

  return value;
}

const describeSpawnError = (error: unknown): Error => {
  const message = error instanceof Error ? error.message : String(error);

  if (message.includes('ENOENT') || message.includes('not found')) {
    return new Error('wrangler was not found on PATH; install it or run this script through bunx wrangler');
  }

  return error instanceof Error ? error : new Error(message);
};

function runWrangler(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    let child: ChildProcess | null = null;

    try {
      child = spawn('wrangler', args, { stdio: 'inherit' });
    } catch (error) {
      reject(describeSpawnError(error));
      return;
    }

    child.on('error', (error) => reject(describeSpawnError(error)));

    child.on('close', (code, signal) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(signal ? `wrangler was terminated by ${signal}` : `wrangler exited with code ${code}`));
    });
  });
}

async function main() {
  const args = process.argv.slice(2);
  const options: {
    database: string;
    config?: string;
    env?: string;
    mode?: 'local' | 'remote';
  } = { database: 'werewolf-d1-dev' };

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    switch (arg) {
      case '--database':
        options.database = requireArgValue(args, ++i, '--database');
        break;
      case '--config':
        options.config = requireArgValue(args, ++i, '--config');
        break;
      case '--env':
        options.env = requireArgValue(args, ++i, '--env');
        break;
      case '--local':
      case '--remote': {
        const mode = arg === '--local' ? 'local' : 'remote';
        if (options.mode && options.mode !== mode) {
          throw new Error(`--local and --remote are mutually exclusive.\n\n${USAGE}`);
        }
        options.mode = mode;
        break;
      }
      default:
        throw new Error(`Unknown argument: ${arg}\n\n${USAGE}`);
    }
  }

  if (!options.mode) {
    throw new Error(`Choose the target: --local or --remote is required.\n\n${USAGE}`);
  }

  if (options.mode === 'local' && options.env) {
    throw new Error(`--env only applies to --remote.\n\n${USAGE}`);
  }

  const mode = options.mode;
  const config = options.config ?? (mode === 'local' ? 'wrangler.dev.toml' : undefined);

  const reshelMen = await loadJson<ReshelDataset>('packages/domain/src/data/reshel-men.json');
  const reshelWomen = await loadJson<ReshelDataset>('packages/domain/src/data/reshel-women.json');
  const mccullough = await loadJson<McCulloughDataset>('packages/domain/src/data/mccullough.json');

  const sql = buildSql(reshelMen, reshelWomen, mccullough);
  const tmp = await mkdtemp(join(tmpdir(), 'werewolf-coefficients-'));

  try {
    const sqlPath = join(tmp, 'seed.sql');
    await writeFile(sqlPath, sql, 'utf8');

    const argsList = [
      'd1',
      'execute',
      options.database,
      ...(config === undefined ? [] : ['--config', config]),
      '--file',
      sqlPath,
      `--${mode}`,
    ];

    if (mode === 'remote' && options.env) {
      argsList.push('--env', options.env);
    }

    await runWrangler(argsList);
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }

  console.log('Coefficient tables seeded successfully.');
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
