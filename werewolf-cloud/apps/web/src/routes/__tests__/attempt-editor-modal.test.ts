import { render, fireEvent, waitFor } from '@testing-library/svelte';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import AttemptEditorModal from '$lib/components/AttemptEditorModal.svelte';
import { addMessages, init, waitLocale } from 'svelte-i18n';
import en from '$lib/i18n/locales/en.json';
import type { Attempt, Registration } from '$lib/types';

const postMock = vi.fn();
const getMock = vi.fn();
const toastSuccessMock = vi.fn();
const toastErrorMock = vi.fn();
const toastInfoMock = vi.fn();

vi.mock('$lib/api', () => ({
  apiClient: {
    post: (...args: unknown[]) => postMock(...args),
    get: (...args: unknown[]) => getMock(...args),
  },
}));

vi.mock('$lib/ui/toast', () => ({
  toast: {
    success: (...args: unknown[]) => toastSuccessMock(...args),
    error: (...args: unknown[]) => toastErrorMock(...args),
    info: (...args: unknown[]) => toastInfoMock(...args),
    warning: vi.fn(),
  },
}));

// The attempt editor messages are not part of the shipped catalogues yet; the
// specs below assert the current labels, so they are registered here.
const attemptEditorMessages = {
  attempt_editor: {
    table: { lift: 'Lift', attempt: 'Attempt {number}' },
    controls: { increase: '+{delta}', decrease: '-{delta}' },
    buttons: { save: 'Save' },
    toast: {
      missing_ids: 'Missing contest or registration id',
      weight_invalid: 'Attempt weight must be a positive number',
      nothing_to_save: 'Nothing to save',
      save_success: 'Attempts saved',
      save_error: 'Could not save attempts',
      save_partial: 'Saved {saved} of {total} attempts — the rest could not be saved',
    },
  },
};

const registration: Registration = {
  id: 'reg-1',
  competitorId: 'comp-1',
  firstName: 'Anna',
  lastName: 'Kowalska',
  birthDate: '1992-01-01',
  gender: 'F',
  club: 'AZS',
  city: 'Warszawa',
  weightClassId: 'wc1',
  weightClassName: 'Do 67.5 kg',
  ageCategoryId: 'ac1',
  ageCategoryName: 'Senior (24-39)',
  bodyweight: 63.5,
  rackHeightSquat: 42,
  rackHeightBench: 36,
  reshelCoefficient: null,
  mcculloughCoefficient: null,
  competitionOrder: 1,
  lifts: ['Squat', 'Bench', 'Deadlift'],
};

function buildAttempt(overrides: Partial<Attempt> = {}): Attempt {
  return {
    id: 'attempt-default',
    registrationId: registration.id,
    liftType: 'Squat',
    attemptNumber: 1,
    weight: 170,
    status: 'Pending',
    judge1Decision: null,
    judge2Decision: null,
    judge3Decision: null,
    notes: null,
    timestamp: null,
    createdAt: '2024-01-01T10:00:00Z',
    updatedAt: '2024-01-01T10:00:00Z',
    firstName: registration.firstName,
    lastName: registration.lastName,
    competitorName: `${registration.firstName} ${registration.lastName}`,
    competitionOrder: registration.competitionOrder ?? null,
    ...overrides,
  };
}

describe('AttemptEditorModal', () => {
  beforeEach(async () => {
    addMessages('en', { ...en, ...attemptEditorMessages });
    init({ fallbackLocale: 'en', initialLocale: 'en' });
    await waitLocale();
    postMock.mockReset();
    getMock.mockReset();
    toastSuccessMock.mockReset();
    toastErrorMock.mockReset();
    toastInfoMock.mockReset();
    postMock.mockResolvedValue({ data: { success: true }, error: null });
  });

  it('submits updated attempt weights and reports the saved attempts', async () => {
    const onSaved = vi.fn();
    const optimisticSpy = vi.fn();
    const restoreSnapshotSpy = vi.fn();

    const { getAllByRole, getByRole } = render(AttemptEditorModal, {
      contestId: 'contest-1',
      registration,
      attempts: [buildAttempt({ id: 'attempt-squat-1' })],
      onClose: vi.fn(),
      onSaved,
      onOptimisticUpdate: optimisticSpy,
      getSnapshot: () => [],
      restoreSnapshot: restoreSnapshotSpy,
    });

    const inputs = getAllByRole('spinbutton') as HTMLInputElement[];
    expect(inputs.length).toBeGreaterThan(0);
    const firstInput = inputs[0];
    expect(firstInput).toBeDefined();

    await fireEvent.input(firstInput!, { target: { value: '180' } });

    await fireEvent.click(getByRole('button', { name: 'Save' }));

    await waitFor(() => {
      expect(postMock).toHaveBeenCalledTimes(1);
    });

    expect(postMock).toHaveBeenCalledWith(
      '/contests/contest-1/registrations/reg-1/attempts',
      {
        registrationId: registration.id,
        liftType: 'Squat',
        attemptNumber: 1,
        weight: 180,
      }
    );

    await waitFor(() => {
      expect(onSaved).toHaveBeenCalledTimes(1);
    });
    expect(onSaved).toHaveBeenCalledWith([
      expect.objectContaining({ liftType: 'Squat', attemptNumber: 1, weight: 180 }),
    ]);
    expect(optimisticSpy).toHaveBeenCalled();
    expect(toastSuccessMock).toHaveBeenCalledWith('Attempts saved');
    expect(toastErrorMock).not.toHaveBeenCalled();
    // A successful save has nothing to reconcile.
    expect(getMock).not.toHaveBeenCalled();
    expect(restoreSnapshotSpy).not.toHaveBeenCalled();
  });

  it('does not re-save unchanged drafts', async () => {
    const onSaved = vi.fn();

    const { getByRole } = render(AttemptEditorModal, {
      contestId: 'contest-1',
      registration,
      attempts: [buildAttempt({ id: 'attempt-squat-1' })],
      onClose: vi.fn(),
      onSaved,
      onOptimisticUpdate: vi.fn(),
      getSnapshot: () => [],
      restoreSnapshot: vi.fn(),
    });

    await fireEvent.click(getByRole('button', { name: 'Save' }));

    await waitFor(() => {
      expect(toastInfoMock).toHaveBeenCalledWith('Nothing to save');
    });
    expect(postMock).not.toHaveBeenCalled();
    expect(onSaved).not.toHaveBeenCalled();
    expect(toastErrorMock).not.toHaveBeenCalled();
  });

  it('refuses non-positive weights without saving anything', async () => {
    const onSaved = vi.fn();

    const { getAllByRole, getByRole } = render(AttemptEditorModal, {
      contestId: 'contest-1',
      registration,
      attempts: [buildAttempt({ id: 'attempt-squat-1' })],
      onClose: vi.fn(),
      onSaved,
      onOptimisticUpdate: vi.fn(),
      getSnapshot: () => [],
      restoreSnapshot: vi.fn(),
    });

    const inputs = getAllByRole('spinbutton') as HTMLInputElement[];
    await fireEvent.input(inputs[0]!, { target: { value: '0' } });

    await fireEvent.click(getByRole('button', { name: 'Save' }));

    await waitFor(() => {
      expect(toastErrorMock).toHaveBeenCalledWith('Attempt weight must be a positive number');
    });
    expect(postMock).not.toHaveBeenCalled();
    expect(onSaved).not.toHaveBeenCalled();
  });

  it('treats empty drafts as nothing to save', async () => {
    const onSaved = vi.fn();

    const { getByRole } = render(AttemptEditorModal, {
      contestId: 'contest-1',
      registration,
      attempts: [],
      onClose: vi.fn(),
      onSaved,
      onOptimisticUpdate: vi.fn(),
      getSnapshot: () => [],
      restoreSnapshot: vi.fn(),
    });

    await fireEvent.click(getByRole('button', { name: 'Save' }));

    await waitFor(() => {
      expect(toastInfoMock).toHaveBeenCalledWith('Nothing to save');
    });
    expect(postMock).not.toHaveBeenCalled();
    expect(onSaved).not.toHaveBeenCalled();
  });

  it('keeps the attempts saved before a failure and reconciles with the server', async () => {
    const attempts = [
      buildAttempt({ id: 'attempt-squat-1', attemptNumber: 1, weight: 170 }),
      buildAttempt({ id: 'attempt-squat-2', attemptNumber: 2, weight: 150 }),
    ];
    const serverAttempts = [
      buildAttempt({ id: 'attempt-squat-1', attemptNumber: 1, weight: 180 }),
      buildAttempt({ id: 'attempt-squat-2', attemptNumber: 2, weight: 150 }),
    ];

    const onSaved = vi.fn();
    const optimisticSpy = vi.fn();
    const restoreSnapshotSpy = vi.fn();
    const getSnapshotSpy = vi.fn(() => [...attempts]);

    postMock
      .mockResolvedValueOnce({ data: { success: true }, error: null })
      .mockRejectedValueOnce(new Error('second write failed'));
    getMock.mockResolvedValue({ data: serverAttempts, error: null });

    const { getAllByRole, getByRole } = render(AttemptEditorModal, {
      contestId: 'contest-1',
      registration,
      attempts,
      onClose: vi.fn(),
      onSaved,
      onOptimisticUpdate: optimisticSpy,
      getSnapshot: getSnapshotSpy,
      restoreSnapshot: restoreSnapshotSpy,
    });

    const inputs = getAllByRole('spinbutton') as HTMLInputElement[];
    await fireEvent.input(inputs[0]!, { target: { value: '180' } });
    await fireEvent.input(inputs[1]!, { target: { value: '160' } });

    await fireEvent.click(getByRole('button', { name: 'Save' }));

    await waitFor(() => {
      expect(postMock).toHaveBeenCalledTimes(2);
    });
    expect(postMock).toHaveBeenNthCalledWith(
      1,
      '/contests/contest-1/registrations/reg-1/attempts',
      { registrationId: 'reg-1', liftType: 'Squat', attemptNumber: 1, weight: 180 }
    );
    expect(postMock).toHaveBeenNthCalledWith(
      2,
      '/contests/contest-1/registrations/reg-1/attempts',
      { registrationId: 'reg-1', liftType: 'Squat', attemptNumber: 2, weight: 160 }
    );

    expect(optimisticSpy).toHaveBeenCalled();
    expect(onSaved).not.toHaveBeenCalled();
    expect(toastSuccessMock).not.toHaveBeenCalled();

    // The first write is committed on the server: reconcile instead of rolling back.
    await waitFor(() => {
      expect(getMock).toHaveBeenCalledWith('/contests/contest-1/attempts');
    });
    await waitFor(() => {
      expect(restoreSnapshotSpy).toHaveBeenCalledWith(serverAttempts);
    });
    expect(restoreSnapshotSpy).not.toHaveBeenCalledWith([...attempts]);
    expect(getSnapshotSpy).not.toHaveBeenCalled();
    expect(toastErrorMock).toHaveBeenCalledWith('Saved 1 of 2 attempts — the rest could not be saved');

    // Server state wins: the stored weight of the first attempt is now visible.
    await waitFor(() => {
      const reRendered = getAllByRole('spinbutton') as HTMLInputElement[];
      expect(reRendered[0]?.value).toBe('180');
    });
  });

  it('reverts local optimism when nothing was saved and the server cannot be read', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const attempts = [buildAttempt({ id: 'attempt-squat-1', weight: 170 })];
    const preSaveSnapshot = [...attempts];

    const onSaved = vi.fn();
    const restoreSnapshotSpy = vi.fn();
    const getSnapshotSpy = vi.fn(() => preSaveSnapshot);

    postMock.mockRejectedValueOnce(new Error('network down'));
    getMock.mockRejectedValue(new Error('server unreachable'));

    const { getAllByRole, getByRole } = render(AttemptEditorModal, {
      contestId: 'contest-1',
      registration,
      attempts,
      onClose: vi.fn(),
      onSaved,
      onOptimisticUpdate: vi.fn(),
      getSnapshot: getSnapshotSpy,
      restoreSnapshot: restoreSnapshotSpy,
    });

    const inputs = getAllByRole('spinbutton') as HTMLInputElement[];
    await fireEvent.input(inputs[0]!, { target: { value: '180' } });
    await fireEvent.click(getByRole('button', { name: 'Save' }));

    await waitFor(() => {
      expect(restoreSnapshotSpy).toHaveBeenCalledWith(preSaveSnapshot);
    });
    expect(getSnapshotSpy).toHaveBeenCalled();
    expect(onSaved).not.toHaveBeenCalled();
    expect(toastSuccessMock).not.toHaveBeenCalled();
    expect(toastErrorMock).toHaveBeenCalledWith('network down');

    // Nothing reached the server, so the optimistic weight is gone again.
    await waitFor(() => {
      const reRendered = getAllByRole('spinbutton') as HTMLInputElement[];
      expect(reRendered[0]?.value).toBe('170');
    });

    consoleSpy.mockRestore();
  });
});
