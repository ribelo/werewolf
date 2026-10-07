import { describe, it, expect } from 'vitest';
import { load } from '../results/[id]/+page.ts';
import { parseResultsTab } from '$lib/components/public-results';
import type { PublicResultsBundle } from '$lib/types';

type LoadEvent = Parameters<typeof load>[0];
type StubFetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
type Stub = { data: unknown; error: string | null; status?: number };

/** The page reads all of these keys: the loader must always return them. */
const PAGE_KEYS = ['contest', 'error', 'lastUpdated', 'resultsBundle', 'selectedTab'];

interface ResultsData {
  contest: { id: string; name: string } | null;
  resultsBundle: PublicResultsBundle | null;
  error: string | null;
  lastUpdated: string | null;
  selectedTab: string;
}

function bundle(contestId: string): Record<string, unknown> {
  return {
    contest: { id: contestId, name: `Meet ${contestId}` },
    individual: { open: [], age: [], weight: [] },
    team: { mixed: { metric: 'mixed', rows: [] } },
    scoreboard: { registrations: [], attempts: [], referenceData: { weightClasses: [], ageCategories: [] } },
    lastUpdated: '2026-01-01T10:00:00Z',
  };
}

function createFetch(stub: Stub | Error): { fetchImpl: StubFetch; requested: string[] } {
  const requested: string[] = [];
  const fetchImpl: StubFetch = async (input) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    requested.push(new URL(url).pathname);
    if (stub instanceof Error) throw stub;
    return new Response(JSON.stringify({ data: stub.data, error: stub.error }), {
      status: stub.status ?? 200,
      headers: { 'Content-Type': 'application/json' },
    });
  };
  return { fetchImpl, requested };
}

function loadEvent(fetchImpl: StubFetch, search = ''): LoadEvent {
  return {
    params: { id: 'contest-a' },
    fetch: fetchImpl,
    url: new URL(`https://example.test/results/contest-a${search}`),
  } as unknown as LoadEvent;
}

/** `load` is annotated with SvelteKit's PageLoad, whose return type is widened. */
function runLoad(event: LoadEvent): Promise<ResultsData> {
  return load(event) as unknown as Promise<ResultsData>;
}

function expectCompleteShape(data: ResultsData): void {
  expect(Object.keys(data).sort()).toEqual([...PAGE_KEYS].sort());
}

describe('results [id] loader', () => {
  it('loads the public bundle and keeps the requested tab', async () => {
    const { fetchImpl, requested } = createFetch({ data: bundle('contest-a'), error: null });
    const data = await runLoad(loadEvent(fetchImpl, '?tab=team'));

    expect(requested).toEqual(['/contests/contest-a/results/public-bundle']);
    expectCompleteShape(data);
    expect(data.error).toBeNull();
    expect(data.contest?.name).toBe('Meet contest-a');
    expect(data.resultsBundle?.lastUpdated).toBe('2026-01-01T10:00:00Z');
    expect(data.lastUpdated).toBe('2026-01-01T10:00:00Z');
    expect(data.selectedTab).toBe('team');
  });

  it('falls back to the individual tab for an unknown tab query', async () => {
    const data = await runLoad(loadEvent(createFetch({ data: bundle('contest-a'), error: null }).fetchImpl, '?tab=evil'));

    expect(data.selectedTab).toBe('individual');
  });

  it('defaults to the individual tab when the query is missing', async () => {
    const data = await runLoad(loadEvent(createFetch({ data: bundle('contest-a'), error: null }).fetchImpl));

    expect(data.selectedTab).toBe('individual');
  });

  it('reports an API error and still returns every page key', async () => {
    const data = await runLoad(loadEvent(createFetch({ data: null, error: 'not found', status: 404 }).fetchImpl, '?tab=team'));

    expectCompleteShape(data);
    expect(data.error).toBe('not found');
    expect(data.contest).toBeNull();
    expect(data.resultsBundle).toBeNull();
    expect(data.lastUpdated).toBeNull();
    expect(data.selectedTab).toBe('team');
  });

  it('reports a transport failure and still returns every page key', async () => {
    const data = await runLoad(loadEvent(createFetch(new Error('offline')).fetchImpl));

    expectCompleteShape(data);
    expect(data.error).toBe('offline');
    expect(data.contest).toBeNull();
    expect(data.resultsBundle).toBeNull();
    expect(data.lastUpdated).toBeNull();
  });
});

describe('parseResultsTab', () => {
  it('accepts only the two known tabs', () => {
    expect(parseResultsTab('individual')).toBe('individual');
    expect(parseResultsTab('team')).toBe('team');
    expect(parseResultsTab('Team')).toBe('individual');
    expect(parseResultsTab('')).toBe('individual');
    expect(parseResultsTab(null)).toBe('individual');
    expect(parseResultsTab(undefined)).toBe('individual');
  });
});
