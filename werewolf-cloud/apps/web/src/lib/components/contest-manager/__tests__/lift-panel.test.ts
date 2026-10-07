import { render } from '@testing-library/svelte';
import { addMessages, init } from 'svelte-i18n';
import { describe, expect, it } from 'vitest';
import LiftPanel from '../LiftPanel.svelte';
import { buildUnifiedRows, type LiftKind, type UnifiedRow } from '$lib/contest-table';
import en from '$lib/i18n/locales/en.json';
import type { Attempt, ContestDetail, Registration } from '$lib/types';

addMessages('en', en);
init({ fallbackLocale: 'en', initialLocale: 'en' });

const contest: ContestDetail = {
  id: 'contest-1',
  name: 'Werewolf Open',
  date: '2024-03-01',
  location: 'Warsaw',
  discipline: 'Powerlifting',
  status: 'Live',
  mensBarWeight: 20,
  womensBarWeight: 15,
  clampWeight: 2.5,
  competitionType: 'Squat, Bench, Deadlift',
  registrations: [],
};

function registration(): Registration {
  return {
    id: 'reg-1',
    competitorId: 'comp-1',
    firstName: 'Anna',
    lastName: 'Nowak',
    birthDate: '1995-01-01',
    gender: 'Female',
    weightClassId: 'wc-1',
    weightClassName: 'Up to 63 kg',
    ageCategoryId: 'ac-1',
    ageCategoryName: 'Senior',
    bodyweight: 61.2,
    competitionOrder: 1,
    lifts: ['Squat', 'Bench', 'Deadlift'],
  };
}

function attempt(liftType: LiftKind, weight: number): Attempt {
  return {
    id: `${liftType.toLowerCase()}-1`,
    registrationId: 'reg-1',
    liftType,
    attemptNumber: 1,
    weight,
    status: 'Pending',
    createdAt: '2024-02-20T10:00:00Z',
    updatedAt: '2024-02-20T10:00:00Z',
  };
}

const registrations = [registration()];
const rows: UnifiedRow[] = buildUnifiedRows({
  registrations,
  attempts: [attempt('Squat', 100), attempt('Bench', 60), attempt('Deadlift', 150)],
  contest,
  resultsOpen: [],
  resultsAge: [],
  resultsWeight: [],
});

/** Attempt-column prefixes that differ per lift; everything else must be identical. */
const LIFT_TOKENS: Record<LiftKind, Array<[RegExp, string]>> = {
  Squat: [[/Squat/g, 'LIFT'], [/SQ(?![a-z])/g, 'ABBR']],
  Bench: [[/Bench press/g, 'LIFT'], [/Bench/g, 'LIFT'], [/BP(?![a-z])/g, 'ABBR']],
  Deadlift: [[/Deadlift/g, 'LIFT'], [/DL(?![a-z])/g, 'ABBR']],
};

function renderLiftRaw(lift: LiftKind): string {
  const { container } = render(LiftPanel, {
    lift,
    title: 'Lift table',
    rows,
    exportMenuId: lift === 'Squat' ? 'squat' : lift === 'Bench' ? 'bench' : 'deadlift',
    syncClass: 'sync-class',
    registrationsCount: registrations.length,
    weightClasses: [{ id: 'wc-1', code: '63', name: 'Up to 63 kg', gender: 'Female', minWeight: 0, maxWeight: 63 }],
    ageCategories: [{ id: 'ac-1', code: 'SR', name: 'Senior', minAge: 24, maxAge: 39 }],
    femaleWeightFilters: [{ id: 'FEMALE_OPEN', label: 'Open' }],
    availableAgeFilters: [{ id: 'ALL', label: 'All' }],
    availableLabelFilters: [{ id: 'ALL', label: 'All' }],
    registrationWeightSelectionLabel: 'Open',
    registrationAgeSelectionLabel: 'All',
    registrationLabelSelectionLabel: 'All',
  });

  return container.innerHTML.replace(/<!--[\s\S]*?-->/g, '');
}

/** Tag sequence and lift-agnostic text of a rendered panel. */
function describeRender(lift: LiftKind): { tags: string[]; text: string } {
  const html = renderLiftRaw(lift);
  const tags = Array.from(html.matchAll(/<([a-zA-Z][a-zA-Z0-9-]*)/g), (match) => match[1] ?? '');
  const rawText = html.replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
  const text = LIFT_TOKENS[lift].reduce(
    (result, [pattern, replacement]) => result.replace(pattern, replacement),
    rawText,
  );
  return { tags, text };
}

const ALL_LIFTS: LiftKind[] = ['Squat', 'Bench', 'Deadlift'];

describe('LiftPanel', () => {
  it('renders the shared panel chrome and the table for every lift', () => {
    for (const lift of ALL_LIFTS) {
      const html = renderLiftRaw(lift);
      expect(html).toContain('Lift table');
      expect(html).toContain('sync-class');
      expect(html).toContain('Sync');
      expect(html).toContain('Show QR');
      expect(html).toContain('Export');
      expect(html).toContain('<table');
    }
  });

  it('renders the squat and bench tables with identical markup modulo the lift label', () => {
    const squat = describeRender('Squat');
    const bench = describeRender('Bench');

    expect(squat.tags.length).toBeGreaterThan(100);
    expect(bench.tags).toEqual(squat.tags);
    expect(bench.text).toBe(squat.text);
  });

  it('renders the deadlift table without the squat and bench rack column', () => {
    const deadlift = describeRender('Deadlift');

    expect(deadlift.tags).toHaveLength(describeRender('Squat').tags.length - 4);
    expect(renderLiftRaw('Squat')).toContain('Rack</th>');
    expect(renderLiftRaw('Bench')).toContain('Rack</th>');
    expect(renderLiftRaw('Deadlift')).not.toContain('Rack</th>');
  });

  it('uses the attempt prefix of the rendered lift', () => {
    expect(renderLiftRaw('Squat')).toContain('SQ&nbsp;I');
    expect(renderLiftRaw('Bench')).toContain('BP&nbsp;I');
    expect(renderLiftRaw('Deadlift')).toContain('DL&nbsp;I');
    expect(renderLiftRaw('Squat')).not.toContain('BP&nbsp;I');
  });
});
