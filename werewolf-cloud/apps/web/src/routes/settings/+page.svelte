<script lang="ts">
  import Layout from '$lib/components/Layout.svelte';
  import { apiClient } from '$lib/api';
  import { getStatusClasses } from '$lib/utils';
  import { availableLocales, changeLanguage } from '$lib/i18n';
  import { _, locale } from 'svelte-i18n';
  import { get } from 'svelte/store';
  import type { PageData } from './$types';
  import type { PlateDefinition, BackupSummary, BackupRecord, BackupCreateResult } from '$lib/types';
  import { toast } from '$lib/ui/toast';

  type MessageValues = Record<string, string | number | boolean | Date | null | undefined>;

  const DEFAULT_PLATE_SET: PlateDefinition[] = [
    { weight: 25, quantity: 4, color: '#DC2626' },
    { weight: 20, quantity: 4, color: '#2563EB' },
    { weight: 15, quantity: 4, color: '#EAB308' },
    { weight: 10, quantity: 6, color: '#16A34A' },
    { weight: 5, quantity: 6, color: '#F8FAFC' },
    { weight: 2.5, quantity: 6, color: '#DC2626' },
    { weight: 1.25, quantity: 4, color: '#16A34A' },
    { weight: 0.5, quantity: 4, color: '#6B7280' },
  ];

  export let data: PageData;
  export let params: Record<string, string> = {};
  export let form: unknown = undefined;
  export let errors: unknown = undefined;

  $: void params;
  $: void form;
  $: void errors;


  let settings = data.settings
    ? {
        ...data.settings,
        ui: { ...data.settings.ui },
        competition: {
          ...data.settings.competition,
          defaultPlateSet: data.settings.competition?.defaultPlateSet
            ? data.settings.competition.defaultPlateSet.map((plate) => ({ ...plate }))
            : clonePlateSet(DEFAULT_PLATE_SET),
        },
        database: { ...data.settings.database },
      }
    : null;

  const settingsError = data.settingsError;
  const health = data.health;
  const healthError = data.healthError;
  const database = data.database;
  const databaseError = data.databaseError;
  const apiBase = data.apiBase;

  let backups: BackupSummary | null = data.backups ?? null;
  let backupsError = data.backupsError;
  let backupsLoading = false;
  let backupsBusy = false;

let busy = false;
let platesDirty = false;
let platesError: string | null = null;

let plateSet: PlateDefinition[] = settings
  ? normalizePlateSet(settings.competition.defaultPlateSet)
  : clonePlateSet(DEFAULT_PLATE_SET);

$: currentLocale = $locale;
$: if (settings && !platesDirty) {
  plateSet = normalizePlateSet(settings.competition.defaultPlateSet);
}

  function clonePlateSet(set: PlateDefinition[]): PlateDefinition[] {
    return set.map((plate) => ({ ...plate }));
  }

  function getPlateColorHex(weight: number): string {
    if (Math.abs(weight - 25) < 0.001 || Math.abs(weight - 2.5) < 0.001) return '#DC2626';
    if (Math.abs(weight - 20) < 0.001 || Math.abs(weight - 2) < 0.001) return '#2563EB';
    if (Math.abs(weight - 15) < 0.001 || Math.abs(weight - 1.5) < 0.001) return '#EAB308';
    if (
      Math.abs(weight - 10) < 0.001 ||
      Math.abs(weight - 1.25) < 0.001 ||
      Math.abs(weight - 1) < 0.001
    ) {
      return '#16A34A';
    }
    if (Math.abs(weight - 5) < 0.001) return '#F8FAFC';
    if (weight <= 1) return '#6B7280';
    return '#374151';
  }

  function normalizePlateSet(input?: PlateDefinition[] | null): PlateDefinition[] {
    const source = Array.isArray(input) && input.length ? input : DEFAULT_PLATE_SET;
    const dedup = new Map<number, PlateDefinition>();

    for (const plate of source) {
      const weight = Number(plate.weight);
      if (!Number.isFinite(weight) || weight <= 0) continue;

      const quantityValue = Number(plate.quantity);
      const quantity = Number.isFinite(quantityValue) ? Math.max(0, Math.trunc(quantityValue)) : 0;
      const color =
        typeof plate.color === 'string' && plate.color.trim().length > 0
          ? plate.color
          : getPlateColorHex(weight);

      dedup.set(weight, { weight, quantity, color });
    }

    return Array.from(dedup.values()).sort((a, b) => b.weight - a.weight);
  }

  async function handleLanguageChange(event: Event) {
    const value = (event.currentTarget as HTMLSelectElement).value;
    try {
      await changeLanguage(value);
      toast.success($_('settings_page.language_updated'));
    } catch (err) {
      const message = err instanceof Error ? err.message : $_('settings_page.toast_error');
      toast.error(message);
    }
  }

  async function updateSetting(section: 'ui' | 'competition' | 'database', key: string, value: unknown) {
    busy = true;
    try {
      const response = await apiClient.patch(`/settings/${section}`, { [key]: value });
      if (response.error) {
        throw new Error(response.error);
      }
      toast.success($_('settings_page.toast_saved'));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : $_('settings_page.toast_error'));
      throw err;
    } finally {
      busy = false;
    }
  }

  function handleShowWeightsChange(event: Event) {
    if (!settings) return;
    const checkbox = event.currentTarget as HTMLInputElement;
    const previousValue = settings.ui.showWeights;
    const checked = checkbox.checked;

    settings = {
      ...settings,
      ui: { ...settings.ui, showWeights: checked },
    };

    updateSetting('ui', 'showWeights', checked).catch(() => {
      if (!settings) return;
      settings = {
        ...settings,
        ui: { ...settings.ui, showWeights: previousValue },
      };
      checkbox.checked = previousValue;
    });
  }

  function handleDefaultBarWeightChange(event: Event) {
    if (!settings) return;
    const input = event.currentTarget as HTMLInputElement;
    const previousValue = settings.competition.defaultBarWeight;
    const value = Number(input.value);

    if (!Number.isFinite(value)) {
      input.value = String(previousValue);
      return;
    }

    settings = {
      ...settings,
      competition: { ...settings.competition, defaultBarWeight: value },
    };
    updateSetting('competition', 'defaultBarWeight', value).catch(() => {
      if (!settings) return;
      settings = {
        ...settings,
        competition: { ...settings.competition, defaultBarWeight: previousValue },
      };
      input.value = String(previousValue);
    });
  }

  function updatePlateWeight(index: number, value: number) {
    plateSet = plateSet.map((plate, idx) =>
      idx === index && Number.isFinite(value)
        ? { ...plate, weight: Number(value.toFixed(2)) }
        : plate
    );
    platesDirty = true;
  }

  function updatePlateQuantity(index: number, value: number) {
    const sanitized = Number.isFinite(value) ? Math.max(0, Math.trunc(value)) : 0;
    plateSet = plateSet.map((plate, idx) => (idx === index ? { ...plate, quantity: sanitized } : plate));
    platesDirty = true;
  }

  function updatePlateColor(index: number, value: string) {
    const normalized = value.startsWith('#') ? value : `#${value}`;
    plateSet = plateSet.map((plate, idx) => (idx === index ? { ...plate, color: normalized } : plate));
    platesDirty = true;
  }

  function handlePlateWeightInput(index: number, event: Event) {
    const value = (event.currentTarget as HTMLInputElement).valueAsNumber;
    updatePlateWeight(index, value);
  }

  function handlePlateQuantityInput(index: number, event: Event) {
    const value = (event.currentTarget as HTMLInputElement).valueAsNumber;
    updatePlateQuantity(index, value);
  }

  function handlePlateColorInput(index: number, event: Event) {
    const value = (event.currentTarget as HTMLInputElement).value;
    updatePlateColor(index, value);
  }

  function addPlateRow() {
    plateSet = [...plateSet, { weight: 0, quantity: 0, color: '#6B7280' }];
    platesDirty = true;
    platesError = null;
  }

  function removePlateRow(index: number) {
    plateSet = plateSet.filter((_, idx) => idx !== index);
    platesDirty = true;
  }

  function restoreDefaultPlateSet() {
    plateSet = clonePlateSet(DEFAULT_PLATE_SET);
    platesDirty = true;
    platesError = null;
  }

  async function savePlateSet() {
    const sanitized = normalizePlateSet(plateSet).filter((plate) => plate.quantity > 0);

    if (sanitized.length === 0) {
      platesError = $_('settings_page.plates_validation_error');
      toast.error(platesError);
      return;
    }

    platesError = null;
    try {
      await updateSetting('competition', 'defaultPlateSet', sanitized);
      if (settings) {
        settings = {
          ...settings,
          competition: {
            ...settings.competition,
            defaultPlateSet: clonePlateSet(sanitized),
          },
        };
      }
      plateSet = clonePlateSet(sanitized);
      platesDirty = false;
      toast.success($_('settings_page.plates_saved'));
    } catch (err) {
      const message = err instanceof Error ? err.message : $_('settings_page.plates_error');
      platesError = message;
      toast.error(message);
    }
  }

  async function refreshBackups() {
    backupsLoading = true;
    try {
      const response = await apiClient.get<BackupSummary>('/system/backups');
      if (response.error) {
        throw new Error(response.error);
      }
      backups = response.data ?? null;
      backupsError = response.error;
    } catch (err) {
      backupsError = err instanceof Error ? err.message : $_('settings_page.toast_error');
    } finally {
      backupsLoading = false;
    }
  }

  async function createBackup() {
    backupsBusy = true;
    try {
      const response = await apiClient.post<BackupCreateResult>('/system/backups');
      if (response.error) {
        throw new Error(response.error);
      }
      const backupId = response.data?.backupId ?? '';
      toast.success(formatMessage('settings_page.backup_created', { id: backupId }));
      await refreshBackups();
    } catch (err) {
      const message = err instanceof Error ? err.message : $_('settings_page.toast_error');
      toast.error(message);
    } finally {
      backupsBusy = false;
    }
  }

  async function triggerReset() {
    const confirmed = confirm($_('settings.reset_database_warning'));
    if (!confirmed) return;

    busy = true;
    try {
      const response = await apiClient.post<{ success: boolean; message?: string }>('/system/database/reset');
      if (response.error) {
        throw new Error(response.error);
      }
      toast.success(response.data?.message ?? $_('settings_page.reset_success'));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : $_('settings_page.reset_error'));
    } finally {
      busy = false;
    }
  }

  function formatBackupTimestamp(timestamp?: string) {
    if (!timestamp) return '—';
    return new Date(timestamp).toLocaleString();
  }

  function formatBytes(bytes?: number) {
    if (!Number.isFinite(bytes)) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB', 'TB'] as const;
    let value = bytes as number;
    let index = 0;
    while (value >= 1024 && index < units.length - 1) {
      value /= 1024;
      index += 1;
    }
    const precision = value >= 10 || index === 0 ? 0 : 1;
    return `${value.toFixed(precision)} ${units[index]}`;
  }

  function formatBackupCounts(recordCounts: BackupRecord['recordCounts']) {
    return formatMessage('settings_page.backup_counts', {
      contests: recordCounts.contests,
      competitors: recordCounts.competitors,
      registrations: recordCounts.registrations,
    });
  }

  const formatMessage = (key: string, vars?: MessageValues) => {
    try {
      let text = get(_)(key);
      // Simple string replacement for problematic ICU messages
      if (vars && text.includes('PLACEHOLDER_COUNT') && 'count' in vars) {
        text = text.replace('PLACEHOLDER_COUNT', String(vars['count']));
      }
      return text;
    } catch (error) {
      console.debug('[settings] formatMessage fallback', key, error);
      return key;
    }
  };

  if (typeof window !== 'undefined') {
    (window as Window & { __werewolfFormat?: typeof formatMessage }).__werewolfFormat = formatMessage;
  }
</script>

<svelte:head>
  <title>{$_('settings.title')}</title>
</svelte:head>

<Layout
  title={$_('settings.title')}
  subtitle={$_('settings.subtitle')}
  currentPage="settings"
  apiBase={apiBase}
>
  <div class="space-y-6">
    <section class="card">
      <header class="card-header">
        <h2 class="text-h3 text-text-primary">{$_('settings.language_title')}</h2>
        <p class="text-body text-text-secondary">{$_('settings.language_description')}</p>
      </header>
      <div class="space-y-4">
        {#if settingsError}
          <div class="px-4 py-2 text-sm rounded border border-status-error text-status-error bg-status-error/30">{settingsError}</div>
        {/if}
        {#if settings}
          <div class="flex items-center justify-between gap-4 flex-wrap">
            <div>
              <p class="text-body text-text-primary font-semibold">{$_('settings_page.language_label')}</p>
              <p class="text-caption text-text-secondary">{$_('settings_page.language_desc')}</p>
            </div>
            <select class="input-field max-w-xs" value={currentLocale} on:change={handleLanguageChange}>
              {#each availableLocales as option}
                <option value={option.code}>{option.label}</option>
              {/each}
            </select>
          </div>
          <div class="flex items-center justify-between gap-4 flex-wrap">
            <div>
              <p class="text-body text-text-primary font-semibold">{$_('settings_page.show_weights')}</p>
              <p class="text-caption text-text-secondary">{$_('settings_page.show_weights_desc')}</p>
            </div>
            <input
              type="checkbox"
              class="accent-primary-red scale-125"
              checked={settings.ui.showWeights}
              on:change={handleShowWeightsChange}
              disabled={busy}
            />
          </div>
        {/if}
      </div>
    </section>

    <section class="card">
      <header class="card-header">
        <h2 class="text-h3 text-text-primary">{$_('settings.competition_title')}</h2>
        <p class="text-body text-text-secondary">{$_('settings.competition_description')}</p>
      </header>
      {#if settings && !settingsError}
        <div class="space-y-6">
          <label class="flex flex-col gap-2 max-w-xs">
            <span class="input-label">{$_('settings_page.default_bar')}</span>
            <input
              type="number"
              class="input-field"
              min="0"
              step="0.5"
              value={settings.competition.defaultBarWeight}
              on:change={handleDefaultBarWeightChange}
              disabled={busy}
            />
          </label>

          <div class="space-y-3">
            <div class="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p class="text-body text-text-primary font-semibold">{$_('settings_page.plates_title')}</p>
                <p class="text-caption text-text-secondary">{$_('settings_page.plates_description')}</p>
              </div>
              <div class="flex items-center gap-2">
                <button type="button" class="btn-secondary" on:click={restoreDefaultPlateSet}>
                  {$_('settings_page.plates_restore')}
                </button>
                <button type="button" class="btn-secondary" on:click={addPlateRow}>
                  {$_('settings_page.plates_add')}
                </button>
              </div>
            </div>

            <div class="overflow-x-auto">
              <table class="w-full text-left text-sm border border-border-color">
                <thead class="bg-element-bg text-text-secondary uppercase tracking-[0.3em] text-xxs">
                  <tr>
                    <th class="px-3 py-2">{$_('settings_page.plates_weight')}</th>
                    <th class="px-3 py-2">{$_('settings_page.plates_quantity')}</th>
                    <th class="px-3 py-2">{$_('settings_page.plates_color')}</th>
                    <th class="px-3 py-2 sr-only">{$_('settings_page.plates_remove')}</th>
                  </tr>
                </thead>
                <tbody>
                  {#if plateSet.length === 0}
                    <tr>
                      <td colspan="4" class="px-3 py-3 text-center text-caption text-text-secondary">
                        {$_('settings_page.plates_empty')}
                      </td>
                    </tr>
                  {:else}
                    {#each plateSet as plate, index}
                      <tr class="border-t border-border-color">
                        <td class="px-3 py-2">
                          <input
                            type="number"
                            class="input-field"
                            min="0.25"
                            step="0.25"
                            value={plate.weight}
                            on:input={(event) => handlePlateWeightInput(index, event)}
                          />
                        </td>
                        <td class="px-3 py-2">
                          <input
                            type="number"
                            class="input-field"
                            min="0"
                            step="1"
                            value={plate.quantity}
                            on:input={(event) => handlePlateQuantityInput(index, event)}
                          />
                        </td>
                        <td class="px-3 py-2">
                          <input
                            type="color"
                            class="h-10 w-16 cursor-pointer"
                            value={plate.color}
                            on:input={(event) => handlePlateColorInput(index, event)}
                          />
                        </td>
                        <td class="px-3 py-2 text-right">
                          <button
                            type="button"
                            class="btn-secondary"
                            on:click={() => removePlateRow(index)}
                          >
                            {$_('settings_page.plates_remove')}
                          </button>
                        </td>
                      </tr>
                    {/each}
                  {/if}
                </tbody>
              </table>
            </div>

            {#if platesError}
              <p class="text-caption text-status-error">{platesError}</p>
            {:else if platesDirty}
              <p class="text-caption text-text-secondary">{$_('settings_page.plates_unsaved')}</p>
            {/if}

            <div class="flex gap-2">
              <button
                type="button"
                class="btn-primary"
                on:click={savePlateSet}
                disabled={!platesDirty || busy}
              >
                {$_('settings_page.plates_save')}
              </button>
            </div>
          </div>
        </div>
      {:else}
        <p class="text-caption text-text-secondary">{$_('settings_page.no_data')}</p>
      {/if}
    </section>

    <section class="card">
      <header class="card-header">
        <h2 class="text-h3 text-text-primary">{$_('settings.database_title')}</h2>
        <p class="text-body text-text-secondary">{$_('settings.database_description')}</p>
      </header>
      <div class="grid gap-4 md:grid-cols-3">
        <div class="border border-border-color p-4 bg-element-bg">
          <h3 class="text-label text-text-secondary">API Worker</h3>
          {#if healthError}
            <p class="text-caption text-status-error">{healthError}</p>
          {:else if health}
            <span class={getStatusClasses(health.status)}>{health.status}</span>
            <p class="text-caption text-text-secondary mt-2">{new Date(health.timestamp).toLocaleString()}</p>
          {:else}
            <p class="text-caption text-text-secondary">{$_('settings_page.no_data')}</p>
          {/if}
        </div>
        <div class="border border-border-color p-4 bg-element-bg">
          <h3 class="text-label text-text-secondary">D1 Database</h3>
          {#if databaseError}
            <p class="text-caption text-status-error">{databaseError}</p>
          {:else if database}
            <span class={getStatusClasses(database.status)}>{database.status}</span>
            <ul class="text-caption text-text-secondary mt-2 space-y-1">
              <li>{formatMessage('settings_page.contests_count', { count: database.stats.contests })}</li>
              <li>{formatMessage('settings_page.competitors_count', { count: database.stats.competitors })}</li>
              <li>{formatMessage('settings_page.registrations_count', { count: database.stats.registrations })}</li>
            </ul>
          {:else}
            <p class="text-caption text-text-secondary">{$_('settings_page.no_data')}</p>
          {/if}
        </div>
        <div class="border border-border-color p-4 bg-element-bg space-y-3">
          <div class="flex items-center justify-between">
            <div>
              <h3 class="text-label text-text-secondary">{$_('settings_page.kv_title')}</h3>
              <p class="text-caption text-text-secondary">{$_('settings_page.kv_description')}</p>
            </div>
            <div class="flex gap-2">
              <button
                type="button"
                class="btn-secondary px-3 py-1"
                on:click={refreshBackups}
                disabled={backupsLoading || backupsBusy}
              >
                {$_('settings_page.refresh')}
              </button>
              <button
                type="button"
                class="btn-secondary px-3 py-1"
                on:click={createBackup}
                disabled={backupsBusy}
              >
                {backupsBusy ? $_('settings_page.creating_backup') : $_('settings_page.create_backup')}
              </button>
            </div>
          </div>

          {#if backupsLoading}
            <p class="text-caption text-text-secondary">{$_('settings_page.loading')}</p>
          {:else if backupsError}
            <p class="text-caption text-status-error">{backupsError}</p>
          {:else if backups}
            <p class="text-caption text-text-secondary">
              {formatMessage('settings_page.kv_total', { count: backups.total })}
            </p>
            {#if backups.backups.length > 0}
              <ul class="space-y-2 text-caption text-text-secondary">
                {#each backups.backups.slice(0, 5) as backup}
                  <li class="border border-border-color/50 px-3 py-2 bg-black/20">
                    <div class="flex justify-between items-start gap-2">
                      <div>
                        <span class="font-mono text-xxs text-text-secondary">{backup.id}</span>
                        <p>{formatBackupTimestamp(backup.timestamp)} • {formatBytes(backup.size)}</p>
                      </div>
                      <div class="text-right text-xxs text-text-secondary">
                        {formatBackupCounts(backup.recordCounts)}
                      </div>
                    </div>
                  </li>
                {/each}
              </ul>
              <p class="text-caption text-text-secondary">{formatMessage('settings_page.kv_last_run', { timestamp: formatBackupTimestamp(backups.timestamp) })}</p>
            {:else}
              <p class="text-caption text-text-secondary">{$_('settings_page.kv_empty')}</p>
            {/if}
          {:else}
            <p class="text-caption text-text-secondary">{$_('settings_page.no_data')}</p>
          {/if}
        </div>
      </div>
    </section>

    <section class="card">
      <header class="card-header">
        <h2 class="text-h3 text-text-primary">{$_('settings.reset_database_title')}</h2>
        <p class="text-body text-text-secondary">{$_('settings.reset_database_subtitle')}</p>
      </header>
      <div class="flex flex-col gap-3">
        <p class="text-caption text-text-secondary">{$_('settings.reset_database_backup_recommendation')}</p>
        <button type="button" class="btn-secondary px-4 py-2" on:click={triggerReset} disabled={busy}>
          {$_('settings.reset_database_title')}
        </button>
      </div>
    </section>
  </div>
</Layout>
