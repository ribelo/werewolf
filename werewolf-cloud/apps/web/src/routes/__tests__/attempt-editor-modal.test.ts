import { render, fireEvent, waitFor } from '@testing-library/svelte';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import AttemptEditorModal from '$lib/components/AttemptEditorModal.svelte';
import { addMessages, init, waitLocale } from 'svelte-i18n';
import en from '$lib/i18n/locales/en.json';
import type { Attempt } from '$lib/types';

const postMock = vi.fn();

vi.mock('$lib/api', () => ({
  apiClient: {
    post: (...args: unknown[]) => postMock(...args),
  },
}));

const registration = {
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
    addMessages('en', en);
    init({ fallbackLocale: 'en', initialLocale: 'en' });
    await waitLocale();
    postMock.mockReset();
    postMock.mockResolvedValue({ data: { success: true }, error: null });
  });

  it('submits updated attempt weights and resolves onSaved', async () => {
    const onSaved = vi.fn();

    const optimisticSpy = vi.fn();
    const { getAllByRole, getByText } = render(AttemptEditorModal, {
      contestId: 'contest-1',
      registration,
      attempts: [buildAttempt({ id: 'attempt-squat-1' })],
      onClose: vi.fn(),
      onSaved,
      onOptimisticUpdate: optimisticSpy,
      getSnapshot: () => [],
      restoreSnapshot: vi.fn(),
    });

    const inputs = getAllByRole('spinbutton');
    expect(inputs.length).toBeGreaterThan(0);
    const firstInput = inputs[0] as HTMLInputElement | undefined;
    expect(firstInput).toBeDefined();

    await fireEvent.input(firstInput!, { target: { value: '180' } });

    const saveButton = getByText('Save attempts');
    await fireEvent.click(saveButton);

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

    expect(onSaved).toHaveBeenCalledTimes(1);
    expect(optimisticSpy).toHaveBeenCalled();
  });

  it('applies optimistic attempts and restores snapshot on failure', async () => {
    const optimisticSpy = vi.fn();
    const restoreSpy = vi.fn();
    const snapshot: Attempt[] = [buildAttempt({ id: 'attempt-squat-1' })];

    postMock.mockRejectedValueOnce(new Error('network error'));

    const { getByText, getAllByRole } = render(AttemptEditorModal, {
      contestId: 'contest-1',
      registration,
      attempts: snapshot,
      onClose: vi.fn(),
      onSaved: vi.fn(),
      onOptimisticUpdate: optimisticSpy,
      getSnapshot: () => snapshot,
      restoreSnapshot: restoreSpy,
    });

    const inputs = getAllByRole('spinbutton');
    const emptyInput = inputs.find((input) => (input as HTMLInputElement).value === '') as HTMLInputElement | undefined;
    const targetInput = emptyInput ?? (inputs[0] as HTMLInputElement);
    await fireEvent.input(targetInput, { target: { value: '190' } });

    await fireEvent.click(getByText('Save attempts'));

    await waitFor(() => {
      expect(postMock).toHaveBeenCalledTimes(1);
    });

    expect(optimisticSpy).toHaveBeenCalled();
    await waitFor(() => {
      expect(restoreSpy).toHaveBeenCalledWith(snapshot);
    });
  });
});
