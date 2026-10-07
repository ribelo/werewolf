import { evaluateAttemptWeight } from '$lib/plate-plan';
import {
  competitorDisplayName,
  normaliseDraftEvents,
  syncAttemptPlan,
  type AttemptIssue,
  type CompetitorDraft,
  type ContestEvent,
  type ContestForm,
  type TagDraft,
} from './draft';

/**
 * Pure validation for the contest wizard: which required fields are missing,
 * which tag drafts are malformed and which opener attempts cannot be loaded.
 * Callers own the state and the toasts; every function here only reports.
 */

export type Translate = (key: string, values?: Record<string, unknown>) => string;

export function collectStepErrors(
  step: number,
  form: ContestForm,
  t: Translate,
): Record<string, string> {
  const errors: Record<string, string> = {};

  if (step === 1) {
    if (!form.name.trim()) {
      errors['name'] = t('contest.wizard.validation.name_required');
    }
    if (!form.location.trim()) {
      errors['location'] = t('contest.wizard.validation.location_required');
    }
    if (!form.date) {
      errors['date'] = t('contest.wizard.validation.date_required');
    }
  }

  if (step === 2 && !form.organizer.trim()) {
    errors['organizer'] = t('contest.wizard.validation.organizer_required');
  }

  return errors;
}

export function collectCompetitorDraftErrors(
  draft: CompetitorDraft,
  t: Translate,
): Record<string, string> {
  const errors: Record<string, string> = {};

  if (!draft.firstName.trim()) {
    errors['firstName'] = t('contest.wizard.validation.first_name_required');
  }
  if (!draft.lastName.trim()) {
    errors['lastName'] = t('contest.wizard.validation.last_name_required');
  }
  if (!draft.birthDate) {
    errors['birthDate'] = t('contest.wizard.validation.birth_date_required');
  }
  if (draft.bodyweight <= 0) {
    errors['bodyweight'] = t('contest.wizard.validation.bodyweight_positive');
  }

  return errors;
}

export function collectTagDraftErrors(
  drafts: readonly TagDraft[],
  t: Translate,
): { drafts: TagDraft[]; hasError: boolean } {
  let hasError = false;
  const counts: Record<string, number> = {};

  for (const draft of drafts) {
    const key = draft.label.trim().toLowerCase();
    if (!key) continue;
    counts[key] = (counts[key] ?? 0) + 1;
  }

  const checked = drafts.map((draft) => {
    const label = draft.label.trim();
    let error: string | null = null;
    if (!label) {
      error = t('contest_edit.tags.validation.label_required');
      hasError = true;
    } else if ((counts[label.toLowerCase()] ?? 0) > 1) {
      error = t('contest_edit.tags.validation.duplicate');
      hasError = true;
    }
    return { ...draft, label, error };
  });

  return { drafts: checked, hasError };
}

export function collectAttemptIssues(
  drafts: readonly CompetitorDraft[],
  allowedEvents: readonly ContestEvent[],
  t: Translate,
): AttemptIssue[] {
  const issues: AttemptIssue[] = [];
  drafts.forEach((competitor, index) => {
    const lifts = normaliseDraftEvents(competitor.lifts, allowedEvents);
    const attempts = syncAttemptPlan(competitor.attempts, lifts);
    const displayName = competitorDisplayName(competitor, index, (position) =>
      t('contest.wizard.attempts.unnamed', { values: { index: position + 1 } }),
    );
    for (const event of lifts) {
      const weight = attempts[event];
      if (!weight || weight <= 0) {
        issues.push({
          competitorIndex: index,
          name: displayName,
          event,
          type: 'missing',
        });
        continue;
      }

      const check = evaluateAttemptWeight(weight, competitor.gender);
      if (!check.loadable) {
        issues.push({
          competitorIndex: index,
          name: displayName,
          event,
          type: check.reason === 'below_bar' ? 'below_bar' : 'unloadable',
          suggestedWeight: check.normalized,
        });
      }
    }
  });
  return issues;
}
