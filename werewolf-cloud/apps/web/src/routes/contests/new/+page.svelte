<script lang="ts">
import { goto } from '$app/navigation';
import Layout from '$lib/components/Layout.svelte';
import { apiClient } from '$lib/api';
import type { PageData } from './$types';
import type { ContestSummary, AgeCategory, WeightClass, ContestCategories, RegistrationSummary } from '$lib/types';
import { toast } from '$lib/ui/toast';
import { _ } from 'svelte-i18n';
import { get } from 'svelte/store';
import { tick } from 'svelte';
import {
  createDefaultAgeCategories,
  createDefaultWeightClasses,
  validateCategories,
  formatCategoryIssues,
  buildCategoryPayload,
  categoriesEqual,
} from '$lib/categories';
import { evaluateAttemptWeight, normalizeAttemptWeight } from '$lib/plate-plan';
import { formatWeight } from '$lib/utils';

  const AVAILABLE_EVENTS = ['Squat', 'Bench', 'Deadlift'] as const;
  const EVENT_LABEL_KEYS: Record<typeof AVAILABLE_EVENTS[number], string> = {
    Squat: 'contest.wizard.events.squat',
    Bench: 'contest.wizard.events.bench',
    Deadlift: 'contest.wizard.events.deadlift',
  };

  const GENDERS = ['Male', 'Female'] as const;
  const GENDER_LABEL_KEYS: Record<typeof GENDERS[number], string> = {
    Male: 'contest.wizard.genders.male',
    Female: 'contest.wizard.genders.female',
  };

  export let data: PageData;
  export let params: Record<string, string> = {};

  $: void params;
  const { apiBase } = data;

  type ContestEvent = typeof AVAILABLE_EVENTS[number];
  type Gender = typeof GENDERS[number];

  type AttemptPlan = Record<ContestEvent, number | null>;

  type AttemptIssueType = 'missing' | 'unloadable' | 'below_bar';

  interface AttemptIssue {
    competitorIndex: number;
    name: string;
    event: ContestEvent;
    type: AttemptIssueType;
    suggestedWeight?: number;
  }

  const ATTEMPT_INCREMENT = 2.5;

  function roundToIncrement(value: number, increment = ATTEMPT_INCREMENT): number {
    const rounded = Math.round(value / increment) * increment;
    return Number(rounded.toFixed(2));
  }

  function suggestOpener(event: ContestEvent, bodyweight: number): number {
    const base = Math.max(bodyweight || 0, 20);
    const multiplier = {
      Squat: 1.2,
      Bench: 0.8,
      Deadlift: 1.4,
    }[event];

    const suggested = roundToIncrement(base * multiplier);
    return Math.max(20, suggested);
  }

  function createAttemptPlan(events: ContestEvent[], bodyweight: number, fill = false): AttemptPlan {
    const plan = {} as AttemptPlan;
    for (const event of events) {
      plan[event] = fill ? suggestOpener(event, bodyweight) : null;
    }
    return plan;
  }

  function syncAttemptPlan(plan: AttemptPlan | undefined, events: ContestEvent[]): AttemptPlan {
    const source = plan ?? ({} as AttemptPlan);
    const next = {} as AttemptPlan;
    for (const event of events) {
      next[event] = source[event] ?? null;
    }
    return next;
  }

  function normalizeAttemptValue(value: number | null, gender: Gender): number | null {
    if (!value || value <= 0) {
      return null;
    }
    return normalizeAttemptWeight(value, gender);
  }

  function normalizeAttemptPlanForGender(plan: AttemptPlan, gender: Gender): AttemptPlan {
    const events = Object.keys(plan) as ContestEvent[];
    const normalized = {} as AttemptPlan;
    for (const event of events) {
      normalized[event] = normalizeAttemptValue(plan[event] ?? null, gender);
    }
    return normalized;
  }

  function cloneAttemptPlan(plan: AttemptPlan): AttemptPlan {
    const events = Object.keys(plan) as ContestEvent[];
    return syncAttemptPlan(plan, events);
  }

  function fillAttemptPlan(plan: AttemptPlan, events: ContestEvent[], bodyweight: number, onlyMissing = false): AttemptPlan {
    const next = { ...plan } as AttemptPlan;
    for (const event of events) {
      const current = next[event] ?? null;
      if (!onlyMissing || !current || current <= 0) {
        next[event] = suggestOpener(event, bodyweight);
      }
    }
    return next;
  }

  const translate = (key: string, values?: Record<string, unknown>) => get(_)(key, values) as string;

  let ageCategoriesDraft: AgeCategory[] = createDefaultAgeCategories();
  let weightClassesDraft: WeightClass[] = createDefaultWeightClasses();
  let categoryIssues: string[] = [];

  const CONTEST_NAMES = [
    'Werewolf Classic',
    'Northern Lights Open',
    'Iron Den Invitational',
    'Capital City Throwdown',
    'Vistula Strength Meet',
    'Silver Moon Showdown'
  ] as const;

  const VENUES = [
    'Warsaw',
    'Kraków',
    'Gdańsk',
    'Wrocław',
    'Poznań',
    'Łódź',
    'Katowice'
  ] as const;

  const ORGANIZERS = [
    'Werewolf Powerlifting Club',
    'Northern Strength Association',
    'Iron Den Athletics',
    'Polska Liga Siły',
    'Vistula Barbell'
  ] as const;

  const RULESETS = ['IPF', 'WRPF', 'USAPL', 'URP'] as const;

  const CLUBS = [
    'Werewolf PL',
    'Barbell Syndicate',
    'Northern Strength',
    'Vistula Barbell',
    'Katowice Ironworks',
    'Łódź Power Crew'
  ] as const;

  const CITIES = [
    'Warszawa',
    'Kraków',
    'Łódź',
    'Gdynia',
    'Szczecin',
    'Białystok',
    'Lublin',
    'Rzeszów'
  ] as const;

  type NameTuple = readonly [string, string];

  const FEMALE_NAMES: readonly NameTuple[] = [
    ['Anna', 'Nowak'],
    ['Magda', 'Kowalska'],
    ['Kinga', 'Wiśniewska'],
    ['Natalia', 'Mazur'],
    ['Julia', 'Baran'],
    ['Marta', 'Lis'],
    ['Karolina', 'Jasińska'],
    ['Ewelina', 'Sobczak'],
    ['Zuzanna', 'Kaczmarek']
  ] as const;

  const MALE_NAMES: readonly NameTuple[] = [
    ['Paweł', 'Zieliński'],
    ['Tomasz', 'Lewandowski'],
    ['Michał', 'Piotrowski'],
    ['Krzysztof', 'Sikora'],
    ['Piotr', 'Bryk'],
    ['Damian', 'Olszewski'],
    ['Łukasz', 'Kubiak'],
    ['Jakub', 'Konarski']
  ] as const;

  const NAME_SETS: Record<Gender, readonly NameTuple[]> = {
    Male: MALE_NAMES,
    Female: FEMALE_NAMES,
  } as const;

  function randomItem<T>(items: readonly T[]): T {
    if (items.length === 0) {
      throw new Error('Cannot select a random item from an empty array');
    }
    const index = Math.floor(Math.random() * items.length);
    return items[index] as T;
  }

  function randomDateWithin(days: number): string {
    const base = new Date();
    const offset = Math.floor(Math.random() * days);
    base.setDate(base.getDate() + offset);
    return base.toISOString().slice(0, 10);
  }

  function randomBodyweight(gender: Gender): number {
    const min = gender === 'Male' ? 70 : 55;
    const max = gender === 'Male' ? 125 : 85;
    const value = min + Math.random() * (max - min);
    return Number(value.toFixed(1));
  }

  function randomBirthDate(): string {
    const today = new Date();
    const minAge = 18;
    const maxAge = 40;
    const age = minAge + Math.floor(Math.random() * (maxAge - minAge + 1));
    const birth = new Date(today.getFullYear() - age, Math.floor(Math.random() * 12), Math.floor(Math.random() * 28) + 1);
    return birth.toISOString().slice(0, 10);
  }

  function randomEvents(): ContestEvent[] {
    const shuffled = [...AVAILABLE_EVENTS].sort(() => Math.random() - 0.5);
    const count = Math.random() < 0.4 ? 3 : Math.random() < 0.7 ? 2 : 1;
    return shuffled.slice(0, count);
  }

  function buildRandomCompetitor(gender: Gender, usedNames: Set<string>, events: ContestEvent[]): CompetitorDraft {
    const baseNames = NAME_SETS[gender];
    const available = baseNames.filter(([firstName, lastName]) => !usedNames.has(`${firstName}|${lastName}`));
    const [firstName, lastName] = available.length > 0
      ? randomItem(available)
      : randomItem(baseNames);
    usedNames.add(`${firstName}|${lastName}`);
    const rackHeightSquat = DEFAULT_RACK_SQUAT + Math.floor(Math.random() * 5) - 2;
    const rackHeightBench = DEFAULT_RACK_BENCH + Math.floor(Math.random() * 3) - 1;
    const bodyweight = randomBodyweight(gender);

    return {
      firstName,
      lastName,
      birthDate: randomBirthDate(),
      gender,
      club: randomItem(CLUBS),
      city: randomItem(CITIES),
      bodyweight,
      rackHeightSquat,
      rackHeightBench,
      lifts: [...events],
      attempts: normalizeAttemptPlanForGender(createAttemptPlan(events, bodyweight, true), gender),
    };
  }

  function resetCategoryDraftsToDefault() {
    ageCategoriesDraft = createDefaultAgeCategories();
    weightClassesDraft = createDefaultWeightClasses();
    categoryIssues = [];
  }

  function addAgeCategoryDraft() {
    ageCategoriesDraft = [
      ...ageCategoriesDraft,
      {
        id: undefined,
        code: '',
        name: '',
        minAge: null,
        maxAge: null,
        sortOrder: (ageCategoriesDraft.length + 1) * 10,
        metadata: null,
      },
    ];
  }

  function removeAgeCategoryDraft(index: number) {
    ageCategoriesDraft = ageCategoriesDraft.filter((_, idx) => idx !== index);
  }

  function updateAgeCategoryDraft(index: number, field: keyof AgeCategory, value: string) {
    const updated = [...ageCategoriesDraft];
    const target = { ...updated[index] };
    if (field === 'code') {
      target.code = value.trim().toUpperCase();
    } else if (field === 'name') {
      target.name = value;
    } else if (field === 'minAge' || field === 'maxAge' || field === 'sortOrder') {
      const parsed = value.trim() === '' ? null : Number(value);
      target[field] = Number.isFinite(parsed) ? (parsed as number) : null;
    }
    updated[index] = target;
    ageCategoriesDraft = updated;
    categoryIssues = [];
  }

  function handleAgeCategoryInput(index: number, field: keyof AgeCategory) {
    return (event: Event) => {
      const input = event.currentTarget as HTMLInputElement | null;
      updateAgeCategoryDraft(index, field, input?.value ?? '');
    };
  }

  function addWeightClassDraft() {
    weightClassesDraft = [
      ...weightClassesDraft,
      {
        id: undefined,
        code: '',
        name: '',
        gender: weightClassesDraft.length % 2 === 0 ? 'Female' : 'Male',
        minWeight: null,
        maxWeight: null,
        sortOrder: (weightClassesDraft.length + 1) * 10,
        metadata: null,
      },
    ];
  }

  function removeWeightClassDraft(index: number) {
    weightClassesDraft = weightClassesDraft.filter((_, idx) => idx !== index);
  }

  function updateWeightClassDraft(index: number, field: keyof WeightClass, value: string) {
    const updated = [...weightClassesDraft];
    const target = { ...updated[index] };
    if (field === 'code') {
      target.code = value.trim().toUpperCase();
    } else if (field === 'name') {
      target.name = value;
    } else if (field === 'gender') {
      const upper = value.trim().toUpperCase();
      target.gender = upper.startsWith('F') ? 'Female' : 'Male';
    } else if (field === 'minWeight' || field === 'maxWeight' || field === 'sortOrder') {
      const parsed = value.trim() === '' ? null : Number(value);
      target[field] = Number.isFinite(parsed) ? (parsed as number) : null;
    }
    updated[index] = target;
    weightClassesDraft = updated;
    categoryIssues = [];
  }

  function handleWeightClassInput(index: number, field: keyof WeightClass) {
    return (event: Event) => {
      const input = event.currentTarget as HTMLInputElement | null;
      updateWeightClassDraft(index, field, input?.value ?? '');
    };
  }

  function handleWeightClassSelect(index: number) {
    return (event: Event) => {
      const select = event.currentTarget as HTMLSelectElement | null;
      updateWeightClassDraft(index, 'gender', select?.value ?? '');
    };
  }

  interface ContestForm {
    name: string;
    date: string;
    location: string;
    discipline: 'Powerlifting' | 'Bench' | 'Squat' | 'Deadlift';
    events: ContestEvent[];
    federationRules: string;
    organizer: string;
    notes: string;
  }

  interface CompetitorDraft {
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
  }

  const MIN_STEP = 1;
  const MAX_STEP = 4;
  const TOTAL_STEPS = MAX_STEP;
  const BODYWEIGHT_STEP = 0.5;
  const DEFAULT_RACK_SQUAT = 10;
  const DEFAULT_RACK_BENCH = 5;

  let step = MIN_STEP;
  let isSubmitting = false;
  let isGeneratingSample = false;
  let error: string | null = null;
  let success: string | null = null;

  const today = new Date();
  const isoToday = today.toISOString().slice(0, 10);

  let form: ContestForm = {
    name: '',
    date: isoToday,
    location: '',
    discipline: 'Powerlifting',
    events: ['Squat', 'Bench', 'Deadlift'],
    federationRules: '',
    organizer: '',
    notes: '',
  };

  let competitorDraft: CompetitorDraft = {
    firstName: '',
    lastName: '',
    birthDate: '',
    gender: 'Male',
    club: '',
    city: '',
    bodyweight: 70,
    rackHeightSquat: DEFAULT_RACK_SQUAT,
    rackHeightBench: DEFAULT_RACK_BENCH,
    lifts: [...form.events],
    attempts: createAttemptPlan(form.events, 70, false),
  };

  let competitorDrafts: CompetitorDraft[] = [];
  let validationErrors: Record<string, string> = {};
  let attemptIssues: AttemptIssue[] = [];

  function generateSampleContestData() {
    if (isGeneratingSample) return;
    isGeneratingSample = true;

    try {
      const DEFAULT_EVENTS = ['Squat', 'Bench', 'Deadlift'] as const;
      const hasCustomEventSelection =
        form.events.length !== DEFAULT_EVENTS.length ||
        form.events.some((event, index) => event !== DEFAULT_EVENTS[index]);

      const events = hasCustomEventSelection ? [...form.events] : randomEvents();
      const discipline = events.length >= 2 ? 'Powerlifting' : events[0] ?? 'Powerlifting';

      form = {
        name: randomItem(CONTEST_NAMES),
        date: randomDateWithin(21),
        location: randomItem(VENUES),
        discipline: discipline as ContestForm['discipline'],
        events,
        federationRules: Math.random() < 0.7 ? randomItem(RULESETS) : '',
        organizer: randomItem(ORGANIZERS),
        notes: translate('contest.wizard.sample.notes'),
      };

      const competitorCount = 6 + Math.floor(Math.random() * 4);
      const usedNames = new Set<string>();
      competitorDrafts = Array.from({ length: competitorCount }, (_, index) => {
        const gender: Gender = index % 2 === 0 ? 'Male' : 'Female';
        return buildRandomCompetitor(gender, usedNames, events);
      });

      validationErrors = {};
      step = 4;
      syncAttemptPlansWithEvents();
      toast.info(translate('contest.wizard.toast.sample_generated'));
    } finally {
      isGeneratingSample = false;
    }
  }

  function toggleEvent(event: ContestEvent) {
    if (form.events.includes(event)) {
      form.events = form.events.filter((e) => e !== event);
    } else {
      form.events = [...form.events, event];
    }
    if (form.events.length === 0) {
      form.events = [event];
    }
    updateDiscipline();
    syncAttemptPlansWithEvents();
  }

  function updateDiscipline() {
    if (form.events.length >= 2) {
      form.discipline = 'Powerlifting';
      return;
    }

    const [singleEvent] = form.events;
    if (singleEvent) {
      form.discipline = singleEvent;
    }
  }

  function resetCompetitorDraft() {
    competitorDraft = {
      firstName: '',
      lastName: '',
      birthDate: '',
      gender: 'Male',
      club: '',
    city: '',
    bodyweight: 70,
    rackHeightSquat: DEFAULT_RACK_SQUAT,
    rackHeightBench: DEFAULT_RACK_BENCH,
    lifts: [...form.events],
    attempts: createAttemptPlan(form.events, 70, false),
  };
}

  function normaliseDraftEvents(source: ContestEvent[]): ContestEvent[] {
    const allowed = form.events;
    if (allowed.length === 0) {
      return [...AVAILABLE_EVENTS];
    }
    const uniqueAllowed = Array.from(new Set(allowed));
    const filtered = Array.from(new Set(source.filter((event) => uniqueAllowed.includes(event))));
    return filtered.length > 0 ? uniqueAllowed.filter((event) => filtered.includes(event)) : [...uniqueAllowed];
  }

  function syncAttemptPlansWithEvents() {
    const updatedDraftEvents = normaliseDraftEvents(competitorDraft.lifts);
    competitorDraft = {
      ...competitorDraft,
      lifts: updatedDraftEvents,
      attempts: normalizeAttemptPlanForGender(
        syncAttemptPlan(competitorDraft.attempts, updatedDraftEvents),
        competitorDraft.gender,
      ),
    };
    competitorDrafts = competitorDrafts.map((draft) => {
      const lifts = normaliseDraftEvents(draft.lifts);
      return {
        ...draft,
        lifts,
        attempts: normalizeAttemptPlanForGender(syncAttemptPlan(draft.attempts, lifts), draft.gender),
      };
    });
  }

  function addCompetitorDraft() {
    validationErrors = {};

    if (!competitorDraft.firstName.trim()) {
      validationErrors['firstName'] = translate('contest.wizard.validation.first_name_required');
    }
    if (!competitorDraft.lastName.trim()) {
      validationErrors['lastName'] = translate('contest.wizard.validation.last_name_required');
    }
    if (!competitorDraft.birthDate) {
      validationErrors['birthDate'] = translate('contest.wizard.validation.birth_date_required');
    }
    if (competitorDraft.bodyweight <= 0) {
      validationErrors['bodyweight'] = translate('contest.wizard.validation.bodyweight_positive');
    }

    if (Object.keys(validationErrors).length > 0) {
      return;
    }

    const lifts = normaliseDraftEvents(competitorDraft.lifts);
    const attempts = normalizeAttemptPlanForGender(
      syncAttemptPlan(competitorDraft.attempts, lifts),
      competitorDraft.gender,
    );
    competitorDrafts = [
      ...competitorDrafts,
      {
        ...competitorDraft,
        bodyweight: Number(competitorDraft.bodyweight),
        lifts,
        attempts,
      },
    ];
    resetCompetitorDraft();
  }

  function removeCompetitorDraft(index: number) {
    competitorDrafts = competitorDrafts.filter((_, i) => i !== index);
  }

  function handleBodyweightWheel(event: WheelEvent) {
    event.preventDefault();
    const direction = event.deltaY > 0 ? -1 : 1;
    const nextValue = Math.max(0, (competitorDraft.bodyweight || 0) + direction * BODYWEIGHT_STEP);
    competitorDraft.bodyweight = Number(nextValue.toFixed(2));
  }

  function updateAttemptDraft(index: number, event: ContestEvent, value: number | null) {
    competitorDrafts = competitorDrafts.map((draft, idx) => {
      if (idx !== index) return draft;
      const lifts = normaliseDraftEvents(draft.lifts);
      if (!lifts.includes(event)) {
        return { ...draft, lifts };
      }
      const attempts = { ...syncAttemptPlan(draft.attempts, lifts) } as AttemptPlan;
      attempts[event] = value && Number.isFinite(value) && value > 0 ? Number(value.toFixed(2)) : null;
      return { ...draft, lifts, attempts };
    });
  }

  function buildNextLifts(current: ContestEvent[], target: ContestEvent): ContestEvent[] {
    const allowed = Array.from(new Set(form.events)) as ContestEvent[];
    if (!allowed.includes(target)) {
      return normaliseDraftEvents(current);
    }
    const normalisedCurrent = normaliseDraftEvents(current);
    let next: ContestEvent[];
    if (normalisedCurrent.includes(target)) {
      next = normalisedCurrent.filter((event) => event !== target);
      if (next.length === 0) {
        next = [target];
      }
    } else {
      next = [...normalisedCurrent, target];
    }
    return normaliseDraftEvents(next);
  }

  function toggleCompetitorDraftLift(lift: ContestEvent) {
    const lifts = buildNextLifts(competitorDraft.lifts, lift);
    competitorDraft = {
      ...competitorDraft,
      lifts,
      rackHeightSquat: lifts.includes('Squat') ? competitorDraft.rackHeightSquat : null,
      rackHeightBench: lifts.includes('Bench') ? competitorDraft.rackHeightBench : null,
      attempts: normalizeAttemptPlanForGender(
        syncAttemptPlan(competitorDraft.attempts, lifts),
        competitorDraft.gender,
      ),
    };
  }

  function toggleSavedDraftLift(index: number, lift: ContestEvent) {
    competitorDrafts = competitorDrafts.map((draft, idx) => {
      if (idx !== index) return draft;
      const lifts = buildNextLifts(draft.lifts, lift);
      return {
        ...draft,
        lifts,
        rackHeightSquat: lifts.includes('Squat') ? draft.rackHeightSquat : null,
        rackHeightBench: lifts.includes('Bench') ? draft.rackHeightBench : null,
        attempts: normalizeAttemptPlanForGender(
          syncAttemptPlan(draft.attempts, lifts),
          draft.gender,
        ),
      };
    });
  }

  function handleAttemptInput(index: number, event: ContestEvent) {
    return (inputEvent: Event) => {
      const input = inputEvent.currentTarget as HTMLInputElement | null;
      const raw = input?.value ?? '';
      const parsed = raw.trim() === '' ? null : Number(raw);
      updateAttemptDraft(index, event, parsed);
    };
  }

  function collectAttemptIssues(): AttemptIssue[] {
    const issues: AttemptIssue[] = [];
    competitorDrafts.forEach((competitor, index) => {
      const lifts = normaliseDraftEvents(competitor.lifts);
      const attempts = syncAttemptPlan(competitor.attempts, lifts);
      const displayName = [competitor.lastName, competitor.firstName].filter(Boolean).join(' ').trim() ||
        translate('contest.wizard.attempts.unnamed', { values: { index: index + 1 } });
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

  $: attemptIssues = collectAttemptIssues();

  function fillMissingAttemptWeights() {
    if (competitorDrafts.length === 0) {
      return;
    }

    competitorDrafts = competitorDrafts.map((draft) => {
      const lifts = normaliseDraftEvents(draft.lifts);
      return {
        ...draft,
        lifts,
        attempts: normalizeAttemptPlanForGender(
          fillAttemptPlan(syncAttemptPlan(draft.attempts, lifts), lifts, draft.bodyweight, true),
          draft.gender,
        ),
      };
    });

    competitorDraft = {
      ...competitorDraft,
      lifts: normaliseDraftEvents(competitorDraft.lifts),
      attempts: normalizeAttemptPlanForGender(
        fillAttemptPlan(
          syncAttemptPlan(competitorDraft.attempts, normaliseDraftEvents(competitorDraft.lifts)),
          normaliseDraftEvents(competitorDraft.lifts),
          competitorDraft.bodyweight,
          true,
        ),
        competitorDraft.gender,
      ),
    };

    toast.success(translate('contest.wizard.attempts.auto_fill_success'));
  }

  function normalizeAllCompetitorAttempts() {
    competitorDrafts = competitorDrafts.map((draft) => {
      const lifts = normaliseDraftEvents(draft.lifts);
      return {
        ...draft,
        lifts,
        attempts: normalizeAttemptPlanForGender(
          syncAttemptPlan(draft.attempts, lifts),
          draft.gender,
        ),
      };
    });

    competitorDraft = {
      ...competitorDraft,
      lifts: normaliseDraftEvents(competitorDraft.lifts),
      attempts: normalizeAttemptPlanForGender(
        syncAttemptPlan(competitorDraft.attempts, normaliseDraftEvents(competitorDraft.lifts)),
        competitorDraft.gender,
      ),
    };
  }

  function validateStep(stepNumber: number): boolean {
    validationErrors = {};

    if (stepNumber === 1) {
      if (!form.name.trim()) {
        validationErrors['name'] = translate('contest.wizard.validation.name_required');
      }
      if (!form.location.trim()) {
        validationErrors['location'] = translate('contest.wizard.validation.location_required');
      }
      if (!form.date) {
        validationErrors['date'] = translate('contest.wizard.validation.date_required');
      }
    }

    if (stepNumber === 2) {
      if (!form.organizer.trim()) {
        validationErrors['organizer'] = translate('contest.wizard.validation.organizer_required');
      }

      const issues = validateCategories(ageCategoriesDraft, weightClassesDraft);
      if (issues.length > 0) {
        categoryIssues = formatCategoryIssues(issues, translate);
      } else {
        categoryIssues = [];
      }

    if (categoryIssues.length > 0) {
      return false;
    }
  }

    if (stepNumber === 3 && competitorDrafts.length === 0) {
      validationErrors = {};
    }

    if (stepNumber === 4 && attemptIssues.length > 0) {
      return false;
    }

    return Object.keys(validationErrors).length === 0;
  }

  function goToStep(next: number) {
    const target = Math.min(Math.max(next, MIN_STEP), MAX_STEP);
    if (target > step && !validateStep(step)) {
      toast.error(translate('contest.wizard.validation.warning'));
      return;
    }
    step = target;
  }

  async function submitContest() {
    normalizeAllCompetitorAttempts();
    await tick();

    if (!validateStep(step)) {
      toast.error(translate('contest.wizard.validation.warning'));
      return;
    }

    error = null;
    success = null;
    isSubmitting = true;

    const issues = validateCategories(ageCategoriesDraft, weightClassesDraft);
    if (issues.length > 0) {
      categoryIssues = formatCategoryIssues(issues, translate);
      isSubmitting = false;
      return;
    }

    categoryIssues = [];

    const payload = {
      name: form.name.trim(),
      date: form.date,
      location: form.location.trim(),
      discipline: form.discipline,
      federationRules: form.federationRules.trim() || null,
      organizer: form.organizer.trim(),
      notes: form.notes.trim() || null,
    };

    try {
      const response = await apiClient.post<ContestSummary>('/contests', payload);
      if (response.error || !response.data) {
        throw new Error(response.error || translate('contest.wizard.messages.error'));
      }

      const contest = response.data;
      const attemptCreationErrors: string[] = [];

      const draftCategories: ContestCategories = {
        ageCategories: ageCategoriesDraft,
        weightClasses: weightClassesDraft,
      };

      const defaultCategories: ContestCategories = {
        ageCategories: createDefaultAgeCategories(),
        weightClasses: createDefaultWeightClasses(),
      };

      if (!categoriesEqual(defaultCategories, draftCategories)) {
        const categoriesPayload = buildCategoryPayload(ageCategoriesDraft, weightClassesDraft);
        const categoryResponse = await apiClient.put<ContestCategories>(
          `/contests/${contest.id}/categories`,
          categoriesPayload,
        );
        if (categoryResponse.error) {
          throw new Error(categoryResponse.error);
        }
      }

      for (const [draftIndex, draft] of competitorDrafts.entries()) {
        try {
          const lifts = normaliseDraftEvents(draft.lifts);
          const competitorResponse = await apiClient.post<{ id: string }>('/competitors', {
            firstName: draft.firstName.trim(),
            lastName: draft.lastName.trim(),
            birthDate: draft.birthDate,
            gender: draft.gender,
            club: draft.club.trim() || null,
            city: draft.city.trim() || null,
            notes: null,
          });

          if (competitorResponse.error || !competitorResponse.data) {
            throw new Error(competitorResponse.error || translate('contest.wizard.messages.error'));
          }

          const competitorId = competitorResponse.data.id;

          const includeSquat = lifts.includes('Squat');
          const includeBench = lifts.includes('Bench');

          const registrationResponse = await apiClient.post(`/contests/${contest.id}/registrations`, {
            competitorId,
            bodyweight: draft.bodyweight,
            rackHeightSquat: includeSquat ? draft.rackHeightSquat : null,
            rackHeightBench: includeBench ? draft.rackHeightBench : null,
            lifts,
          });
          if (registrationResponse.error) {
            throw new Error(registrationResponse.error);
          }

          const registrationData = registrationResponse.data as RegistrationSummary | undefined;
          const registrationId = registrationData?.id;

          if (registrationId) {
            const displayName = [draft.lastName, draft.firstName].filter(Boolean).join(' ').trim() ||
              translate('contest.wizard.attempts.unnamed', { values: { index: draftIndex + 1 } });
            const attemptPlan = normalizeAttemptPlanForGender(
              syncAttemptPlan(draft.attempts, lifts),
              draft.gender,
            );
            for (const event of lifts) {
              const weight = attemptPlan[event];
              if (weight && weight > 0) {
                try {
                  const attemptPayload = {
                    registrationId,
                    liftType: event,
                    attemptNumber: 1 as const,
                    weight,
                  };
                  const attemptResponse = await apiClient.post(`/contests/${contest.id}/registrations/${registrationId}/attempts`, attemptPayload);
                  if (attemptResponse.error) {
                    throw new Error(attemptResponse.error);
                  }
                } catch (attemptError) {
                  const message = attemptError instanceof Error ? attemptError.message : translate('contest.wizard.attempts.submit_error');
                  attemptCreationErrors.push(`${displayName} • ${translate(EVENT_LABEL_KEYS[event])}: ${message}`);
                }
              }
            }
          }
        } catch (competitorError) {
          console.error('Failed to register competitor draft:', competitorError);
        }
      }

      if (attemptCreationErrors.length > 0) {
        attemptCreationErrors.forEach((message) => toast.error(message));
      }

      success = translate('contest.wizard.messages.success');
      resetForm();
      competitorDrafts = [];

      await goto(`/contests/${contest.id}`);
    } catch (err) {
      console.error(err);
      error = err instanceof Error ? err.message : translate('contest.wizard.messages.error');
    } finally {
      isSubmitting = false;
    }
  }

  function resetForm() {
    form = {
      name: '',
      date: isoToday,
      location: '',
      discipline: 'Powerlifting',
      events: ['Squat', 'Bench', 'Deadlift'],
      federationRules: '',
      organizer: '',
      notes: '',
    };
    validationErrors = {};
    resetCategoryDraftsToDefault();
    syncAttemptPlansWithEvents();
  }
</script>

<svelte:head>
  <title>{$_('contest.wizard.page_title')}</title>
</svelte:head>

<Layout
  title={$_('contest.wizard.layout_title')}
  subtitle={$_('contest.wizard.layout_subtitle')}
  currentPage="contests"
  apiBase={apiBase}
>
  <div class="container-medium space-y-8">
    <div class="card">
      <header class="card-header flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h2 class="text-h2 text-text-primary">{$_('contest.wizard.title')}</h2>
          <p class="text-body text-text-secondary">
            {$_('contest.wizard.step_label')} {step} {$_('contest.wizard.step_connector')} {TOTAL_STEPS}
          </p>
        </div>
        <div class="flex flex-wrap gap-2 justify-end">
          <button
            class="btn-secondary"
            type="button"
            on:click={generateSampleContestData}
            disabled={isSubmitting || isGeneratingSample}
          >
            {#if isGeneratingSample}
              {$_('contest.wizard.actions.generating_sample')}
            {:else}
              {$_('contest.wizard.actions.generate_sample')}
            {/if}
          </button>
          <button
            class="btn-secondary"
            on:click={() => goToStep(Math.max(step - 1, MIN_STEP))}
            disabled={step === MIN_STEP}
            type="button"
          >
            {$_('contest.wizard.actions.previous')}
          </button>
          <button
            class="btn-primary"
            on:click={() => (step < TOTAL_STEPS ? goToStep(step + 1) : submitContest())}
            type="button"
            disabled={isSubmitting}
          >
            {#if step < TOTAL_STEPS}
              {$_('contest.wizard.actions.next')}
            {:else if isSubmitting}
              {$_('contest.wizard.actions.submitting')}
            {:else}
              {$_('contest.wizard.actions.submit')}
            {/if}
          </button>
        </div>
      </header>

      {#if error}
        <div class="bg-status-error/20 border border-status-error text-status-error px-4 py-3 mb-4">
          {error}
        </div>
      {/if}

      {#if success}
        <div class="bg-status-success/20 border border-status-success text-green-200 px-4 py-3 mb-4">
          {success}
        </div>
      {/if}

      {#if step === 1}
        <section class="space-y-6">
          <div class="space-y-2">
            <h3 class="text-h3 text-text-primary">{$_('contest.wizard.steps.basic')}</h3>
            <p class="text-caption text-text-secondary">{$_('contest.wizard.steps.basic_hint')}</p>
          </div>

          <div class="grid gap-4 md:grid-cols-2">
            <div>
              <label class="input-label" for="contest-name">{$_('contest.wizard.fields.name.label')}</label>
              <input
                id="contest-name"
                class="input-field"
                bind:value={form.name}
                placeholder={$_('contest.wizard.fields.name.placeholder')}
                required
              />
              {#if validationErrors['name']}
                <p class="error-message">{validationErrors['name']}</p>
              {/if}
            </div>
            <div>
              <label class="input-label" for="contest-date">{$_('contest.wizard.fields.date.label')}</label>
              <input
                id="contest-date"
                class="input-field"
                type="date"
                bind:value={form.date}
                min={isoToday}
                required
              />
              {#if validationErrors['date']}
                <p class="error-message">{validationErrors['date']}</p>
              {/if}
            </div>
          </div>

          <div class="grid gap-4 md:grid-cols-2">
            <div>
              <label class="input-label" for="location">{$_('contest.wizard.fields.location.label')}</label>
              <input
                id="location"
                class="input-field"
                bind:value={form.location}
                placeholder={$_('contest.wizard.fields.location.placeholder')}
                required
              />
              {#if validationErrors['location']}
                <p class="error-message">{validationErrors['location']}</p>
              {/if}
            </div>
            <div class="flex flex-col gap-2">
              <span class="input-label">{$_('contest.wizard.fields.events.label')}</span>
              <div class="flex flex-wrap gap-3">
                {#each AVAILABLE_EVENTS as eventName}
                  <label class="flex items-center gap-2 text-body">
                    <input
                      type="checkbox"
                      class="accent-primary-red"
                      checked={form.events.includes(eventName)}
                      on:change={() => toggleEvent(eventName)}
                    />
                    {$_(EVENT_LABEL_KEYS[eventName])}
                  </label>
                {/each}
              </div>
              <p class="text-caption text-text-secondary">{$_('contest.wizard.messages.events_hint')}</p>
            </div>
          </div>
        </section>
      {:else if step === 2}
        <section class="space-y-6">
          <div class="space-y-2">
            <h3 class="text-h3 text-text-primary">{$_('contest.wizard.steps.details')}</h3>
            <p class="text-caption text-text-secondary">{$_('contest.wizard.steps.details_hint')}</p>
          </div>

          <div class="grid gap-4 md:grid-cols-2">
            <div>
              <label class="input-label" for="organizer">{$_('contest.wizard.fields.organizer.label')}</label>
              <input
                id="organizer"
                class="input-field"
                bind:value={form.organizer}
                placeholder={$_('contest.wizard.fields.organizer.placeholder')}
                required
              />
              {#if validationErrors['organizer']}
                <p class="error-message">{validationErrors['organizer']}</p>
              {/if}
            </div>
            <div>
              <label class="input-label" for="federationRules">{$_('contest.wizard.fields.federation_rules.label')}</label>
              <input
                id="federationRules"
                class="input-field"
                bind:value={form.federationRules}
                placeholder={$_('contest.wizard.fields.federation_rules.placeholder')}
              />
            </div>
            <div class="md:col-span-2">
              <label class="input-label" for="notes">{$_('contest.wizard.fields.notes.label')}</label>
              <textarea
                id="notes"
                class="input-field"
                rows="3"
                bind:value={form.notes}
                placeholder={$_('contest.wizard.fields.notes.placeholder')}
              />
            </div>
          </div>

          <div class="space-y-6 border-t border-border-color pt-6">
            <div class="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
              <div>
                <h4 class="text-h4 text-text-primary">{$_('contest.wizard.categories.age.title')}</h4>
                <p class="text-caption text-text-secondary">{$_('contest.wizard.categories.age.description')}</p>
              </div>
              <div class="flex flex-wrap gap-2">
                <button type="button" class="btn-secondary px-3 py-1" on:click={resetCategoryDraftsToDefault}>
                  {$_('contest.wizard.categories.actions.reset_defaults')}
                </button>
                <button type="button" class="btn-secondary px-3 py-1" on:click={addAgeCategoryDraft}>
                  {$_('contest.wizard.categories.age.add')}
                </button>
              </div>
            </div>

            <div class="overflow-x-auto border border-border-color rounded-lg">
              <table class="min-w-full text-left text-sm">
                <thead class="bg-element-bg text-label">
                  <tr>
                    <th class="px-3 py-2">{$_('contest.wizard.categories.columns.code')}</th>
                    <th class="px-3 py-2">{$_('contest.wizard.categories.columns.name')}</th>
                    <th class="px-3 py-2">{$_('contest.wizard.categories.columns.min_age')}</th>
                    <th class="px-3 py-2">{$_('contest.wizard.categories.columns.max_age')}</th>
                    <th class="px-3 py-2">{$_('contest.wizard.categories.columns.sort_order')}</th>
                    <th class="px-3 py-2 text-right">{$_('contest.wizard.categories.columns.actions')}</th>
                  </tr>
                </thead>
                <tbody>
                  {#each ageCategoriesDraft as category, index}
                    <tr class="border-t border-border-color">
                      <td class="px-3 py-2">
                        <input
                          class="table-input-field w-full"
                          placeholder="SENIOR"
                          value={category.code}
                          on:input={handleAgeCategoryInput(index, 'code')}
                        />
                      </td>
                      <td class="px-3 py-2">
                        <input
                          class="table-input-field w-full"
                          placeholder={$_('contest.wizard.categories.placeholders.age_name')}
                          value={category.name}
                          on:input={handleAgeCategoryInput(index, 'name')}
                        />
                      </td>
                      <td class="px-3 py-2">
                        <input
                          class="table-input-field w-full"
                          type="number"
                          min="0"
                          value={category.minAge ?? ''}
                            on:input={handleAgeCategoryInput(index, 'minAge')}
                        />
                      </td>
                      <td class="px-3 py-2">
                        <input
                          class="table-input-field w-full"
                          type="number"
                          min="0"
                          value={category.maxAge ?? ''}
                            on:input={handleAgeCategoryInput(index, 'maxAge')}
                        />
                      </td>
                      <td class="px-3 py-2">
                        <input
                          class="table-input-field w-full"
                          type="number"
                          min="0"
                          value={category.sortOrder ?? (index + 1) * 10}
                            on:input={handleAgeCategoryInput(index, 'sortOrder')}
                        />
                      </td>
                      <td class="px-3 py-2 text-right">
                        <button type="button" class="btn-secondary px-3 py-1" on:click={() => removeAgeCategoryDraft(index)}>
                          {$_('buttons.remove')}
                        </button>
                      </td>
                    </tr>
                  {/each}
                </tbody>
              </table>
            </div>

            <div class="space-y-2">
              <div class="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                <div>
                  <h4 class="text-h4 text-text-primary">{$_('contest.wizard.categories.weight.title')}</h4>
                  <p class="text-caption text-text-secondary">{$_('contest.wizard.categories.weight.description')}</p>
                </div>
                <button type="button" class="btn-secondary px-3 py-1" on:click={addWeightClassDraft}>
                  {$_('contest.wizard.categories.weight.add')}
                </button>
              </div>

              <div class="overflow-x-auto border border-border-color rounded-lg">
                <table class="min-w-full text-left text-sm">
                  <thead class="bg-element-bg text-label">
                    <tr>
                      <th class="px-3 py-2">{$_('contest.wizard.categories.columns.gender')}</th>
                      <th class="px-3 py-2">{$_('contest.wizard.categories.columns.code')}</th>
                      <th class="px-3 py-2">{$_('contest.wizard.categories.columns.name')}</th>
                      <th class="px-3 py-2">{$_('contest.wizard.categories.columns.min_weight')}</th>
                      <th class="px-3 py-2">{$_('contest.wizard.categories.columns.max_weight')}</th>
                      <th class="px-3 py-2">{$_('contest.wizard.categories.columns.sort_order')}</th>
                      <th class="px-3 py-2 text-right">{$_('contest.wizard.categories.columns.actions')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {#each weightClassesDraft as weightClass, index}
                      <tr class="border-t border-border-color">
                        <td class="px-3 py-2">
                          <select
                            class="table-input-field w-full"
                            value={weightClass.gender}
                            on:change={handleWeightClassSelect(index)}
                          >
                            <option value="Female">{$_('contest.wizard.categories.gender.female')}</option>
                            <option value="Male">{$_('contest.wizard.categories.gender.male')}</option>
                          </select>
                        </td>
                        <td class="px-3 py-2">
                          <input
                            class="table-input-field w-full"
                            placeholder="M_95"
                            value={weightClass.code}
                            on:input={handleWeightClassInput(index, 'code')}
                          />
                        </td>
                        <td class="px-3 py-2">
                          <input
                            class="table-input-field w-full"
                            placeholder={$_('contest.wizard.categories.placeholders.weight_name')}
                            value={weightClass.name}
                            on:input={handleWeightClassInput(index, 'name')}
                          />
                        </td>
                        <td class="px-3 py-2">
                          <input
                            class="table-input-field w-full"
                            type="number"
                            min="0"
                            step="0.1"
                            value={weightClass.minWeight ?? ''}
                            on:input={handleWeightClassInput(index, 'minWeight')}
                          />
                        </td>
                        <td class="px-3 py-2">
                          <input
                            class="table-input-field w-full"
                            type="number"
                            min="0"
                            step="0.1"
                            value={weightClass.maxWeight ?? ''}
                            on:input={handleWeightClassInput(index, 'maxWeight')}
                          />
                        </td>
                        <td class="px-3 py-2">
                          <input
                            class="table-input-field w-full"
                            type="number"
                            min="0"
                            value={weightClass.sortOrder ?? (index + 1) * 10}
                            on:input={handleWeightClassInput(index, 'sortOrder')}
                          />
                        </td>
                        <td class="px-3 py-2 text-right">
                          <button type="button" class="btn-secondary px-3 py-1" on:click={() => removeWeightClassDraft(index)}>
                            {$_('buttons.remove')}
                          </button>
                        </td>
                      </tr>
                    {/each}
                  </tbody>
                </table>
              </div>
            </div>

            {#if categoryIssues.length > 0}
              <div class="bg-status-error/20 border border-status-error text-status-error px-4 py-3 rounded-lg">
                <ul class="list-disc list-inside space-y-1">
                  {#each categoryIssues as issue}
                    <li>{issue}</li>
                  {/each}
                </ul>
              </div>
            {/if}
          </div>
        </section>
      {:else if step === 3}
        <section class="space-y-6">
          <div class="space-y-2">
            <h3 class="text-h3 text-text-primary">{$_('contest.wizard.steps.competitors')}</h3>
            <p class="text-caption text-text-secondary">{$_('contest.wizard.steps.competitors_hint')}</p>
          </div>

          <div class="grid gap-4 md:grid-cols-2">
            <div>
              <label class="input-label" for="firstName">{$_('contest.wizard.competitor.first_name')}</label>
              <input id="firstName" class="input-field" bind:value={competitorDraft.firstName} />
              {#if validationErrors['firstName']}
                <p class="error-message">{validationErrors['firstName']}</p>
              {/if}
            </div>
            <div>
              <label class="input-label" for="lastName">{$_('contest.wizard.competitor.last_name')}</label>
              <input id="lastName" class="input-field" bind:value={competitorDraft.lastName} />
              {#if validationErrors['lastName']}
                <p class="error-message">{validationErrors['lastName']}</p>
              {/if}
            </div>
            <div>
              <label class="input-label" for="birthDate">{$_('contest.wizard.competitor.birth_date')}</label>
              <input id="birthDate" type="date" class="input-field" bind:value={competitorDraft.birthDate} />
              {#if validationErrors['birthDate']}
                <p class="error-message">{validationErrors['birthDate']}</p>
              {/if}
            </div>
            <div>
              <label class="input-label" for="gender">{$_('contest.wizard.competitor.gender')}</label>
              <select id="gender" class="input-field" bind:value={competitorDraft.gender}>
                {#each GENDERS as gender}
                  <option value={gender}>{$_(GENDER_LABEL_KEYS[gender])}</option>
                {/each}
              </select>
            </div>
            <div>
              <label class="input-label" for="club">{$_('contest.wizard.competitor.club')}</label>
              <input
                id="club"
                class="input-field"
                bind:value={competitorDraft.club}
                placeholder={$_('contest.wizard.competitor.club_placeholder')}
              />
            </div>
            <div>
              <label class="input-label" for="city">{$_('contest.wizard.competitor.city')}</label>
              <input
                id="city"
                class="input-field"
                bind:value={competitorDraft.city}
                placeholder={$_('contest.wizard.competitor.city_placeholder')}
              />
            </div>
            <div>
              <label class="input-label" for="bodyweight">{$_('contest.wizard.competitor.bodyweight')}</label>
              <input
                id="bodyweight"
                type="number"
                step="0.1"
                min="0"
                class="input-field"
                bind:value={competitorDraft.bodyweight}
                on:wheel={handleBodyweightWheel}
              />
              {#if validationErrors['bodyweight']}
                <p class="error-message">{validationErrors['bodyweight']}</p>
              {/if}
            </div>
            <div class="flex flex-col gap-2 md:col-span-2">
              <span class="input-label">{$_('contest.wizard.competitor.lifts')}</span>
              <div class="flex flex-wrap gap-2">
                {#each form.events as event}
                  <button
                    type="button"
                    class={`px-3 py-2 border rounded-md text-sm transition ${competitorDraft.lifts.includes(event) ? 'border-primary-red bg-primary-red/10 text-text-primary' : 'border-border-color text-text-secondary hover:text-text-primary'}`}
                    on:click={() => toggleCompetitorDraftLift(event)}
                  >
                    {$_(EVENT_LABEL_KEYS[event])}
                  </button>
                {/each}
              </div>
              <p class="text-caption text-text-secondary">{$_('contest.wizard.competitor.lifts_hint')}</p>
            </div>
            {#if form.events.includes('Squat')}
              <div>
                <label class="input-label" for="rackHeightSquat">{$_('contest.wizard.competitor.rack_squat')}</label>
                <input
                  id="rackHeightSquat"
                  type="number"
                  class="input-field"
                  bind:value={competitorDraft.rackHeightSquat}
                  disabled={!competitorDraft.lifts.includes('Squat')}
                />
              </div>
            {/if}
            <div>
              <label class="input-label" for="rackHeightBench">{$_('contest.wizard.competitor.rack_bench')}</label>
              <input
                id="rackHeightBench"
                type="number"
                class="input-field"
                bind:value={competitorDraft.rackHeightBench}
                disabled={!competitorDraft.lifts.includes('Bench')}
              />
            </div>
          </div>

          <div class="flex gap-3">
            <button class="btn-primary" type="button" on:click={addCompetitorDraft}>
              {$_('contest.wizard.competitor.add_button')}
            </button>
            <button class="btn-secondary" type="button" on:click={resetCompetitorDraft}>
              {$_('contest.wizard.competitor.reset_button')}
            </button>
          </div>

          {#if competitorDrafts.length > 0}
            <div class="space-y-3">
              <h3 class="text-h3 text-text-primary">{$_('contest.wizard.drafts.title')}</h3>
              {#each competitorDrafts as competitor, index}
                <div class="bg-element-bg border border-border-color p-4 space-y-3">
                  <div class="flex flex-col gap-2 md:flex-row md:items-start md:justify-between md:gap-4">
                    <div>
                      <p class="text-body text-text-primary font-semibold">
                        {competitor.lastName} {competitor.firstName}
                      </p>
                      <p class="text-caption text-text-secondary">
                        {$_('contest.wizard.drafts.meta', {
                          values: {
                            birthDate: competitor.birthDate,
                            gender: $_(GENDER_LABEL_KEYS[competitor.gender]),
                            bodyweight: competitor.bodyweight,
                          }
                        })}
                      </p>
                      <p class="text-caption text-text-secondary">
                        {$_('contest.wizard.drafts.club_city', {
                          values: {
                            club: competitor.club.trim() ? competitor.club : $_('contest.wizard.drafts.no_club'),
                            city: competitor.city.trim() ? competitor.city : $_('contest.wizard.drafts.no_city'),
                          }
                        })}
                      </p>
                    </div>
                    <button class="btn-secondary h-fit" type="button" on:click={() => removeCompetitorDraft(index)}>
                      {$_('contest.wizard.drafts.remove')}
                    </button>
                  </div>
                  <div class="flex flex-wrap gap-2">
                    {#each form.events as event}
                      <button
                        type="button"
                        class={`px-3 py-2 border rounded-md text-xs uppercase tracking-[0.2em] transition ${competitor.lifts.includes(event) ? 'border-primary-red bg-primary-red/10 text-text-primary' : 'border-border-color text-text-secondary hover:text-text-primary'}`}
                        on:click={() => toggleSavedDraftLift(index, event)}
                      >
                        {$_(EVENT_LABEL_KEYS[event])}
                      </button>
                    {/each}
                  </div>
                </div>
              {/each}
            </div>
          {/if}
        </section>
      {:else}
        <section class="space-y-6">
          <div class="space-y-2">
            <h3 class="text-h3 text-text-primary">{$_('contest.wizard.steps.attempts')}</h3>
            <p class="text-caption text-text-secondary">{$_('contest.wizard.steps.attempts_hint')}</p>
          </div>

          <div class="flex flex-wrap gap-3">
            <button
              type="button"
              class="btn-secondary px-3 py-1"
              on:click={fillMissingAttemptWeights}
              disabled={competitorDrafts.length === 0}
            >
              {$_('contest.wizard.attempts.auto_fill')}
            </button>
          </div>

          {#if competitorDrafts.length === 0}
            <div class="card">
              <p class="text-body text-text-secondary">{$_('contest.wizard.attempts.empty')}</p>
            </div>
          {:else}
            {#if attemptIssues.length > 0}
              <div class="bg-status-warning/20 border border-status-warning text-status-warning px-4 py-3 rounded-lg">
                <h4 class="text-label text-status-warning mb-2">{$_('contest.wizard.attempts.issues_title')}</h4>
                <ul class="list-disc list-inside space-y-1">
                  {#each attemptIssues as issue}
                    <li>
                      {$_(
                        issue.type === 'missing'
                          ? 'contest.wizard.attempts.issue_missing'
                          : issue.type === 'below_bar'
                            ? 'contest.wizard.attempts.issue_below_bar'
                            : 'contest.wizard.attempts.issue_unloadable',
                        {
                          values: {
                            name: issue.name,
                            event: $_(EVENT_LABEL_KEYS[issue.event]),
                            suggested: issue.suggestedWeight !== undefined
                              ? $_('contest.wizard.attempts.suggested_suffix', {
                                values: { weight: formatWeight(issue.suggestedWeight) }
                              })
                              : '',
                          },
                        }
                      )}
                    </li>
                  {/each}
                </ul>
              </div>
            {/if}

            <div class="space-y-4">
              {#each competitorDrafts as competitor, index}
                {@const lifts = normaliseDraftEvents(competitor.lifts)}
                {@const attemptPlan = syncAttemptPlan(competitor.attempts, lifts)}
                {@const competitorIssues = attemptIssues.filter((issue) => issue.competitorIndex === index)}
                {@const issuesCount = competitorIssues.length}
                <div class="card space-y-4">
                  <header class="flex flex-col gap-1 md:flex-row md:items-center md:justify-between">
                    <div>
                      <h4 class="text-h4 text-text-primary">{competitor.lastName} {competitor.firstName}</h4>
                      <p class="text-caption text-text-secondary">
                        {$_('contest.wizard.attempts.competitor_meta', {
                          values: {
                            bodyweight: competitor.bodyweight,
                            gender: $_(GENDER_LABEL_KEYS[competitor.gender])
                          }
                        })}
                      </p>
                    </div>
                    {#if issuesCount > 0}
                      <span class="text-xxs uppercase tracking-[0.35em] text-status-warning">
                        {$_('contest.wizard.attempts.issue_badge', { values: { count: issuesCount } })}
                      </span>
                    {/if}
                  </header>

                  <div class={`grid gap-4 ${lifts.length > 2 ? 'md:grid-cols-3' : 'md:grid-cols-2'}`}>
                    {#each lifts as event}
                      <div>
                        <label class="input-label" for={`attempt-${index}-${event}`}>
                          {$_(EVENT_LABEL_KEYS[event])}
                        </label>
                        <div class="flex items-center gap-3">
                          <input
                            id={`attempt-${index}-${event}`}
                            type="number"
                            class="input-field"
                            min="0"
                            step="0.5"
                            value={attemptPlan[event] ?? ''}
                            on:input={handleAttemptInput(index, event)}
                          />
                          <span class="text-caption text-text-secondary">kg</span>
                        </div>
                      </div>
                    {/each}
                  </div>
                </div>
              {/each}
            </div>
          {/if}
        </section>
      {/if}
    </div>
  </div>
</Layout>
