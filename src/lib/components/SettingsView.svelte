<script lang="ts">
  import { onMount } from 'svelte';
  import { invoke } from '@tauri-apps/api/core';
  import { _ } from 'svelte-i18n';
  import { appView } from '../stores';
  import { ArrowLeft, Globe, Database, Trash2, HardDrive, RefreshCw } from 'lucide-svelte';
  import LanguageSwitcher from './LanguageSwitcher.svelte';
  import BackupManager from './BackupManager.svelte';
  
  let loading = false;
  let error = '';
  let successMessage = '';
  
  function handleBack() {
    appView.set('mainMenu');
  }
  
  async function resetDatabase() {
    const confirmed = confirm(
      `${$_('settings.reset_database_warning')}\n\n` +
      `${$_('settings.reset_database_confirmation')}\n\n` +
      `${$_('settings.reset_database_backup_recommendation')}`
    );
    
    if (!confirmed) return;
    
    // Double confirmation for safety
    const doubleConfirmed = confirm(
      `${$_('settings.reset_database_final_warning')}\n\n` +
      `${$_('settings.are_you_sure')}`
    );
    
    if (!doubleConfirmed) return;
    
    loading = true;
    error = '';
    successMessage = '';
    
    try {
      const result = await invoke('reset_database');
      successMessage = result as string;
      console.log('Database reset successful:', result);
    } catch (err) {
      error = `${$_('settings.reset_database_failed')} ${err}`;
      console.error('Failed to reset database:', err);
    } finally {
      loading = false;
    }
  }
  
  // Clear messages after delay
  function clearMessages() {
    setTimeout(() => {
      successMessage = '';
      error = '';
    }, 5000);
  }
  
  // Auto-clear messages
  $: if (successMessage || error) {
    clearMessages();
  }
</script>

<div class="min-h-screen bg-main-bg">
  <!-- Header -->
  <header class="container-full py-6 border-b border-border-color">
    <div class="flex items-center justify-between">
      <div class="flex items-center gap-4">
        <button
          class="btn-secondary flex items-center gap-2"
          on:click={handleBack}
        >
          <ArrowLeft size={16} strokeWidth={2} />
          {$_('buttons.back')}
        </button>
        <div>
          <h1 class="text-h2 text-text-primary">{$_('settings.title')}</h1>
          <p class="text-caption text-text-secondary mt-1">
            {$_('settings.subtitle')}
          </p>
        </div>
      </div>
    </div>
  </header>

  <main class="container-full py-8">
    
    <!-- Language Settings -->
    <div class="card mb-8">
      <div class="card-header">
        <h2 class="text-h3 text-text-primary flex items-center gap-2">
          <Globe size={20} strokeWidth={2} class="text-accent-red" />
          {$_('settings.language_title')}
        </h2>
        <p class="text-body text-text-secondary">
          {$_('settings.language_description')}
        </p>
      </div>
      
      <div class="flex items-center gap-4">
        <span class="text-label text-text-secondary">{$_('settings.current_language')}:</span>
        <LanguageSwitcher />
      </div>
    </div>

    <!-- Database Settings -->
    <div class="card mb-8">
      <div class="card-header">
        <h2 class="text-h3 text-text-primary flex items-center gap-2">
          <Database size={20} strokeWidth={2} class="text-accent-red" />
          {$_('settings.database_title')}
        </h2>
        <p class="text-body text-text-secondary">
          {$_('settings.database_description')}
        </p>
      </div>

      <!-- Status Messages -->
      {#if successMessage}
        <div class="success-message mb-4">
          {successMessage}
        </div>
      {/if}

      {#if error}
        <div class="error-message mb-4">
          {error}
        </div>
      {/if}
      
      <div class="flex flex-col gap-4">
        <!-- Reset Database -->
        <div class="database-action">
          <div class="flex items-center gap-3">
            <Trash2 size={18} strokeWidth={2} class="text-red-400" />
            <div>
              <h3 class="text-body font-semibold text-text-primary">{$_('settings.reset_database_title')}</h3>
              <p class="text-caption text-text-secondary">
                {$_('settings.reset_database_subtitle')}
              </p>
            </div>
          </div>
          <button
            class="btn-danger"
            on:click={resetDatabase}
            disabled={loading}
          >
            {#if loading}
              <RefreshCw size={16} strokeWidth={2} class="animate-spin mr-2" />
              {$_('buttons.resetting')}
            {:else}
              <Trash2 size={16} strokeWidth={2} class="mr-2" />
              {$_('buttons.reset_database')}
            {/if}
          </button>
        </div>
      </div>
    </div>

    <!-- Backup & Restore -->
    <div class="card">
      <div class="card-header">
        <h2 class="text-h3 text-text-primary flex items-center gap-2">
          <HardDrive size={20} strokeWidth={2} class="text-accent-red" />
          {$_('backup.title')}
        </h2>
        <p class="text-body text-text-secondary">
          {$_('settings.backup_description')}
        </p>
      </div>
      
      <BackupManager />
    </div>

  </main>
</div>

<style>
  .database-action {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 1rem;
    background-color: #2C2C2C;
    border: 1px solid #374151;
    border-radius: 0.375rem;
    transition: all 0.2s;
  }

  .database-action:hover {
    border-color: #dc2626;
    background-color: #1f1f1f;
  }

  .success-message {
    background-color: #065f46;
    border: 1px solid #059669;
    border-radius: 0.25rem;
    padding: 0.75rem;
    color: #d1fae5;
    font-size: 0.875rem;
  }

  .error-message {
    background-color: #7f1d1d;
    border: 1px solid #dc2626;
    border-radius: 0.25rem;
    padding: 0.75rem;
    color: #fecaca;
    font-size: 0.875rem;
  }

  .btn-danger {
    background-color: #dc2626;
    color: white;
    border: 2px solid #dc2626;
    padding: 0.5rem 1rem;
    font-family: 'Bebas Neue', sans-serif;
    font-size: 0.875rem;
    letter-spacing: 0.05em;
    text-transform: uppercase;
    transition: all 0.3s ease-in-out;
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
  }
  
  .btn-danger:hover {
    background-color: #b91c1c;
    border-color: #b91c1c;
  }
  
  .btn-danger:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
</style>