import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';

const cloudRoot = resolve(fileURLToPath(new URL('../../../', import.meta.url)));
const scriptPath = join(cloudRoot, 'scripts/curl-api-test.sh');

/**
 * curl stand-in for scripts/curl-api-test.sh: it records "METHOD PATH" once per
 * invocation and answers from a canned table, so the test can prove that the
 * script sends exactly one request per test, uses the declared HTTP method,
 * threads the ids it created through the follow-up requests and still fails
 * when a status does not match.
 */
const FAKE_CURL = String.raw`#!/usr/bin/env bash
# curl stand-in for scripts/curl-api-test.sh tests: records "METHOD PATH" for
# every invocation and answers from a canned table.
set -u

log="$CURL_LOG"
method="GET"
url=""
out=""
jar=""
data=""

while [ "$#" -gt 0 ]; do
  arg="$1"
  shift
  case "$arg" in
    -X) method="$1"; shift ;;
    -o) out="$1"; shift ;;
    -w) shift ;;
    -b) shift ;;
    -c) jar="$1"; shift ;;
    -H) shift ;;
    --data|-d) data="$1"; shift ;;
    -s|-S|-sS) ;;
    *) url="$arg" ;;
  esac
done

path="$(printf '%s' "$url" | sed -e "s|^$MOCK_BASE||")"

case "$method $path" in
  "POST /auth/login")
    status=200; body='{"data":{"authenticated":true},"error":null,"requestId":"mock"}' ;;
  "GET /health")
    status=200; body='{"data":{"status":"ok"},"error":null,"requestId":"mock"}' ;;
  "GET /system/health")
    status=200; body='{"data":{"status":"healthy"},"error":null,"requestId":"mock"}' ;;
  "GET /contests")
    status=200; body='{"data":[],"error":null,"requestId":"mock"}' ;;
  "GET /competitors")
    status=200; body='{"data":[],"error":null,"requestId":"mock"}' ;;
  "GET /settings")
    status=200; body='{"data":{},"error":null,"requestId":"mock"}' ;;
  "GET /settings/health")
    status=200; body='{"data":{"status":"healthy"},"error":null,"requestId":"mock"}' ;;
  "GET /settings/language")
    status=200; body='{"data":{"language":"pl"},"error":null,"requestId":"mock"}' ;;
  "GET /reference/weight-classes")
    status=200; body='{"data":[],"error":null,"requestId":"mock"}' ;;
  "GET /reference/age-categories")
    status=200; body='{"data":[],"error":null,"requestId":"mock"}' ;;
  "GET /system/database")
    status=200; body='{"data":{"status":"ok"},"error":null,"requestId":"mock"}' ;;
  "GET /system/backups")
    status=200; body='{"data":{"backups":[],"total":0},"error":null,"requestId":"mock"}' ;;
  "GET /settings/ui")
    status=200; body='{"data":{"theme":"light","showAttempts":true,"showWeights":true},"error":null,"requestId":"mock"}' ;;
  "PATCH /settings/ui")
    status=200; body='{"data":{"success":true},"error":null,"requestId":"mock"}' ;;
  "PUT /settings")
    status=200; body='{"data":{"success":true},"error":null,"requestId":"mock"}' ;;
  "POST /contests")
    case "$data" in
      *name*) status=201; body='{"data":{"id":"contest-1"},"error":null,"requestId":"mock"}' ;;
      *) status=400; body='{"data":null,"error":"Validation failed: name is required","requestId":"mock"}' ;;
    esac ;;
  "GET /contests/contest-1")
    status=200; body='{"data":{"id":"contest-1"},"error":null,"requestId":"mock"}' ;;
  "PATCH /contests/contest-1")
    status=200; body='{"data":{"id":"contest-1","status":"InProgress"},"error":null,"requestId":"mock"}' ;;
  "POST /competitors")
    case "$data" in
      *lastName*) status=201; body='{"data":{"id":"competitor-1"},"error":null,"requestId":"mock"}' ;;
      *) status=400; body='{"data":null,"error":"Validation failed: lastName is required","requestId":"mock"}' ;;
    esac ;;
  "GET /competitors/competitor-1")
    status=200; body='{"data":{"id":"competitor-1"},"error":null,"requestId":"mock"}' ;;
  "POST /contests/contest-1/registrations")
    status=201; body='{"data":{"id":"registration-1"},"error":null,"requestId":"mock"}' ;;
  "GET /contests/contest-1/registrations")
    status=200; body='{"data":[],"error":null,"requestId":"mock"}' ;;
  "GET /contests/invalid-id")
    status=404; body='{"data":null,"error":"Contest not found","requestId":"mock"}' ;;
  "PATCH /contests/invalid-id")
    status=404; body='{"data":null,"error":"Contest not found","requestId":"mock"}' ;;
  "GET /competitors/invalid-id")
    status=404; body='{"data":null,"error":"Competitor not found","requestId":"mock"}' ;;
  "DELETE /registrations/registration-1")
    status=200; body='{"data":{"success":true},"error":null,"requestId":"mock"}' ;;
  "DELETE /competitors/competitor-1")
    status=200; body='{"data":{"success":true},"error":null,"requestId":"mock"}' ;;
  "DELETE /contests/contest-1")
    status=200; body='{"data":{"success":true},"error":null,"requestId":"mock"}' ;;
  *)
    status=404; body='{"data":null,"error":"Not found","requestId":"mock"}' ;;
esac

if [ -n "%%{MOCK_BREAK_PATH:-}" ] && [ "$path" = "$MOCK_BREAK_PATH" ]; then
  status=500
  body='{"data":null,"error":"mock failure","requestId":"mock"}'
fi

printf '%s %s\n' "$method" "$path" >> "$log"

if [ "$method $path" = "POST /auth/login" ] && [ "$status" = "200" ]; then
  printf '#HttpOnly_api.test\tFALSE\t/\tFALSE\t0\twerewolf_session\tmock-session\n' > "$jar"
fi

if [ -n "$out" ]; then
  printf '%s' "$body" > "$out"
fi

printf '%s' "$status"
exit 0
`.split('%%{').join('${');

type Sandbox = { binDir: string; logPath: string };

type RunResult = { status: number | null; stdout: string; invocations: string[] };

const sandboxes: string[] = [];

const createSandbox = (): Sandbox => {
  const dir = mkdtempSync(join(tmpdir(), 'werewolf-curl-test-'));
  sandboxes.push(dir);

  const binDir = join(dir, 'bin');
  mkdirSync(binDir, { recursive: true });
  writeFileSync(join(binDir, 'curl'), FAKE_CURL, { mode: 0o755 });

  const logPath = join(dir, 'requests.log');
  writeFileSync(logPath, '');

  return { binDir, logPath };
};

const runScript = (sandbox: Sandbox, env: Record<string, string> = {}): RunResult => {
  const result = spawnSync('bash', [scriptPath, 'http://api.test'], {
    cwd: cloudRoot,
    encoding: 'utf8',
    env: {
      ...process.env,
      PATH: `${sandbox.binDir}:${process.env.PATH ?? ''}`,
      ADMIN_PASSWORD: 'test-password',
      CURL_LOG: sandbox.logPath,
      MOCK_BASE: 'http://api.test',
      ...env,
    },
  });

  const invocations = readFileSync(sandbox.logPath, 'utf8')
    .split('\n')
    .filter((line) => line.length > 0);

  return { status: result.status, stdout: result.stdout ?? '', invocations };
};

/**
 * Golden list: one line per test the script runs. A body-then-status double
 * fetch (the bug this guards against) would roughly double it.
 */
const EXPECTED_INVOCATIONS = [
  'POST /auth/login',
  'GET /health',
  'GET /system/health',
  'GET /contests',
  'GET /competitors',
  'GET /settings',
  'GET /settings/health',
  'GET /settings/language',
  'GET /reference/weight-classes',
  'GET /reference/age-categories',
  'GET /system/database',
  'GET /system/backups',
  'GET /settings/ui',
  'PATCH /settings/ui',
  'PUT /settings',
  'POST /contests',
  'GET /contests/contest-1',
  'PATCH /contests/contest-1',
  'POST /competitors',
  'GET /competitors/competitor-1',
  'POST /contests/contest-1/registrations',
  'GET /contests/contest-1/registrations',
  'GET /contests/invalid-id',
  'PATCH /contests/invalid-id',
  'GET /competitors/invalid-id',
  'POST /competitors',
  'DELETE /registrations/registration-1',
  'DELETE /competitors/competitor-1',
  'DELETE /contests/contest-1',
];

const hasJq = spawnSync('bash', ['-c', 'command -v jq'], { encoding: 'utf8' }).status === 0;

afterEach(() => {
  while (sandboxes.length > 0) {
    const dir = sandboxes.pop();
    if (dir) {
      rmSync(dir, { recursive: true, force: true });
    }
  }
});

describe.skipIf(!hasJq)('scripts/curl-api-test.sh', () => {
  it('signs in and sends exactly one request per test with the declared method', () => {
    const sandbox = createSandbox();
    const result = runScript(sandbox);

    expect(result.stdout).toContain('Signed in, session cookie stored.');
    expect(result.stdout).toContain('Tests failed: 0');
    expect(result.status).toBe(0);
    expect(result.invocations).toEqual(EXPECTED_INVOCATIONS);

    // Only the fixtures this run created are deleted, by id, with DELETE.
    expect(result.invocations.filter((line) => line.startsWith('DELETE '))).toEqual([
      'DELETE /registrations/registration-1',
      'DELETE /competitors/competitor-1',
      'DELETE /contests/contest-1',
    ]);
  });

  it('fails with a non-zero exit code when a status does not match', () => {
    const sandbox = createSandbox();
    const result = runScript(sandbox, { MOCK_BREAK_PATH: '/system/database' });

    expect(result.status).not.toBe(0);
    expect(result.stdout).toContain('Database status: expected HTTP 200, got 500');
    expect(result.stdout).toContain('Tests failed: 1');
    expect(result.invocations).toEqual(EXPECTED_INVOCATIONS);
  });

  it('aborts before creating fixtures when the sign-in fails', () => {
    const sandbox = createSandbox();
    const result = runScript(sandbox, { MOCK_BREAK_PATH: '/auth/login' });

    expect(result.status).not.toBe(0);
    expect(result.stdout).toContain('Login failed (HTTP 500)');
    expect(result.invocations).toEqual(['POST /auth/login']);
  });

  it('runs unauthenticated when ADMIN_PASSWORD is not set', () => {
    const sandbox = createSandbox();
    const result = runScript(sandbox, { ADMIN_PASSWORD: '' });

    expect(result.stdout).toContain('ADMIN_PASSWORD is not set');
    expect(result.invocations).toEqual(EXPECTED_INVOCATIONS.slice(1));
  });
});
