import type { MutationOutcome } from '$lib/api';
import type { ContestCategories, RegistrationSummary } from '$lib/types';
import {
  competitorDisplayName,
  normaliseDraftEvents,
  normaliseTagSelection,
  normalizeAttemptPlanForGender,
  syncAttemptPlan,
  type CompetitorDraft,
  type ContestEvent,
  type ContestForm,
  type Gender,
} from './draft';

/**
 * The contest-creation workflow.
 *
 * Creating a contest is a sequence of dependent API calls: contest, categories,
 * tags, then per competitor a competitor, a registration and one attempt per
 * lift. A failure in the middle used to leave the operator with no idea what
 * had been written, so the workflow records every entity it created in a
 * resumable {@link SetupProgress} checkpoint:
 *
 * - the checkpoint is returned to the caller and passed back on retry;
 * - entities already recorded there are never created again;
 * - drafts that did not fully complete stay in the caller's list.
 */

export interface SetupApi {
  post<T>(endpoint: string, data?: unknown): Promise<MutationOutcome<T>>;
  put<T>(endpoint: string, data?: unknown): Promise<MutationOutcome<T>>;
}

export interface ContestSetupPayload {
  name: string;
  date: string;
  location: string;
  discipline: ContestForm['discipline'];
  federationRules: string | null;
  organizer: string;
  notes: string | null;
}

export interface SetupCompetitor {
  draftId: string;
  displayName: string;
  competitor: {
    firstName: string;
    lastName: string;
    birthDate: string;
    gender: Gender;
    club: string | null;
    city: string | null;
    notes: null;
  };
  registration: {
    bodyweight: number;
    rackHeightSquat: number | null;
    rackHeightBench: number | null;
    lifts: ContestEvent[];
    labels: string[];
  };
  attempts: Array<{ event: ContestEvent; weight: number }>;
}

export interface ContestSetupInput {
  contest: ContestSetupPayload;
  /** null when the operator kept the default categories the API already seeded. */
  categories: ContestCategories | null;
  tagLabels: readonly string[];
  competitors: readonly SetupCompetitor[];
}

export interface SetupProgress {
  contestId: string | null;
  categoriesSaved: boolean;
  savedTagLabels: string[];
  competitors: Record<string, { competitorId: string; registrationId: string | null }>;
  attempts: Record<string, true>;
}

export function createSetupProgress(): SetupProgress {
  return {
    contestId: null,
    categoriesSaved: false,
    savedTagLabels: [],
    competitors: {},
    attempts: {},
  };
}

export type SetupFailureKind =
  | 'contest'
  | 'categories'
  | 'tag'
  | 'competitor'
  | 'registration'
  | 'attempt';

export interface SetupFailure {
  kind: SetupFailureKind;
  message: string;
  draftId?: string;
  displayName?: string;
  event?: ContestEvent;
  label?: string;
}

/** complete: everything was written. partial: the contest exists, some data did not. failed: nothing was written. */
export type SetupStatus = 'complete' | 'partial' | 'failed';

export interface SetupResult {
  status: SetupStatus;
  contestId: string | null;
  progress: SetupProgress;
  failures: SetupFailure[];
  createdDraftIds: string[];
  failedDraftIds: string[];
}

export interface SetupOptions {
  /** Message used when an error envelope carries none. */
  fallbackError: string;
  /** Checkpoint from a previous attempt; created entities are skipped. */
  progress?: SetupProgress;
}

type Attempt<T> = { ok: true; data: T | null } | { ok: false; message: string };

async function request<T>(
  call: () => Promise<MutationOutcome<T>>,
  fallbackError: string,
): Promise<Attempt<T>> {
  try {
    const outcome = await call();
    if (outcome.error) {
      return { ok: false, message: outcome.error };
    }
    return { ok: true, data: outcome.data };
  } catch (error) {
    if (error instanceof Error && error.message) {
      return { ok: false, message: error.message };
    }
    return { ok: false, message: fallbackError };
  }
}

export function attemptKey(draftId: string, event: ContestEvent): string {
  return draftId + ':' + event;
}

/**
 * Drafts the caller must keep after a run: everything that was not fully
 * created. A failed draft is never dropped, so the operator can fix the cause
 * and retry without losing the data.
 */
export function pendingDrafts<T extends { id: string }>(
  drafts: readonly T[],
  createdDraftIds: readonly string[],
): T[] {
  const created = new Set(createdDraftIds);
  return drafts.filter((draft) => !created.has(draft.id));
}

export function buildSubmissionCompetitors(
  drafts: readonly CompetitorDraft[],
  allowedEvents: readonly ContestEvent[],
  tagOptions: readonly string[],
  unnamedLabel: (index: number) => string,
): SetupCompetitor[] {
  return drafts.map((draft, index) => {
    const lifts = normaliseDraftEvents(draft.lifts, allowedEvents);
    const attemptPlan = normalizeAttemptPlanForGender(
      syncAttemptPlan(draft.attempts, lifts),
      draft.gender,
    );
    const attempts: Array<{ event: ContestEvent; weight: number }> = [];
    for (const event of lifts) {
      const weight = attemptPlan[event];
      if (weight && weight > 0) {
        attempts.push({ event, weight });
      }
    }

    return {
      draftId: draft.id,
      displayName: competitorDisplayName(draft, index, unnamedLabel),
      competitor: {
        firstName: draft.firstName.trim(),
        lastName: draft.lastName.trim(),
        birthDate: draft.birthDate,
        gender: draft.gender,
        club: draft.club.trim() || null,
        city: draft.city.trim() || null,
        notes: null,
      },
      registration: {
        bodyweight: draft.bodyweight,
        rackHeightSquat: lifts.includes('Squat') ? draft.rackHeightSquat : null,
        rackHeightBench: lifts.includes('Bench') ? draft.rackHeightBench : null,
        lifts,
        labels: normaliseTagSelection(draft.tags, tagOptions),
      },
      attempts,
    };
  });
}

function cloneProgress(progress: SetupProgress): SetupProgress {
  return {
    contestId: progress.contestId,
    categoriesSaved: progress.categoriesSaved,
    savedTagLabels: [...progress.savedTagLabels],
    competitors: Object.fromEntries(
      Object.entries(progress.competitors).map(([draftId, ids]) => [draftId, { ...ids }]),
    ),
    attempts: { ...progress.attempts },
  };
}

async function ensureContest(
  progress: SetupProgress,
  payload: ContestSetupPayload,
  api: SetupApi,
  fallbackError: string,
  failures: SetupFailure[],
): Promise<string | null> {
  if (progress.contestId) {
    return progress.contestId;
  }

  const created = await request(() => api.post<{ id: string }>('/contests', payload), fallbackError);
  if (!created.ok) {
    failures.push({ kind: 'contest', message: created.message });
    return null;
  }
  if (!created.data) {
    failures.push({ kind: 'contest', message: fallbackError });
    return null;
  }

  progress.contestId = created.data.id;
  return created.data.id;
}

function failedResult(input: ContestSetupInput, progress: SetupProgress, failures: SetupFailure[]): SetupResult {
  return {
    status: 'failed',
    contestId: null,
    progress,
    failures,
    createdDraftIds: [],
    failedDraftIds: input.competitors.map((competitor) => competitor.draftId),
  };
}

export async function runContestSetup(
  input: ContestSetupInput,
  api: SetupApi,
  options: SetupOptions,
): Promise<SetupResult> {
  const { fallbackError } = options;
  const progress = cloneProgress(options.progress ?? createSetupProgress());
  const failures: SetupFailure[] = [];

  const contestId = await ensureContest(progress, input.contest, api, fallbackError, failures);
  if (!contestId) {
    return failedResult(input, progress, failures);
  }

  const categories = input.categories;
  if (categories && !progress.categoriesSaved) {
    const saved = await request(
      () => api.put(`/contests/${contestId}/categories`, categories),
      fallbackError,
    );
    if (saved.ok) {
      progress.categoriesSaved = true;
    } else {
      failures.push({ kind: 'categories', message: saved.message });
    }
  }

  for (const label of input.tagLabels) {
    if (progress.savedTagLabels.includes(label)) continue;
    const created = await request(
      () => api.post(`/contests/${contestId}/tags`, { label }),
      fallbackError,
    );
    if (created.ok) {
      progress.savedTagLabels.push(label);
    } else {
      failures.push({ kind: 'tag', label, message: created.message });
    }
  }

  const createdDraftIds: string[] = [];
  const failedDraftIds: string[] = [];

  for (const item of input.competitors) {
    const registration = item.registration;
    const existing = progress.competitors[item.draftId];
    let competitorId = existing?.competitorId ?? null;
    let registrationId = existing?.registrationId ?? null;
    let failed = false;

    if (!competitorId) {
      const created = await request(
        () => api.post<{ id: string }>('/competitors', item.competitor),
        fallbackError,
      );
      if (!created.ok) {
        failures.push({
          kind: 'competitor',
          draftId: item.draftId,
          displayName: item.displayName,
          message: created.message,
        });
        failed = true;
      } else if (!created.data) {
        failures.push({
          kind: 'competitor',
          draftId: item.draftId,
          displayName: item.displayName,
          message: fallbackError,
        });
        failed = true;
      } else {
        competitorId = created.data.id;
        progress.competitors[item.draftId] = { competitorId, registrationId: null };
      }
    }

    if (!failed && !registrationId && competitorId) {
      const targetCompetitorId = competitorId;
      const created = await request(
        () =>
          api.post<RegistrationSummary>(`/contests/${contestId}/registrations`, {
            competitorId: targetCompetitorId,
            ...registration,
          }),
        fallbackError,
      );
      const createdRegistrationId = created.ok ? created.data?.id ?? null : null;

      if (!created.ok) {
        failures.push({
          kind: 'registration',
          draftId: item.draftId,
          displayName: item.displayName,
          message: created.message,
        });
        failed = true;
      } else if (!createdRegistrationId) {
        failures.push({
          kind: 'registration',
          draftId: item.draftId,
          displayName: item.displayName,
          message: fallbackError,
        });
        failed = true;
      } else {
        registrationId = createdRegistrationId;
        progress.competitors[item.draftId] = { competitorId: targetCompetitorId, registrationId };
      }
    }

    if (!failed && registrationId && competitorId) {
      const targetRegistrationId = registrationId;
      for (const attempt of item.attempts) {
        const key = attemptKey(item.draftId, attempt.event);
        if (progress.attempts[key]) continue;
        const payload: {
          registrationId: string;
          liftType: ContestEvent;
          attemptNumber: 1;
          weight: number;
        } = {
          registrationId: targetRegistrationId,
          liftType: attempt.event,
          attemptNumber: 1,
          weight: attempt.weight,
        };
        const created = await request(
          () =>
            api.post(
              `/contests/${contestId}/registrations/${targetRegistrationId}/attempts`,
              payload,
            ),
          fallbackError,
        );
        if (created.ok) {
          progress.attempts[key] = true;
        } else {
          failures.push({
            kind: 'attempt',
            draftId: item.draftId,
            displayName: item.displayName,
            event: attempt.event,
            message: created.message,
          });
          failed = true;
        }
      }
    }

    const complete =
      competitorId !== null &&
      registrationId !== null &&
      item.attempts.every((attempt) => progress.attempts[attemptKey(item.draftId, attempt.event)] === true);
    if (complete) {
      createdDraftIds.push(item.draftId);
    } else {
      failedDraftIds.push(item.draftId);
    }
  }

  return {
    status: failures.length === 0 ? 'complete' : 'partial',
    contestId,
    progress,
    failures,
    createdDraftIds,
    failedDraftIds,
  };
}
