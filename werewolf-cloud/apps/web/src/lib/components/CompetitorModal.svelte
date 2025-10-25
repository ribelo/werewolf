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

  export let competitor: CompetitorSummary | null = null;
  export let registration: Registration | null = null;
  export let weightClasses: WeightClass[] = [];
  export let ageCategories: AgeCategory[] = [];
  export let mode: 'create' | 'edit' = 'create';
  export let contestId: string | null = null;
  export let contestTags: ContestTag[] = [];
  export let lifts: LiftType[] = ['Squat', 'Bench', 'Deadlift'];
  export let onClose: (result?: unknown) => void = () => {};
  export let onSaved: (result?: unknown) => void = () => {};

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
      const payload: { deletedCompetitorId: string; deletedRegistrationId?: string } = {
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
  let openingAttemptByLift: Record<LiftType, string> = { Squat: '', Bench: '', Deadlift: '' };
  let liveAgeCategoryName: string | null = registration?.ageCategoryName ?? null;

  $: contestDate = (get(currentContest)?.date ?? '').toString();
  let isDeleting = false;

  // competition order removed

  let form = {
    firstName: '',
    lastName: '',
    birthDate: '',
    gender: 'Male',
    club: '',
    city: '',
    notes: '',
  };

  if (competitor?.gender) {
    form.gender = competitor.gender;
  }

  type RegistrationFormState = {
    bodyweight: string;
    rackHeightSquat: string;
    rackHeightBench: string;
    weightClassId: string;
    ageCategoryId: string;
  };

  function createRegistrationForm(source: Registration | null): RegistrationFormState {
    return {
      bodyweight: source?.bodyweight != null ? String(source.bodyweight) : '',
      rackHeightSquat: source?.rackHeightSquat != null ? String(source.rackHeightSquat) : '',
      rackHeightBench: source?.rackHeightBench != null ? String(source.rackHeightBench) : '',
      weightClassId: source?.weightClassId ?? '',
      ageCategoryId: source?.ageCategoryId ?? '',
    };
  }

  let registrationForm: RegistrationFormState = createRegistrationForm(registration);
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
    if (registrationForm.weightClassId) {
      const option = weightClassOptions.find((item) => item.id === registrationForm.weightClassId);
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
    if (registrationForm.ageCategoryId) {
      const option = ageCategoryOptions.find((item) => item.id === registrationForm.ageCategoryId);
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
  $: if (registration && contestId) {
    loadOpeningAttempts();
  }

  onMount(async () => {
    if (mode === 'edit' && competitor) {
      await loadCompetitor(competitor.id);
    }
    if (registration) {
      await loadOpeningAttempts();
    }
  });

  async function loadCompetitor(id: string) {
    isLoading = true;
    error = null;
    try {
      const detailResp = await apiClient.get<CompetitorDetail>(`/competitors/${id}`);

      if (detailResp.data) {
        detail = detailResp.data;
        form = {
          firstName: detailResp.data.firstName ?? '',
          lastName: detailResp.data.lastName ?? '',
          birthDate: detailResp.data.birthDate ?? '',
          gender: detailResp.data.gender ?? 'Male',
          club: detailResp.data.club ?? '',
          city: detailResp.data.city ?? '',
          notes: detailResp.data.notes ?? '',
        };
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

  async function loadOpeningAttempts() {
    if (!registration || !contestId) return;
    
    try {
      const attemptsResp = await apiClient.get<Attempt[]>(`/contests/${contestId}/registrations/${registration.id}/attempts`);
      if (attemptsResp.data) {
        const attempts = attemptsResp.data;
        const updatedOpeningAttempts: Record<LiftType, string> = { Squat: '', Bench: '', Deadlift: '' };
        
        for (const attempt of attempts) {
          if (attempt.attemptNumber === 1 && selectedLifts.includes(attempt.liftType as LiftType)) {
            updatedOpeningAttempts[attempt.liftType as LiftType] = String(attempt.weight);
          }
        }
        
        openingAttemptByLift = updatedOpeningAttempts;
      }
    } catch (err) {
      // Silently fail - opening attempts will remain empty
      console.warn('Failed to load opening attempts:', err);
    }
  }

  function resetState() {
    if (competitor && detail) {
      form = {
        firstName: detail.firstName,
        lastName: detail.lastName,
        birthDate: detail.birthDate,
        gender: detail.gender,
        club: detail.club ?? '',
        city: detail.city ?? '',
        notes: detail.notes ?? '',
      };
      // competition order removed
      success = null;
      error = null;
    }
    resetRegistrationState();
  }

  function resetRegistrationState() {
    registrationForm = createRegistrationForm(registration);
    openingAttemptByLift = { Squat: '', Bench: '', Deadlift: '' };
    liveWeightClassName = registration?.weightClassName ?? null;
    liveAgeCategoryName = registration?.ageCategoryName ?? null;
  }

  function parseFloatInput(value: string): number | null {
    if (value === undefined || value === null) return null;
    const trimmed = value.toString().trim();
    if (trimmed === '') return null;
    const parsed = Number.parseFloat(trimmed.replace(',', '.'));
    return Number.isFinite(parsed) ? parsed : null;
  }

  function parseIntInput(value: string): number | null {
    if (value === undefined || value === null) return null;
    const trimmed = value.toString().trim();
    if (trimmed === '') return null;
    const parsed = Number.parseInt(trimmed, 10);
    return Number.isNaN(parsed) ? null : parsed;
  }

  function resolveGenderForClassification(): string | null {
    const candidates = [form.gender, registration?.gender, competitor?.gender];
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
  if (!Array.isArray(weightClasses) || weightClasses.length === 0) return;

  const weight = parseFloatInput(registrationForm.bodyweight);
  if (weight === null || weight <= 0) {
      return;
    }

    const gender = resolveGenderForClassification();
    if (!gender) return;

    const descriptors = weightClasses
      .filter((cls) => cls && (cls.id || cls.code))
      .map((cls) => ({
        id: cls.id ?? cls.code,
        code: cls.code,
        gender: cls.gender,
        minWeight: cls.minWeight,
        maxWeight: cls.maxWeight,
        sortOrder: cls.sortOrder ?? undefined,
      }));

    if (descriptors.length === 0) {
      return;
    }

    try {
      const fixedDescriptors = descriptors.map(d => ({ ...d, sortOrder: d.sortOrder ?? null }));
      const resolvedCode = determineWeightClass(weight, gender, fixedDescriptors);
      const normalisedGender = gender.toLowerCase().startsWith('f') ? 'female' : 'male';

      const match =
        weightClasses.find((cls) => {
          if (!cls) return false;
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

      if (nextId && registrationForm.weightClassId !== nextId) {
        registrationForm = {
          ...registrationForm,
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
      registrationForm = { ...registrationForm, rackHeightSquat: '' };
    }
    if (!selectedLifts.includes('Bench')) {
      registrationForm = { ...registrationForm, rackHeightBench: '' };
    }

    if (!selectedLifts.includes(lift)) {
      openingAttemptByLift = { ...openingAttemptByLift, [lift]: '' };
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
    if (!Array.isArray(ageCategories) || ageCategories.length === 0) return;
    const birth = (form.birthDate ?? '').toString().trim();
    const cDate = (contestDate ?? '').toString().trim();
    if (!birth || !cDate) return;

    const descriptors = ageCategories
      .filter((cat) => cat && (cat.id || cat.code))
      .map((cat) => ({
        id: cat.id ?? cat.code,
        code: cat.code,
        minAge: cat.minAge,
        maxAge: cat.maxAge,
        sortOrder: cat.sortOrder ?? undefined,
      }));
    if (descriptors.length === 0) return;

    try {
      const fixedDescriptors = descriptors.map(d => ({ ...d, sortOrder: d.sortOrder ?? null }));
      const resolvedCode = determineAgeCategory(birth, cDate, fixedDescriptors);
      const match = ageCategories.find((cat) => cat.code === resolvedCode || cat.id === resolvedCode);
      if (!match) return;
      const nextId = match.id ?? match.code;
      const nextName = match.name ?? match.code;
      if (nextId && registrationForm.ageCategoryId !== nextId) {
        registrationForm = { ...registrationForm, ageCategoryId: nextId };
      }
      if (nextName && liveAgeCategoryName !== nextName) {
        liveAgeCategoryName = nextName;
      }
    } catch (error) {
      console.warn('Failed to auto-assign age category', error);
    }
  }

  function validateForm(): boolean {
    if (!form.firstName.trim() || !form.lastName.trim()) {
      error = t('competitor_modal.status.validation.name_required');
      return false;
    }
    if (!form.birthDate) {
      error = t('competitor_modal.status.validation.birth_required');
      return false;
    }
    if (form.gender !== 'Male' && form.gender !== 'Female') {
      error = t('competitor_modal.status.validation.gender_invalid');
      return false;
    }
    const parsedBodyweight = parseFloatInput(registrationForm.bodyweight);
    if (parsedBodyweight !== null && parsedBodyweight <= 0) {
      error = t('competitor_modal.status.validation.bodyweight_positive');
      return false;
    }
    return true;
  }

  async function upsertOpeningAttempt(registrationId: string, liftType: LiftType, weight: number) {
    if (!contestId) return;
    await apiClient.post(`/contests/${contestId}/registrations/${registrationId}/attempts`, {
      registrationId,
      liftType,
      attemptNumber: 1,
      weight,
    });
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
    try {
      const payload = {
        firstName: form.firstName.trim(),
        lastName: form.lastName.trim(),
        birthDate: form.birthDate,
        gender: form.gender,
        club: form.club.trim() || null,
        city: form.city.trim() || null,
        notes: form.notes.trim() || null,
      };

      let targetId = competitor?.id ?? null;

      if (mode === 'create') {
        const response = await apiClient.post<{ id: string }>('/competitors', payload);
        if (response.error || !response.data) {
          throw new Error(response.error ?? 'Failed to create competitor');
        }
        targetId = response.data.id;
      } else if (mode === 'edit' && competitor) {
        const response = await apiClient.patch(`/competitors/${competitor.id}`, payload);
        if (response.error) {
          throw new Error(response.error);
        }
      }

      // competition order removed

      let updatedRegistration: Registration | null = registration;

      if (registration && mode === 'edit') {
        const bodyweightValue = parseFloatInput(registrationForm.bodyweight);
        if (bodyweightValue !== null && bodyweightValue <= 0) {
          throw new Error(t('competitor_modal.status.validation.bodyweight_positive'));
        }

        const registrationPayload: Record<string, unknown> = {
          bodyweight: bodyweightValue ?? null,
          rackHeightSquat: parseIntInput(registrationForm.rackHeightSquat),
          rackHeightBench: parseIntInput(registrationForm.rackHeightBench),
        };
        registrationPayload.lifts = [...selectedLifts];
        registrationPayload.labels = [...selectedTags];

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
        const bodyweightValue = parseFloatInput(registrationForm.bodyweight);

        const registrationPayload: Record<string, unknown> = {
          competitorId: targetId,
          bodyweight: bodyweightValue ?? null,
          rackHeightSquat: parseIntInput(registrationForm.rackHeightSquat),
          rackHeightBench: parseIntInput(registrationForm.rackHeightBench),
        };
        registrationPayload.lifts = [...selectedLifts];
        registrationPayload.labels = [...selectedTags];

        const response = await apiClient.post<Registration>(
          `/contests/${contestId}/registrations`,
          registrationPayload
        );
        if (response.error) {
          throw new Error(response.error);
        }

        if (response.data) {
          const next = { ...response.data } as Registration;
          next.firstName = form.firstName || '';
          next.lastName = form.lastName || '';
          next.gender = form.gender;
          next.club = form.club?.trim() || null;
          next.city = form.city?.trim() || null;
          next.lifts = next.lifts?.length ? next.lifts : [...selectedLifts];
          next.labels = response.data.labels ?? [...selectedTags];

          updatedRegistration = next;
          selectedTags = [...(next.labels ?? selectedTags)];
        }
      }

      if (contestId && updatedRegistration) {
        try {
          for (const lift of selectedLifts) {
            const raw = openingAttemptByLift[lift as LiftType] ?? '';
            const weight = parseFloatInput(raw);
            if (weight !== null && weight > 0) {
              await upsertOpeningAttempt(updatedRegistration.id, lift as LiftType, weight);
            }
          }
        } catch (err) {
          error = err instanceof Error ? err.message : t('competitor_modal.status.error_opening_attempt');
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
      error = err instanceof Error ? err.message : t('competitor_modal.status.error_save');
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
            bind:value={form.firstName}
            autocomplete="given-name"
            required
          />
        </label>
        <label class="flex flex-col gap-2">
          <span class="input-label">{t('competitor_modal.fields.last_name')} *</span>
          <input
            class="input-field"
            bind:value={form.lastName}
            autocomplete="family-name"
            required
          />
        </label>
        <label class="flex flex-col gap-2">
          <span class="input-label">{t('competitor_modal.fields.birth_date')} *</span>
          <input
            class="input-field"
            type="date"
            bind:value={form.birthDate}
            on:input={autoAssignAgeCategory}
            required
          />
        </label>
        <label class="flex flex-col gap-2">
          <span class="input-label">{t('competitor_modal.fields.gender')} *</span>
          <select class="input-field" bind:value={form.gender} on:change={handleGenderChange}>
            {#each genderOptions as option}
              <option value={option}>{genderLabel(option)}</option>
            {/each}
          </select>
        </label>
        <label class="flex flex-col gap-2">
          <span class="input-label">{t('competitor_modal.fields.club')}</span>
          <input class="input-field" bind:value={form.club} placeholder={t('competitor_modal.placeholders.club')} />
        </label>
        <label class="flex flex-col gap-2">
          <span class="input-label">{t('competitor_modal.fields.city')}</span>
          <input class="input-field" bind:value={form.city} placeholder={t('competitor_modal.placeholders.city')} />
        </label>
      </div>

      <label class="flex flex-col gap-2">
        <span class="input-label">{t('competitor_modal.fields.notes')}</span>
        <textarea class="input-field" rows={3} bind:value={form.notes}></textarea>
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
                bind:value={registrationForm.bodyweight}
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
                  bind:value={registrationForm.rackHeightSquat}
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
                bind:value={registrationForm.rackHeightBench}
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
                      bind:value={openingAttemptByLift[lift]}
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
          <button type="button" class="btn-secondary px-4 py-2" on:click={onClose} disabled={isSaving || isDeleting}>
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
