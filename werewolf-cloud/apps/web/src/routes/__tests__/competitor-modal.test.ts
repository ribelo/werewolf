import { render, fireEvent, waitFor } from '@testing-library/svelte';
import { tick } from 'svelte';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { addMessages, init, waitLocale } from 'svelte-i18n';
import en from '$lib/i18n/locales/en.json';
import CompetitorModal from '$lib/components/CompetitorModal.svelte';
import { contestStore } from '$lib/ui/contest-store';
import type {
  AgeCategory,
  Attempt,
  CompetitorDetail,
  ContestDetail,
  Registration,
} from '$lib/types';

type ApiStubResponse = { data?: unknown; error: string | null };

const api = vi.hoisted(() => ({
  get: vi.fn<(endpoint: string) => Promise<ApiStubResponse>>(),
  post: vi.fn<(endpoint: string, body?: unknown) => Promise<ApiStubResponse>>(),
  patch: vi.fn<(endpoint: string, body?: unknown) => Promise<ApiStubResponse>>(),
  delete: vi.fn<(endpoint: string) => Promise<ApiStubResponse>>(),
}));

vi.mock('$lib/api', () => ({
  ApiError: class ApiError extends Error {
    readonly status = 0;
  },
  apiClient: {
    get: (...args: [string]) => api.get(...args),
    post: (...args: [string, unknown?]) => api.post(...args),
    patch: (...args: [string, unknown?]) => api.patch(...args),
    delete: (...args: [string]) => api.delete(...args),
  },
}));

const contestId = 'contest-1';

function buildContest(date: string): ContestDetail {
  return {
    id: contestId,
    name: 'Autumn Cup',
    date,
    location: 'Gdansk',
    discipline: 'Powerlifting',
    status: 'Draft',
    mensBarWeight: 20,
    womensBarWeight: 15,
    clampWeight: 2.5,
    registrations: [],
  };
}

const competitor: CompetitorDetail = {
  id: 'comp-1',
  firstName: 'Anna',
  lastName: 'Kowalska',
  birthDate: '2010-06-02',
  gender: 'Female',
  club: 'AZS',
  city: 'Warszawa',
  competitionOrder: 1,
  notes: null,
  createdAt: '2024-01-01T00:00:00Z',
  updatedAt: '2024-01-01T00:00:00Z',
};

const ageCategories: AgeCategory[] = [
  {
    id: 'age-u18',
    contestId,
    code: 'U18',
    name: 'Under 18',
    minAge: 14,
    maxAge: 17,
    sortOrder: 10,
    metadata: null,
  },
  {
    id: 'age-senior',
    contestId,
    code: 'SENIOR',
    name: 'Senior',
    minAge: 24,
    maxAge: 39,
    sortOrder: 20,
    metadata: null,
  },
];

function buildRegistration(id: string): Registration {
  return {
    id,
    competitorId: 'comp-1',
    firstName: 'Anna',
    lastName: 'Kowalska',
    birthDate: '2010-06-02',
    gender: 'Female',
    weightClassId: null,
    ageCategoryId: '',
    bodyweight: null,
    lifts: ['Squat', 'Bench', 'Deadlift'],
  };
}

function buildAttempt(registrationId: string, weight: number): Attempt {
  return {
    id: `attempt-${registrationId}`,
    registrationId,
    liftType: 'Squat',
    attemptNumber: 1,
    weight,
    status: 'Pending',
    createdAt: '2024-01-01T10:00:00Z',
    updatedAt: '2024-01-01T10:00:00Z',
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

function attemptEndpoints(): string[] {
  return api.get.mock.calls
    .map(([endpoint]) => endpoint)
    .filter((endpoint) => endpoint.endsWith('/attempts'));
}

function stubAttempts(handler: () => Promise<ApiStubResponse>) {
  api.get.mockImplementation((endpoint: string) => {
    if (endpoint.endsWith('/attempts')) {
      return handler();
    }
    return Promise.resolve({ data: competitor, error: null });
  });
}

function labelledControl(container: HTMLElement, label: string): HTMLInputElement {
  const span = Array.from(container.querySelectorAll('span.input-label')).find((candidate) =>
    candidate.textContent?.includes(label),
  );
  const input = span?.parentElement?.querySelector('input');
  if (!(input instanceof HTMLInputElement)) {
    throw new Error(`input for "${label}" not found`);
  }
  return input;
}

function ageCategoryDisplay(container: HTMLElement): string {
  const span = Array.from(container.querySelectorAll('span.input-label')).find((candidate) =>
    candidate.textContent?.includes('Age category'),
  );
  return span?.parentElement?.querySelector('.input-field')?.textContent?.trim() ?? '';
}

function renderEditModal(registration: Registration) {
  return render(CompetitorModal, {
    competitor,
    registration,
    weightClasses: [],
    ageCategories,
    mode: 'edit' as const,
    contestId,
    contestTags: [],
    lifts: ['Squat', 'Bench', 'Deadlift'] as const,
    onClose: vi.fn(),
    onSaved: vi.fn(),
  });
}

function renderCreateModal() {
  return render(CompetitorModal, {
    competitor: null,
    registration: null,
    weightClasses: [],
    ageCategories,
    mode: 'create' as const,
    contestId,
    contestTags: [],
    lifts: ['Squat', 'Bench', 'Deadlift'] as const,
    onClose: vi.fn(),
    onSaved: vi.fn(),
  });
}

describe('CompetitorModal', () => {
  beforeEach(async () => {
    addMessages('en', en);
    addMessages('en', {
      competitor_modal: {
        status: {
          error_competitor_saved_registration_failed:
            'Competitor data was saved, but the registration could not be saved: {message}',
          error_registration_saved_attempts_failed:
            'Registration was saved, but the opening attempt could not be saved: {message}',
        },
      },
    });
    init({ fallbackLocale: 'en', initialLocale: 'en' });
    await waitLocale();
    api.get.mockReset();
    api.post.mockReset();
    api.patch.mockReset();
    api.delete.mockReset();
    contestStore.reset();
    contestStore.setContest(buildContest('2025-06-01'));
  });

  it('loads opening attempts exactly once for the active registration', async () => {
    stubAttempts(() => Promise.resolve({ data: [buildAttempt('reg-1', 190)], error: null }));

    const { container } = renderEditModal(buildRegistration('reg-1'));

    await waitFor(() => {
      expect(attemptEndpoints()).toHaveLength(1);
    });
    // Give any duplicate reactive trigger the chance to fire before asserting.
    await tick();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(attemptEndpoints()).toEqual([`/contests/${contestId}/registrations/reg-1/attempts`]);

    const squatInput = labelledControl(container, 'Opening attempt (Squat)');
    expect(squatInput.value).toBe('190');
  });

  it('ignores a late attempts response for a registration that is no longer active', async () => {
    const first = deferred<ApiStubResponse>();
    const second = deferred<ApiStubResponse>();
    const pending = [first.promise, second.promise];
    stubAttempts(() => pending.shift() ?? Promise.resolve({ data: [], error: null }));

    const { container, component } = renderEditModal(buildRegistration('reg-1'));
    await waitFor(() => {
      expect(attemptEndpoints()).toHaveLength(1);
    });

    await component.$set({ registration: buildRegistration('reg-2') });
    await waitFor(() => {
      expect(attemptEndpoints()).toHaveLength(2);
    });

    second.resolve({ data: [buildAttempt('reg-2', 220)], error: null });
    await waitFor(() => {
      expect(labelledControl(container, 'Opening attempt (Squat)').value).toBe('220');
    });

    first.resolve({ data: [buildAttempt('reg-1', 100)], error: null });
    await tick();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(labelledControl(container, 'Opening attempt (Squat)').value).toBe('220');
  });

  it('uses the contest date that is current when the birth date is entered', async () => {
    stubAttempts(() => Promise.resolve({ data: [], error: null }));
    const { container } = renderEditModal(buildRegistration('reg-1'));

    contestStore.setContest(buildContest('2035-06-01'));
    await tick();

    const birthInput = container.querySelector('input[type="date"]');
    if (!(birthInput instanceof HTMLInputElement)) {
      throw new Error('birth date input not found');
    }
    await fireEvent.input(birthInput, { target: { value: '2010-06-02' } });

    await waitFor(() => {
      expect(ageCategoryDisplay(container)).toContain('Senior');
    });
  });

  it('reports that the competitor was saved when the registration write fails', async () => {
    api.post.mockImplementation((endpoint: string) => {
      if (endpoint === '/competitors') {
        return Promise.resolve({ data: { id: 'comp-new' }, error: null });
      }
      if (endpoint === `/contests/${contestId}/registrations`) {
        return Promise.resolve({ data: null, error: 'Registration rejected' });
      }
      return Promise.resolve({ data: null, error: null });
    });

    const { container, getByRole } = renderCreateModal();
    await fireEvent.input(labelledControl(container, 'First name'), { target: { value: 'Jan' } });
    await fireEvent.input(labelledControl(container, 'Last name'), { target: { value: 'Nowak' } });
    await fireEvent.input(container.querySelector('input[type="date"]') as HTMLInputElement, {
      target: { value: '1990-05-05' },
    });

    await fireEvent.click(getByRole('button', { name: 'Create competitor' }));

    await waitFor(() => {
      expect(container.textContent).toContain(
        'Competitor data was saved, but the registration could not be saved: Registration rejected',
      );
    });
    expect(api.post).toHaveBeenCalledWith('/competitors', {
      firstName: 'Jan',
      lastName: 'Nowak',
      birthDate: '1990-05-05',
      gender: 'Male',
      club: null,
      city: null,
      notes: null,
    });
  });

  it('reports that the registration was saved when the opening attempt write fails', async () => {
    api.post.mockImplementation((endpoint: string) => {
      if (endpoint === '/competitors') {
        return Promise.resolve({ data: { id: 'comp-new' }, error: null });
      }
      if (endpoint === `/contests/${contestId}/registrations`) {
        return Promise.resolve({ data: buildRegistration('reg-new'), error: null });
      }
      if (endpoint.endsWith('/attempts')) {
        return Promise.reject(new Error('Attempt rejected'));
      }
      return Promise.resolve({ data: null, error: null });
    });

    const { container, getByRole } = renderCreateModal();
    await fireEvent.input(labelledControl(container, 'First name'), { target: { value: 'Jan' } });
    await fireEvent.input(labelledControl(container, 'Last name'), { target: { value: 'Nowak' } });
    await fireEvent.input(container.querySelector('input[type="date"]') as HTMLInputElement, {
      target: { value: '1990-05-05' },
    });
    await fireEvent.input(labelledControl(container, 'Opening attempt (Squat)'), {
      target: { value: '200' },
    });

    await fireEvent.click(getByRole('button', { name: 'Create competitor' }));

    await waitFor(() => {
      expect(container.textContent).toContain(
        'Registration was saved, but the opening attempt could not be saved: Attempt rejected',
      );
    });
  });
});
