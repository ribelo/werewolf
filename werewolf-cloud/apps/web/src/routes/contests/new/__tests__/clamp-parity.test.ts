import { describe, expect, it } from 'vitest';
import {
  createEmptyCompetitorDraft,
  normalizeAttemptPlanForGender,
  type AttemptIssue,
  type CompetitorDraft,
} from '../draft';
import { collectAttemptIssues, type Translate } from '../validation';

/**
 * The API opens every contest the wizard creates with a 20 kg bar (15 kg for
 * women) and 2.5 kg per clamp, and it rejects an attempt below the bar plus
 * both clamps or below a weight its plate plan cannot load. The wizard must
 * predict that, or the review step lets the operator through with an opener the
 * API refuses.
 */

const t: Translate = (key) => key;

function draft(overrides: Partial<CompetitorDraft> = {}): CompetitorDraft {
  const base = createEmptyCompetitorDraft({
    id: 'draft-1',
    events: ['Squat'],
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

function issueFor(
  weight: number,
  gender: CompetitorDraft['gender'] = 'Male',
): AttemptIssue | undefined {
  return collectAttemptIssues([draft({ gender, attempts: { Squat: weight } })], ['Squat'], t)[0];
}

describe('contest wizard attempt validation matches the API', () => {
  it('rejects an opener below the bar plus both clamps', () => {
    // 22.5 kg clears the 20 kg bar but not the 25 kg minimum: 20 kg bar + 2 x 2.5 kg clamps.
    expect(issueFor(22.5)).toMatchObject({ type: 'unloadable', suggestedWeight: 25 });
    expect(issueFor(25)).toBeUndefined();
  });

  it('only suggests a weight the API accepts', () => {
    const issue = issueFor(15);
    expect(issue).toMatchObject({ type: 'below_bar', suggestedWeight: 25 });
    expect(issueFor(issue?.suggestedWeight ?? 0)).toBeUndefined();
  });

  it('normalises a submitted opener to a weight the API accepts', () => {
    // Without the clamp the wizard used to send 22.5 kg, which the API rejects.
    expect(normalizeAttemptPlanForGender({ Squat: 22.5 }, 'Male')).toEqual({ Squat: 25 });
    expect(normalizeAttemptPlanForGender({ Squat: 30 }, 'Male')).toEqual({ Squat: 30 });
  });
});
