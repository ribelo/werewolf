import type { ContestRankingEntry } from '$lib/types';

export interface RankingsBundle {
  open: ContestRankingEntry[];
  age: ContestRankingEntry[];
  weight: ContestRankingEntry[];
}

/** Structural subset of the API envelope the loader needs. */
export interface ResultsLoaderResponse<T> {
  data?: T | null;
  error?: string | null;
}

export type ResultsLoaderGet = <T>(endpoint: string) => Promise<ResultsLoaderResponse<T>>;

export interface ResultsLoaderOptions {
  get: ResultsLoaderGet;
  /** Message used when a request throws without an Error message. */
  fallbackError: () => string;
  /** Called when a request throws (network or decode failure). */
  onUnexpectedError?: (message: string) => void;
}

export interface ResultsLoaderState {
  open: ContestRankingEntry[];
  age: ContestRankingEntry[];
  weight: ContestRankingEntry[];
  tagCache: Record<string, ContestRankingEntry[]>;
  loading: boolean;
  error: string | null;
}

export interface EnsureTagResultsOptions {
  force?: boolean;
  /** Whether a failure of this request should be shown to the operator. */
  surfaceError?: () => boolean;
}

const EMPTY_STATE: ResultsLoaderState = {
  open: [],
  age: [],
  weight: [],
  tagCache: {},
  loading: false,
  error: null,
};

/**
 * Loads the results tables and sequences the requests, so a slow response can
 * never overwrite a newer one. Owns the loading flag, the error message and the
 * per-tag cache; subscribers mirror that state into the view.
 */
export class ResultsLoader {
  private token = 0;
  private state: ResultsLoaderState = { ...EMPTY_STATE, tagCache: {} };
  private readonly listeners = new Set<(state: ResultsLoaderState) => void>();

  constructor(private readonly options: ResultsLoaderOptions) {}

  getState(): ResultsLoaderState {
    return this.state;
  }

  subscribe(listener: (state: ResultsLoaderState) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /** `true` when `token` still belongs to the newest request. */
  isCurrent(token: number): boolean {
    return token === this.token;
  }

  /** Starts a request: bumps the token, shows the spinner and clears the error. */
  begin(): number {
    this.token += 1;
    this.update({ loading: true, error: null });
    return this.token;
  }

  /** Commits the end of a request; superseded requests are ignored. */
  finish(token: number, error: string | null = null): void {
    if (!this.isCurrent(token)) return;
    this.update({ loading: false, error });
  }

  async loadRankings(contestId: string): Promise<void> {
    const token = this.begin();
    this.update({ tagCache: {} });
    let errorMessage: string | null = null;

    try {
      const bundle = await this.options.get<RankingsBundle>(
        `/contests/${contestId}/results/rankings/all`,
      );

      if (!bundle.error && bundle.data) {
        if (this.isCurrent(token)) {
          this.update({
            open: bundle.data.open ?? [],
            age: bundle.data.age ?? [],
            weight: bundle.data.weight ?? [],
          });
        }
      } else {
        const [openResponse, ageResponse, weightResponse] = await Promise.all([
          this.options.get<ContestRankingEntry[]>(`/contests/${contestId}/results/rankings?type=open`),
          this.options.get<ContestRankingEntry[]>(`/contests/${contestId}/results/rankings?type=age`),
          this.options.get<ContestRankingEntry[]>(`/contests/${contestId}/results/rankings?type=weight`),
        ]);

        if (this.isCurrent(token)) {
          this.update({
            open: openResponse.data ?? [],
            age: ageResponse.data ?? [],
            weight: weightResponse.data ?? [],
          });
        }

        errorMessage = openResponse.error || ageResponse.error || weightResponse.error || null;
      }
    } catch (error) {
      errorMessage = error instanceof Error ? error.message : this.options.fallbackError();
      this.options.onUnexpectedError?.(errorMessage);
    } finally {
      this.finish(token, errorMessage);
    }
  }

  async ensureTagResults(
    contestId: string,
    tagLabel: string,
    options: EnsureTagResultsOptions = {},
  ): Promise<void> {
    if (!tagLabel) return;
    if (!options.force && this.state.tagCache[tagLabel]) return;

    const token = this.begin();
    let errorMessage: string | null = null;

    try {
      const response = await this.options.get<ContestRankingEntry[]>(
        `/contests/${contestId}/results/rankings?type=tag&tag=${encodeURIComponent(tagLabel)}`,
      );

      if (response.error) {
        errorMessage = response.error;
        if (this.isCurrent(token)) {
          this.update({ tagCache: { ...this.state.tagCache, [tagLabel]: [] } });
        }
      } else if (this.isCurrent(token)) {
        this.update({ tagCache: { ...this.state.tagCache, [tagLabel]: response.data ?? [] } });
      }
    } catch (error) {
      errorMessage = error instanceof Error ? error.message : this.options.fallbackError();
      this.options.onUnexpectedError?.(errorMessage);
    } finally {
      const surface = options.surfaceError ? options.surfaceError() : false;
      this.finish(token, surface ? errorMessage : null);
    }
  }

  private update(patch: Partial<ResultsLoaderState>): void {
    this.state = { ...this.state, ...patch };
    for (const listener of this.listeners) {
      listener(this.state);
    }
  }
}

export function createResultsLoader(options: ResultsLoaderOptions): ResultsLoader {
  return new ResultsLoader(options);
}
