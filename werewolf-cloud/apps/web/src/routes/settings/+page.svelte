<script lang="ts">
  import Layout from '$lib/components/Layout.svelte';
  import { apiClient } from '$lib/api';
  import { getStatusClasses } from '$lib/utils';
  import { availableLocales, changeLanguage } from '$lib/i18n';
  import { _, locale } from 'svelte-i18n';
  import type { PageData } from './$types';

  export let data: PageData;

  let settings = data.settings
    ? {
        ...data.settings,
        ui: { ...data.settings.ui },
        competition: { ...data.settings.competition },
        database: { ...data.settings.database },
      }
    : null;

  const settingsError = data.settingsError;
  const health = data.health;
  const healthError = data.healthError;
  const database = data.database;
  const databaseError = data.databaseError;
  const apiBase = data.apiBase;

  import ToastList from '$lib/components/ToastList.svelte';
  import { createToastStore } from '$lib/ui/toast';

const toastStore = createToastStore();
let toasts = toastStore.list();
let busy = false;

$: toasts = toastStore.list();
$: currentLocale = $locale;

const pushToast = toastStore.push;

function handleLanguageChange(event: Event) {
  const value = (event.currentTarget as HTMLSelectElement).value;
  changeLanguage(value);
}


  async function updateSetting(section: 'ui' | 'competition' | 'database', key: string, value: unknown) {
    busy = true;
    try {
      const response = await apiClient.patch(`/settings/${section}`, { [key]: value });
      if (response.error) {
        throw new Error(response.error);
      }
      pushToast($_('settings_page.toast_saved'), 'success');
    } catch (err) {
      pushToast(err instanceof Error ? err.message : $_('settings_page.toast_error'), 'error');
    } finally {
      busy = false;
    }
  }

  function handleShowWeightsChange(event: Event) {
    if (!settings) return;
    const checked = (event.currentTarget as HTMLInputElement).checked;
    settings = {
      ...settings,
      ui: { ...settings.ui, showWeights: checked },
    };
    updateSetting('ui', 'showWeights', checked);
  }

  function handleDefaultBarWeightChange(event: Event) {
    if (!settings) return;
    const value = Number((event.currentTarget as HTMLInputElement).value);
    settings = {
      ...settings,
      competition: { ...settings.competition, defaultBarWeight: value },
    };
    updateSetting('competition', 'defaultBarWeight', value);
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
      pushToast(response.data?.message ?? $_('settings_page.reset_success'), 'success');
    } catch (err) {
      pushToast(err instanceof Error ? err.message : $_('settings_page.reset_error'), 'error');
    } finally {
      busy = false;
    }
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
    <ToastList {toasts} toneClass={toastStore.toneClass} />

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
          <div class="flex items-center justify-between">
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
          <div class="flex items-center justify-between">
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
        <h2 class="text-h3 text-text-primary">{$_('contest.step_2_title')}</h2>
        <p class="text-body text-text-secondary">{$_('settings.database_description')}</p>
      </header>
      <div class="space-y-4">
        {#if settings && !settingsError}
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
        {/if}
      </div>
    </section>

    <section class="card">
      <header class="card-header">
        <h2 class="text-h3 text-text-primary">{$_('settings.database_title')}</h2>
        <p class="text-body text-text-secondary">Live diagnostics from the worker, KV, and D1 layers.</p>
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
            <p class="text-caption text-text-secondary">{$_('settings_page.no_data', { default: 'No data' })}</p>
          {/if}
        </div>
        <div class="border border-border-color p-4 bg-element-bg">
          <h3 class="text-label text-text-secondary">D1 Database</h3>
          {#if databaseError}
            <p class="text-caption text-status-error">{databaseError}</p>
          {:else if database}
            <span class={getStatusClasses(database.status)}>{database.status}</span>
            <ul class="text-caption text-text-secondary mt-2 space-y-1">
              <li>Contests: {database.stats.contests}</li>
              <li>Competitors: {database.stats.competitors}</li>
              <li>Registrations: {database.stats.registrations}</li>
            </ul>
          {:else}
            <p class="text-caption text-text-secondary">{$_('settings_page.no_data', { default: 'No data' })}</p>
          {/if}
        </div>
        <div class="border border-border-color p-4 bg-element-bg">
          <h3 class="text-label text-text-secondary">KV</h3>
          <p class="text-caption text-text-secondary">Coming soon – KV diagnostics will surface after KV routes land.</p>
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
