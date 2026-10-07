import { describe, expect, it } from 'vitest';
import {
  buildNextLifts,
  collectExtraTagLabels,
  competitorDisplayName,
  computeAvailableTagOptions,
  createEmptyCompetitorDraft,
  createTagDraftFactory,
  createAttemptPlan,
  disciplineForEvents,
  fillAttemptPlan,
  normaliseDraftEvents,
  normaliseTagSelection,
  normalizeAttemptPlanForGender,
  replaceTagLabelInTags,
  roundToIncrement,
  suggestOpener,
  syncAttemptPlan,
  type CompetitorDraft,
} from '../draft';

function draft(overrides: Partial<CompetitorDraft> = {}): CompetitorDraft {
  const base = createEmptyCompetitorDraft({
    id: 'draft-1',
    events: ['Squat', 'Bench'],
    tagOptions: ['Open', 'Mundurowka'],
  });
  return { ...base, ...overrides };
}

describe('tag drafts', () => {
  it('derives available options from the drafts and always keeps Open', () => {
    const createTagDraft = createTagDraftFactory('tag');
    const drafts = [
      createTagDraft(' Open '),
      createTagDraft('open'),
      createTagDraft('Juvenile'),
      createTagDraft('  '),
      createTagDraft('juvenile'),
    ];
    expect(computeAvailableTagOptions(drafts)).toEqual(['Open', 'Juvenile']);
    expect(computeAvailableTagOptions([])).toEqual(['Open']);
  });

  it('canonicalises, de-duplicates and enforces the mandatory tag', () => {
    const options = ['Open', 'Juvenile'];
    expect(normaliseTagSelection(['juvenile', 'JUVENILE', 'unknown'], options)).toEqual([
      'Open',
      'Juvenile',
    ]);
    expect(normaliseTagSelection(['Open'], options)).toEqual(['Open']);
    expect(normaliseTagSelection(undefined, options)).toEqual(['Open']);
    expect(normaliseTagSelection(['Juvenile'], options, { enforceMandatory: false })).toEqual([
      'Juvenile',
    ]);
    expect(normaliseTagSelection(['Juvenile'], [])).toEqual(['Open']);
    expect(normaliseTagSelection(['Juvenile'], [], { enforceMandatory: false })).toEqual([]);
  });

  it('collects the extra labels to create on the server', () => {
    const createTagDraft = createTagDraftFactory('tag');
    const labels = collectExtraTagLabels([
      createTagDraft('Open', { mandatory: true }),
      createTagDraft(' Juvenile '),
      createTagDraft('  '),
      createTagDraft('juvenile'),
      createTagDraft('open'),
    ]);
    expect(labels).toEqual(['Juvenile']);
  });

  it('rewrites a renamed label in every draft that used it', () => {
    expect(replaceTagLabelInTags(['Open', 'Juvenile'], 'juvenile', ' Youth ')).toEqual({
      tags: ['Open', 'Youth'],
      changed: true,
    });
    expect(replaceTagLabelInTags(['Open'], 'Juvenile', 'Youth')).toEqual({
      tags: ['Open'],
      changed: false,
    });
    expect(replaceTagLabelInTags(['Juvenile'], 'Juvenile', '   ')).toEqual({
      tags: ['Juvenile'],
      changed: true,
    });
  });
});

describe('attempt plans', () => {
  it('rounds suggestions to the attempt increment', () => {
    expect(roundToIncrement(101.2)).toBe(100);
    expect(roundToIncrement(101.3)).toBe(102.5);
    expect(suggestOpener('Squat', 100)).toBe(120);
    expect(suggestOpener('Bench', 100)).toBe(80);
    expect(suggestOpener('Deadlift', 100)).toBe(140);
    expect(suggestOpener('Squat', 0)).toBe(25);
  });

  it('creates an empty or pre-filled plan for the selected events', () => {
    expect(createAttemptPlan(['Squat', 'Bench'], 100, false)).toEqual({ Squat: null, Bench: null });
    expect(createAttemptPlan(['Squat'], 100, true)).toEqual({ Squat: 120 });
    expect(createAttemptPlan([], 100, true)).toEqual({});
  });

  it('keeps the plan aligned with the selected events', () => {
    expect(syncAttemptPlan({ Squat: 100, Bench: 50, Deadlift: 140 }, ['Bench'])).toEqual({ Bench: 50 });
    expect(syncAttemptPlan(undefined, ['Squat'])).toEqual({ Squat: null });
  });

  it('fills only the missing openers when asked to', () => {
    const filled = fillAttemptPlan({ Squat: 150, Bench: null }, ['Squat', 'Bench'], 100, true);
    expect(filled).toEqual({ Squat: 150, Bench: 80 });
    const overwritten = fillAttemptPlan({ Squat: 150 }, ['Squat'], 100, false);
    expect(overwritten).toEqual({ Squat: 120 });
  });

  it('normalises every planned weight for the competitor gender', () => {
    expect(normalizeAttemptPlanForGender({ Squat: 100, Bench: null }, 'Male')).toEqual({
      Squat: 100,
      Bench: null,
    });
    expect(normalizeAttemptPlanForGender({ Squat: 0, Bench: -5 }, 'Female')).toEqual({
      Squat: null,
      Bench: null,
    });
  });
});

describe('competitor drafts', () => {
  it('starts empty with the mandatory tag and empty attempts', () => {
    const empty = createEmptyCompetitorDraft({
      id: 'draft-7',
      events: ['Squat'],
      tagOptions: ['Open'],
    });
    expect(empty.id).toBe('draft-7');
    expect(empty.lifts).toEqual(['Squat']);
    expect(empty.attempts).toEqual({ Squat: null });
    expect(empty.tags).toEqual(['Open']);
    expect(empty.bodyweight).toBe(70);
  });

  it('filters lifts to the contest events and keeps their order', () => {
    expect(normaliseDraftEvents(['Deadlift', 'Squat'], ['Squat', 'Bench', 'Deadlift'])).toEqual([
      'Squat',
      'Deadlift',
    ]);
    expect(normaliseDraftEvents(['Bench'], ['Squat', 'Deadlift'])).toEqual(['Squat', 'Deadlift']);
    expect(normaliseDraftEvents([], ['Bench'])).toEqual(['Bench']);
    expect(normaliseDraftEvents(['Squat'], [])).toEqual(['Squat', 'Bench', 'Deadlift']);
  });

  it('never lets a competitor end up without a lift', () => {
    expect(buildNextLifts(['Squat'], 'Squat', ['Squat', 'Bench'])).toEqual(['Squat']);
    expect(buildNextLifts(['Squat'], 'Bench', ['Squat', 'Bench'])).toEqual(['Squat', 'Bench']);
    expect(buildNextLifts(['Squat', 'Bench'], 'Bench', ['Squat', 'Bench'])).toEqual(['Squat']);
    expect(buildNextLifts(['Squat'], 'Deadlift', ['Squat', 'Bench'])).toEqual(['Squat']);
  });

  it('names a competitor from the draft or falls back to the placeholder', () => {
    const named = draft({ firstName: 'Jan', lastName: 'Kowalski' });
    expect(competitorDisplayName(named, 0, () => 'unnamed')).toBe('Kowalski Jan');
    const empty = draft({ firstName: '', lastName: '   ' });
    expect(competitorDisplayName(empty, 2, (index) => 'unnamed ' + String(index + 1))).toBe(
      'unnamed 3',
    );
  });

  it('follows the lift selection for the discipline', () => {
    expect(disciplineForEvents(['Squat', 'Bench'])).toBe('Powerlifting');
    expect(disciplineForEvents(['Deadlift'])).toBe('Deadlift');
    expect(disciplineForEvents([])).toBe('Powerlifting');
  });
});
