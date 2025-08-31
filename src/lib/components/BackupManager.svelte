<script lang="ts">
  import { onMount } from 'svelte';
  import { invoke } from '@tauri-apps/api/core';
  import { _ } from 'svelte-i18n';
  import { FolderOpen, Database, RefreshCw, RotateCcw, Lightbulb } from 'lucide-svelte';

  // State
  let backups: string[] = [];
  let loading = false;
  let error = '';
  let successMessage = '';

  // Load backup list
  async function loadBackups() {
    loading = true;
    error = '';
    
    try {
      backups = await invoke('list_backups');
    } catch (e) {
      error = `${$_('backup.failed_load')} ${e}`;
      console.error('Failed to load backups:', e);
    } finally {
      loading = false;
    }
  }

  // Create a new backup
  async function createBackup() {
    loading = true;
    error = '';
    successMessage = '';
    
    try {
      const backupPath = await invoke('backup_database');
      successMessage = `${$_('backup.success_created')} ${backupPath}`;
      await loadBackups(); // Refresh the list
    } catch (e) {
      error = `${$_('backup.failed_create')} ${e}`;
      console.error('Failed to create backup:', e);
    } finally {
      loading = false;
    }
  }

  // Restore from backup
  async function restoreBackup(backupPath: string) {
    const confirmed = confirm(
      `${$_('backup.confirm_restore_title')}\n\n` +
      `${$_('backup.confirm_restore_warning')}\n\n` +
      `${$_('backup.confirm_restore_backup')} ${getBackupDisplayName(backupPath)}\n\n` +
      `${$_('backup.confirm_restore_safety')}`
    );
    
    if (!confirmed) return;

    loading = true;
    error = '';
    successMessage = '';
    
    try {
      const result = await invoke('restore_database', { backupPath });
      successMessage = result as string;
      
      // Show success and recommend restarting the app
      const restartConfirmed = confirm(
        `${successMessage}\n\n` +
        `${$_('messages.restart_recommended')}\n\n` +
        `${$_('messages.refresh_page_now')}`
      );
      
      if (restartConfirmed) {
        window.location.reload();
      }
      
    } catch (e) {
      error = `${$_('backup.failed_restore')} ${e}`;
      console.error('Failed to restore backup:', e);
    } finally {
      loading = false;
    }
  }

  // Extract readable name from backup path
  function getBackupDisplayName(backupPath: string): string {
    const filename = backupPath.split(/[/\\]/).pop() || backupPath;
    const match = filename.match(/werewolf_backup_(\d{8}_\d{6})\.db/);
    if (match && match[1]) {
      const timestamp = match[1];
      const year = timestamp.slice(0, 4);
      const month = timestamp.slice(4, 6);
      const day = timestamp.slice(6, 8);
      const hour = timestamp.slice(9, 11);
      const minute = timestamp.slice(11, 13);
      const second = timestamp.slice(13, 15);
      
      return `${year}-${month}-${day} ${hour}:${minute}:${second}`;
    }
    return filename;
  }

  // Get file size (if available)
  function getFileInfo(backupPath: string): string {
    try {
      // This would need to be implemented via Tauri if file size info is needed
      return 'Database Backup';
    } catch {
      return 'Database Backup';
    }
  }

  // Clear messages after a delay
  function clearMessages() {
    setTimeout(() => {
      successMessage = '';
      error = '';
    }, 5000);
  }

  // Watch for success/error messages and auto-clear
  $: if (successMessage || error) {
    clearMessages();
  }

  // Load backups on mount
  onMount(loadBackups);
</script>

<div class="backup-manager">
  <div class="backup-header">
    <h2 class="text-h1 text-gray-900 mb-1">{$_('backup.title')}</h2>
    <p class="text-body text-gray-600">
      {$_('backup.subtitle')}
    </p>
  </div>

  <!-- Actions -->
  <div class="backup-actions">
    <button 
      class="btn-primary" 
      on:click={createBackup} 
      disabled={loading}
    >
      {#if loading}
        <span class="loading-spinner"></span>
      {/if}
      <Database size={16} strokeWidth={2} class="inline mr-2" />
      {$_('buttons.create_backup')}
    </button>
    
    <button 
      class="btn-secondary" 
      on:click={loadBackups} 
      disabled={loading}
    >
      <RefreshCw size={16} strokeWidth={2} class="inline mr-2" />
      {$_('buttons.refresh_list')}
    </button>
  </div>

  <!-- Status Messages -->
  {#if successMessage}
    <div class="success-message">
      {successMessage}
    </div>
  {/if}

  {#if error}
    <div class="error-message">
      {error}
    </div>
  {/if}

  <!-- Loading State -->
  {#if loading}
    <div class="loading-state">
      <span class="loading-spinner"></span>
      {$_('backup.loading')}
    </div>
  {/if}

  <!-- Backup List -->
  {#if backups.length > 0 && !loading}
    <div class="backup-list">
      <h3 class="text-h2 text-gray-900">{$_('backup.available_backups')}</h3>
      <div class="backup-list-header">
        <span>{$_('backup.date_time')}</span>
        <span>{$_('backup.details')}</span>
        <span>{$_('backup.actions')}</span>
      </div>
      
      {#each backups as backup}
        <div class="backup-item">
          <div class="backup-info">
            <div class="backup-name">
              {getBackupDisplayName(backup)}
            </div>
            <div class="backup-details">
              {$_('backup.backup_type')}
            </div>
          </div>
          
          <div class="backup-actions-item">
            <button 
              class="btn-outline btn-sm" 
              on:click={() => restoreBackup(backup)}
              disabled={loading}
            >
              <RotateCcw size={14} strokeWidth={2} class="inline mr-1" />
              {$_('buttons.restore')}
            </button>
          </div>
        </div>
      {/each}
    </div>
  {:else if !loading}
    <div class="no-backups">
      <div class="no-backups-icon">
        <FolderOpen size={48} class="text-text-secondary" strokeWidth={1.5} />
      </div>
      <h3 class="text-h2 text-gray-900">{$_('backup.no_backups_title')}</h3>
      <p class="text-body text-gray-600">{$_('backup.no_backups_description')}</p>
      <button 
        class="btn-primary" 
        on:click={createBackup}
      >
        {$_('buttons.create_first_backup')}
      </button>
    </div>
  {/if}

  <!-- Help Section -->
  <div class="backup-help">
    <h4 class="text-h3 text-blue-900">
      <Lightbulb size={18} strokeWidth={2} class="inline mr-2" />
      {$_('help.best_practices')}
    </h4>
    <ul class="text-caption text-blue-700">
      <li><strong>{$_('help.before_competitions')}</strong></li>
      <li><strong>{$_('help.regular_backups')}</strong></li>
      <li><strong>{$_('help.safe_restore')}</strong></li>
      <li><strong>{$_('help.after_restore')}</strong></li>
    </ul>
  </div>
</div>

<style>
  .backup-manager {
    width: 100%;
    margin: 0;
    padding: 0.75rem;
  }

  .backup-header {
    text-align: center;
    margin-bottom: 0.75rem;
  }

  .backup-actions {
    display: flex;
    gap: 0.5rem;
    justify-content: center;
    margin-bottom: 0.75rem;
    flex-wrap: wrap;
  }

  .success-message {
    background-color: #d1fae5;
    border: 1px solid #6ee7b7;
    border-radius: 0.25rem;
    padding: 0.5rem;
    margin-bottom: 0.5rem;
    color: #065f46;
    font-size: 0.875rem;
  }

  .error-message {
    background-color: #fef2f2;
    border: 1px solid #fecaca;
    border-radius: 0.25rem;
    padding: 0.5rem;
    margin-bottom: 0.5rem;
    color: #dc2626;
    font-size: 0.875rem;
  }

  .loading-state {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    padding: 1rem;
    color: #6b7280;
  }

  .backup-list {
    background: white;
    border-radius: 0.25rem;
    border: 1px solid #e5e7eb;
    overflow: hidden;
    margin-bottom: 0.75rem;
  }

  .backup-list h3 {
    background-color: #f9fafb;
    padding: 0.5rem;
    margin: 0;
    border-bottom: 1px solid #e5e7eb;
    color: #374151;
  }

  .backup-list-header {
    display: grid;
    grid-template-columns: 2fr 1fr 1fr;
    gap: 0.5rem;
    padding: 0.375rem 0.5rem;
    background-color: #f3f4f6;
    font-weight: 600;
    color: #374151;
    border-bottom: 1px solid #e5e7eb;
    font-size: 0.75rem;
  }

  .backup-item {
    display: grid;
    grid-template-columns: 2fr 1fr;
    gap: 0.5rem;
    padding: 0.5rem;
    border-bottom: 1px solid #e5e7eb;
    align-items: center;
  }

  .backup-item:last-child {
    border-bottom: none;
  }

  .backup-item:hover {
    background-color: #f9fafb;
  }

  .backup-info {
    display: flex;
    flex-direction: column;
    gap: 0.125rem;
  }

  .backup-name {
    font-weight: 600;
    color: #374151;
    font-family: monospace;
    font-size: 0.875rem;
  }

  .backup-details {
    font-size: 0.75rem;
    color: #6b7280;
  }

  .backup-actions-item {
    display: flex;
    justify-content: flex-end;
  }

  .no-backups {
    text-align: center;
    padding: 1.5rem 0.75rem;
    color: #6b7280;
  }

  .no-backups-icon {
    display: flex;
    justify-content: center;
    margin-bottom: 0.5rem;
  }

  .no-backups h3 {
    margin-bottom: 0.25rem;
    color: #374151;
  }

  .no-backups p {
    margin-bottom: 0.75rem;
  }

  .backup-help {
    background-color: #f0f9ff;
    border: 1px solid #bae6fd;
    border-radius: 0.25rem;
    padding: 0.75rem;
    margin-top: 0.75rem;
  }

  .backup-help h4 {
    margin-bottom: 0.5rem;
  }

  .backup-help ul {
    line-height: 1.4;
    margin: 0;
    padding-left: 1rem;
  }

  .backup-help li {
    margin-bottom: 0.25rem;
  }

  .btn-primary {
    @apply bg-blue-600 text-white border border-blue-600
           px-3 py-1.5 text-sm font-medium rounded
           transition-colors duration-200 cursor-pointer
           hover:bg-blue-700 disabled:opacity-60 disabled:cursor-not-allowed;
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
  }

  .btn-secondary {
    @apply bg-gray-100 text-gray-700 border border-gray-300
           px-3 py-1.5 text-sm font-medium rounded
           transition-colors duration-200 cursor-pointer
           hover:bg-gray-200 disabled:opacity-60 disabled:cursor-not-allowed;
  }

  .btn-outline {
    @apply bg-transparent text-blue-600 border border-blue-600
           px-2 py-1 text-xs font-medium rounded
           transition-colors duration-200 cursor-pointer
           hover:bg-blue-600 hover:text-white disabled:opacity-60 disabled:cursor-not-allowed;
  }

  .btn-sm {
    padding: 0.25rem 0.5rem;
    font-size: 0.75rem;
  }

  .loading-spinner {
    display: inline-block;
    width: 0.75rem;
    height: 0.75rem;
    border: 2px solid #f3f4f6;
    border-top: 2px solid #3b82f6;
    border-radius: 50%;
    animation: spin 1s linear infinite;
  }

  @keyframes spin {
    0% { transform: rotate(0deg); }
    100% { transform: rotate(360deg); }
  }

  @media (max-width: 640px) {
    .backup-manager {
      padding: 0.5rem;
    }

    .backup-list-header,
    .backup-item {
      grid-template-columns: 1fr;
      text-align: left;
      gap: 0.25rem;
    }

    .backup-actions-item {
      justify-content: flex-start;
    }

    .backup-actions {
      flex-direction: column;
      align-items: center;
      gap: 0.25rem;
    }
  }
</style>