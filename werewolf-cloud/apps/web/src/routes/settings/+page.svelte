<script lang="ts">
  import Layout from '$lib/components/Layout.svelte';
  import { getStatusClasses } from '$lib/utils';
  import { availableLocales, changeLanguage } from '$lib/i18n';
  import { _, locale } from 'svelte-i18n';
  import type { PageData } from './$types';
  import type { BackupRecord } from '$lib/types';
  import { toast } from '$lib/ui/toast';
  import { createBackupController, formatMessage } from './backup-workflows';

  export let data: PageData;

  const settings = data.settings;
  const settingsError = data.settingsError;
  const health = data.health;
  const healthError = data.healthError;
  const database = data.database;
  const databaseError = data.databaseError;
  const apiBase = data.apiBase;

  const controller = createBackupController({
    summary: data.backups,
    error: data.backupsError,
  });
  const backupState = controller.state;

  let backupFileInput: HTMLInputElement | null = null;
  let currentLocale: string | null | undefined = undefined;

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

  const handleRefresh = () => void controller.refresh();
  const handleCreateBackup = () => void controller.create();
  const handleResetDatabase = () => void controller.resetDatabase();
  const handleDeleteBackup = (backup: BackupRecord) => void controller.remove(backup);
  const handleDownloadBackup = (backup: BackupRecord) => void controller.download(backup);
  const handleRestoreBackup = (backup: BackupRecord) => void controller.restore(backup);

  function openImportDialog() {
    if (backupFileInput) {
      backupFileInput.value = '';
      backupFileInput.click();
    }
  }

  async function handleBackupImport(event: Event) {
    const input = event.currentTarget as HTMLInputElement | null;
    const file = input?.files?.[0];
    if (!file) return;

    try {
      await controller.importFile(file);
    } finally {
      if (input) {
        input.value = '';
      }
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
</script>

<svelte:head>
  <title>{$_('settings.title')}</title>
</svelte:head>

<Layout
  title={$_('settings.title')}
  subtitle={$_('settings.subtitle')}
  currentPage="settings"
  apiBase={apiBase}
  session={data.session}
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
          <h3 class="text-label text-text-secondary">{$_('settings_page.worker_title')}</h3>
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
          <h3 class="text-label text-text-secondary">{$_('settings_page.d1_title')}</h3>
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
                on:click={handleRefresh}
                disabled={$backupState.loading || $backupState.busy}
              >
                {$_('settings_page.refresh')}
              </button>
              <button
                type="button"
                class="btn-secondary px-3 py-1"
                on:click={handleCreateBackup}
                disabled={$backupState.busy}
              >
                {$backupState.busy ? $_('settings_page.creating_backup') : $_('settings_page.create_backup')}
              </button>
              <button
                type="button"
                class="btn-secondary px-3 py-1"
                on:click={openImportDialog}
                disabled={$backupState.busy}
              >
                {$backupState.importing ? $_('settings_page.importing_backup') : $_('settings_page.import_backup')}
              </button>
            </div>
          </div>
          <input
            type="file"
            accept="application/json"
            class="hidden"
            bind:this={backupFileInput}
            on:change={handleBackupImport}
          />

          {#if $backupState.loading}
            <p class="text-caption text-text-secondary">{$_('settings_page.loading')}</p>
          {:else if $backupState.error}
            <p class="text-caption text-status-error">{$backupState.error}</p>
          {:else if $backupState.summary}
            <p class="text-caption text-text-secondary">
              {formatMessage('settings_page.kv_total', { count: $backupState.summary.total })}
            </p>
            {#if $backupState.summary.backups.length > 0}
              <ul class="space-y-2 text-caption text-text-secondary">
                {#each $backupState.summary.backups.slice(0, 5) as backup}
                  <li class="border border-border-color/50 px-3 py-2 bg-black/20">
                    <div class="flex flex-col gap-2">
                      <div class="flex justify-between items-start gap-2">
                        <div>
                          <span class="font-mono text-xxs text-text-secondary">{backup.id}</span>
                          <p>{formatBackupTimestamp(backup.timestamp)} • {formatBytes(backup.size)}</p>
                        </div>
                        <div class="text-right text-xxs text-text-secondary">
                          {formatBackupCounts(backup.recordCounts)}
                        </div>
                      </div>
                      <div class="flex flex-wrap justify-end gap-2">
                        <button
                          type="button"
                          class="btn-secondary px-3 py-1 text-xxs border border-status-error text-status-error hover:border-primary-red hover:text-primary-red"
                          disabled={$backupState.busy || $backupState.deletingId === backup.id}
                          on:click={() => handleDeleteBackup(backup)}
                        >
                          {$backupState.deletingId === backup.id
                            ? $_('settings_page.deleting_backup')
                            : $_('settings_page.delete_backup')}
                        </button>
                        <button
                          type="button"
                          class="btn-secondary px-3 py-1 text-xxs"
                          disabled={$backupState.busy || $backupState.downloadingId === backup.id}
                          on:click={() => handleDownloadBackup(backup)}
                        >
                          {$backupState.downloadingId === backup.id
                            ? $_('settings_page.downloading_backup')
                            : $_('settings_page.download_backup')}
                        </button>
                        <button
                          type="button"
                          class="btn-primary px-3 py-1 text-xxs"
                          disabled={$backupState.busy || $backupState.restoringId === backup.id}
                          on:click={() => handleRestoreBackup(backup)}
                        >
                          {$backupState.restoringId === backup.id
                            ? $_('settings_page.restoring_backup')
                            : $_('settings_page.restore_backup')}
                        </button>
                      </div>
                    </div>
                  </li>
                {/each}
              </ul>
              <p class="text-caption text-text-secondary">{formatMessage('settings_page.kv_last_run', { timestamp: formatBackupTimestamp($backupState.summary.timestamp) })}</p>
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
        <button type="button" class="btn-secondary px-4 py-2" on:click={handleResetDatabase} disabled={$backupState.resetting}>
          {$_('settings.reset_database_title')}
        </button>
      </div>
    </section>
  </div>
</Layout>
