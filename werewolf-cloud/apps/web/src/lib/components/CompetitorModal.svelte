<script lang="ts">
  import { onMount } from 'svelte';
  import { apiClient } from '$lib/api';
  import { normaliseAgeCategoryLabel } from '$lib/utils';
  import type {
    CompetitorSummary,
    CompetitorDetail,
    Registration,
    WeightClass,
    AgeCategory
  } from '$lib/types';
  import { get } from 'svelte/store';
  import { _ } from 'svelte-i18n';

  export let competitor: CompetitorSummary | null = null;
  export let registration: Registration | null = null;
  export let weightClasses: WeightClass[] = [];
  export let ageCategories: AgeCategory[] = [];
export let mode: 'create' | 'edit' = 'create';
export let contestId: string | null = null;
  export let onClose: (result?: unknown) => void = () => {};
  export let onSaved: (result?: unknown) => void = () => {};

  const genderOptions = ['Male', 'Female'] as const;
  type GenderOption = (typeof genderOptions)[number];

  type MessageValues = Record<string, string | number | boolean | Date | null | undefined>;

  function t(key: string, values?: MessageValues): string {
    const translate = get(_);
    return translate(key, values ? { values } : undefined);
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

  let reorderValue: number | null = null;

  let form = {
    firstName: '',
    lastName: '',
    birthDate: '',
    gender: 'Male',
    club: '',
    city: '',
    notes: '',
  };

  type RegistrationFormState = {
    bodyweight: string;
    lotNumber: string;
    personalRecordAtEntry: string;
    rackHeightSquat: string;
    rackHeightBench: string;
    equipmentM: boolean;
    equipmentSm: boolean;
    equipmentT: boolean;
    weightClassId: string;
    ageCategoryId: string;
  };

  const parseFlag = (value: unknown): boolean => {
    if (typeof value === 'boolean') return value;
    if (typeof value === 'number') return value !== 0;
    if (typeof value === 'string') {
      const normalised = value.trim().toLowerCase();
      return normalised === 'true' || normalised === '1';
    }
    return false;
  };

  function createRegistrationForm(source: Registration | null): RegistrationFormState {
    return {
      bodyweight: source?.bodyweight != null ? String(source.bodyweight) : '',
      lotNumber: source?.lotNumber ?? '',
      personalRecordAtEntry:
        source?.personalRecordAtEntry != null ? String(source.personalRecordAtEntry) : '',
      rackHeightSquat: source?.rackHeightSquat != null ? String(source.rackHeightSquat) : '',
      rackHeightBench: source?.rackHeightBench != null ? String(source.rackHeightBench) : '',
      equipmentM: parseFlag(source?.equipmentM),
      equipmentSm: parseFlag(source?.equipmentSm),
      equipmentT: parseFlag(source?.equipmentT),
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
    if (registration?.weightClassName) {
      return registration.weightClassName;
    }
    if (registrationForm.weightClassId) {
      const option = weightClassOptions.find((item) => item.id === registrationForm.weightClassId);
      if (option) {
        return option.label;
      }
    }
    if (mode === 'edit') {
      return t('competitor_modal.registration_fields.weight_class_auto_assigned');
    }
    return t('competitor_modal.registration_fields.weight_class_pending');
  })();

  $: ageCategoryDisplay = (() => {
    if (registration?.ageCategoryName) {
      return registration.ageCategoryName;
    }
    if (registrationForm.ageCategoryId) {
      const option = ageCategoryOptions.find((item) => item.id === registrationForm.ageCategoryId);
      if (option) {
        return option.label;
      }
    }
    if (mode === 'edit') {
      return t('competitor_modal.registration_fields.age_category_auto_assigned');
    }
    return t('competitor_modal.registration_fields.age_category_pending');
  })();

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
        form = {
          firstName: detailResp.data.firstName,
          lastName: detailResp.data.lastName,
          birthDate: detailResp.data.birthDate,
          gender: detailResp.data.gender,
          club: detailResp.data.club ?? '',
          city: detailResp.data.city ?? '',
          notes: detailResp.data.notes ?? '',
        };
        reorderValue = detailResp.data.competitionOrder ?? null;
      } else if (detailResp.error) {
        error = detailResp.error;
      }
    } catch (err) {
      error = err instanceof Error ? err.message : t('competitor_modal.status.error_load');
    } finally {
      isLoading = false;
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
      reorderValue = detail.competitionOrder ?? null;
      success = null;
      error = null;
    }
    resetRegistrationState();
  }

  function resetRegistrationState() {
    registrationForm = createRegistrationForm(registration);
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
    if (registration) {
      const parsedBodyweight = parseFloatInput(registrationForm.bodyweight);
      if (parsedBodyweight === null || parsedBodyweight <= 0) {
        error = t('competitor_modal.status.validation.bodyweight_positive');
        return false;
      }
    }
    return true;
  }

  async function handleSubmit() {
    error = null;
    success = null;

    if (!validateForm()) {
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

      if (
        mode === 'edit' &&
        targetId &&
        reorderValue !== null &&
        reorderValue > 0 &&
        reorderValue !== detail?.competitionOrder
      ) {
        const response = await apiClient.post(`/competitors/${targetId}/reorder`, {
          newOrder: reorderValue,
        });
        if (response.error) {
          throw new Error(response.error);
        }
      }

      let updatedRegistration: Registration | null = registration;

      if (registration && mode === 'edit') {
        const bodyweightValue = parseFloatInput(registrationForm.bodyweight);
        if (bodyweightValue === null || bodyweightValue <= 0) {
          throw new Error(t('competitor_modal.status.validation.bodyweight_positive'));
        }

        const registrationPayload: Record<string, unknown> = {
          bodyweight: bodyweightValue,
          lotNumber: registrationForm.lotNumber.trim() || null,
          personalRecordAtEntry: parseFloatInput(registrationForm.personalRecordAtEntry),
          rackHeightSquat: parseIntInput(registrationForm.rackHeightSquat),
          rackHeightBench: parseIntInput(registrationForm.rackHeightBench),
          equipmentM: registrationForm.equipmentM,
          equipmentSm: registrationForm.equipmentSm,
          equipmentT: registrationForm.equipmentT,
        };

        const response = await apiClient.patch<Registration>(
          `/registrations/${registration.id}`,
          registrationPayload
        );
        if (response.error) {
          throw new Error(response.error);
        }
        updatedRegistration = response.data ?? updatedRegistration;
      }

      if (!registration && mode === 'create' && contestId && targetId) {
        const bodyweightValue = parseFloatInput(registrationForm.bodyweight);
        if (bodyweightValue === null || bodyweightValue <= 0) {
          throw new Error(t('competitor_modal.status.validation.bodyweight_positive'));
        }

        const registrationPayload: Record<string, unknown> = {
          competitorId: targetId,
          bodyweight: bodyweightValue,
          lotNumber: registrationForm.lotNumber.trim() || null,
          personalRecordAtEntry: parseFloatInput(registrationForm.personalRecordAtEntry),
          rackHeightSquat: parseIntInput(registrationForm.rackHeightSquat),
          rackHeightBench: parseIntInput(registrationForm.rackHeightBench),
          equipmentM: registrationForm.equipmentM,
          equipmentSm: registrationForm.equipmentSm,
          equipmentT: registrationForm.equipmentT,
        };

        const response = await apiClient.post<Registration>(
          `/contests/${contestId}/registrations`,
          registrationPayload
        );
        if (response.error) {
          throw new Error(response.error);
        }

        if (response.data) {
          const next = { ...response.data } as Registration;
          next.firstName = form.firstName;
          next.lastName = form.lastName;
          next.gender = form.gender;
          next.club = form.club.trim() || null;
          next.city = form.city.trim() || null;

          updatedRegistration = next;
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
            required
          />
        </label>
        <label class="flex flex-col gap-2">
          <span class="input-label">{t('competitor_modal.fields.gender')} *</span>
          <select class="input-field" bind:value={form.gender}>
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
        <textarea class="input-field" rows={3} bind:value={form.notes} placeholder={t('competitor_modal.placeholders.notes')}></textarea>
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
              />
            </label>
            <label class="flex flex-col gap-2">
              <span class="input-label">{t('competitor_modal.registration_fields.lot_number')}</span>
              <input
                class="input-field"
                bind:value={registrationForm.lotNumber}
                placeholder={t('competitor_modal.registration_fields.lot_number_placeholder')}
              />
            </label>
            <label class="flex flex-col gap-2">
              <span class="input-label">{t('competitor_modal.registration_fields.personal_record')}</span>
              <input
                class="input-field"
                type="number"
                step="0.5"
                min="0"
                bind:value={registrationForm.personalRecordAtEntry}
                placeholder={t('competitor_modal.registration_fields.personal_record_placeholder')}
              />
            </label>
            <label class="flex flex-col gap-2">
              <span class="input-label flex items-center gap-2">
                {t('competitor_modal.registration_fields.weight_class')}
                <span class="text-caption text-text-secondary uppercase tracking-[0.3em]">
                  {t('competitor_modal.registration_fields.auto_chip')}
                </span>
              </span>
              <div class="input-field bg-element-bg/60 text-text-secondary">
                {weightClassDisplay}
              </div>
              <p class="text-caption text-text-tertiary">
                {t('competitor_modal.registration_fields.weight_class_hint')}
              </p>
            </label>
            <label class="flex flex-col gap-2">
              <span class="input-label flex items-center gap-2">
                {t('competitor_modal.registration_fields.age_category')}
                <span class="text-caption text-text-secondary uppercase tracking-[0.3em]">
                  {t('competitor_modal.registration_fields.auto_chip')}
                </span>
              </span>
              <div class="input-field bg-element-bg/60 text-text-secondary">
                {ageCategoryDisplay}
              </div>
              <p class="text-caption text-text-tertiary">
                {t('competitor_modal.registration_fields.age_category_hint')}
              </p>
            </label>
            <label class="flex flex-col gap-2">
              <span class="input-label">{t('competitor_modal.registration_fields.rack_squat')}</span>
              <input
                class="input-field"
                type="number"
                step="1"
                min="0"
                bind:value={registrationForm.rackHeightSquat}
              />
            </label>
            <label class="flex flex-col gap-2">
              <span class="input-label">{t('competitor_modal.registration_fields.rack_bench')}</span>
              <input
                class="input-field"
                type="number"
                step="1"
                min="0"
                bind:value={registrationForm.rackHeightBench}
              />
            </label>
          </div>

          <fieldset class="space-y-2">
            <legend class="input-label">{t('competitor_modal.registration_fields.equipment')}</legend>
            <div class="flex flex-wrap gap-3 text-body">
              <label class="flex items-center gap-2">
                <input type="checkbox" bind:checked={registrationForm.equipmentM} />
                {t('contest.wizard.competitor.equipment.multi')}
              </label>
              <label class="flex items-center gap-2">
                <input type="checkbox" bind:checked={registrationForm.equipmentSm} />
                {t('contest.wizard.competitor.equipment.single')}
              </label>
              <label class="flex items-center gap-2">
                <input type="checkbox" bind:checked={registrationForm.equipmentT} />
                {t('contest.wizard.competitor.equipment.wraps')}
              </label>
            </div>
          </fieldset>
        </section>
      {/if}

      <section class="grid gap-4 md:grid-cols-2">
        <div class="space-y-3">
          <h3 class="text-label text-text-secondary">{t('competitor_modal.cloud_note.title')}</h3>
          <p class="text-caption text-text-secondary">{t('competitor_modal.cloud_note.description')}</p>
        </div>

        {#if mode === 'edit'}
          <div class="space-y-3">
            <h3 class="text-label text-text-secondary">{t('competitor_modal.competition_order.title')}</h3>
            <p class="text-caption text-text-secondary">
              {t('competitor_modal.competition_order.subtitle')}
            </p>
            <input
              type="number"
              min="1"
              class="input-field w-32"
              bind:value={reorderValue}
              aria-label={t('competitor_modal.competition_order.aria')}
            />
          </div>
        {/if}
      </section>

      <div class="flex items-center justify-between">
        <div class="space-x-3">
          <button
            type="button"
            class="btn-secondary px-4 py-2"
            on:click={() => (mode === 'edit' ? resetState() : onClose())}
            disabled={isSaving}
          >
            {mode === 'edit' ? t('competitor_modal.actions.reset') : t('competitor_modal.actions.cancel')}
          </button>
          <button type="button" class="btn-secondary px-4 py-2" on:click={onClose} disabled={isSaving}>
            {t('competitor_modal.actions.close')}
          </button>
        </div>
        <button type="submit" class="btn-primary px-6 py-2" disabled={isSaving}>
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
