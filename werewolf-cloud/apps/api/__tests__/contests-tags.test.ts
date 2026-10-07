import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import type { D1Database } from '@cloudflare/workers-types';
import { createApp } from '../src/app';
import type { WerewolfEnvironment } from '../src/env';
import { resetCoefficientCaches } from '../src/services/coefficients';
import { renameContestTag, removeContestTag } from '../src/utils/tags';
import { createTestEnv, wipeDatabase, type TestEnvironment } from './helpers/d1';

type App = ReturnType<typeof createApp>;

describe('contest tags – label rewrites stay atomic', () => {
  let testEnv: TestEnvironment;
  let db: D1Database;
  let app: App;
  let env: WerewolfEnvironment;

  beforeAll(async () => {
    testEnv = await createTestEnv();
    db = testEnv.db;
    app = testEnv.app;
    env = testEnv.env;
  });

  afterAll(async () => {
    await testEnv.dispose();
  });

  beforeEach(async () => {
    await wipeDatabase(db);
    await clearKv();
    resetCoefficientCaches();
  });

  const request = (path: string, init?: RequestInit) =>
    app.request(`http://localhost${path}`, init, env);

  const json = (path: string, method: string, body?: unknown) =>
    request(path, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });

  const clearKv = async () => {
    const list = await testEnv.kv.list();
    await Promise.all(list.keys.map((key) => testEnv.kv.delete(key.name)));
  };

  async function createTaggedRegistration(tagLabel: string) {
    const contestRes = await json('/contests', 'POST', {
      name: 'Tag Atomicity Meet',
      date: '2025-08-08',
      location: 'Lublin',
      discipline: 'Powerlifting',
    });
    expect(contestRes.status).toBe(201);
    const contestId = (await contestRes.json()).data.id as string;

    const tagRes = await json(`/contests/${contestId}/tags`, 'POST', { label: tagLabel });
    expect(tagRes.status).toBe(201);
    const tagId = (await tagRes.json()).data.id as string;

    const competitorRes = await json('/competitors', 'POST', {
      firstName: 'Halina',
      lastName: 'Tag',
      birthDate: '1988-04-04',
      gender: 'Female',
    });
    expect(competitorRes.status).toBe(201);
    const competitorId = (await competitorRes.json()).data.id as string;

    const registrationRes = await json(`/contests/${contestId}/registrations`, 'POST', {
      contestId,
      competitorId,
      bodyweight: 66,
    });
    expect(registrationRes.status).toBe(201);
    const registrationId = (await registrationRes.json()).data.id as string;

    const labelRes = await json(`/registrations/${registrationId}/labels`, 'PATCH', {
      labels: [tagLabel],
    });
    expect(labelRes.status).toBe(200);

    return { contestId, tagId, registrationId };
  }

  const readLabels = async (registrationId: string): Promise<string[]> => {
    const row = await db
      .prepare('SELECT labels FROM registrations WHERE id = ?')
      .bind(registrationId)
      .first<{ labels: string }>();
    return JSON.parse(row?.labels ?? '[]') as string[];
  };

  const readTagLabel = async (tagId: string): Promise<string | null> => {
    const row = await db
      .prepare('SELECT label FROM contest_tags WHERE id = ?')
      .bind(tagId)
      .first<{ label: string }>();
    return row?.label ?? null;
  };

  it('DELETE drops the tag from registration labels', async () => {
    const { contestId, tagId, registrationId } = await createTaggedRegistration('vip');

    const deleteRes = await request(`/contests/${contestId}/tags/${tagId}`, { method: 'DELETE' });
    expect(deleteRes.status).toBe(200);

    expect(await readTagLabel(tagId)).toBeNull();
    expect(await readLabels(registrationId)).toEqual([]);
  });

  it('PATCH rename rewrites registration labels', async () => {
    const { contestId, tagId, registrationId } = await createTaggedRegistration('vip');

    const renameRes = await json(`/contests/${contestId}/tags/${tagId}`, 'PATCH', { label: 'vip-plus' });
    expect(renameRes.status).toBe(200);
    expect((await renameRes.json()).data.label).toBe('vip-plus');

    expect(await readTagLabel(tagId)).toBe('vip-plus');
    expect(await readLabels(registrationId)).toEqual(['vip-plus']);
  });

  it('rename leaves the tag untouched when the label rewrite fails', async () => {
    const { contestId, tagId, registrationId } = await createTaggedRegistration('vip');

    await db
      .prepare("CREATE TRIGGER block_registration_update BEFORE UPDATE ON registrations BEGIN SELECT RAISE(ABORT, 'blocked'); END")
      .run();

    try {
      // The trigger makes the label rewrite fail, so the whole batch – the tag
      // update and every label rewrite – must roll back.
      await expect(
        renameContestTag(db, contestId, tagId, 'vip', 'uniformed'),
      ).rejects.toBeTruthy();
    } finally {
      await db.prepare('DROP TRIGGER block_registration_update').run();
    }

    expect(await readTagLabel(tagId)).toBe('vip');
    expect(await readLabels(registrationId)).toEqual(['vip']);
  });

  it('removal leaves the tag and labels untouched when the label rewrite fails', async () => {
    const { contestId, tagId, registrationId } = await createTaggedRegistration('vip');

    await db
      .prepare("CREATE TRIGGER block_registration_update BEFORE UPDATE ON registrations BEGIN SELECT RAISE(ABORT, 'blocked'); END")
      .run();

    try {
      await expect(
        removeContestTag(db, contestId, tagId, 'vip'),
      ).rejects.toBeTruthy();
    } finally {
      await db.prepare('DROP TRIGGER block_registration_update').run();
    }

    expect(await readTagLabel(tagId)).toBe('vip');
    expect(await readLabels(registrationId)).toEqual(['vip']);
  });

  it('leaves other registrations alone when a tag is renamed', async () => {
    const { contestId, tagId, registrationId } = await createTaggedRegistration('vip');

    const competitorRes = await json('/competitors', 'POST', {
      firstName: 'Other',
      lastName: 'Lifter',
      birthDate: '1990-02-02',
      gender: 'Male',
    });
    const otherCompetitorId = (await competitorRes.json()).data.id as string;

    const otherRegistrationRes = await json(`/contests/${contestId}/registrations`, 'POST', {
      contestId,
      competitorId: otherCompetitorId,
      bodyweight: 90,
    });
    const otherRegistrationId = (await otherRegistrationRes.json()).data.id as string;

    const renameRes = await json(`/contests/${contestId}/tags/${tagId}`, 'PATCH', { label: 'uniformed' });
    expect(renameRes.status).toBe(200);

    expect(await readLabels(registrationId)).toEqual(['uniformed']);
    expect(await readLabels(otherRegistrationId)).toEqual(['Open']);
  });
});
