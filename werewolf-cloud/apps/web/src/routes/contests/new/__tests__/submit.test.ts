import { describe, expect, it } from 'vitest';
import type { MutationOutcome } from '$lib/api';
import { createEmptyCompetitorDraft, type CompetitorDraft, type ContestEvent } from '../draft';
import {
  attemptKey,
  buildSubmissionCompetitors,
  pendingDrafts,
  runContestSetup,
  type ContestSetupInput,
  type SetupApi,
} from '../submit';

interface Call {
  method: 'post' | 'put';
  endpoint: string;
  data: unknown;
}

interface FakeReply {
  data?: unknown;
  error?: string;
  throws?: boolean;
}

interface Counters {
  competitors: number;
  registrations: number;
  attempts: number;
}

type Handler = (call: Call, counters: Counters) => FakeReply | null;

interface FakeApi extends SetupApi {
  calls: Call[];
}

function defaultReply(call: Call, counters: Counters): FakeReply {
  if (call.endpoint === '/contests') return { data: { id: 'contest-1' } };
  if (call.endpoint.endsWith('/categories')) return { data: {} };
  if (call.endpoint.endsWith('/tags')) return { data: { id: 'tag-1' } };
  if (call.endpoint === '/competitors') {
    counters.competitors += 1;
    return { data: { id: 'competitor-' + String(counters.competitors) } };
  }
  if (call.endpoint.startsWith('/contests/') && call.endpoint.endsWith('/registrations')) {
    counters.registrations += 1;
    return { data: { id: 'registration-' + String(counters.registrations) } };
  }
  if (call.endpoint.endsWith('/attempts')) {
    counters.attempts += 1;
    return { data: { id: 'attempt-' + String(counters.attempts) } };
  }
  throw new Error('unexpected endpoint: ' + call.endpoint);
}

function createFakeApi(handler: Handler = () => null): FakeApi {
  const calls: Call[] = [];
  const counters: Counters = { competitors: 0, registrations: 0, attempts: 0 };

  const send = <T>(call: Call): MutationOutcome<T> => {
    calls.push(call);
    const reply = handler(call, counters) ?? defaultReply(call, counters);
    if (reply.throws) {
      throw new Error('offline');
    }
    const data = reply.error ? null : reply.data ?? null;
    return { data: data as T, error: reply.error ?? null };
  };

  return {
    calls,
    async post<T>(endpoint: string, data?: unknown): Promise<MutationOutcome<T>> {
      return send<T>({ method: 'post', endpoint, data });
    },
    async put<T>(endpoint: string, data?: unknown): Promise<MutationOutcome<T>> {
      return send<T>({ method: 'put', endpoint, data });
    },
  };
}

function draft(overrides: Partial<CompetitorDraft> = {}): CompetitorDraft {
  const base = createEmptyCompetitorDraft({
    id: 'draft-1',
    events: ['Squat'],
    tagOptions: ['Open', 'Juvenile'],
  });
  return {
    ...base,
    firstName: 'Jan',
    lastName: 'Kowalski',
    birthDate: '1990-01-01',
    bodyweight: 90,
    attempts: { Squat: 100 },
    ...overrides,
  };
}

function setupInput(
  drafts: CompetitorDraft[],
  allowedEvents: ContestEvent[] = ['Squat'],
): ContestSetupInput {
  return {
    contest: {
      name: 'Werewolf Classic',
      date: '2026-01-01',
      location: 'Warsaw',
      discipline: 'Powerlifting',
      federationRules: null,
      organizer: 'Werewolf PL',
      notes: null,
    },
    categories: null,
    tagLabels: [],
    competitors: buildSubmissionCompetitors(drafts, allowedEvents, ['Open', 'Juvenile'], (index) =>
      'Unnamed ' + String(index + 1),
    ),
  };
}

const OPTIONS = { fallbackError: 'generic failure' };

function endpoints(api: FakeApi): string[] {
  return api.calls.map((call) => call.method + ' ' + call.endpoint);
}

function attempts(api: FakeApi): Call[] {
  return api.calls.filter((call) => call.endpoint.endsWith('/attempts'));
}

function liftTypes(api: FakeApi): unknown[] {
  return attempts(api).map((call) => {
    const data = call.data;
    if (typeof data !== 'object' || data === null) return undefined;
    return (data as Record<string, unknown>)['liftType'];
  });
}

function tagLabels(api: FakeApi): unknown[] {
  return api.calls
    .filter((call) => call.endpoint.endsWith('/tags'))
    .map((call) => {
      const data = call.data;
      if (typeof data !== 'object' || data === null) return undefined;
      return (data as Record<string, unknown>)['label'];
    });
}

describe('runContestSetup', () => {
  it('creates contest, competitors, registrations and openers in order', async () => {
    const api = createFakeApi();
    const result = await runContestSetup(setupInput([draft(), draft({ id: 'draft-2' })]), api, OPTIONS);

    expect(result.status).toBe('complete');
    expect(result.contestId).toBe('contest-1');
    expect(result.failures).toEqual([]);
    expect(result.createdDraftIds).toEqual(['draft-1', 'draft-2']);
    expect(result.failedDraftIds).toEqual([]);
    expect(endpoints(api)).toEqual([
      'post /contests',
      'post /competitors',
      'post /contests/contest-1/registrations',
      'post /contests/contest-1/registrations/registration-1/attempts',
      'post /competitors',
      'post /contests/contest-1/registrations',
      'post /contests/contest-1/registrations/registration-2/attempts',
    ]);
    expect(result.progress.competitors['draft-1']).toEqual({
      competitorId: 'competitor-1',
      registrationId: 'registration-1',
    });
    expect(result.progress.attempts[attemptKey('draft-1', 'Squat')]).toBe(true);
    expect(api.calls[1]?.data).toMatchObject({
      firstName: 'Jan',
      lastName: 'Kowalski',
      club: null,
      city: null,
      notes: null,
    });
    expect(api.calls[2]?.data).toMatchObject({
      competitorId: 'competitor-1',
      bodyweight: 90,
      lifts: ['Squat'],
      labels: ['Open'],
    });
    expect(api.calls[3]?.data).toEqual({
      registrationId: 'registration-1',
      liftType: 'Squat',
      attemptNumber: 1,
      weight: 100,
    });
  });

  it('keeps the failed competitor draft and everything created before it', async () => {
    let competitorCalls = 0;
    const api = createFakeApi((call) => {
      if (call.endpoint === '/competitors') {
        competitorCalls += 1;
        if (competitorCalls === 2) return { error: 'competitor rejected' };
      }
      return null;
    });

    const result = await runContestSetup(setupInput([draft(), draft({ id: 'draft-2' })]), api, OPTIONS);

    expect(result.status).toBe('partial');
    expect(result.createdDraftIds).toEqual(['draft-1']);
    expect(result.failedDraftIds).toEqual(['draft-2']);
    expect(result.failures).toEqual([
      {
        kind: 'competitor',
        draftId: 'draft-2',
        displayName: 'Kowalski Jan',
        message: 'competitor rejected',
      },
    ]);
    expect(result.progress.competitors['draft-1']).toEqual({
      competitorId: 'competitor-1',
      registrationId: 'registration-1',
    });
    expect(result.progress.competitors['draft-2']).toBeUndefined();
    expect(api.calls.filter((call) => call.endpoint.endsWith('/registrations'))).toHaveLength(1);
    expect(attempts(api)).toHaveLength(1);
  });

  it('records a registration failure, keeps the competitor and resumes on retry', async () => {
    const api = createFakeApi((call) =>
      call.endpoint.endsWith('/registrations') ? { error: 'registration rejected' } : null,
    );

    const result = await runContestSetup(setupInput([draft()]), api, OPTIONS);

    expect(result.status).toBe('partial');
    expect(result.failedDraftIds).toEqual(['draft-1']);
    expect(result.failures).toEqual([
      {
        kind: 'registration',
        draftId: 'draft-1',
        displayName: 'Kowalski Jan',
        message: 'registration rejected',
      },
    ]);
    expect(result.progress.competitors['draft-1']).toEqual({
      competitorId: 'competitor-1',
      registrationId: null,
    });
    expect(attempts(api)).toHaveLength(0);

    const retryApi = createFakeApi();
    const retried = await runContestSetup(setupInput([draft()]), retryApi, {
      ...OPTIONS,
      progress: result.progress,
    });

    expect(retried.status).toBe('complete');
    expect(retried.failures).toEqual([]);
    expect(retryApi.calls.filter((call) => call.endpoint === '/contests')).toHaveLength(0);
    expect(retryApi.calls.filter((call) => call.endpoint === '/competitors')).toHaveLength(0);
    expect(attempts(retryApi)).toHaveLength(1);
  });

  it('reports every failed attempt and retries only the missing one', async () => {
    const api = createFakeApi((call) =>
      call.endpoint.endsWith('/attempts') &&
      typeof call.data === 'object' &&
      call.data !== null &&
      (call.data as Record<string, unknown>)['liftType'] === 'Squat'
        ? { error: 'attempt rejected' }
        : null,
    );
    const drafts = [
      draft({ lifts: ['Squat', 'Bench'], attempts: { Squat: 100, Bench: 80 } }),
    ];

    const result = await runContestSetup(setupInput(drafts, ['Squat', 'Bench']), api, OPTIONS);

    expect(result.status).toBe('partial');
    expect(result.failures).toEqual([
      {
        kind: 'attempt',
        draftId: 'draft-1',
        displayName: 'Kowalski Jan',
        event: 'Squat',
        message: 'attempt rejected',
      },
    ]);
    expect(result.progress.attempts[attemptKey('draft-1', 'Squat')]).toBeUndefined();
    expect(result.progress.attempts[attemptKey('draft-1', 'Bench')]).toBe(true);
    expect(liftTypes(api)).toEqual(['Squat', 'Bench']);

    const retryApi = createFakeApi();
    const retried = await runContestSetup(setupInput(drafts, ['Squat', 'Bench']), retryApi, {
      ...OPTIONS,
      progress: result.progress,
    });

    expect(retried.status).toBe('complete');
    expect(retryApi.calls.filter((call) => call.endpoint === '/competitors')).toHaveLength(0);
    expect(retryApi.calls.filter((call) => call.endpoint.endsWith('/registrations'))).toHaveLength(0);
    expect(liftTypes(retryApi)).toEqual(['Squat']);
  });

  it('writes nothing else when the contest itself cannot be created', async () => {
    const api = createFakeApi((call) => (call.endpoint === '/contests' ? { error: 'name is taken' } : null));

    const result = await runContestSetup(setupInput([draft(), draft({ id: 'draft-2' })]), api, OPTIONS);

    expect(result.status).toBe('failed');
    expect(result.contestId).toBeNull();
    expect(result.progress.contestId).toBeNull();
    expect(result.progress.categoriesSaved).toBe(false);
    expect(result.createdDraftIds).toEqual([]);
    expect(result.failedDraftIds).toEqual(['draft-1', 'draft-2']);
    expect(result.failures).toEqual([{ kind: 'contest', message: 'name is taken' }]);
    expect(api.calls).toHaveLength(1);
  });

  it('turns a thrown transport error into a reported failure', async () => {
    const api = createFakeApi((call) => (call.endpoint === '/competitors' ? { throws: true } : null));

    const result = await runContestSetup(setupInput([draft()]), api, OPTIONS);

    expect(result.status).toBe('partial');
    expect(result.failures).toEqual([
      {
        kind: 'competitor',
        draftId: 'draft-1',
        displayName: 'Kowalski Jan',
        message: 'offline',
      },
    ]);
    expect(result.progress.contestId).toBe('contest-1');
  });

  it('saves categories once and keeps a failed tag for the retry', async () => {
    const input: ContestSetupInput = {
      ...setupInput([draft()]),
      categories: { ageCategories: [], weightClasses: [] },
      tagLabels: ['Juvenile', 'Youth'],
    };
    const api = createFakeApi((call) =>
      call.endpoint.endsWith('/tags') &&
      typeof call.data === 'object' &&
      call.data !== null &&
      (call.data as Record<string, unknown>)['label'] === 'Youth'
        ? { error: 'tag rejected' }
        : null,
    );

    const result = await runContestSetup(input, api, OPTIONS);

    expect(result.status).toBe('partial');
    expect(result.failures).toEqual([{ kind: 'tag', label: 'Youth', message: 'tag rejected' }]);
    expect(result.progress.savedTagLabels).toEqual(['Juvenile']);
    expect(result.progress.categoriesSaved).toBe(true);
    expect(tagLabels(api)).toEqual(['Juvenile', 'Youth']);

    const retryApi = createFakeApi();
    const retried = await runContestSetup(input, retryApi, { ...OPTIONS, progress: result.progress });

    expect(retried.status).toBe('complete');
    expect(tagLabels(retryApi)).toEqual(['Youth']);
    expect(retryApi.calls.filter((call) => call.method === 'put')).toHaveLength(0);
  });
});

describe('pendingDrafts', () => {
  it('never drops a draft that was not fully created', () => {
    const drafts = [draft(), draft({ id: 'draft-2' })];

    expect(pendingDrafts(drafts, ['draft-1']).map((item) => item.id)).toEqual(['draft-2']);
    expect(pendingDrafts(drafts, [])).toEqual(drafts);
    expect(pendingDrafts(drafts, ['draft-1', 'draft-2'])).toEqual([]);
  });
});

describe('buildSubmissionCompetitors', () => {
  it('trims names, drops empty optional fields and normalises tags', () => {
    const competitors = buildSubmissionCompetitors(
      [
        draft({
          firstName: 'Jan ',
          club: '   ',
          city: 'Warsaw',
          tags: ['juvenile', 'Open'],
          rackHeightSquat: 12,
        }),
      ],
      ['Squat'],
      ['Open', 'Juvenile'],
      (index) => 'Unnamed ' + String(index + 1),
    );

    expect(competitors).toEqual([
      {
        draftId: 'draft-1',
        displayName: 'Kowalski Jan',
        competitor: {
          firstName: 'Jan',
          lastName: 'Kowalski',
          birthDate: '1990-01-01',
          gender: 'Male',
          club: null,
          city: 'Warsaw',
          notes: null,
        },
        registration: {
          bodyweight: 90,
          rackHeightSquat: 12,
          rackHeightBench: null,
          lifts: ['Squat'],
          labels: ['Juvenile', 'Open'],
        },
        attempts: [{ event: 'Squat', weight: 100 }],
      },
    ]);
  });

  it('drops openers that were never filled in', () => {
    const competitors = buildSubmissionCompetitors(
      [draft({ lifts: ['Squat', 'Bench'], attempts: { Squat: null, Bench: 80 } })],
      ['Squat', 'Bench'],
      ['Open'],
      () => 'unnamed',
    );

    expect(competitors[0]?.attempts).toEqual([{ event: 'Bench', weight: 80 }]);
  });
});
