import { normalizeAttemptWeight } from '$lib/plate-plan';

/**
 * Pure draft state for the contest wizard: tag selection, opening-attempt plans
 * and the competitor drafts the operator builds before anything is submitted.
 * Nothing here touches Svelte state or the API, so the wizard page and its
 * tests share exactly one implementation of these rules.
 */

export const AVAILABLE_EVENTS = ['Squat', 'Bench', 'Deadlift'] as const;
export type ContestEvent = (typeof AVAILABLE_EVENTS)[number];

export const GENDERS = ['Male', 'Female'] as const;
export type Gender = (typeof GENDERS)[number];

export const EVENT_LABEL_KEYS: Record<ContestEvent, string> = {
  Squat: 'contest.wizard.events.squat',
  Bench: 'contest.wizard.events.bench',
  Deadlift: 'contest.wizard.events.deadlift',
};

export const GENDER_LABEL_KEYS: Record<Gender, string> = {
  Male: 'contest.wizard.genders.male',
  Female: 'contest.wizard.genders.female',
};

export const MANDATORY_TAG_LABEL = 'Open';
export const MANDATORY_TAG_KEY = MANDATORY_TAG_LABEL.toLowerCase();

export const MIN_STEP = 1;
export const MAX_STEP = 4;
export const TOTAL_STEPS = MAX_STEP;

export const ATTEMPT_INCREMENT = 2.5;
export const BODYWEIGHT_STEP = 0.5;
export const DEFAULT_RACK_SQUAT = 10;
export const DEFAULT_RACK_BENCH = 5;
export const DEFAULT_BODYWEIGHT = 70;

export interface ContestForm {
  name: string;
  date: string;
  location: string;
  discipline: 'Powerlifting' | 'Bench' | 'Squat' | 'Deadlift';
  events: ContestEvent[];
  federationRules: string;
  organizer: string;
  notes: string;
}

export type AttemptPlan = Partial<Record<ContestEvent, number | null>>;

export interface CompetitorDraft {
  id: string;
  firstName: string;
  lastName: string;
  birthDate: string;
  gender: Gender;
  club: string;
  city: string;
  bodyweight: number;
  rackHeightSquat: number | null;
  rackHeightBench: number | null;
  lifts: ContestEvent[];
  attempts: AttemptPlan;
  tags: string[];
}

export interface TagDraft {
  id: string;
  label: string;
  isMandatory: boolean;
  error: string | null;
}

export type AttemptIssueType = 'missing' | 'unloadable' | 'below_bar';

export interface AttemptIssue {
  competitorIndex: number;
  name: string;
  event: ContestEvent;
  type: AttemptIssueType;
  suggestedWeight?: number;
}

export function arraysEqual(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

/** Monotonic id source; the wizard keeps one per entity kind. */
export function createIdFactory(prefix: string): () => string {
  let sequence = 0;
  return () => {
    sequence += 1;
    return prefix + '-' + sequence;
  };
}

export function createTagDraftFactory(
  prefix = 'tag',
): (label: string, options?: { mandatory?: boolean }) => TagDraft {
  const nextId = createIdFactory(prefix);
  return (label, options = {}) => ({
    id: nextId(),
    label,
    isMandatory: Boolean(options.mandatory),
    error: null,
  });
}

export function computeAvailableTagOptions(drafts: readonly TagDraft[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const draft of drafts) {
    const label = draft.label.trim();
    if (!label) continue;
    const key = label.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(label);
  }
  if (!seen.has(MANDATORY_TAG_KEY)) {
    result.unshift(MANDATORY_TAG_LABEL);
  }
  return result;
}

export function canonicaliseTagLabel(label: string, options: readonly string[]): string | null {
  const key = label.trim().toLowerCase();
  if (!key) return null;
  for (const option of options) {
    if (option.toLowerCase() === key) {
      return option;
    }
  }
  return null;
}

export function normaliseTagSelection(
  source: readonly string[] | undefined,
  options: readonly string[],
  { enforceMandatory = true }: { enforceMandatory?: boolean } = {},
): string[] {
  if (options.length === 0) {
    return enforceMandatory ? [MANDATORY_TAG_LABEL] : [];
  }
  const optionMap = new Map(options.map((label) => [label.toLowerCase(), label]));
  const unique: string[] = [];
  for (const raw of source ?? []) {
    const key = raw.trim().toLowerCase();
    if (!key) continue;
    const canonical = optionMap.get(key);
    if (!canonical) continue;
    if (!unique.includes(canonical)) {
      unique.push(canonical);
    }
  }
  if (enforceMandatory) {
    const mandatory = optionMap.get(MANDATORY_TAG_KEY);
    if (mandatory && !unique.includes(mandatory)) {
      unique.unshift(mandatory);
    }
  }
  return unique;
}

/** Labels to create on the server: tag drafts minus the seeded mandatory tag. */
export function collectExtraTagLabels(drafts: readonly TagDraft[]): string[] {
  const seen = new Set<string>();
  const labels: string[] = [];
  for (const draft of drafts) {
    const trimmed = draft.label.trim();
    if (!trimmed) continue;
    const key = trimmed.toLowerCase();
    if (key === MANDATORY_TAG_KEY || seen.has(key)) continue;
    seen.add(key);
    labels.push(trimmed);
  }
  return labels;
}

export function replaceTagLabelInTags(
  tags: readonly string[],
  previousLabel: string,
  nextLabel: string,
): { tags: string[]; changed: boolean } {
  const previousKey = previousLabel.trim().toLowerCase();
  const trimmedNext = nextLabel.trim();
  let changed = false;
  const next = tags.map((tag) => {
    if (tag.toLowerCase() === previousKey) {
      changed = true;
      return trimmedNext || tag;
    }
    return tag;
  });
  return { tags: next, changed };
}

export function roundToIncrement(value: number, increment = ATTEMPT_INCREMENT): number {
  const rounded = Math.round(value / increment) * increment;
  return Number(rounded.toFixed(2));
}

export function suggestOpener(event: ContestEvent, bodyweight: number): number {
  const base = Math.max(bodyweight || 0, 20);
  const multiplier = {
    Squat: 1.2,
    Bench: 0.8,
    Deadlift: 1.4,
  }[event];

  const suggested = roundToIncrement(base * multiplier);
  return Math.max(20, suggested);
}

export function createAttemptPlan(
  events: readonly ContestEvent[],
  bodyweight: number,
  fill = false,
): AttemptPlan {
  const plan: AttemptPlan = {};
  for (const event of events) {
    plan[event] = fill ? suggestOpener(event, bodyweight) : null;
  }
  return plan;
}

export function syncAttemptPlan(
  plan: AttemptPlan | undefined,
  events: readonly ContestEvent[],
): AttemptPlan {
  const source = plan ?? {};
  const next: AttemptPlan = {};
  for (const event of events) {
    next[event] = source[event] ?? null;
  }
  return next;
}

export function planEvents(plan: AttemptPlan): ContestEvent[] {
  return AVAILABLE_EVENTS.filter((event) => event in plan);
}

export function normalizeAttemptValue(value: number | null, gender: Gender): number | null {
  if (!value || value <= 0) {
    return null;
  }
  return normalizeAttemptWeight(value, gender);
}

export function normalizeAttemptPlanForGender(plan: AttemptPlan, gender: Gender): AttemptPlan {
  const normalized: AttemptPlan = {};
  for (const event of planEvents(plan)) {
    normalized[event] = normalizeAttemptValue(plan[event] ?? null, gender);
  }
  return normalized;
}

export function fillAttemptPlan(
  plan: AttemptPlan,
  events: readonly ContestEvent[],
  bodyweight: number,
  onlyMissing = false,
): AttemptPlan {
  const next: AttemptPlan = { ...plan };
  for (const event of events) {
    const current = next[event] ?? null;
    if (!onlyMissing || !current || current <= 0) {
      next[event] = suggestOpener(event, bodyweight);
    }
  }
  return next;
}

/** A contest can run one, two or three lifts; the discipline follows the selection. */
export function disciplineForEvents(events: readonly ContestEvent[]): ContestForm['discipline'] {
  if (events.length >= 2) {
    return 'Powerlifting';
  }
  return events[0] ?? 'Powerlifting';
}

export function normaliseDraftEvents(
  source: readonly ContestEvent[],
  allowed: readonly ContestEvent[],
): ContestEvent[] {
  if (allowed.length === 0) {
    return [...AVAILABLE_EVENTS];
  }
  const uniqueAllowed = Array.from(new Set(allowed));
  const filtered = Array.from(new Set(source.filter((event) => uniqueAllowed.includes(event))));
  return filtered.length > 0
    ? uniqueAllowed.filter((event) => filtered.includes(event))
    : [...uniqueAllowed];
}

export function buildNextLifts(
  current: readonly ContestEvent[],
  target: ContestEvent,
  allowed: readonly ContestEvent[],
): ContestEvent[] {
  const uniqueAllowed = Array.from(new Set(allowed));
  if (!uniqueAllowed.includes(target)) {
    return normaliseDraftEvents(current, allowed);
  }
  const normalisedCurrent = normaliseDraftEvents(current, allowed);
  let next: ContestEvent[];
  if (normalisedCurrent.includes(target)) {
    next = normalisedCurrent.filter((event) => event !== target);
    if (next.length === 0) {
      next = [target];
    }
  } else {
    next = [...normalisedCurrent, target];
  }
  return normaliseDraftEvents(next, allowed);
}

export function createEmptyCompetitorDraft(init: {
  id: string;
  events: readonly ContestEvent[];
  tagOptions: readonly string[];
}): CompetitorDraft {
  return {
    id: init.id,
    firstName: '',
    lastName: '',
    birthDate: '',
    gender: 'Male',
    club: '',
    city: '',
    bodyweight: DEFAULT_BODYWEIGHT,
    rackHeightSquat: DEFAULT_RACK_SQUAT,
    rackHeightBench: DEFAULT_RACK_BENCH,
    lifts: [...init.events],
    attempts: createAttemptPlan(init.events, DEFAULT_BODYWEIGHT, false),
    tags: normaliseTagSelection([MANDATORY_TAG_LABEL], init.tagOptions),
  };
}

export function competitorDisplayName(
  draft: CompetitorDraft,
  index: number,
  unnamedLabel: (index: number) => string,
): string {
  const name = [draft.lastName, draft.firstName].filter(Boolean).join(' ').trim();
  return name || unnamedLabel(index);
}
