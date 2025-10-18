<script lang="ts">
  import Layout from '$lib/components/Layout.svelte';
  import { apiClient } from '$lib/api';
  import { getStatusClasses } from '$lib/utils';
  import { availableLocales, changeLanguage } from '$lib/i18n';
  import { _, locale } from 'svelte-i18n';
  import { get } from 'svelte/store';
  import type { PageData } from './$types';
  import type { BackupSummary, BackupRecord, BackupCreateResult } from '$lib/types';
  import { toast } from '$lib/ui/toast';

  type MessageValues = Record<string, string | number | boolean | Date | null | undefined>;



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

  let backups: BackupSummary | null = data.backups ?? null;
  let backupsError = data.backupsError;
  let backupsLoading = false;
  let backupsBusy = false;

let busy = false;

$: currentLocale = $locale;



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
      const response = await apiClient.post<{ success: boolean; message?: string }>('/system/database/reset', {
        confirm: 'YES_I_WANT_TO_RESET_THE_DATABASE',
      });
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

        {/if}
      </div>
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
