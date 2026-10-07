import { fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { addMessages, init, locale, waitLocale } from 'svelte-i18n';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import UnifiedContestTable from '$lib/components/UnifiedContestTable.svelte';
import { buildUnifiedRows, type AttemptNumber, type LiftKind, type UnifiedRow } from '$lib/contest-table';
import en from '$lib/i18n/locales/en.json';
import pl from '$lib/i18n/locales/pl.json';
import type { Attempt, AttemptStatus, ContestDetail, Registration } from '$lib/types';

addMessages('en', en);
addMessages('pl', pl);
init({ fallbackLocale: 'en', initialLocale: 'en' });

const LIFT_WEIGHTS: Record<LiftKind, number> = { Squat: 100, Bench: 80, Deadlift: 150 };

const CONTEST: ContestDetail = {
  id: 'contest-1',
  name: 'Werewolf Open',
  date: '2024-03-01',
  location: 'Warsaw',
  discipline: 'Squat',
  status: 'Live',
  mensBarWeight: 20,
  womensBarWeight: 15,
  clampWeight: 2.5,
  registrations: [],
  updatedAt: '2024-02-20T10:00:00Z',
};

function makeRegistration(overrides: Partial<Registration> = {}): Registration {
  return {
    id: 'reg-1',
    competitorId: 'comp-1',
    firstName: 'Anna',
    lastName: 'Nowak',
    birthDate: '1995-01-01',
    gender: 'Female',
    club: 'Werewolf',
    city: 'Warsaw',
    weightClassId: 'wc1',
    weightClassName: 'Up to 63 kg',
    ageCategoryId: 'ac-senior',
    ageCategoryName: 'Senior (24-39)',
    bodyweight: 61.2,
    competitionOrder: 1,
    lifts: ['Squat', 'Bench', 'Deadlift'],
    ...overrides,
  };
}

function makeAttempt(
  liftType: LiftKind,
  attemptNumber: 1 | 2 | 3,
  weight: number,
  status: AttemptStatus = 'Pending'
): Attempt {
  return {
    id: `${liftType.toLowerCase()}-${attemptNumber}`,
    registrationId: 'reg-1',
    liftType,
    attemptNumber,
    weight,
    status,
    createdAt: '2024-03-01T10:00:00Z',
    updatedAt: '2024-03-01T10:00:00Z',
  };
}

function makeRows(
  attempts: LiftKind[],
  registrationOverrides: Partial<Registration> = {},
  statuses: Partial<Record<LiftKind, AttemptStatus>> = {}
): UnifiedRow[] {
  const registration = makeRegistration(registrationOverrides);
  const attemptList = attempts.map((lift) =>
    makeAttempt(lift, 1, LIFT_WEIGHTS[lift], statuses[lift] ?? 'Pending')
  );
  return buildUnifiedRows({ registrations: [registration], attempts: attemptList, contest: CONTEST });
}

const READ_ONLY_COLUMNS: { showPointsColumn: boolean; showMaxColumn: boolean; attemptNumbers: AttemptNumber[] } = {
  showPointsColumn: false,
  showMaxColumn: false,
  attemptNumbers: [1],
};

describe('UnifiedContestTable', () => {
  beforeEach(async () => {
    locale.set('en');
    await waitLocale('en');
  });

  it('renders attempt columns for attempts 1..3 only', () => {
    const rows = makeRows(['Squat', 'Bench', 'Deadlift']);
    render(UnifiedContestTable, { props: { rows, readOnly: true } });

    const attemptHeaders = screen
      .getAllByRole('columnheader')
      .map((header) => header.getAttribute('title'))
      .filter((title): title is string => title !== null && /^(SQ|BP|DL) (I|II|III)$/.test(title));

    expect(attemptHeaders).toHaveLength(9);
    expect(screen.queryByTitle('SQ IV')).toBeNull();
    expect(screen.queryByTitle('DL IV')).toBeNull();
  });

  const READ_ONLY_COMBOS: { label: string; lifts: LiftKind[] }[] = [
    { label: 'the squat', lifts: ['Squat'] },
    { label: 'the bench', lifts: ['Bench'] },
    { label: 'the deadlift', lifts: ['Deadlift'] },
    { label: 'squat and deadlift', lifts: ['Squat', 'Deadlift'] },
    { label: 'all three lifts', lifts: ['Squat', 'Bench', 'Deadlift'] },
  ];

  it.each(READ_ONLY_COMBOS)('renders read-only weight pills for $label', ({ lifts }) => {
    const rows = makeRows(['Squat', 'Bench', 'Deadlift'], {}, { Squat: 'Successful' });
    render(UnifiedContestTable, {
      props: { rows, readOnly: true, lifts, ...READ_ONLY_COLUMNS },
    });

    const table = screen.getByRole('table');
    const headerCells = table.querySelectorAll('thead tr:first-child th');
    const bodyCells = table.querySelectorAll('tbody tr:first-child td');
    expect(bodyCells).toHaveLength(headerCells.length);

    for (const lift of lifts) {
      expect(screen.getByText(`${LIFT_WEIGHTS[lift]}kg`)).toBeInTheDocument();
    }

    expect(screen.queryAllByRole('textbox')).toHaveLength(0);
    expect(screen.queryAllByLabelText('Set live')).toHaveLength(0);
    const successful = lifts.includes('Squat') ? 1 : 0;
    expect(screen.queryAllByLabelText('Successful')).toHaveLength(successful);
    expect(screen.queryAllByLabelText('Pending')).toHaveLength(lifts.length - successful);
  });

  it('renders a placeholder for lifts the registration does not compete in', () => {
    const rows = makeRows(['Squat'], { lifts: ['Squat'] });
    render(UnifiedContestTable, {
      props: { rows, lifts: ['Squat', 'Bench'], ...READ_ONLY_COLUMNS },
    });

    expect(screen.getAllByRole('textbox')).toHaveLength(1);
    expect(screen.getByDisplayValue('100.00')).toBeInTheDocument();
    expect(screen.getAllByText('—').length).toBeGreaterThanOrEqual(1);
  });

  it.each(['Squat', 'Bench', 'Deadlift'] as LiftKind[])(
    'routes live, status and weight mutations for an editable %s attempt',
    async (lift) => {
      const onSetCurrentAttempt = vi.fn();
      const onAttemptStatusCycle = vi.fn();
      const onAttemptWeightChange = vi.fn();
      const rows = makeRows([lift]);
      const attempt = rows[0]!.attempts[lift][0]!.attempt;
      const weight = LIFT_WEIGHTS[lift];

      render(UnifiedContestTable, {
        props: {
          rows,
          lifts: [lift],
          ...READ_ONLY_COLUMNS,
          onSetCurrentAttempt,
          onAttemptStatusCycle,
          onAttemptWeightChange,
        },
      });

      await fireEvent.click(screen.getByLabelText('Set live'));
      expect(onSetCurrentAttempt).toHaveBeenCalledWith(attempt);

      await fireEvent.click(screen.getByLabelText('Pending'));
      expect(onAttemptStatusCycle).toHaveBeenCalledWith(attempt);

      const weightInput = screen.getByDisplayValue(`${weight}.00`);
      await fireEvent.change(weightInput, { target: { value: `${weight + 2.5}`.replace('.', ',') } });
      expect(onAttemptWeightChange).toHaveBeenCalledWith({
        registrationId: 'reg-1',
        liftType: lift,
        attemptNumber: 1,
        attemptId: `${lift.toLowerCase()}-1`,
        weight: weight + 2.5,
      });

      await fireEvent.change(weightInput, { target: { value: 'nonsense' } });
      expect(onAttemptWeightChange).toHaveBeenCalledTimes(1);
    }
  );

  it('marks the current attempt as live', () => {
    const rows = makeRows(['Bench'], {}, { Bench: 'Successful' });
    render(UnifiedContestTable, {
      props: { rows, lifts: ['Bench'], ...READ_ONLY_COLUMNS, currentAttemptId: 'bench-1' },
    });

    const liveButton = screen.getByLabelText('Live now');
    expect(liveButton).toHaveAttribute('aria-pressed', 'true');
    expect(liveButton).toBeDisabled();
    expect(screen.getByLabelText('Successful')).toBeInTheDocument();
  });

  it('ignores weight edits while a change is pending', async () => {
    const onAttemptWeightChange = vi.fn();
    const rows = makeRows(['Squat']);
    const { component } = render(UnifiedContestTable, {
      props: { rows, lifts: ['Squat'], ...READ_ONLY_COLUMNS, onAttemptWeightChange },
    });

    const weightInput = screen.getByDisplayValue('100.00');
    await fireEvent.change(weightInput, { target: { value: '101.5' } });
    expect(onAttemptWeightChange).toHaveBeenCalledTimes(1);
    onAttemptWeightChange.mockClear();

    await component.$set({ attemptWeightPending: { 'squat-1': true } });

    await waitFor(() => expect(weightInput).toBeDisabled());
    expect(weightInput).toHaveAttribute('aria-busy', 'true');
    expect(screen.getByLabelText('Set live')).toBeDisabled();

    await fireEvent.change(weightInput, { target: { value: '102.5' } });
    expect(onAttemptWeightChange).not.toHaveBeenCalled();
  });

  it('toggles lifts in registration mode with the lift name interpolated', async () => {
    const onToggleLift = vi.fn();
    const rows = makeRows(['Squat'], { lifts: ['Squat'] });
    render(UnifiedContestTable, {
      props: {
        rows,
        mode: 'registration',
        lifts: ['Squat', 'Bench', 'Deadlift'],
        attemptNumbers: [1],
        onToggleLift,
      },
    });

    const disableSquat = screen.getByLabelText('Disable Squat');
    const enableBench = screen.getByLabelText('Enable Bench press');
    const enableDeadlift = screen.getByLabelText('Enable Deadlift');
    expect(disableSquat).toHaveAttribute('aria-pressed', 'true');
    expect(enableBench).toHaveAttribute('aria-pressed', 'false');
    expect(enableDeadlift).toHaveAttribute('aria-pressed', 'false');
    expect(screen.queryAllByRole('textbox')).toHaveLength(0);

    await fireEvent.click(enableDeadlift);
    expect(onToggleLift).toHaveBeenCalledWith(rows[0]!.registration, 'Deadlift', true);

    await fireEvent.click(enableBench);
    expect(onToggleLift).toHaveBeenCalledWith(rows[0]!.registration, 'Bench', true);

    await fireEvent.click(disableSquat);
    expect(onToggleLift).toHaveBeenCalledWith(rows[0]!.registration, 'Squat', false);
  });

  it('follows locale switches for registration labels', async () => {
    const rows = makeRows(['Squat'], { lifts: ['Squat'] });
    render(UnifiedContestTable, {
      props: { rows, mode: 'registration', lifts: ['Squat', 'Bench'], attemptNumbers: [1] },
    });

    expect(screen.getByLabelText('Disable Squat')).toBeInTheDocument();

    locale.set('pl');
    await waitFor(() => expect(screen.getByLabelText('Wyłącz Przysiad')).toBeInTheDocument());
    expect(screen.getByLabelText('Włącz Wyciskanie leżąc')).toBeInTheDocument();

    locale.set('en');
    await waitFor(() => expect(screen.getByLabelText('Disable Squat')).toBeInTheDocument());
  });

  it('renders Polish attempt status labels', async () => {
    locale.set('pl');
    await waitLocale('pl');
    const rows = makeRows(['Deadlift'], {}, { Deadlift: 'Failed' });
    render(UnifiedContestTable, {
      props: { rows, readOnly: true, lifts: ['Deadlift'], ...READ_ONLY_COLUMNS },
    });

    expect(screen.getByLabelText('Nieudana')).toBeInTheDocument();
    expect(screen.getByText('150kg')).toBeInTheDocument();
  });
});
