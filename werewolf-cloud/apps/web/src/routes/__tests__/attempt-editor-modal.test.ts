import { render, fireEvent, waitFor } from '@testing-library/svelte';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import AttemptEditorModal from '$lib/components/AttemptEditorModal.svelte';

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
  ageClassId: 'ac1',
  bodyweight: 63.5,
  lotNumber: null,
  equipmentM: false,
  equipmentSm: false,
  equipmentT: false,
  rackHeightSquat: 42,
  rackHeightBench: 36,
  personalRecordAtEntry: null,
  reshelCoefficient: null,
  mcculloughCoefficient: null,
  competitionOrder: 1,
};

const baseAttempt = {
  registrationId: registration.id,
  weight: 0,
  status: 'Pending' as const,
  judge1Decision: null,
  judge2Decision: null,
  judge3Decision: null,
  notes: null,
  createdAt: '2024-01-01T10:00:00Z',
  updatedAt: '2024-01-01T10:00:00Z',
};

describe('AttemptEditorModal', () => {
  beforeEach(() => {
    postMock.mockReset();
    postMock.mockResolvedValue({ data: { success: true }, error: null });
  });

  it('submits updated attempt weights and resolves onSaved', async () => {
    const onSaved = vi.fn();

    const { getAllByRole, getByText } = render(AttemptEditorModal, {
      contestId: 'contest-1',
      registration,
      attempts: [
        {
          ...baseAttempt,
          id: 'attempt-squat-1',
          liftType: 'Squat',
          attemptNumber: 1,
          weight: 170,
        },
      ],
      onClose: vi.fn(),
      onSaved,
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
  });
});
