import { describe, expect, it, vi } from 'vitest';
import { createResultsLoader, type ResultsLoaderGet, type ResultsLoaderResponse } from '../results-loader';
import type { ContestRankingEntry } from '$lib/types';

function entry(id: string, place: number): ContestRankingEntry {
  return {
    id,
    registrationId: 'reg-1',
    contestId: 'contest-1',
    firstName: 'Anna',
    lastName: 'Nowak',
    placeOpen: place,
  };
}

interface Deferred {
  endpoint: string;
  resolve: (value: ResultsLoaderResponse<unknown>) => void;
  reject: (error: unknown) => void;
}

type FakeHandler = (endpoint: string) => Promise<ResultsLoaderResponse<unknown>>;

/**
 * Test adapter for the loader's generic `get`: fakes serve untyped JSON, exactly
 * like the real API client does before callers narrow the payload.
 */
function fakeGet(handler: FakeHandler): ResultsLoaderGet {
  return async <T,>(endpoint: string): Promise<ResultsLoaderResponse<T>> =>
    (await handler(endpoint)) as ResultsLoaderResponse<T>;
}

function deferredGet(deferreds: Deferred[]): ResultsLoaderGet {
  return fakeGet(
    (endpoint) =>
      new Promise<ResultsLoaderResponse<unknown>>((resolve, reject) => {
        deferreds.push({ endpoint, resolve, reject });
      }),
  );
}

describe('ResultsLoader.loadRankings', () => {
  it('ignores a slow response that resolves after a newer request', async () => {
    const deferreds: Deferred[] = [];
    const loader = createResultsLoader({ get: deferredGet(deferreds), fallbackError: () => 'failed' });

    const first = loader.loadRankings('contest-1');
    const second = loader.loadRankings('contest-1');
    expect(deferreds).toHaveLength(2);

    // The newer request answers first...
    deferreds[1]!.resolve({ data: { open: [entry('new', 1)], age: [], weight: [] }, error: null });
    await second;

    // ...and the older one must not overwrite it.
    deferreds[0]!.resolve({ data: { open: [entry('old', 2)], age: [], weight: [] }, error: null });
    await first;

    const state = loader.getState();
    expect(state.open.map((row) => row.id)).toEqual(['new']);
    expect(state.loading).toBe(false);
    expect(state.error).toBeNull();
  });

  it('falls back to the per-type endpoints when the bundle fails', async () => {
    const handler = vi.fn(async (endpoint: string): Promise<ResultsLoaderResponse<unknown>> => {
      if (endpoint.endsWith('/results/rankings/all')) {
        return { data: null, error: 'unavailable' };
      }
      if (endpoint.endsWith('type=open')) return { data: [entry('open-1', 1)], error: null };
      if (endpoint.endsWith('type=age')) return { data: [entry('age-1', 1)], error: null };
      return { data: [entry('weight-1', 1)], error: null };
    });

    const loader = createResultsLoader({ get: fakeGet(handler), fallbackError: () => 'failed' });
    await loader.loadRankings('contest-1');

    expect(handler).toHaveBeenCalledTimes(4);
    expect(loader.getState().open.map((row) => row.id)).toEqual(['open-1']);
    expect(loader.getState().age.map((row) => row.id)).toEqual(['age-1']);
    expect(loader.getState().weight.map((row) => row.id)).toEqual(['weight-1']);
    expect(loader.getState().loading).toBe(false);
  });

  it('reports an error and toasts only when a request throws', async () => {
    const onUnexpectedError = vi.fn();
    const get = fakeGet(async () => {
      throw new Error('network down');
    });

    const loader = createResultsLoader({ get, fallbackError: () => 'failed', onUnexpectedError });
    await loader.loadRankings('contest-1');

    expect(loader.getState().error).toBe('network down');
    expect(loader.getState().loading).toBe(false);
    expect(onUnexpectedError).toHaveBeenCalledWith('network down');
  });
});

describe('ResultsLoader.ensureTagResults', () => {
  it('caches a tag result and only refetches when forced', async () => {
    const handler = vi.fn(async (): Promise<ResultsLoaderResponse<unknown>> => ({
      data: [entry('tag-1', 1)],
      error: null,
    }));
    const loader = createResultsLoader({ get: fakeGet(handler), fallbackError: () => 'failed' });

    await loader.ensureTagResults('contest-1', 'Open');
    expect(handler).toHaveBeenCalledTimes(1);
    expect(loader.getState().tagCache['Open']?.map((row) => row.id)).toEqual(['tag-1']);

    await loader.ensureTagResults('contest-1', 'Open');
    expect(handler).toHaveBeenCalledTimes(1);

    await loader.ensureTagResults('contest-1', 'Open', { force: true });
    expect(handler).toHaveBeenCalledTimes(2);
  });

  it('does not cache a superseded tag response', async () => {
    const deferreds: Deferred[] = [];
    const loader = createResultsLoader({ get: deferredGet(deferreds), fallbackError: () => 'failed' });

    const first = loader.ensureTagResults('contest-1', 'Open');
    const second = loader.ensureTagResults('contest-1', 'Open', { force: true });
    expect(deferreds).toHaveLength(2);

    deferreds[1]!.resolve({ data: [entry('new', 1)], error: null });
    await second;
    deferreds[0]!.resolve({ data: [entry('old', 2)], error: null });
    await first;

    expect(loader.getState().tagCache['Open']?.map((row) => row.id)).toEqual(['new']);
  });

  it('hides the failure of a tag that is no longer displayed', async () => {
    const handler = vi.fn(async (): Promise<ResultsLoaderResponse<unknown>> => ({
      data: null,
      error: 'boom',
    }));
    const loader = createResultsLoader({ get: fakeGet(handler), fallbackError: () => 'failed' });

    await loader.ensureTagResults('contest-1', 'Open', { surfaceError: () => false });
    expect(loader.getState().error).toBeNull();
    expect(loader.getState().loading).toBe(false);
    expect(loader.getState().tagCache['Open']).toEqual([]);

    await loader.ensureTagResults('contest-1', 'Open', { force: true, surfaceError: () => true });
    expect(loader.getState().error).toBe('boom');
  });
});
