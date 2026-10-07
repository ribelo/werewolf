<script lang="ts">
import { goto } from '$app/navigation';
import Layout from '$lib/components/Layout.svelte';
import ContestTagsForm, { type ContestTagRowView } from '$lib/components/ContestTagsForm.svelte';
import { apiClient } from '$lib/api';
import type { PageData } from './$types';
import type { AgeCategory, ContestCategories, WeightClass } from '$lib/types';
import { toast } from '$lib/ui/toast';
import { _ } from 'svelte-i18n';
import { get } from 'svelte/store';
import { tick } from 'svelte';
import {
  buildCategoryPayload,
  categoriesEqual,
  createDefaultAgeCategories,
  createDefaultWeightClasses,
  formatCategoryIssues,
  validateCategories,
} from '$lib/categories';
import { formatWeight } from '$lib/utils';
import {
  AVAILABLE_EVENTS,
  BODYWEIGHT_STEP,
  EVENT_LABEL_KEYS,
  GENDERS,
  GENDER_LABEL_KEYS,
  MANDATORY_TAG_KEY,
  MANDATORY_TAG_LABEL,
  MAX_STEP,
  MIN_STEP,
  TOTAL_STEPS,
  arraysEqual,
  buildNextLifts,
  canonicaliseTagLabel,
  collectExtraTagLabels,
  computeAvailableTagOptions,
  createEmptyCompetitorDraft,
  createIdFactory,
  createTagDraftFactory,
  disciplineForEvents,
  fillAttemptPlan,
  normaliseDraftEvents,
  normaliseTagSelection,
  normalizeAttemptPlanForGender,
  replaceTagLabelInTags,
  syncAttemptPlan,
  type AttemptIssue,
  type AttemptPlan,
  type CompetitorDraft,
  type ContestEvent,
  type ContestForm,
  type TagDraft,
} from './draft';
import {
  generateSampleCompetitorDrafts,
  generateSampleForm,
  randomCompetitorCount,
} from './sample-data';
import {
  buildSubmissionCompetitors,
  pendingDrafts,
  runContestSetup,
  type SetupOptions,
  type SetupProgress,
  type SetupResult,
} from './submit';
import {
  collectAttemptIssues,
  collectCompetitorDraftErrors,
  collectStepErrors,
  collectTagDraftErrors,
} from './validation';

  const translate = (key: string, values?: Record<string, unknown>) => get(_)(key, values) as string;

  const createTagDraft = createTagDraftFactory('tag');
  const nextCompetitorDraftId = createIdFactory('competitor');

  let availableTagOptions: string[] = [MANDATORY_TAG_LABEL];

  export let data: PageData;

  const { apiBase } = data;

  let ageCategoriesDraft: AgeCategory[] = createDefaultAgeCategories();
  let weightClassesDraft: WeightClass[] = createDefaultWeightClasses();
  let categoryIssues: string[] = [];

  function resetCategoryDraftsToDefault() {
    ageCategoriesDraft = createDefaultAgeCategories();
    weightClassesDraft = createDefaultWeightClasses();
    categoryIssues = [];
  }

  function parseOptionalNumber(value: string): number | null {
    const parsed = value.trim() === '' ? null : Number(value);
    return parsed !== null && Number.isFinite(parsed) ? parsed : null;
  }

  function addAgeCategoryDraft() {
    const next: AgeCategory = {
      code: '',
      name: '',
      minAge: null,
      maxAge: null,
      sortOrder: (ageCategoriesDraft.length + 1) * 10,
      metadata: null,
    };
    ageCategoriesDraft = [...ageCategoriesDraft, next];
  }

  function removeAgeCategoryDraft(index: number) {
    ageCategoriesDraft = ageCategoriesDraft.filter((_, idx) => idx !== index);
  }

  function updateAgeCategoryDraft(index: number, field: keyof AgeCategory, value: string) {
    const current = ageCategoriesDraft[index];
    if (!current) return;
    let target: AgeCategory = { ...current };
    if (field === 'code') {
      target = { ...current, code: value.trim().toUpperCase() };
    } else if (field === 'name') {
      target = { ...current, name: value };
    } else if (field === 'minAge') {
      target = { ...current, minAge: parseOptionalNumber(value) };
    } else if (field === 'maxAge') {
      target = { ...current, maxAge: parseOptionalNumber(value) };
    } else if (field === 'sortOrder') {
      target = { ...current, sortOrder: parseOptionalNumber(value) };
    }
    ageCategoriesDraft = ageCategoriesDraft.map((category, idx) => (idx === index ? target : category));
    categoryIssues = [];
  }

  function handleAgeCategoryInput(index: number, field: keyof AgeCategory) {
    return (event: Event) => {
      const input = event.currentTarget as HTMLInputElement | null;
      updateAgeCategoryDraft(index, field, input?.value ?? '');
    };
  }

  function addWeightClassDraft() {
    const next: WeightClass = {
      code: '',
      name: '',
      gender: weightClassesDraft.length % 2 === 0 ? 'Female' : 'Male',
      minWeight: null,
      maxWeight: null,
      sortOrder: (weightClassesDraft.length + 1) * 10,
      metadata: null,
    };
    weightClassesDraft = [...weightClassesDraft, next];
  }

  function removeWeightClassDraft(index: number) {
    weightClassesDraft = weightClassesDraft.filter((_, idx) => idx !== index);
  }

  function updateWeightClassDraft(index: number, field: keyof WeightClass, value: string) {
    const current = weightClassesDraft[index];
    if (!current) return;
    let target: WeightClass = { ...current };
    if (field === 'code') {
      target = { ...current, code: value.trim().toUpperCase() };
    } else if (field === 'name') {
      target = { ...current, name: value };
    } else if (field === 'gender') {
      const upper = value.trim().toUpperCase();
      target = { ...current, gender: upper.startsWith('F') ? 'Female' : 'Male' };
    } else if (field === 'minWeight') {
      target = { ...current, minWeight: parseOptionalNumber(value) };
    } else if (field === 'maxWeight') {
      target = { ...current, maxWeight: parseOptionalNumber(value) };
    } else if (field === 'sortOrder') {
      target = { ...current, sortOrder: parseOptionalNumber(value) };
    }
    weightClassesDraft = weightClassesDraft.map((weightClass, idx) => (idx === index ? target : weightClass));
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

  function resetTagDrafts() {
    tagDrafts = [createTagDraft(MANDATORY_TAG_LABEL, { mandatory: true })];
    newTagLabel = '';
    newTagError = null;
    syncAllCompetitorTags();
  }

  function removeTagDraft(id: string) {
    const target = tagDrafts.find((draft) => draft.id === id);
    if (!target || target.isMandatory) {
      return;
    }
    tagDrafts = tagDrafts.filter((draft) => draft.id !== id);
    syncAllCompetitorTags();
  }

  function addTagDraft() {
    const label = newTagLabel.trim();
    if (!label) {
      newTagError = translate('contest_edit.tags.validation.label_required');
      return;
    }

    const exists = tagDrafts.some(
      (draft) => draft.label.trim().toLowerCase() === label.toLowerCase()
    );
    if (exists) {
      newTagError = translate('contest_edit.tags.validation.duplicate');
      return;
    }

    tagDrafts = [...tagDrafts, createTagDraft(label)];
    newTagLabel = '';
    newTagError = null;
    syncAllCompetitorTags();
  }

  function validateTagDrafts(): boolean {
    newTagError = null;
    const result = collectTagDraftErrors(tagDrafts, translate);
    tagDrafts = result.drafts;

    if (!result.hasError) {
      syncAllCompetitorTags();
    }

    return !result.hasError;
  }

  let tagDraftRows: ContestTagRowView[] = [];

  $: {
    const nextOptions = computeAvailableTagOptions(tagDrafts);
    if (!arraysEqual(availableTagOptions, nextOptions)) {
      availableTagOptions = nextOptions;
      syncAllCompetitorTags();
    }
  }

  $: tagDraftRows = tagDrafts.map((draft) => ({
    id: draft.id,
    label: draft.label,
    isMandatory: draft.isMandatory,
    error: draft.error,
    inputDisabled: draft.isMandatory,
    showReset: false,
    showSave: false,
    showDelete: !draft.isMandatory,
    deleteDisabled: false,
  }));

  let step = MIN_STEP;
  let isSubmitting = false;
  let isGeneratingSample = false;
  let error: string | null = null;
  let success: string | null = null;
  let setupProgress: SetupProgress | null = null;

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

  let competitorDraft: CompetitorDraft = createEmptyCompetitorDraft({
    id: nextCompetitorDraftId(),
    events: form.events,
    tagOptions: availableTagOptions,
  });

  let competitorDrafts: CompetitorDraft[] = [];
  let validationErrors: Record<string, string> = {};
  let attemptIssues: AttemptIssue[] = [];
  let tagDrafts: TagDraft[] = [createTagDraft(MANDATORY_TAG_LABEL, { mandatory: true })];
  let newTagLabel = '';
  let newTagError: string | null = null;

  function generateSampleContestData() {
    if (isGeneratingSample) return;
    isGeneratingSample = true;

    try {
      const sampleForm = generateSampleForm(form.events, translate('contest.wizard.sample.notes'));
      form = sampleForm;

      tagDrafts = [
        createTagDraft(MANDATORY_TAG_LABEL, { mandatory: true }),
        createTagDraft('Mundurówka'),
      ];
      newTagLabel = '';
      newTagError = null;
      availableTagOptions = computeAvailableTagOptions(tagDrafts);
      syncAllCompetitorTags();

      competitorDrafts = generateSampleCompetitorDrafts(
        sampleForm.events,
        randomCompetitorCount(),
        availableTagOptions,
        nextCompetitorDraftId,
      );
      syncAllCompetitorTags();

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
    form.discipline = disciplineForEvents(form.events);
  }

  function resetCompetitorDraft() {
    competitorDraft = createEmptyCompetitorDraft({
      id: nextCompetitorDraftId(),
      events: form.events,
      tagOptions: availableTagOptions,
    });
  }

  function syncAllCompetitorTags() {
    const nextDraftTags = normaliseTagSelection(competitorDraft.tags, availableTagOptions);
    if (!arraysEqual(competitorDraft.tags, nextDraftTags)) {
      competitorDraft = { ...competitorDraft, tags: nextDraftTags };
    }

    let updated = false;
    const nextDrafts = competitorDrafts.map((draft) => {
      const normalised = normaliseTagSelection(draft.tags, availableTagOptions);
      if (!arraysEqual(draft.tags, normalised)) {
        updated = true;
        return { ...draft, tags: normalised };
      }
      return draft;
    });
    if (updated) {
      competitorDrafts = nextDrafts;
    }
  }

  function syncAttemptPlansWithEvents() {
    const updatedDraftEvents = normaliseDraftEvents(competitorDraft.lifts, form.events);
    competitorDraft = {
      ...competitorDraft,
      lifts: updatedDraftEvents,
      attempts: normalizeAttemptPlanForGender(
        syncAttemptPlan(competitorDraft.attempts, updatedDraftEvents),
        competitorDraft.gender,
      ),
    };
    competitorDrafts = competitorDrafts.map((draft) => {
      const lifts = normaliseDraftEvents(draft.lifts, form.events);
      return {
        ...draft,
        lifts,
        attempts: normalizeAttemptPlanForGender(syncAttemptPlan(draft.attempts, lifts), draft.gender),
      };
    });
  }

  function addCompetitorDraft() {
    validationErrors = {};

    Object.assign(validationErrors, collectCompetitorDraftErrors(competitorDraft, translate));

    if (Object.keys(validationErrors).length > 0) {
      return;
    }

    const lifts = normaliseDraftEvents(competitorDraft.lifts, form.events);
    const attempts = normalizeAttemptPlanForGender(
      syncAttemptPlan(competitorDraft.attempts, lifts),
      competitorDraft.gender,
    );
    const tags = normaliseTagSelection(competitorDraft.tags, availableTagOptions);
    competitorDrafts = [
      ...competitorDrafts,
      {
        ...competitorDraft,
        bodyweight: Number(competitorDraft.bodyweight),
        lifts,
        attempts,
        tags,
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
      const lifts = normaliseDraftEvents(draft.lifts, form.events);
      if (!lifts.includes(event)) {
        return { ...draft, lifts };
      }
      const attempts: AttemptPlan = { ...syncAttemptPlan(draft.attempts, lifts) };
      attempts[event] = value && Number.isFinite(value) && value > 0 ? Number(value.toFixed(2)) : null;
      return { ...draft, lifts, attempts };
    });
  }

  function toggleCompetitorDraftLift(lift: ContestEvent) {
    const lifts = buildNextLifts(competitorDraft.lifts, lift, form.events);
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
      const lifts = buildNextLifts(draft.lifts, lift, form.events);
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

  function toggleCompetitorDraftTag(label: string, checked: boolean) {
    const canonical = canonicaliseTagLabel(label, availableTagOptions);
    if (!canonical) return;
    const key = canonical.toLowerCase();
    if (key === MANDATORY_TAG_KEY) {
      competitorDraft = {
        ...competitorDraft,
        tags: normaliseTagSelection([canonical, ...competitorDraft.tags], availableTagOptions),
      };
      return;
    }
    const current = competitorDraft.tags ?? [];
    let next: string[];
    if (checked) {
      if (current.some((tag) => tag.toLowerCase() === key)) {
        next = [...current];
      } else {
        next = [...current, canonical];
      }
    } else {
      next = current.filter((tag) => tag.toLowerCase() !== key);
    }
    competitorDraft = { ...competitorDraft, tags: normaliseTagSelection(next, availableTagOptions) };
  }

  function toggleSavedDraftTag(index: number, label: string, checked: boolean) {
    const canonical = canonicaliseTagLabel(label, availableTagOptions);
    if (!canonical) return;
    const key = canonical.toLowerCase();
    if (key === MANDATORY_TAG_KEY) {
      return;
    }
    competitorDrafts = competitorDrafts.map((draft, idx) => {
      if (idx !== index) return draft;
      const current = draft.tags ?? [];
      let next: string[];
      if (checked) {
        if (current.some((tag) => tag.toLowerCase() === key)) {
          next = [...current];
        } else {
          next = [...current, canonical];
        }
      } else {
        next = current.filter((tag) => tag.toLowerCase() !== key);
      }
      const normalised = normaliseTagSelection(next, availableTagOptions);
      if (arraysEqual(draft.tags, normalised)) {
        return draft;
      }
      return { ...draft, tags: normalised };
    });
  }

  function replaceTagLabelAcrossDrafts(previousLabel: string, nextLabel: string) {
    const previousKey = previousLabel.trim().toLowerCase();
    if (!previousKey) {
      syncAllCompetitorTags();
      return;
    }

    const draftTags = replaceTagLabelInTags(competitorDraft.tags, previousLabel, nextLabel);
    if (draftTags.changed) {
      competitorDraft = { ...competitorDraft, tags: draftTags.tags };
    }

    let listChanged = false;
    const nextDrafts = competitorDrafts.map((draft) => {
      const replaced = replaceTagLabelInTags(draft.tags, previousLabel, nextLabel);
      if (!replaced.changed) {
        return draft;
      }
      listChanged = true;
      return { ...draft, tags: replaced.tags };
    });
    if (listChanged) {
      competitorDrafts = nextDrafts;
    }

    syncAllCompetitorTags();
  }

  function handleTagRowChange(event: CustomEvent<{ id: string; value: string }>) {
    const { id, value } = event.detail ?? {};
    if (!id) {
      return;
    }

    const previousLabel = tagDrafts.find((draft) => draft.id === id)?.label ?? null;
    tagDrafts = tagDrafts.map((draft) =>
      draft.id === id ? { ...draft, label: value, error: null } : draft
    );

    const prevKey = previousLabel?.trim().toLowerCase() ?? null;
    const nextKey = value.trim().toLowerCase();
    if (previousLabel !== null && prevKey !== nextKey) {
      replaceTagLabelAcrossDrafts(previousLabel, value);
    } else {
      syncAllCompetitorTags();
    }
  }

  function handleAttemptInput(index: number, event: ContestEvent) {
    return (inputEvent: Event) => {
      const input = inputEvent.currentTarget as HTMLInputElement | null;
      const raw = input?.value ?? '';
      const parsed = raw.trim() === '' ? null : Number(raw);
      updateAttemptDraft(index, event, parsed);
    };
  }

  $: attemptIssues = collectAttemptIssues(competitorDrafts, form.events, translate);

  function fillMissingAttemptWeights() {
    if (competitorDrafts.length === 0) {
      return;
    }

    competitorDrafts = competitorDrafts.map((draft) => {
      const lifts = normaliseDraftEvents(draft.lifts, form.events);
      return {
        ...draft,
        lifts,
        attempts: normalizeAttemptPlanForGender(
          fillAttemptPlan(syncAttemptPlan(draft.attempts, lifts), lifts, draft.bodyweight, true),
          draft.gender,
        ),
      };
    });

    const draftLifts = normaliseDraftEvents(competitorDraft.lifts, form.events);
    competitorDraft = {
      ...competitorDraft,
      lifts: draftLifts,
      attempts: normalizeAttemptPlanForGender(
        fillAttemptPlan(
          syncAttemptPlan(competitorDraft.attempts, draftLifts),
          draftLifts,
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
      const lifts = normaliseDraftEvents(draft.lifts, form.events);
      return {
        ...draft,
        lifts,
        attempts: normalizeAttemptPlanForGender(
          syncAttemptPlan(draft.attempts, lifts),
          draft.gender,
        ),
      };
    });

    const draftLifts = normaliseDraftEvents(competitorDraft.lifts, form.events);
    competitorDraft = {
      ...competitorDraft,
      lifts: draftLifts,
      attempts: normalizeAttemptPlanForGender(
        syncAttemptPlan(competitorDraft.attempts, draftLifts),
        competitorDraft.gender,
      ),
    };
  }

  function validateStep(stepNumber: number): boolean {
    validationErrors = collectStepErrors(stepNumber, form, translate);

    if (stepNumber === 2) {
      const issues = validateCategories(ageCategoriesDraft, weightClassesDraft);
      if (issues.length > 0) {
        categoryIssues = formatCategoryIssues(issues, translate);
      } else {
        categoryIssues = [];
      }

      const tagsValid = validateTagDrafts();

      if (categoryIssues.length > 0) {
        return false;
      }

      if (!tagsValid) {
        return false;
      }
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

  function reportSetupResult(result: SetupResult) {
    for (const failure of result.failures) {
      if (failure.kind === 'contest') {
        continue;
      }
      if (failure.kind === 'attempt' && failure.event && failure.displayName) {
        toast.error(`${failure.displayName} • ${translate(EVENT_LABEL_KEYS[failure.event])}: ${failure.message}`);
        continue;
      }
      if (failure.displayName) {
        toast.error(
          translate('contest.wizard.messages.draft_failed', {
            values: { name: failure.displayName, message: failure.message },
          }),
        );
        continue;
      }
      toast.error(failure.message);
    }
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

    try {
      const issues = validateCategories(ageCategoriesDraft, weightClassesDraft);
      if (issues.length > 0) {
        categoryIssues = formatCategoryIssues(issues, translate);
        return;
      }

      categoryIssues = [];

      if (!validateTagDrafts()) {
        toast.error(translate('contest.wizard.validation.warning'));
        return;
      }

      const draftCategories: ContestCategories = {
        ageCategories: ageCategoriesDraft,
        weightClasses: weightClassesDraft,
      };

      const defaultCategories: ContestCategories = {
        ageCategories: createDefaultAgeCategories(),
        weightClasses: createDefaultWeightClasses(),
      };

      const options: SetupOptions = {
        fallbackError: translate('contest.wizard.messages.error'),
      };
      if (setupProgress) {
        options.progress = setupProgress;
      }

      const result = await runContestSetup(
        {
          contest: {
            name: form.name.trim(),
            date: form.date,
            location: form.location.trim(),
            discipline: form.discipline,
            federationRules: form.federationRules.trim() || null,
            organizer: form.organizer.trim(),
            notes: form.notes.trim() || null,
          },
          categories: categoriesEqual(defaultCategories, draftCategories)
            ? null
            : buildCategoryPayload(ageCategoriesDraft, weightClassesDraft),
          tagLabels: collectExtraTagLabels(tagDrafts),
          competitors: buildSubmissionCompetitors(
            competitorDrafts,
            form.events,
            availableTagOptions,
            (index) => translate('contest.wizard.attempts.unnamed', { values: { index: index + 1 } }),
          ),
        },
        apiClient,
        options,
      );

      setupProgress = result.progress;
      reportSetupResult(result);

      if (result.status === 'complete') {
        success = translate('contest.wizard.messages.success');
        resetForm();
        competitorDrafts = [];
        setupProgress = null;
        if (result.contestId) {
          await goto(`/contests/${result.contestId}`);
        }
        return;
      }

      if (result.status === 'partial') {
        success = translate('contest.wizard.messages.success');
        error = translate('contest.wizard.messages.partial');
        competitorDrafts = pendingDrafts(competitorDrafts, result.createdDraftIds);
        return;
      }

      error = result.failures[0]?.message ?? translate('contest.wizard.messages.error');
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
    resetTagDrafts();
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
  session={data.session}
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

          <ContestTagsForm
            title={$_('contest_edit.tags.title')}
            description={$_('contest_edit.tags.description')}
            mandatoryHint={$_('contest_edit.tags.mandatory_hint')}
            loadingMessage={$_('contest_edit.tags.loading')}
            emptyMessage={$_('contest_edit.tags.empty')}
            orderHint={$_('contest_edit.tags.new.order_hint')}
            labelFieldTitle={$_('contest_edit.tags.fields.label')}
            newTagFieldTitle={$_('contest_edit.tags.new.label')}
            rows={tagDraftRows}
            tagsLoading={false}
            tagsError={null}
            newTagLabel={newTagLabel}
            newTagPlaceholder={$_('contest_edit.tags.new.placeholder')}
            newTagError={newTagError}
            newTagDisabled={false}
            newTagSaving={false}
            actionLabels={{
              reset: '',
              save: '',
              saving: '',
              delete: $_('buttons.remove'),
              deleting: $_('contest_edit.tags.actions.deleting'),
            }}
            addButtonLabel={$_('contest_edit.tags.new.add')}
            addButtonLoadingLabel={$_('contest_edit.tags.new.saving')}
            resetButtonClass="btn-secondary px-3 py-1"
            saveButtonClass="btn-primary px-3 py-1"
            deleteButtonClass="btn-secondary px-3 py-1"
            addButtonClass="btn-secondary px-3 py-1"
            showNewTagForm={true}
            on:rowChange={handleTagRowChange}
            on:delete={({ detail }) => removeTagDraft(detail.id)}
            on:add={addTagDraft}
            on:newTagInput={({ detail }) => {
              newTagLabel = detail.value;
              newTagError = null;
            }}
          />

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
            <div class="flex flex-col gap-2 md:col-span-2">
              <span class="input-label flex items-center gap-2">
                {$_('competitor_modal.registration_fields.tags')}
                <span class="text-caption text-text-secondary uppercase tracking-[0.3em]">
                  {$_('competitor_modal.registration_fields.tags_hint')}
                </span>
              </span>
              {#if availableTagOptions.length > 0}
                <div class="flex flex-wrap gap-2">
                  {#each availableTagOptions as tagLabel}
                    {@const isSelected = competitorDraft.tags.includes(tagLabel)}
                    {@const isMandatoryTag = tagLabel.toLowerCase() === MANDATORY_TAG_KEY}
                    <button
                      type="button"
                      class={`px-3 py-2 border rounded-md text-sm transition ${isSelected ? 'border-primary-red bg-primary-red/10 text-text-primary' : 'border-border-color bg-element-bg text-text-secondary hover:text-text-primary'}`}
                      disabled={isMandatoryTag}
                      on:click={() => toggleCompetitorDraftTag(tagLabel, !isSelected)}
                    >
                      {tagLabel}
                    </button>
                  {/each}
                </div>
              {:else}
                <p class="text-caption text-text-secondary">{$_('competitor_modal.registration_fields.tags_empty')}</p>
              {/if}
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
                  {#if availableTagOptions.length > 0}
                    <div class="space-y-2">
                      <span class="text-xxs uppercase tracking-[0.3em] text-text-secondary">
                        {$_('competitor_modal.registration_fields.tags')}
                      </span>
                      <div class="flex flex-wrap gap-2">
                        {#each availableTagOptions as tagLabel}
                          {@const isSelected = competitor.tags.includes(tagLabel)}
                          {@const isMandatoryTag = tagLabel.toLowerCase() === MANDATORY_TAG_KEY}
                          <button
                            type="button"
                            class={`px-3 py-1 border rounded-md text-xxs uppercase tracking-[0.2em] transition ${isSelected ? 'border-primary-red bg-primary-red/10 text-text-primary' : 'border-border-color bg-element-bg text-text-secondary hover:text-text-primary'}`}
                            disabled={isMandatoryTag}
                            on:click={() => toggleSavedDraftTag(index, tagLabel, !isSelected)}
                          >
                            {tagLabel}
                          </button>
                        {/each}
                      </div>
                    </div>
                  {/if}
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
                {@const lifts = normaliseDraftEvents(competitor.lifts, form.events)}
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
