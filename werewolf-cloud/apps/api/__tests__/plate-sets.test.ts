import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { Miniflare } from 'miniflare';
import type { D1Database } from '@cloudflare/workers-types';
import { createApp } from '../src/app';
import type { WerewolfEnvironment } from '../src/env';

const CONTEST_ID = 'contest-1';
const MISSING_CONTEST_ID = 'missing-contest';

const SCHEMA = [
  'CREATE TABLE IF NOT EXISTS contests (id TEXT PRIMARY KEY, mens_bar_weight REAL DEFAULT 20, womens_bar_weight REAL DEFAULT 15, clamp_weight REAL DEFAULT 2.5)',
  "CREATE TABLE IF NOT EXISTS plate_sets (id TEXT PRIMARY KEY, contest_id TEXT NOT NULL, plate_weight REAL NOT NULL, quantity INTEGER NOT NULL, color TEXT DEFAULT '#374151')",
];

type RequestCase = {
  label: string;
  method: string;
  path: string;
  body?: unknown;
};

const MISSING_CONTEST_CASES: RequestCase[] = [
  { label: 'list plate sets', method: 'GET', path: `/contests/${MISSING_CONTEST_ID}/platesets` },
  { label: 'create a plate set', method: 'POST', path: `/contests/${MISSING_CONTEST_ID}/platesets`, body: { plateWeight: 20, quantity: 2 } },
  { label: 'update a plate set', method: 'PATCH', path: `/contests/${MISSING_CONTEST_ID}/platesets/20`, body: { quantity: 2 } },
  { label: 'delete a plate set', method: 'DELETE', path: `/contests/${MISSING_CONTEST_ID}/platesets/20` },
  { label: 'calculate a plan', method: 'POST', path: `/contests/${MISSING_CONTEST_ID}/platesets/calculate`, body: { targetWeight: 100 } },
  { label: 'read plate colours', method: 'GET', path: `/contests/${MISSING_CONTEST_ID}/platesets/colors` },
  { label: 'read bar weights', method: 'GET', path: `/contests/${MISSING_CONTEST_ID}/platesets/barweights` },
  { label: 'update bar weights', method: 'PUT', path: `/contests/${MISSING_CONTEST_ID}/platesets/barweights`, body: { mensBarWeight: 20 } },
];

describe('plate set routes', () => {
  let mf: Miniflare;
  let db: D1Database;
  let app: ReturnType<typeof createApp>;
  let env: WerewolfEnvironment;

  beforeAll(async () => {
    mf = new Miniflare({
      modules: true,
      compatibilityDate: '2024-01-01',
      script: 'export default { async fetch() { return new Response("ok") } }',
      d1Databases: { DB: ':memory:' },
    });

    db = await mf.getD1Database('DB');
    for (const statement of SCHEMA) {
      await db.prepare(statement).run();
    }

    app = createApp();
    env = { DB: db, ENV: 'test' } as unknown as WerewolfEnvironment;
  });

  afterAll(async () => {
    await mf.dispose();
  });

  beforeEach(async () => {
    await db.prepare('DELETE FROM plate_sets').run();
    await db.prepare('DELETE FROM contests').run();
    await db
      .prepare('INSERT INTO contests (id, mens_bar_weight, womens_bar_weight, clamp_weight) VALUES (?, 20, 15, 2.5)')
      .bind(CONTEST_ID)
      .run();
  });

  const request = async (path: string, method = 'GET', body?: unknown): Promise<Response> =>
    app.request(
      `http://localhost${path}`,
      body === undefined
        ? { method }
        : { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) },
      env
    );

  it.each(MISSING_CONTEST_CASES)('returns a 404 envelope when the contest is missing ($label)', async (testCase) => {
    const response = await request(testCase.path, testCase.method, testCase.body);

    expect(response.status).toBe(404);
    const payload = await response.json();
    expect(payload).toMatchObject({ data: null, error: 'Contest not found' });
    expect(typeof payload.requestId).toBe('string');
  });

  it('creates, updates and deletes plate sets for an existing contest', async () => {
    const createResponse = await request(`/contests/${CONTEST_ID}/platesets`, 'POST', { plateWeight: 20, quantity: 2 });
    expect(createResponse.status).toBe(200);
    const createPayload = await createResponse.json();
    expect(createPayload).toMatchObject({ data: { success: true }, error: null });
    expect(typeof createPayload.requestId).toBe('string');

    const listResponse = await request(`/contests/${CONTEST_ID}/platesets`);
    const listPayload = await listResponse.json();
    expect(listPayload.data).toHaveLength(1);
    expect(listPayload.data[0]).toMatchObject({ plateWeight: 20, quantity: 2, color: '#2563EB' });

    const patchResponse = await request(`/contests/${CONTEST_ID}/platesets/20`, 'PATCH', { quantity: 5 });
    expect(patchResponse.status).toBe(200);

    const afterPatch = await (await request(`/contests/${CONTEST_ID}/platesets`)).json();
    expect(afterPatch.data[0].quantity).toBe(5);

    const deleteResponse = await request(`/contests/${CONTEST_ID}/platesets/20`, 'DELETE');
    expect(deleteResponse.status).toBe(200);

    const missingPlateSet = await request(`/contests/${CONTEST_ID}/platesets/20`, 'DELETE');
    expect(missingPlateSet.status).toBe(404);
    const missingPayload = await missingPlateSet.json();
    expect(missingPayload).toMatchObject({ data: null, error: 'Plate set not found' });
    expect(typeof missingPayload.requestId).toBe('string');
  });

  it('calculates an exact 28 kg plan with three 0.5 kg plates per side', async () => {
    await request(`/contests/${CONTEST_ID}/platesets`, 'POST', { plateWeight: 0.5, quantity: 3 });

    const response = await request(`/contests/${CONTEST_ID}/platesets/calculate`, 'POST', { targetWeight: 28 });

    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload).toMatchObject({ error: null, data: { exact: true, barWeight: 20, clampWeight: 5 } });
    expect(typeof payload.requestId).toBe('string');
    expect(payload.data.totalLoaded).toBeCloseTo(28, 6);
    expect(payload.data.increment).toBeCloseTo(1, 6);
    expect(payload.data.plates).toEqual([{ plateWeight: 0.5, count: 3, color: '#6B7280' }]);
  });

  it('updates and reads bar weights for an existing contest', async () => {
    const updateResponse = await request(`/contests/${CONTEST_ID}/platesets/barweights`, 'PUT', {
      mensBarWeight: 22,
      clampWeight: 4,
    });
    expect(updateResponse.status).toBe(200);

    const readResponse = await request(`/contests/${CONTEST_ID}/platesets/barweights`);
    const payload = await readResponse.json();
    expect(payload).toMatchObject({ error: null, data: { mensBarWeight: 22, clampWeight: 4 } });
    expect(typeof payload.requestId).toBe('string');
  });
});
