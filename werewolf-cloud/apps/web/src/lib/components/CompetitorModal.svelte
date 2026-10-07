<script lang="ts">
  import { onMount } from 'svelte';
  import { apiClient } from '$lib/api';
  import { normaliseAgeCategoryLabel } from '$lib/utils';
  import type {
    CompetitorSummary,
    CompetitorDetail,
    Registration,
    WeightClass,
    AgeCategory,
    LiftType,
    Attempt,
    ContestTag,
  } from '$lib/types';
  import { get } from 'svelte/store';
  import { _ } from 'svelte-i18n';
  import { determineAgeCategory, determineWeightClass } from '@werewolf/domain';
  import { currentContest } from '$lib/ui/contest-store';
  import {
    buildCompetitorPayload,
    buildRegistrationPayload,
    competitorDraftFromDetail,
    createEmptyCompetitorDraft,
    createOpeningAttempts,
    createRegistrationDraft,
    openingAttemptsFromAttempts,
    parseFloatInput,
    parseIntInput,
    toAgeCategoryDescriptors,
    toWeightClassDescriptors,
    type CompetitorDraft,
    type CompetitorModalResult,
    type OpeningAttempts,
    type OpeningAttemptPayload,
    type RegistrationCreatePayload,
    type RegistrationDraft,
  } from '$lib/components/competitor-modal-model';

  export let competitor: CompetitorSummary | null = null;
  export let registration: Registration | null = null;
  export let weightClasses: WeightClass[] = [];
  export let ageCategories: AgeCategory[] = [];
  export let mode: 'create' | 'edit' = 'create';
  export let contestId: string | null = null;
  export let contestTags: ContestTag[] = [];
  export let lifts: LiftType[] = ['Squat', 'Bench', 'Deadlift'];
  export let onClose: (result?: CompetitorModalResult) => void = () => {};
  export let onSaved: (result?: CompetitorModalResult) => void = () => {};

  const genderOptions = ['Male', 'Female'] as const;
  type GenderOption = (typeof genderOptions)[number];

  const DEFAULT_LIFTS: LiftType[] = ['Squat', 'Bench', 'Deadlift'];
  const MANDATORY_TAG_LABEL = 'Open';
  let sortedContestTags: ContestTag[] = [];
  $: {
    const input = Array.isArray(contestTags) ? contestTags : [];
    sortedContestTags = [...input].sort((a, b) => {
      const aTime = Date.parse(a.createdAt);
      const bTime = Date.parse(b.createdAt);
      const aValid = Number.isFinite(aTime);
      const bValid = Number.isFinite(bTime);
      if (aValid && bValid && aTime !== bTime) {
        return aTime - bTime;
      }
      if (aValid && !bValid) return -1;
      if (!aValid && bValid) return 1;
      return a.label.localeCompare(b.label);
    });
  }
  let availableLifts: LiftType[] = [...DEFAULT_LIFTS];
  let selectedLifts: LiftType[] = [...DEFAULT_LIFTS];
  let initialisedRegistrationId: string | null = null;

  function liftsEqualLocal(a: readonly LiftType[], b: readonly LiftType[]): boolean {
    if (a.length !== b.length) return false;
    return a.every((lift, index) => lift === b[index]);
  }

  function normaliseSelectableLifts(source?: readonly LiftType[] | null): LiftType[] {
    const allowed = availableLifts;
    if (!Array.isArray(source) || source.length === 0) {
      return [...allowed];
    }
    const allowedSet = new Set(allowed);
    const filtered = source.filter((lift): lift is LiftType => allowedSet.has(lift));
    if (filtered.length === 0) {
      return [...allowed];
    }
    return allowed.filter((lift) => filtered.includes(lift));
  }

  $: availableLifts = (Array.isArray(lifts) && lifts.length > 0 ? lifts : DEFAULT_LIFTS)
    .filter((lift, index, array) => array.indexOf(lift) === index) as LiftType[];

  $: if (availableLifts.length > 0) {
    const targetId = registration?.id ?? null;
    if (initialisedRegistrationId !== targetId) {
      selectedLifts = normaliseSelectableLifts(registration?.lifts ?? null);
      initialisedRegistrationId = targetId;
    } else {
      const filtered = normaliseSelectableLifts(selectedLifts);
      if (!liftsEqualLocal(filtered, selectedLifts)) {
        selectedLifts = filtered;
      }
    }
  }

  function resolveInitialTags(source: Registration | null): string[] {
    if (source?.labels && source.labels.length > 0) {
      return [...source.labels];
    }
    if (sortedContestTags.some((tag) => tag.label === MANDATORY_TAG_LABEL)) {
      return [MANDATORY_TAG_LABEL];
    }
    return [];
  }

  let selectedTags: string[] = resolveInitialTags(registration);
  let tagsInitialisedFor: string | null = registration?.id ?? '__create__';

  $: {
    const key = registration?.id ?? '__create__';
    if (key !== tagsInitialisedFor) {
      selectedTags = resolveInitialTags(registration);
      tagsInitialisedFor = key;
    }
  }

  $: {
    const allowed = new Set(sortedContestTags.map((tag) => tag.label));
    const filtered = selectedTags.filter((label) => allowed.has(label));
    if (filtered.length !== selectedTags.length) {
      selectedTags = filtered;
    }
  }

  $: if (!registration && selectedTags.length === 0 && sortedContestTags.some((tag) => tag.label === MANDATORY_TAG_LABEL)) {
    selectedTags = [MANDATORY_TAG_LABEL];
  }

  function handleTagToggle(label: string, checked: boolean) {
    if (checked) {
      if (!selectedTags.includes(label)) {
        selectedTags = [...selectedTags, label];
      }
    } else {
      selectedTags = selectedTags.filter((item) => item !== label);
    }
  }

  type MessageValues = Record<string, string | number | boolean | Date | null | undefined>;

  function t(key: string, values?: MessageValues): string {
    const translate = get(_);
    return translate(key, values ? { values } : undefined);
  }

  async function handleDelete() {
    if (!competitor) return;
    const confirmed =
      typeof window === 'undefined'
        ? true
        : window.confirm(t('competitor_modal.actions.confirm_delete'));

    if (!confirmed) {
      return;
    }

    isDeleting = true;
    error = null;
    try {
      await apiClient.delete<{ success: boolean }>(`/competitors/${competitor.id}`);
      const payload: CompetitorModalResult = {
        deletedCompetitorId: competitor.id,
      };
      if (registration?.id) {
        payload.deletedRegistrationId = registration.id;
      }
      onClose(payload);
    } catch (err) {
      error = err instanceof Error ? err.message : t('competitor_modal.status.error_delete');
    } finally {
      isDeleting = false;
    }
  }

  function genderLabel(option: GenderOption): string {
    return option === 'Male'
      ? t('competitor_modal.gender.male')
      : t('competitor_modal.gender.female');
  }

  let detail: CompetitorDetail | null = null;
  let isLoading = false;
  let isSaving = false;
  let error: string | null = null;
  let success: string | null = null;
  let isDeleting = false;

  let competitorDraft: CompetitorDraft = createEmptyCompetitorDraft();
  if (competitor?.gender) {
    competitorDraft = { ...competitorDraft, gender: competitor.gender };
  }

  let registrationDraft: RegistrationDraft = createRegistrationDraft(registration);
  let openingAttempts: OpeningAttempts = createOpeningAttempts();

  let contestDate = '';
  $: contestDate = $currentContest?.date ?? '';

  let liveAgeCategoryName: string | null = registration?.ageCategoryName ?? null;

  // competition order removed

  type SelectOption = { id: string; label: string };
  let weightClassOptions: SelectOption[] = [];
  let ageCategoryOptions: SelectOption[] = [];
  let showRegistrationSection = false;
  let weightClassDisplay = '';
  let ageCategoryDisplay = '';
  let liveWeightClassName: string | null = registration?.weightClassName ?? null;

  $: weightClassOptions = (() => {
    const map = new Map<string, string>();
    for (const entry of weightClasses) {
      if (!entry) continue;
      const id = entry.id ?? entry.code ?? '';
      if (!id) continue;
      const label = entry.name ?? entry.code ?? id;
      if (!map.has(id)) {
        map.set(id, label);
      }
    }
    if (registration?.weightClassId && registration?.weightClassName && !map.has(registration.weightClassId)) {
      map.set(registration.weightClassId, registration.weightClassName);
    }
    return Array.from(map.entries()).map(([id, label]) => ({ id, label }));
  })();

  $: ageCategoryOptions = (() => {
    const map = new Map<string, string>();
    for (const entry of ageCategories) {
      if (!entry) continue;
      const id = entry.id ?? entry.code ?? '';
      if (!id) continue;
      const rawLabel = normaliseAgeCategoryLabel(entry.name, entry.code) || entry.code || id;
      const label = rawLabel.toLowerCase() === 'senior'
        ? t('contest_detail.registrations.filters.age_senior')
        : rawLabel;
      if (!map.has(id)) {
        map.set(id, label);
      }
    }
    if (registration?.ageCategoryId && registration?.ageCategoryName && !map.has(registration.ageCategoryId)) {
      const rawLabel = normaliseAgeCategoryLabel(registration.ageCategoryName, registration.ageCategoryId) || registration.ageCategoryName;
      const label = rawLabel && rawLabel.toLowerCase() === 'senior'
        ? t('contest_detail.registrations.filters.age_senior')
        : rawLabel;
      map.set(registration.ageCategoryId, label ?? registration.ageCategoryName ?? registration.ageCategoryId);
    }
    return Array.from(map.entries()).map(([id, label]) => ({ id, label }));
  })();

  $: showRegistrationSection = mode === 'edit'
    ? Boolean(registration)
    : Boolean(contestId);

  $: weightClassDisplay = (() => {
    if (registrationDraft.weightClassId) {
      const option = weightClassOptions.find((item) => item.id === registrationDraft.weightClassId);
      if (option) {
        return option.label;
      }
      if (liveWeightClassName) {
        return liveWeightClassName;
      }
    }
    if (liveWeightClassName) {
      return liveWeightClassName;
    }
    if (registration?.weightClassName) {
      return registration.weightClassName;
    }
    if (mode === 'edit') {
      return t('competitor_modal.registration_fields.weight_class_auto_assigned');
    }
    return t('competitor_modal.registration_fields.weight_class_pending');
  })();

  $: ageCategoryDisplay = (() => {
    if (registrationDraft.ageCategoryId) {
      const option = ageCategoryOptions.find((item) => item.id === registrationDraft.ageCategoryId);
      if (option) return option.label;
      if (liveAgeCategoryName) return liveAgeCategoryName;
    }
    if (liveAgeCategoryName) return liveAgeCategoryName;
    if (registration?.ageCategoryName) return registration.ageCategoryName;
    if (mode === 'edit') return t('competitor_modal.registration_fields.age_category_auto_assigned');
    return t('competitor_modal.registration_fields.age_category_pending');
  })();

  function liftLabel(lift: LiftType): string {
    const key = `contest_table.lifts.${lift.toLowerCase()}`;
    const translated = t(key);
    return translated === key ? lift : translated;
  }

  $: if (showRegistrationSection && weightClasses.length > 0) {
    autoAssignWeightClass();
  }
  $: if (showRegistrationSection && ageCategories.length > 0) {
    autoAssignAgeCategory();
  }

  // Opening attempts are loaded once per registration: this reactive block is the
  // only trigger, so mounting the modal never fires the request twice.
  let openingAttemptsRequest = 0;
  let openingAttemptsLoadedFor: string | null = null;

  $: if (registration?.id && contestId && openingAttemptsLoadedFor !== registration.id) {
    openingAttemptsLoadedFor = registration.id;
    void loadOpeningAttempts(registration.id);
  }

  onMount(async () => {
    if (mode === 'edit' && competitor) {
      await loadCompetitor(competitor.id);
    }
  });

  async function loadCompetitor(id: string) {
    isLoading = true;
    error = null;
    try {
      const detailResp = await apiClient.get<CompetitorDetail>(`/competitors/${id}`);

      if (detailResp.data) {
        detail = detailResp.data;
        competitorDraft = competitorDraftFromDetail(detailResp.data);
        // competition order removed
      } else if (detailResp.error) {
        error = detailResp.error;
      }
    } catch (err) {
      error = err instanceof Error ? err.message : t('competitor_modal.status.error_load');
    } finally {
      isLoading = false;
    }
  }

  async function loadOpeningAttempts(registrationId: string) {
    if (!contestId) return;

    const request = ++openingAttemptsRequest;
    try {
      const attemptsResp = await apiClient.get<Attempt[]>(
        `/contests/${contestId}/registrations/${registrationId}/attempts`,
      );
      // A response that arrives after the modal switched to another registration
      // must not overwrite the attempts the operator is looking at.
      if (request !== openingAttemptsRequest || registration?.id !== registrationId) {
        return;
      }
      openingAttempts = openingAttemptsFromAttempts(attemptsResp.data ?? [], selectedLifts);
    } catch (err) {
      if (request !== openingAttemptsRequest) {
        return;
      }
      // Silently fail - opening attempts will remain empty
      console.warn('Failed to load opening attempts:', err);
    }
  }

  function resetState() {
    if (competitor && detail) {
      competitorDraft = competitorDraftFromDetail(detail);
      // competition order removed
      success = null;
      error = null;
    }
    resetRegistrationState();
  }

  function resetRegistrationState() {
    registrationDraft = createRegistrationDraft(registration);
    openingAttempts = createOpeningAttempts();
    liveWeightClassName = registration?.weightClassName ?? null;
    liveAgeCategoryName = registration?.ageCategoryName ?? null;
  }

  function resolveGenderForClassification(): string | null {
    const candidates = [competitorDraft.gender, registration?.gender, competitor?.gender];
    for (const candidate of candidates) {
      if (!candidate) continue;
      const trimmed = candidate.toString().trim();
      if (!trimmed) continue;
      const lower = trimmed.toLowerCase();
      if (lower.startsWith('f')) return 'Female';
      if (lower.startsWith('m')) return 'Male';
    }
    return null;
  }

  function autoAssignWeightClass() {
    if (!showRegistrationSection) return;

    const weight = parseFloatInput(registrationDraft.bodyweight);
    if (weight === null || weight <= 0) {
      return;
    }

    const gender = resolveGenderForClassification();
    if (!gender) return;

    const descriptors = toWeightClassDescriptors(weightClasses);
    if (descriptors.length === 0) {
      return;
    }

    try {
      const resolvedCode = determineWeightClass(weight, gender, descriptors);
      const normalisedGender = gender.toLowerCase().startsWith('f') ? 'female' : 'male';

      const match =
        weightClasses.find((cls) => {
          const sameCode = cls.code === resolvedCode || cls.id === resolvedCode;
          if (!sameCode) return false;
          const clsGender = (cls.gender ?? '').toLowerCase();
          if (clsGender && clsGender !== normalisedGender) {
            return false;
          }
          return true;
        }) ?? weightClasses.find((cls) => cls.code === resolvedCode);

      if (!match) {
        return;
      }

      const nextId = match.id ?? match.code;
      const nextName = match.name ?? match.code;

      if (nextId && registrationDraft.weightClassId !== nextId) {
        registrationDraft = {
          ...registrationDraft,
          weightClassId: nextId,
        };
      }

      if (nextName && liveWeightClassName !== nextName) {
        liveWeightClassName = nextName;
      }
    } catch (error) {
      console.warn('Failed to auto-assign weight class', error);
    }
  }

  function toggleLift(lift: LiftType) {
    if (!availableLifts.includes(lift)) {
      return;
    }

    if (selectedLifts.includes(lift)) {
      if (selectedLifts.length === 1) {
        return;
      }
      const next = selectedLifts.filter((entry) => entry !== lift);
      selectedLifts = availableLifts.filter((entry) => next.includes(entry));
    } else {
      const next = [...selectedLifts, lift];
      selectedLifts = availableLifts.filter((entry) => next.includes(entry));
    }

    if (!selectedLifts.includes('Squat')) {
      registrationDraft = { ...registrationDraft, rackHeightSquat: '' };
    }
    if (!selectedLifts.includes('Bench')) {
      registrationDraft = { ...registrationDraft, rackHeightBench: '' };
    }

    if (!selectedLifts.includes(lift)) {
      openingAttempts = { ...openingAttempts, [lift]: '' };
    }
  }

  function handleBodyweightInput() {
    autoAssignWeightClass();
  }

  function handleGenderChange() {
    autoAssignWeightClass();
  }

  function autoAssignAgeCategory() {
    if (!showRegistrationSection) return;
    const birth = competitorDraft.birthDate.trim();
    const cDate = contestDate.trim();
    if (!birth || !cDate) return;

    const descriptors = toAgeCategoryDescriptors(ageCategories);
    if (descriptors.length === 0) return;

    try {
      const resolvedCode = determineAgeCategory(birth, cDate, descriptors);
      const match = ageCategories.find((cat) => cat.code === resolvedCode || cat.id === resolvedCode);
      if (!match) return;
      const nextId = match.id ?? match.code;
      const nextName = match.name ?? match.code;
      if (nextId && registrationDraft.ageCategoryId !== nextId) {
        registrationDraft = { ...registrationDraft, ageCategoryId: nextId };
      }
      if (nextName && liveAgeCategoryName !== nextName) {
        liveAgeCategoryName = nextName;
      }
    } catch (error) {
      console.warn('Failed to auto-assign age category', error);
    }
  }

  function validateForm(): boolean {
    if (!competitorDraft.firstName.trim() || !competitorDraft.lastName.trim()) {
      error = t('competitor_modal.status.validation.name_required');
      return false;
    }
    if (!competitorDraft.birthDate) {
      error = t('competitor_modal.status.validation.birth_required');
      return false;
    }
    if (competitorDraft.gender !== 'Male' && competitorDraft.gender !== 'Female') {
      error = t('competitor_modal.status.validation.gender_invalid');
      return false;
    }
    const parsedBodyweight = parseFloatInput(registrationDraft.bodyweight);
    if (parsedBodyweight !== null && parsedBodyweight <= 0) {
      error = t('competitor_modal.status.validation.bodyweight_positive');
      return false;
    }
    return true;
  }

  async function upsertOpeningAttempt(registrationId: string, liftType: LiftType, weight: number) {
    if (!contestId) return;
    const payload: OpeningAttemptPayload = {
      registrationId,
      liftType,
      attemptNumber: 1,
      weight,
    };
    await apiClient.post(`/contests/${contestId}/registrations/${registrationId}/attempts`, payload);
  }

  async function handleSubmit() {
    error = null;
    success = null;

    if (!validateForm()) {
      return;
    }

    if (selectedLifts.length === 0) {
      error = t('competitor_modal.status.validation.lifts_required');
      return;
    }

    isSaving = true;
    let competitorSaved = false;
    try {
      const payload = buildCompetitorPayload(competitorDraft);

      let targetId = competitor?.id ?? null;

      if (mode === 'create') {
        const response = await apiClient.post<{ id: string }>('/competitors', payload);
        if (response.error || !response.data) {
          throw new Error(response.error ?? 'Failed to create competitor');
        }
        targetId = response.data.id;
        competitorSaved = true;
      } else if (mode === 'edit' && competitor) {
        const response = await apiClient.patch(`/competitors/${competitor.id}`, payload);
        if (response.error) {
          throw new Error(response.error);
        }
        competitorSaved = true;
      }

      // competition order removed

      let updatedRegistration: Registration | null = registration;

      if (registration && mode === 'edit') {
        const bodyweightValue = parseFloatInput(registrationDraft.bodyweight);
        if (bodyweightValue !== null && bodyweightValue <= 0) {
          throw new Error(t('competitor_modal.status.validation.bodyweight_positive'));
        }

        const registrationPayload = buildRegistrationPayload(
          registrationDraft,
          selectedLifts,
          selectedTags,
        );

        const response = await apiClient.patch<Registration>(
          `/registrations/${registration.id}`,
          registrationPayload
        );
        if (response.error) {
          throw new Error(response.error);
        }
        updatedRegistration = response.data ?? updatedRegistration;
        if (updatedRegistration) {
          updatedRegistration.lifts = updatedRegistration.lifts?.length ? updatedRegistration.lifts : [...selectedLifts];
          updatedRegistration.labels = response.data?.labels ?? [...selectedTags];
        }
        selectedTags = updatedRegistration?.labels ?? [...selectedTags];
      }

      if (!registration && mode === 'create' && contestId && targetId) {
        const registrationPayload: RegistrationCreatePayload = {
          competitorId: targetId,
          ...buildRegistrationPayload(registrationDraft, selectedLifts, selectedTags),
        };

        const response = await apiClient.post<Registration>(
          `/contests/${contestId}/registrations`,
          registrationPayload
        );
        if (response.error) {
          throw new Error(response.error);
        }

        if (response.data) {
          const club = competitorDraft.club.trim();
          const city = competitorDraft.city.trim();
          const next: Registration = {
            ...response.data,
            firstName: competitorDraft.firstName,
            lastName: competitorDraft.lastName,
            gender: competitorDraft.gender,
            lifts: response.data.lifts?.length ? response.data.lifts : [...selectedLifts],
            labels: response.data.labels ?? [...selectedTags],
          };
          if (club) {
            next.club = club;
          } else {
            delete next.club;
          }
          if (city) {
            next.city = city;
          } else {
            delete next.city;
          }

          updatedRegistration = next;
          selectedTags = [...(next.labels ?? selectedTags)];
        }
      }

      if (contestId && updatedRegistration) {
        try {
          for (const lift of selectedLifts) {
            const weight = parseFloatInput(openingAttempts[lift]);
            if (weight !== null && weight > 0) {
              await upsertOpeningAttempt(updatedRegistration.id, lift, weight);
            }
          }
        } catch (err) {
          const detail = err instanceof Error ? err.message : t('competitor_modal.status.error_opening_attempt');
          error = t('competitor_modal.status.error_registration_saved_attempts_failed', {
            message: detail,
          });
          isSaving = false;
          return;
        }
      }

      const resultPayload: { registration?: Registration } = {};
      if (updatedRegistration) {
        resultPayload.registration = updatedRegistration;
      }

      success =
        mode === 'create'
          ? t('competitor_modal.status.success_create')
          : t('competitor_modal.status.success_update');

      if (typeof onSaved === 'function') {
        onSaved(resultPayload);
      }

      onClose(resultPayload);
    } catch (err) {
      const message = err instanceof Error ? err.message : t('competitor_modal.status.error_save');
      error = competitorSaved
        ? t('competitor_modal.status.error_competitor_saved_registration_failed', { message })
        : message;
    } finally {
      isSaving = false;
    }
  }

</script>

<div class="space-y-6">
  {#if detail && mode === 'edit'}
    <p class="text-caption text-text-secondary uppercase tracking-[0.3em]">
      {t('competitor_modal.metadata.updated', {
        timestamp: new Date(detail.updatedAt).toLocaleString()
      })}
    </p>
  {/if}

  {#if error}
    <div class="bg-status-error/20 border border-status-error text-status-error px-4 py-2 text-sm">
      {error}
    </div>
  {/if}

  {#if success}
    <div class="bg-status-success/20 border border-status-success text-green-100 px-4 py-2 text-sm">
      {success}
    </div>
  {/if}

  {#if isLoading}
    <div class="py-12 text-center text-text-secondary text-body">
      {t('competitor_modal.status.loading')}
    </div>
  {:else}
    <form class="space-y-6" on:submit|preventDefault={handleSubmit}>
      <div class="grid gap-4 md:grid-cols-2">
        <label class="flex flex-col gap-2">
          <span class="input-label">{t('competitor_modal.fields.first_name')} *</span>
          <input
            class="input-field"
            bind:value={competitorDraft.firstName}
            autocomplete="given-name"
            required
          />
        </label>
        <label class="flex flex-col gap-2">
          <span class="input-label">{t('competitor_modal.fields.last_name')} *</span>
          <input
            class="input-field"
            bind:value={competitorDraft.lastName}
            autocomplete="family-name"
            required
          />
        </label>
        <label class="flex flex-col gap-2">
          <span class="input-label">{t('competitor_modal.fields.birth_date')} *</span>
          <input
            class="input-field"
            type="date"
            bind:value={competitorDraft.birthDate}
            on:input={autoAssignAgeCategory}
            required
          />
        </label>
        <label class="flex flex-col gap-2">
          <span class="input-label">{t('competitor_modal.fields.gender')} *</span>
          <select class="input-field" bind:value={competitorDraft.gender} on:change={handleGenderChange}>
            {#each genderOptions as option}
              <option value={option}>{genderLabel(option)}</option>
            {/each}
          </select>
        </label>
        <label class="flex flex-col gap-2">
          <span class="input-label">{t('competitor_modal.fields.club')}</span>
          <input class="input-field" bind:value={competitorDraft.club} placeholder={t('competitor_modal.placeholders.club')} />
        </label>
        <label class="flex flex-col gap-2">
          <span class="input-label">{t('competitor_modal.fields.city')}</span>
          <input class="input-field" bind:value={competitorDraft.city} placeholder={t('competitor_modal.placeholders.city')} />
        </label>
      </div>

      <label class="flex flex-col gap-2">
        <span class="input-label">{t('competitor_modal.fields.notes')}</span>
        <textarea class="input-field" rows={3} bind:value={competitorDraft.notes}></textarea>
      </label>

      {#if showRegistrationSection}
        <section class="space-y-4">
          <div>
            <h3 class="text-label text-text-secondary">{t('competitor_modal.registration.title')}</h3>
            <p class="text-caption text-text-secondary">{t('competitor_modal.registration.subtitle')}</p>
          </div>

          <div class="grid gap-4 md:grid-cols-2">
            <label class="flex flex-col gap-2">
              <span class="input-label">{t('competitor_modal.registration_fields.bodyweight')}</span>
              <input
                class="input-field"
                type="number"
                step="0.1"
                min="0"
                bind:value={registrationDraft.bodyweight}
                on:input={handleBodyweightInput}
              />
            </label>
            <div class="flex flex-col gap-2">
              <span class="input-label flex items-center gap-2">
                {t('competitor_modal.registration_fields.weight_class')}
                <span class="text-caption text-text-secondary uppercase tracking-[0.3em]">
                  {t('competitor_modal.registration_fields.auto_chip')}
                </span>
              </span>
              <div class="input-field bg-element-bg/60 text-text-secondary">
                {weightClassDisplay}
              </div>
            </div>
            <div class="flex flex-col gap-2">
              <span class="input-label flex items-center gap-2">
                {t('competitor_modal.registration_fields.age_category')}
                <span class="text-caption text-text-secondary uppercase tracking-[0.3em]">
                  {t('competitor_modal.registration_fields.auto_chip')}
                </span>
              </span>
              <div class="input-field bg-element-bg/60 text-text-secondary">
                {ageCategoryDisplay}
              </div>
            </div>
            <div class="flex flex-col gap-2 md:col-span-2">
              <span class="input-label flex items-center gap-2">
                {t('competitor_modal.registration_fields.tags')}
                <span class="text-caption text-text-secondary uppercase tracking-[0.3em]">
                  {t('competitor_modal.registration_fields.tags_hint')}
                </span>
              </span>
              {#if sortedContestTags.length > 0}
                <div class="flex flex-wrap gap-2">
                  {#each sortedContestTags as tag}
                    <label class={`px-3 py-2 border rounded-md cursor-pointer transition ${selectedTags.includes(tag.label) ? 'border-primary-red bg-primary-red/10 text-text-primary' : 'border-border-color bg-element-bg text-text-secondary hover:text-text-primary'}`}>
                      <input
                        type="checkbox"
                        class="hidden"
                        checked={selectedTags.includes(tag.label)}
                        on:change={(event) => handleTagToggle(tag.label, event.currentTarget.checked)}
                      />
                      {tag.label}
                    </label>
                  {/each}
                </div>
              {:else}
                <p class="text-caption text-text-secondary">{t('competitor_modal.registration_fields.tags_empty')}</p>
              {/if}
            </div>

            <div class="flex flex-col gap-2 md:col-span-2">
              <span class="input-label">{t('competitor_modal.registration_fields.lifts')}</span>
              <div class="flex flex-wrap gap-2">
                {#each availableLifts as lift}
                  <label class={`px-3 py-2 border rounded-md cursor-pointer transition ${selectedLifts.includes(lift) ? 'border-primary-red bg-primary-red/10 text-text-primary' : 'border-border-color bg-element-bg text-text-secondary hover:text-text-primary'}`}>
                    <input
                      type="checkbox"
                      class="hidden"
                      checked={selectedLifts.includes(lift)}
                      on:change={() => toggleLift(lift)}
                    />
                    {liftLabel(lift)}
                  </label>
                {/each}
              </div>
              <p class="text-caption text-text-secondary">{t('competitor_modal.registration_fields.lifts_hint')}</p>
            </div>
            {#if availableLifts.includes('Squat')}
              <label class="flex flex-col gap-2">
                <span class="input-label">{t('competitor_modal.registration_fields.rack_squat')}</span>
                <input
                  class="input-field"
                  type="number"
                  step="1"
                  min="0"
                  bind:value={registrationDraft.rackHeightSquat}
                  disabled={!selectedLifts.includes('Squat')}
                />
              </label>
            {/if}
            <label class="flex flex-col gap-2">
              <span class="input-label">{t('competitor_modal.registration_fields.rack_bench')}</span>
              <input
                class="input-field"
                type="number"
                step="1"
                min="0"
                bind:value={registrationDraft.rackHeightBench}
                disabled={!selectedLifts.includes('Bench')}
              />
            </label>
            {#if contestId}
              <div class="grid gap-4">
                {#each selectedLifts as lift}
                  <label class="flex flex-col gap-2">
                    <span class="input-label">{t('competitor_modal.registration_fields.opening_attempt', { lift: liftLabel(lift) })}</span>
                    <input
                      class="input-field"
                      type="number"
                      step="0.5"
                      min="0"
                      bind:value={openingAttempts[lift]}
                    />
                  </label>
                {/each}
              </div>
            {/if}
          </div>
        </section>
      {/if}

<!-- Competition order removed -->

      {#if mode === 'edit' && competitor}
        <div class="rounded-lg border border-status-error/40 bg-status-error/10 px-4 py-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p class="text-caption text-status-error uppercase tracking-[0.3em]">
              {t('competitor_modal.danger_zone.title')}
            </p>
            <p class="text-body text-text-secondary">
              {t('competitor_modal.danger_zone.description')}
            </p>
          </div>
          <button
            type="button"
            class="btn-danger px-4 py-2"
            on:click={handleDelete}
            disabled={isDeleting || isSaving}
          >
            {isDeleting ? t('competitor_modal.actions.deleting') : t('competitor_modal.actions.delete')}
          </button>
        </div>
      {/if}

      <div class="flex items-center justify-between">
        <div class="space-x-3">
          <button
            type="button"
            class="btn-secondary px-4 py-2"
            on:click={() => (mode === 'edit' ? resetState() : onClose())}
            disabled={isSaving || isDeleting}
          >
            {mode === 'edit' ? t('competitor_modal.actions.reset') : t('competitor_modal.actions.cancel')}
          </button>
          <button type="button" class="btn-secondary px-4 py-2" on:click={() => onClose()} disabled={isSaving || isDeleting}>
            {t('competitor_modal.actions.close')}
          </button>
        </div>
        <button type="submit" class="btn-primary px-6 py-2" disabled={isSaving || isDeleting}>
          {isSaving
            ? t('competitor_modal.actions.saving')
            : mode === 'create'
              ? t('competitor_modal.actions.create')
              : t('competitor_modal.actions.save')}
        </button>
      </div>
    </form>
  {/if}
</div>
