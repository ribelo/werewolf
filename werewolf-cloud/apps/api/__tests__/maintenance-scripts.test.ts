import { spawnSync } from 'node:child_process';
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';

const cloudRoot = resolve(fileURLToPath(new URL('../../../', import.meta.url)));
const scriptsDir = join(cloudRoot, 'scripts');
const migrationsDir = join(cloudRoot, 'migrations');

const bunPath = spawnSync('bash', ['-c', 'command -v bun'], { encoding: 'utf8' }).stdout.trim();

/**
 * PATH entries that hold no wrangler binary, so the fake one placed in the
 * sandbox bin directory is the one the scripts spawn.
 */
const pathWithoutWrangler = (process.env.PATH ?? '')
  .split(':')
  .filter((entry) => entry.length > 0 && !existsSync(join(entry, 'wrangler')))
  .join(':');

/** wrangler stand-in: records its arguments and snapshots the --file payload. */
const FAKE_WRANGLER = String.raw`#!/usr/bin/env bash
# wrangler stand-in: records its arguments and snapshots the --file payload.
set -u

printf '%s\n' "$*" >> "$WRANGLER_LOG"

sql=""
while [ "$#" -gt 0 ]; do
  if [ "$1" = "--file" ]; then
    shift
    sql="$1"
  fi
  shift
done

if [ -n "$sql" ] && [ -f "$sql" ]; then
  cp "$sql" "$WRANGLER_CAPTURE"
fi

if [ -n "$WRANGLER_FAIL" ]; then
  exit 3
fi

exit 0
`;

const sandboxes: string[] = [];

type Sandbox = {
  dir: string;
  binDir: string;
  emptyBinDir: string;
  logPath: string;
  capturePath: string;
};

const createSandbox = (): Sandbox => {
  const dir = mkdtempSync(join(tmpdir(), 'werewolf-scripts-test-'));
  sandboxes.push(dir);

  const sandbox: Sandbox = {
    dir,
    binDir: join(dir, 'bin'),
    emptyBinDir: join(dir, 'empty-bin'),
    logPath: join(dir, 'wrangler.log'),
    capturePath: join(dir, 'captured.sql'),
  };

  mkdirSync(sandbox.binDir, { recursive: true });
  mkdirSync(sandbox.emptyBinDir, { recursive: true });
  writeFileSync(join(sandbox.binDir, 'wrangler'), FAKE_WRANGLER, { mode: 0o755 });

  return sandbox;
};

const runBun = (script: string, args: string[] = [], cwd?: string, env: Record<string, string> = {}) =>
  spawnSync(bunPath, [script, ...args], {
    cwd: cwd ?? cloudRoot,
    encoding: 'utf8',
    env: { ...process.env, ...env },
  });

const runSeed = (sandbox: Sandbox, args: string[], env: Record<string, string> = {}) =>
  runBun(join(scriptsDir, 'seed-coefficients.ts'), args, cloudRoot, {
    PATH: `${sandbox.binDir}:${pathWithoutWrangler}`,
    WRANGLER_LOG: sandbox.logPath,
    WRANGLER_CAPTURE: sandbox.capturePath,
    WRANGLER_FAIL: '',
    ...env,
  });

const fixtureDir = (sandbox: Sandbox) => {
  cpSync(migrationsDir, join(sandbox.dir, 'migrations'), { recursive: true });
  return sandbox.dir;
};

afterEach(() => {
  while (sandboxes.length > 0) {
    const dir = sandboxes.pop();
    if (dir) {
      rmSync(dir, { recursive: true, force: true });
    }
  }
});

describe.skipIf(bunPath.length === 0)('repository maintenance scripts', () => {
  // Three bun subprocesses, each applying migrations to a scratch D1 database.
  it('setup-local-d1 only builds a fresh database and rebuilds it with --reset', { timeout: 60_000 }, () => {
    const sandbox = createSandbox();
    const workDir = fixtureDir(sandbox);
    const script = join(scriptsDir, 'setup-local-d1.ts');
    const dbPath = join(workDir, 'tmp/import-validation.sqlite');

    const first = runBun(script, [], workDir);
    expect(first.stderr).toBe('');
    expect(first.status).toBe(0);
    expect(existsSync(dbPath)).toBe(true);

    const second = runBun(script, [], workDir);
    expect(second.status).not.toBe(0);
    expect(second.stderr).toContain('Refusing to reuse');

    const third = runBun(script, ['--reset'], workDir);
    expect(third.status).toBe(0);
    expect(third.stdout).toContain('Removed existing');
    expect(third.stdout).toContain('Local test database initialised');
  });

  it('report-import-counts opens the validation database read-only', () => {
    const sandbox = createSandbox();
    const workDir = fixtureDir(sandbox);
    const script = join(scriptsDir, 'report-import-counts.ts');
    const dbPath = join(workDir, 'tmp/import-validation.sqlite');

    const missing = runBun(script, [], workDir);
    expect(missing.status).not.toBe(0);
    expect(existsSync(dbPath)).toBe(false);

    expect(runBun(join(scriptsDir, 'setup-local-d1.ts'), [], workDir).status).toBe(0);
    const before = statSync(dbPath).mtimeMs;

    const report = runBun(script, [], workDir);
    expect(report.status).toBe(0);
    expect(report.stdout).toContain('contests: 0');
    expect(report.stdout).toContain('contest_weight_classes: 0');
    expect(statSync(dbPath).mtimeMs).toBe(before);
  });

  it('seed-coefficients refuses to run without an explicit mode', () => {
    const sandbox = createSandbox();
    const result = runSeed(sandbox, []);

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('--local or --remote is required');
    expect(existsSync(sandbox.logPath)).toBe(false);
  });

  it('seed-coefficients rejects a flag without its value', () => {
    const sandbox = createSandbox();
    const result = runSeed(sandbox, ['--local', '--database']);

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('Missing value for --database');
    expect(existsSync(sandbox.logPath)).toBe(false);
  });

  it('seed-coefficients seeds locally with --local and cleans up its temp SQL', () => {
    const sandbox = createSandbox();
    const result = runSeed(sandbox, ['--local']);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('Coefficient tables seeded successfully.');

    const invocation = readFileSync(sandbox.logPath, 'utf8').trim();
    expect(invocation).toContain('d1 execute werewolf-d1-dev');
    expect(invocation).toContain('--config wrangler.dev.toml');
    expect(invocation).toContain('--local');
    expect(invocation).not.toContain('--remote');

    expect(readFileSync(sandbox.capturePath, 'utf8')).toContain('INSERT INTO reshel_coefficients');

    const sqlPath = invocation.match(/--file (\S+)/)?.[1] ?? '';
    expect(sqlPath).not.toBe('');
    expect(existsSync(sqlPath)).toBe(false);
    expect(existsSync(dirname(sqlPath))).toBe(false);
  });

  it('seed-coefficients passes --remote and --env to wrangler', () => {
    const sandbox = createSandbox();
    const result = runSeed(sandbox, ['--remote', '--database', 'werewolf-d1', '--env', 'production']);

    expect(result.status).toBe(0);

    const invocation = readFileSync(sandbox.logPath, 'utf8').trim();
    expect(invocation).toContain('d1 execute werewolf-d1');
    expect(invocation).toContain('--config wrangler.worker.toml');
    expect(invocation).toContain('--remote');
    expect(invocation).toContain('--env production');
    expect(invocation).not.toContain('--local');
  });

  it('seed-coefficients reports a failing wrangler', () => {
    const sandbox = createSandbox();
    const result = runSeed(sandbox, ['--local'], { WRANGLER_FAIL: '1' });

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('wrangler exited with code 3');
  });

  it('seed-coefficients reports a missing wrangler', () => {
    const sandbox = createSandbox();
    const result = runSeed(sandbox, ['--local'], {
      PATH: `${sandbox.emptyBinDir}:${pathWithoutWrangler}`,
    });

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('wrangler was not found on PATH');
  });
});

describe('deploy.sh', () => {
  it('uses the pinned workspace wrangler', () => {
    const deploy = readFileSync(join(scriptsDir, 'deploy.sh'), 'utf8');

    expect(deploy).not.toContain('wrangler@latest');
    expect(deploy).not.toContain('npx ');
    expect(deploy).toContain('bunx wrangler d1 migrations apply');
    expect(deploy).toContain('bunx wrangler deploy');
    expect(deploy).toContain('bunx wrangler pages secret put');
    expect(deploy).toContain('bunx wrangler pages deploy');
  });
});
