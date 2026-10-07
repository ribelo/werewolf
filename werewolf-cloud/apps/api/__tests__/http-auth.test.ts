import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Miniflare } from 'miniflare';
import { createApp } from '../src/app';
import type { WerewolfEnvironment } from '../src/env';

const ADMIN_PASSWORD = 'test-password';
const CONTEST_ID = '11111111-1111-4111-8111-111111111111';
const REGISTRATION_ID = '22222222-2222-4222-8222-222222222222';

type FakeStatement = {
  bind: (...params: unknown[]) => FakeStatement;
  all: () => Promise<{ results: unknown[]; success: boolean; meta: Record<string, unknown> }>;
  first: () => Promise<unknown>;
  run: () => Promise<{ success: boolean; meta: Record<string, unknown> }>;
};

const createEmptyDatabase = (): D1Database => {
  const statement: FakeStatement = {
    bind: () => statement,
    all: async () => ({ results: [], success: true, meta: {} }),
    first: async () => null,
    run: async () => ({ success: true, meta: { changes: 0 } }),
  };

  return { prepare: () => statement } as unknown as D1Database;
};

const createMemoryKv = (): KVNamespace => {
  const store = new Map<string, string>();

  return {
    put: async (key: string, value: string) => {
      store.set(key, value);
    },
    get: async (key: string) => store.get(key) ?? null,
    delete: async (key: string) => {
      store.delete(key);
    },
    list: async () => ({ keys: [], list_complete: true, cursor: '' }),
  } as unknown as KVNamespace;
};

const createContestRoomNamespace = (): DurableObjectNamespace => ({
  idFromName: () => ({ toString: () => 'stub-room' } as unknown as DurableObjectId),
  get: () => ({ fetch: async () => new Response('upgrade') } as unknown as DurableObjectStub),
}) as unknown as DurableObjectNamespace;

const createStubEnv = (): WerewolfEnvironment => ({
  DB: createEmptyDatabase(),
  KV: createMemoryKv(),
  ENV: 'production',
  ADMIN_PASSWORD,
  'werewolf-contest-room': createContestRoomNamespace(),
}) as unknown as WerewolfEnvironment;

const login = async (
  app: ReturnType<typeof createApp>,
  env: WerewolfEnvironment,
  password = ADMIN_PASSWORD,
): Promise<string> => {
  const res = await app.request('http://localhost/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password }),
  }, env);

  expect(res.status).toBe(200);

  const setCookie = res.headers.get('Set-Cookie');
  expect(setCookie).toBeTruthy();

  const [sessionCookie] = (setCookie ?? '').split(';');

  return sessionCookie ?? '';
};

describe('HTTP access control', () => {
  const app = createApp();
  const env = createStubEnv();

  const administrativeReads = [
    '/system/backups',
    '/system/backups/backup_1',
    '/system/database',
    '/settings',
    '/settings/ui',
  ];

  it.each(administrativeReads)('requires an organizer session for GET %s', async (path) => {
    const res = await app.request(`http://localhost${path}`, {}, env);

    expect(res.status).toBe(401);

    const body = await res.json() as { data: unknown; error: string; requestId: unknown };
    expect(body).toMatchObject({ data: null, error: 'Authentication required' });
    expect(typeof body.requestId).toBe('string');
  });

  it('serves an administrative read once the session cookie is present', async () => {
    const cookie = await login(app, env);

    const res = await app.request('http://localhost/system/backups', {
      headers: { Cookie: cookie },
    }, env);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ data: { backups: [], total: 0 }, error: null });
  });

  it('keeps the session check public', async () => {
    const res = await app.request('http://localhost/auth/session', {}, env);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ data: { authenticated: false }, error: null });
  });

  it('keeps the service health check public', async () => {
    const res = await app.request('http://localhost/health', {}, env);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ data: { status: 'ok' }, error: null });
  });

  it('keeps the status endpoint the display pages poll public', async () => {
    const res = await app.request('http://localhost/system/health', {}, env);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ data: { status: 'healthy', database: 'connected' }, error: null });
  });

  const publicDisplayReads = [
    `/contests/${CONTEST_ID}`,
    `/contests/${CONTEST_ID}/registrations`,
    `/contests/${CONTEST_ID}/attempts`,
    `/contests/${CONTEST_ID}/attempts/current`,
    `/contests/${CONTEST_ID}/categories`,
    `/contests/${CONTEST_ID}/platesets`,
    `/contests/${CONTEST_ID}/results/public-bundle`,
    `/contests/${CONTEST_ID}/display/sync`,
  ];

  it.each(publicDisplayReads)('reaches the handler for the display read %s', async (path) => {
    const res = await app.request(`http://localhost${path}`, {}, env);

    expect([200, 204, 404]).toContain(res.status);
  });

  it('answers the live websocket join without a session', async () => {
    const res = await app.request(`http://localhost/ws/contests/${CONTEST_ID}`, {}, env);

    expect(res.status).toBe(200);
  });
});

describe('HTTP error envelopes', () => {
  const app = createApp();
  const env = createStubEnv();

  it('answers a malformed JSON body with the standard 400 envelope', async () => {
    const res = await app.request('http://localhost/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{"password": ',
    }, env);

    expect(res.status).toBe(400);

    const body = await res.json() as { data: unknown; error: string; requestId: unknown };
    expect(body).toMatchObject({ data: null, error: 'Invalid JSON in request body' });
    expect(typeof body.requestId).toBe('string');
  });

  it('answers a schema violation with the standard 400 envelope', async () => {
    const res = await app.request('http://localhost/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    }, env);

    expect(res.status).toBe(400);

    const body = await res.json() as { data: unknown; error: string; requestId: unknown };
    expect(body.data).toBeNull();
    expect(body.error).toContain('Validation failed');
    expect(typeof body.requestId).toBe('string');
  });

  it('normalises validation failures from a mounted route into the standard envelope', async () => {
    const cookie = await login(app, env);

    const res = await app.request(`http://localhost/contests/${CONTEST_ID}/results/rankings?type=bogus`, {
      headers: { Cookie: cookie },
    }, env);

    expect(res.status).toBe(400);

    const body = await res.json() as { data: unknown; error: string; requestId: unknown };
    expect(body.data).toBeNull();
    expect(body.error).toContain('Validation failed');
    expect(typeof body.requestId).toBe('string');
  });

  it('returns requestId on display sync envelopes', async () => {
    const cookie = await login(app, env);
    const payload = {
      id: 'sync-1',
      filters: { lift: null, sortColumn: 'name', sortDirection: 'asc', weight: 'all', age: 'all', label: 'all' },
    };

    const post = await app.request(`http://localhost/contests/${CONTEST_ID}/display/sync`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify(payload),
    }, env);

    expect(post.status).toBe(200);
    const postBody = await post.json() as { data: unknown; error: unknown; requestId: unknown };
    expect(postBody).toMatchObject({ data: { ok: true, id: 'sync-1' }, error: null });
    expect(typeof postBody.requestId).toBe('string');

    const get = await app.request(`http://localhost/contests/${CONTEST_ID}/display/sync`, {}, env);

    expect(get.status).toBe(200);
    const getBody = await get.json() as { data: unknown; error: unknown; requestId: unknown };
    expect(getBody).toMatchObject({ data: { id: 'sync-1' }, error: null });
    expect(typeof getBody.requestId).toBe('string');
  });

  it('keeps the display sync read as 204 when nothing was stored', async () => {
    const res = await app.request(`http://localhost/contests/${CONTEST_ID}/display/sync`, {
      headers: { Cookie: await login(app, env) },
    }, env);

    expect(res.status).toBe(200);

    const empty = await app.request('http://localhost/contests/33333333-3333-4333-8333-333333333333/display/sync', {}, env);

    expect(empty.status).toBe(204);
    expect(await empty.text()).toBe('');
  });
});

describe('registration result alias', () => {
  let mf: Miniflare;
  let app: ReturnType<typeof createApp>;
  let env: WerewolfEnvironment;

  beforeAll(async () => {
    mf = new Miniflare({
      modules: true,
      compatibilityDate: '2024-01-01',
      script: 'export default { async fetch() { return new Response("ok") } }',
      d1Databases: { DB: ':memory:' },
      kvNamespaces: ['KV'],
    });

    const db = await mf.getD1Database('DB');

    await db.prepare(`CREATE TABLE results (
      id TEXT PRIMARY KEY,
      registration_id TEXT NOT NULL,
      contest_id TEXT NOT NULL,
      best_bench REAL,
      best_squat REAL,
      best_deadlift REAL,
      total_weight REAL,
      coefficient_points REAL,
      squat_points REAL,
      bench_points REAL,
      deadlift_points REAL,
      place_open INTEGER,
      place_in_age_class INTEGER,
      place_in_weight_class INTEGER,
      is_disqualified BOOLEAN NOT NULL DEFAULT FALSE,
      disqualification_reason TEXT,
      broke_record BOOLEAN NOT NULL DEFAULT FALSE,
      record_type TEXT,
      calculated_at TEXT
    )`).run();

    await db
      .prepare("INSERT INTO results (id, registration_id, contest_id) VALUES ('result-1', ?, 'contest-1')")
      .bind(REGISTRATION_ID)
      .run();

    app = createApp();
    env = {
      DB: db,
      KV: await mf.getKVNamespace('KV'),
      ENV: 'production',
      ADMIN_PASSWORD,
      'werewolf-contest-room': createContestRoomNamespace(),
    } as unknown as WerewolfEnvironment;
  });

  afterAll(async () => {
    await mf.dispose();
  });

  it('serves the result of the registration named in the path', async () => {
    const cookie = await login(app, env);

    const res = await app.request(`http://localhost/registrations/${REGISTRATION_ID}/results`, {
      headers: { Cookie: cookie },
    }, env);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({
      data: { registrationId: REGISTRATION_ID, contestId: 'contest-1' },
      error: null,
    });
  });

  it('no longer needs a second id segment', async () => {
    const cookie = await login(app, env);

    const res = await app.request(`http://localhost/registrations/${REGISTRATION_ID}/results/${REGISTRATION_ID}`, {
      headers: { Cookie: cookie },
    }, env);

    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe('Not found');
  });
});
