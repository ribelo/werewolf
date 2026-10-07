import { render, screen, within } from '@testing-library/svelte';
import { describe, it, expect, beforeEach } from 'vitest';
import { addMessages, init, locale, waitLocale } from 'svelte-i18n';

import UnifiedContestTable from '$lib/components/UnifiedContestTable.svelte';
import { buildUnifiedRows } from '$lib/contest-table';
import en from '$lib/i18n/locales/en.json';
import type { AgeCategory, ContestDetail, Registration, WeightClass } from '$lib/types';

/**
 * The registrations view of a contest is rendered by UnifiedContestTable (the
 * registration mode ContestManagerView uses); this suite keeps an eye on the
 * coefficient columns that view shows.
 */

const CONTEST: ContestDetail = {
  id: 'contest-1',
  name: 'Werewolf Open',
  date: '2024-03-01',
  location: 'Warsaw',
  discipline: 'Deadlift',
  status: 'Live',
  mensBarWeight: 20,
  womensBarWeight: 15,
  clampWeight: 2.5,
  registrations: [],
  updatedAt: '2024-02-20T10:00:00Z',
};

const WEIGHT_CLASSES: WeightClass[] = [
  { id: 'wc1', code: 'F_63', name: 'Up to 63 kg', gender: 'Female', minWeight: 57, maxWeight: 63 },
];

const AGE_CATEGORIES: AgeCategory[] = [
  { id: 'ac-senior', code: 'SENIOR', name: 'Senior (24-39)', minAge: 24, maxAge: 39 },
];

function registration(): Registration {
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
    rackHeightSquat: 42,
    rackHeightBench: 37,
    reshelCoefficient: 0.9453,
    mcculloughCoefficient: 1.072,
    competitionOrder: 5,
    lifts: ['Deadlift'],
  };
}

describe('contest registrations table', () => {
  beforeEach(async () => {
    addMessages('en', en);
    init({ fallbackLocale: 'en', initialLocale: 'en' });
    locale.set('en');
    await waitLocale();
  });

  it('renders Reshel and McCulloch coefficients with formatted values', () => {
    const rows = buildUnifiedRows({
      registrations: [registration()],
      attempts: [],
      contest: CONTEST,
    });

    render(UnifiedContestTable, {
      props: {
        rows,
        mode: 'registration',
        lifts: ['Deadlift'],
        attemptNumbers: [1],
        weightClasses: WEIGHT_CLASSES,
        ageCategories: AGE_CATEGORIES,
        showPointsColumn: false,
        showMaxColumn: false,
      },
    });

    const reshelHeader = screen.getByRole('columnheader', { name: /Reshel/i });
    const table = reshelHeader.closest('table');
    expect(table).not.toBeNull();

    const mccHeader = within(table as HTMLTableElement).getByRole('columnheader', { name: /McC\./i });
    expect(mccHeader).toBeInTheDocument();

    expect(within(table as HTMLTableElement).getByText('0.945')).toBeInTheDocument();
    expect(within(table as HTMLTableElement).getByText('1.072')).toBeInTheDocument();
  });
});
