<script lang="ts">
  import { get } from 'svelte/store';
  import { _ } from 'svelte-i18n';
  import { apiClient, ApiError } from '$lib/api';
  import { toast } from '$lib/ui/toast';
  import type { AgeCategory, ContestCategories, WeightClass } from '$lib/types';
  import {
    buildCategoryPayload,
    createDefaultAgeCategories,
    createDefaultWeightClasses,
    formatCategoryIssues,
    validateCategories,
  } from '$lib/categories';

  export let contestId: string;
  export let initialCategories: ContestCategories;
  export let hasRegistrations = false;
  export let onClose: (result?: ContestCategories) => void = () => {};

  const translateStore = _;
  type MessageValues = Record<string, string | number | boolean | Date | null | undefined>;
  const t = (key: string, values?: MessageValues): string => {
    const translate = get(translateStore);
    return translate(key, values ? { values } : undefined);
  };

  let ageCategories: AgeCategory[] = initialCategories.ageCategories.map((category) => ({ ...category }));
  let weightClasses: WeightClass[] = initialCategories.weightClasses.map((weightClass) => ({ ...weightClass }));
  let validationErrors: string[] = [];
  let resetError: string | null = null;
  let isSaving = false;
  let isResetting = false;

  function addAgeCategory() {
    ageCategories = [
      ...ageCategories,
      {
        id: undefined,
        contestId,
        code: '',
        name: '',
        minAge: null,
        maxAge: null,
        sortOrder: (ageCategories.length + 1) * 10,
        metadata: null,
      },
    ];
  }

  function addWeightClass() {
    weightClasses = [
      ...weightClasses,
      {
        id: undefined,
        contestId,
        code: '',
        name: '',
        gender: weightClasses.length % 2 === 0 ? 'Female' : 'Male',
        minWeight: null,
        maxWeight: null,
        sortOrder: (weightClasses.length + 1) * 10,
        metadata: null,
      },
    ];
  }

  function removeAgeCategory(index: number) {
    ageCategories = ageCategories.filter((_, idx) => idx !== index);
  }

  function removeWeightClass(index: number) {
    weightClasses = weightClasses.filter((_, idx) => idx !== index);
  }

  function updateAgeCategory(index: number, field: keyof AgeCategory, value: string) {
    const updated = [...ageCategories];
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
    ageCategories = updated;
    validationErrors = [];
  }

  function handleAgeCategoryInput(index: number, field: keyof AgeCategory) {
    return (event: Event) => {
      const input = event.currentTarget as HTMLInputElement | null;
      updateAgeCategory(index, field, input?.value ?? '');
    };
  }

  function updateWeightClass(index: number, field: keyof WeightClass, value: string) {
    const updated = [...weightClasses];
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
    weightClasses = updated;
    validationErrors = [];
  }

  function handleWeightClassInput(index: number, field: keyof WeightClass) {
    return (event: Event) => {
      const input = event.currentTarget as HTMLInputElement | null;
      updateWeightClass(index, field, input?.value ?? '');
    };
  }

  function handleWeightClassSelect(index: number) {
    return (event: Event) => {
      const select = event.currentTarget as HTMLSelectElement | null;
      updateWeightClass(index, 'gender', select?.value ?? '');
    };
  }

  function resetLocalState(categories: ContestCategories) {
    ageCategories = categories.ageCategories.map((category) => ({ ...category }));
    weightClasses = categories.weightClasses.map((weightClass) => ({ ...weightClass }));
    validationErrors = [];
    resetError = null;
  }

  async function handleSave() {
    const issues = validateCategories(ageCategories, weightClasses);
    if (issues.length > 0) {
      validationErrors = formatCategoryIssues(issues, (key, params) => t(key, params));
      return;
    }

    isSaving = true;
    validationErrors = [];
    resetError = null;

    try {
      const payload = buildCategoryPayload(ageCategories, weightClasses);
      const response = await apiClient.put<ContestCategories>(`/contests/${contestId}/categories`, payload);
      if (response.error) {
        throw new Error(response.error);
      }
      const data = response.data ?? {
        ageCategories: payload.ageCategories as AgeCategory[],
        weightClasses: payload.weightClasses as WeightClass[],
      };

      toast.success(t('contest_detail.categories.toast_saved'));
      onClose(data);
    } catch (error) {
      const message = error instanceof ApiError
        ? error.message
        : error instanceof Error
          ? error.message
          : t('contest_detail.categories.toast_save_failed');
      validationErrors = [message];
    } finally {
      isSaving = false;
    }
  }

  async function handleResetDefaults() {
    if (hasRegistrations) {
      resetError = t('contest_detail.categories.reset_blocked');
      return;
    }

    isResetting = true;
    resetError = null;
    validationErrors = [];

    try {
      const response = await apiClient.post<ContestCategories>(`/contests/${contestId}/categories/defaults`);
      if (response.error) {
        throw new Error(response.error);
      }
      const defaults = response.data ?? {
        ageCategories: createDefaultAgeCategories(),
        weightClasses: createDefaultWeightClasses(),
      };
      resetLocalState(defaults);
      toast.success(t('contest_detail.categories.toast_reset'));
    } catch (error) {
      if (error instanceof ApiError && error.status === 409) {
        resetError = t('contest_detail.categories.reset_blocked');
      } else {
        resetError = error instanceof Error ? error.message : t('contest_detail.categories.toast_reset_failed');
      }
    } finally {
      isResetting = false;
    }
  }

  function handleCancel() {
    onClose();
  }
</script>

<div class="space-y-6">
  <section class="space-y-2">
    <h3 class="text-h3 text-text-primary">{t('contest_detail.categories.age.title')}</h3>
    <p class="text-caption text-text-secondary">{t('contest_detail.categories.age.description')}</p>

    <div class="overflow-x-auto border border-border-color rounded-lg">
      <table class="min-w-full text-left text-sm">
        <thead class="bg-element-bg text-label">
          <tr>
            <th class="px-3 py-2">{t('contest_detail.categories.columns.code')}</th>
            <th class="px-3 py-2">{t('contest_detail.categories.columns.name')}</th>
            <th class="px-3 py-2">{t('contest_detail.categories.columns.min_age')}</th>
            <th class="px-3 py-2">{t('contest_detail.categories.columns.max_age')}</th>
            <th class="px-3 py-2">{t('contest_detail.categories.columns.sort_order')}</th>
            <th class="px-3 py-2 text-right">{t('contest_detail.categories.columns.actions')}</th>
          </tr>
        </thead>
        <tbody>
          {#each ageCategories as category, index}
            <tr class="border-t border-border-color">
              <td class="px-3 py-2">
                <input
                  class="table-input-field w-full"
                  placeholder="OPEN"
                  value={category.code}
                  on:input={handleAgeCategoryInput(index, 'code')}
                />
              </td>
              <td class="px-3 py-2">
                <input
                  class="table-input-field w-full"
                  placeholder={t('contest_detail.categories.placeholders.age_name')}
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
                <button type="button" class="btn-secondary px-3 py-1" on:click={() => removeAgeCategory(index)}>
                  {t('buttons.remove')}
                </button>
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>

    <button type="button" class="btn-secondary px-3 py-1" on:click={addAgeCategory}>
      {t('contest_detail.categories.age.add')}
    </button>
  </section>

  <section class="space-y-2">
    <h3 class="text-h3 text-text-primary">{t('contest_detail.categories.weight.title')}</h3>
    <p class="text-caption text-text-secondary">{t('contest_detail.categories.weight.description')}</p>

    <div class="overflow-x-auto border border-border-color rounded-lg">
      <table class="min-w-full text-left text-sm">
        <thead class="bg-element-bg text-label">
          <tr>
            <th class="px-3 py-2">{t('contest_detail.categories.columns.gender')}</th>
            <th class="px-3 py-2">{t('contest_detail.categories.columns.code')}</th>
            <th class="px-3 py-2">{t('contest_detail.categories.columns.name')}</th>
            <th class="px-3 py-2">{t('contest_detail.categories.columns.min_weight')}</th>
            <th class="px-3 py-2">{t('contest_detail.categories.columns.max_weight')}</th>
            <th class="px-3 py-2">{t('contest_detail.categories.columns.sort_order')}</th>
            <th class="px-3 py-2 text-right">{t('contest_detail.categories.columns.actions')}</th>
          </tr>
        </thead>
        <tbody>
          {#each weightClasses as weightClass, index}
            <tr class="border-t border-border-color">
              <td class="px-3 py-2">
                <select
                  class="table-input-field w-full"
                  value={weightClass.gender}
                  on:change={handleWeightClassSelect(index)}
                >
                  <option value="Female">{t('contest_detail.categories.gender.female')}</option>
                  <option value="Male">{t('contest_detail.categories.gender.male')}</option>
                </select>
              </td>
              <td class="px-3 py-2">
                <input
                  class="table-input-field w-full"
                  placeholder="M_OPEN"
                  value={weightClass.code}
                  on:input={handleWeightClassInput(index, 'code')}
                />
              </td>
              <td class="px-3 py-2">
                <input
                  class="table-input-field w-full"
                  placeholder={t('contest_detail.categories.placeholders.weight_name')}
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
                <button type="button" class="btn-secondary px-3 py-1" on:click={() => removeWeightClass(index)}>
                  {t('buttons.remove')}
                </button>
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>

    <button type="button" class="btn-secondary px-3 py-1" on:click={addWeightClass}>
      {t('contest_detail.categories.weight.add')}
    </button>
  </section>

  {#if validationErrors.length > 0}
    <div class="bg-status-error/20 border border-status-error text-status-error px-4 py-3 rounded-lg">
      <ul class="list-disc list-inside space-y-1">
        {#each validationErrors as message}
          <li>{message}</li>
        {/each}
      </ul>
    </div>
  {/if}

  {#if resetError}
    <div class="bg-status-warning/20 border border-status-warning text-status-warning px-4 py-3 rounded-lg">
      {resetError}
    </div>
  {/if}

  <footer class="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
    <div class="flex flex-wrap gap-2">
      <button
        type="button"
        class="btn-secondary px-3 py-1"
        on:click={() => resetLocalState(initialCategories)}
        disabled={isSaving || isResetting}
      >
        {t('contest_detail.categories.actions.revert_changes')}
      </button>
      <button
        type="button"
        class="btn-secondary px-3 py-1"
        on:click={handleResetDefaults}
        disabled={hasRegistrations || isResetting || isSaving}
      >
        {#if isResetting}
          {t('contest_detail.categories.actions.resetting')}
        {:else}
          {t('contest_detail.categories.actions.reset_defaults')}
        {/if}
      </button>
    </div>
    <div class="flex gap-2 justify-end">
      <button type="button" class="btn-secondary px-4 py-2" on:click={handleCancel} disabled={isSaving || isResetting}>
        {t('buttons.cancel')}
      </button>
      <button type="button" class="btn-primary px-4 py-2" on:click={handleSave} disabled={isSaving || isResetting}>
        {#if isSaving}
          {t('contest_detail.categories.actions.saving')}
        {:else}
          {t('contest_detail.categories.actions.save')}
        {/if}
      </button>
    </div>
  </footer>
</div>
