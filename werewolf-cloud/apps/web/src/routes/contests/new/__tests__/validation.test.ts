import { describe, expect, it } from 'vitest';
import {
  createEmptyCompetitorDraft,
  createTagDraftFactory,
  type CompetitorDraft,
  type ContestForm,
} from '../draft';
import {
  collectAttemptIssues,
  collectCompetitorDraftErrors,
  collectStepErrors,
  collectTagDraftErrors,
  type Translate,
} from '../validation';

const t: Translate = (key, values) => (values ? key + ':' + JSON.stringify(values) : key);

function form(overrides: Partial<ContestForm> = {}): ContestForm {
  return {
    name: 'Werewolf Classic',
    date: '2026-01-01',
    location: 'Warsaw',
    discipline: 'Powerlifting',
    events: ['Squat', 'Bench'],
    federationRules: '',
    organizer: 'Werewolf PL',
    notes: '',
    ...overrides,
  };
}

function draft(overrides: Partial<CompetitorDraft> = {}): CompetitorDraft {
  const base = createEmptyCompetitorDraft({
    id: 'draft-1',
    events: ['Squat', 'Bench'],
    tagOptions: ['Open'],
  });
  return {
    ...base,
    firstName: 'Jan',
    lastName: 'Kowalski',
    birthDate: '1990-01-01',
    ...overrides,
  };
}

describe('contest form validation', () => {
  it('reports the missing basic fields of step 1', () => {
    expect(collectStepErrors(1, form(), t)).toEqual({});
    expect(collectStepErrors(1, form({ name: '  ', location: '', date: '' }), t)).toEqual({
      name: 'contest.wizard.validation.name_required',
      location: 'contest.wizard.validation.location_required',
      date: 'contest.wizard.validation.date_required',
    });
  });

  it('reports the missing organizer of step 2', () => {
    expect(collectStepErrors(2, form(), t)).toEqual({});
    expect(collectStepErrors(2, form({ organizer: ' ' }), t)).toEqual({
      organizer: 'contest.wizard.validation.organizer_required',
    });
  });

  it('reports the missing competitor fields', () => {
    expect(collectCompetitorDraftErrors(draft(), t)).toEqual({});
    expect(
      collectCompetitorDraftErrors(
        draft({ firstName: '', lastName: ' ', birthDate: '', bodyweight: 0 }),
        t,
      ),
    ).toEqual({
      firstName: 'contest.wizard.validation.first_name_required',
      lastName: 'contest.wizard.validation.last_name_required',
      birthDate: 'contest.wizard.validation.birth_date_required',
      bodyweight: 'contest.wizard.validation.bodyweight_positive',
    });
  });
});

describe('tag draft validation', () => {
  const createTagDraft = createTagDraftFactory('tag');

  it('accepts unique labels and trims them', () => {
    const result = collectTagDraftErrors(
      [createTagDraft(' Open ', { mandatory: true }), createTagDraft('Juvenile')],
      t,
    );
    expect(result.hasError).toBe(false);
    expect(result.drafts.map((draft) => draft.label)).toEqual(['Open', 'Juvenile']);
    expect(result.drafts.every((draft) => draft.error === null)).toBe(true);
  });

  it('marks empty and duplicate labels', () => {
    const result = collectTagDraftErrors(
      [createTagDraft(''), createTagDraft('Juvenile'), createTagDraft('juvenile')],
      t,
    );
    expect(result.hasError).toBe(true);
    expect(result.drafts.map((draft) => draft.error)).toEqual([
      'contest_edit.tags.validation.label_required',
      'contest_edit.tags.validation.duplicate',
      'contest_edit.tags.validation.duplicate',
    ]);
  });
});

describe('attempt issue collection', () => {
  it('reports missing, below-bar and unloadable attempts with names', () => {
    const issues = collectAttemptIssues(
      [
        draft({ id: 'draft-1', attempts: { Squat: null, Bench: 80 } }),
        draft({
          id: 'draft-2',
          firstName: '',
          lastName: '',
          attempts: { Squat: 10, Bench: 20.1 },
        }),
      ],
      ['Squat', 'Bench'],
      t,
    );

    expect(issues).toHaveLength(3);
    expect(issues[0]).toEqual({
      competitorIndex: 0,
      name: 'Kowalski Jan',
      event: 'Squat',
      type: 'missing',
    });
    expect(issues[1]).toMatchObject({
      competitorIndex: 1,
      event: 'Squat',
      type: 'below_bar',
      suggestedWeight: 20,
    });
    expect(issues[2]).toMatchObject({
      competitorIndex: 1,
      event: 'Bench',
      type: 'unloadable',
      suggestedWeight: 20,
    });
    expect(issues[1]?.name).toContain('contest.wizard.attempts.unnamed');
  });

  it('reports nothing when every selected lift has a loadable opener', () => {
    expect(
      collectAttemptIssues([draft({ attempts: { Squat: 100, Bench: 80 } })], ['Squat', 'Bench'], t),
    ).toEqual([]);
  });
});
