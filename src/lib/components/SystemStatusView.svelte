<script lang="ts">
  import { onMount } from 'svelte';
  import { invoke } from '@tauri-apps/api/core';
  import { _ } from 'svelte-i18n';
  import { AlertTriangle, RefreshCw, Settings, Database } from 'lucide-svelte';

  // Rust serde serializes enums as tagged unions
  type ConfigHealth = 'Ok' | { Error: { backup_path?: string; message: string } };
  type DatabaseHealth = 'Ok' | { Error: { backup_path?: string; message: string; using_fallback: boolean } };

  interface SystemHealth {
    config_health: ConfigHealth;
    database_health: DatabaseHealth;
  }

  let healthStatus: SystemHealth | null = null;
  let loading = true;
  let error: string | null = null;

  onMount(async () => {
    await checkSystemHealth();
  });

  async function checkSystemHealth() {
    try {
      loading = true;
      error = null;
      healthStatus = await invoke('system_health_check');
      console.log('System health status:', healthStatus);
    } catch (e) {
      console.error('Failed to check system health:', e);
      error = e as string;
    } finally {
      loading = false;
    }
  }

  async function resetSettings() {
    try {
      await invoke('settings_reset_to_defaults');
      await checkSystemHealth(); // Refresh status
    } catch (e) {
      console.error('Failed to reset settings:', e);
      error = e as string;
    }
  }

  async function resetDatabase() {
    try {
      await invoke('reset_database');
      await checkSystemHealth(); // Refresh status
    } catch (e) {
      console.error('Failed to reset database:', e);
      error = e as string;
    }
  }

</script>

<!-- Custom Titlebar would be here in a real app -->
<div class="min-h-screen bg-main-bg flex flex-col">
  <!-- Header -->
  <header class="container-full py-4 border-b-2 border-border-color">
    <div class="text-center">
      <div class="mb-2">
        <AlertTriangle size={48} class="mx-auto text-accent-red" />
      </div>
      <h1 class="text-h1 text-text-primary">
        {$_('system.title')}
      </h1>
      <p class="text-body text-text-secondary mt-2">
        {$_('system.subtitle')}
      </p>
    </div>
  </header>

  <!-- Main Content -->
  <main class="flex-1 container-medium py-8">
    {#if loading}
      <div class="text-center">
        <RefreshCw size={32} class="mx-auto animate-spin text-accent-red mb-4" />
        <p class="text-body text-text-secondary">{$_('system.checking')}</p>
      </div>
    {:else if error}
      <div class="card bg-red-50 border-red-200">
        <div class="text-center">
          <AlertTriangle size={32} class="mx-auto text-red-600 mb-4" />
          <h2 class="text-h2 text-red-800 mb-2">{$_('system.check_failed')}</h2>
          <p class="text-body text-red-700 mb-4">{error}</p>
          <button 
            class="btn-secondary"
            on:click={checkSystemHealth}
          >
            {$_('system.retry')}
          </button>
        </div>
      </div>
    {:else if healthStatus}
      <!-- System Status Cards -->
      <div class="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
        <!-- Configuration Status -->
        <div class="card">
          <div class="flex items-center mb-4">
            <Settings size={24} class="mr-3 text-accent-red" />
            <h2 class="text-h2 text-text-primary">{$_('system.config.title')}</h2>
          </div>
          <div class="flex items-center mb-2">
            {#if healthStatus.config_health === 'Ok'}
              <span class="text-2xl mr-2">✅</span>
              <span class="text-body text-green-600">{$_('system.status.healthy')}</span>
            {:else}
              <span class="text-2xl mr-2">❌</span>
              <span class="text-body text-red-600">{$_('system.status.error')}</span>
            {/if}
          </div>
          {#if healthStatus.config_health !== 'Ok'}
            <p class="text-caption text-text-secondary mb-2">
              {$_('system.error')}: {healthStatus.config_health.Error.message}
            </p>
            {#if healthStatus.config_health.Error.backup_path}
              <p class="text-caption text-text-secondary">
                {$_('system.backup_location')}: {healthStatus.config_health.Error.backup_path}
              </p>
            {/if}
          {/if}
        </div>

        <!-- Database Status -->
        <div class="card">
          <div class="flex items-center mb-4">
            <Database size={24} class="mr-3 text-accent-red" />
            <h2 class="text-h2 text-text-primary">{$_('system.database.title')}</h2>
          </div>
          <div class="flex items-center mb-2">
            {#if healthStatus.database_health === 'Ok'}
              <span class="text-2xl mr-2">✅</span>
              <span class="text-body text-green-600">{$_('system.status.healthy')}</span>
            {:else if healthStatus.database_health.Error.using_fallback}
              <span class="text-2xl mr-2">⚠️</span>
              <span class="text-body text-orange-600">{$_('system.status.using_fallback')}</span>
            {:else}
              <span class="text-2xl mr-2">❌</span>
              <span class="text-body text-red-600">{$_('system.status.error')}</span>
            {/if}
          </div>
          {#if healthStatus.database_health !== 'Ok'}
            {#if healthStatus.database_health.Error.using_fallback}
              <p class="text-caption text-orange-600 mb-2">
                ⚠️ {$_('system.database.temporary')}
              </p>
            {/if}
            <p class="text-caption text-text-secondary mb-2">
              {$_('system.error')}: {healthStatus.database_health.Error.message}
            </p>
            {#if healthStatus.database_health.Error.backup_path}
              <p class="text-caption text-text-secondary">
                {$_('system.backup_location')}: {healthStatus.database_health.Error.backup_path}
              </p>
            {/if}
          {/if}
        </div>
      </div>


      <!-- Action Buttons -->
      <div class="card">
        <h2 class="text-h2 text-text-primary mb-4">{$_('system.actions.title')}</h2>
        
        {#if !(healthStatus?.config_health === 'Ok' && healthStatus?.database_health === 'Ok')}
          <div class="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
            <div class="flex items-center">
              <AlertTriangle size={20} class="text-red-600 mr-2" />
              <p class="text-body text-red-800 font-medium">
                {$_('system.not_operational')}
              </p>
            </div>
            <p class="text-caption text-red-700 mt-2">
              {$_('system.not_operational_desc')}
            </p>
          </div>
        {/if}

        <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
          <button 
            class="btn-secondary"
            on:click={checkSystemHealth}
          >
            <RefreshCw size={16} class="mr-2" />
            {$_('system.actions.refresh')}
          </button>
          
          <button 
            class="btn-secondary"
            on:click={resetSettings}
          >
            <Settings size={16} class="mr-2" />
            {$_('system.actions.reset_config')}
          </button>

          <button 
            class="btn-secondary text-red-700 border-red-300 hover:bg-red-50"
            on:click={resetDatabase}
          >
            <Database size={16} class="mr-2" />
            {$_('system.actions.reset_database')}
          </button>
        </div>

        {#if healthStatus?.config_health === 'Ok' && healthStatus?.database_health === 'Ok'}
          <div class="mt-6 pt-6 border-t border-border-color">
            <p class="text-caption text-text-secondary mb-4">
              {$_('system.continue_desc')}
            </p>
            <button 
              class="btn-primary"
              on:click={() => window.location.reload()}
            >
              {$_('system.continue')}
            </button>
          </div>
        {/if}
      </div>
    {/if}
  </main>
</div>