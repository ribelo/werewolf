<script lang="ts">
  import { onMount } from 'svelte';
  import { _ } from 'svelte-i18n';
  import { invoke } from '@tauri-apps/api/core';
  import { getCurrentWindow } from '@tauri-apps/api/window';
  import { appView, showHealthWarning, systemHealth } from './lib/stores';
  import ContestWizard from './lib/components/ContestWizard.svelte';
  import ContestView from './lib/components/ContestView.svelte';
  import CustomTitlebar from './lib/components/CustomTitlebar.svelte';
  import SettingsView from './lib/components/SettingsView.svelte';
  import SystemStatusView from './lib/components/SystemStatusView.svelte';
  import DisplayScreen from './lib/components/DisplayScreen.svelte';
  import { Settings, Trophy, BarChart3, AlertTriangle } from 'lucide-svelte';

  console.log('🔧 App.svelte script executing');

  onMount(async () => {
    console.log('🏋️ App.svelte mounted');
    
    // Check if we're in the display window and route accordingly
    try {
      const currentWindow = getCurrentWindow();
      const windowLabel = currentWindow.label;
      console.log('Current window label:', windowLabel);
      
      if (windowLabel === 'display') {
        console.log('Display window detected, routing to displayScreen');
        appView.set('displayScreen');
        return; // Skip health check for display window
      }
    } catch (err) {
      console.error('Failed to get window label:', err);
    }
    
    await checkSystemHealth();
  });

  interface HealthCheckResponse {
    config_health: string;
    database_health: string;
  }

  async function checkSystemHealth(): Promise<void> {
    try {
      const health = await invoke('system_health_check') as HealthCheckResponse;
      console.log('System health status:', health);
      systemHealth.set(health);
      
      // System is operational only if both config and database are Ok
      const isOperational = health.config_health === 'Ok' && health.database_health === 'Ok';
      
      if (!isOperational) {
        console.warn('System is not operational, showing system status view');
        appView.set('systemStatus');
      } else {
        console.log('System is healthy, showing main menu');
        appView.set('mainMenu');
      }
    } catch (e) {
      console.error('Failed to check system health:', e);
      // If health check fails, assume system issues and show status view
      appView.set('systemStatus');
    }
  }

  function handleSettingsClick(): void {
    console.log("⚙️ Settings clicked");
    appView.set('settings');
  }

  function handleCompetitionWizardClick(): void {
    appView.set('contestWizard');
  }

  function handleContestViewClick(): void {
    appView.set('contestView');
  }
</script>

{#if $appView !== 'displayScreen'}
  <!-- Custom Titlebar -->
  <CustomTitlebar />
{/if}

<div class="min-h-screen bg-main-bg flex flex-col {$appView !== 'displayScreen' ? 'pt-10' : ''}">

  <!-- Health Warning Banner -->
  {#if $showHealthWarning && $appView !== 'systemStatus'}
    <div class="container-full bg-orange-50 border-b border-orange-200 py-2">
      <div class="flex items-center justify-center text-orange-800">
        <AlertTriangle size={16} class="mr-2" />
        <span class="text-caption">
          {$_('system.not_operational_desc')}
          <button 
            class="ml-2 underline hover:no-underline"
            on:click={() => appView.set('systemStatus')}
          >
            {$_('system.actions.refresh')}
          </button>
        </span>
      </div>
    </div>
  {/if}

  <!-- Main Content -->
  <main class="flex-1">
    {#if $appView === 'systemStatus'}
      <SystemStatusView />
    {:else if $appView === 'mainMenu'}
      <div class="container-medium py-8">
        <div class="grid grid-cols-1 md:grid-cols-3 gap-6">

          <!-- Settings Tile -->
          <div
            class="card cursor-pointer no-select"
            on:click={handleSettingsClick}
            role="button"
            tabindex="0"
            on:keydown={(e) => e.key === 'Enter' && handleSettingsClick()}
          >
            <div class="text-center">
              <div class="mb-4">
                <Settings size={48} class="mx-auto text-accent-red icon-shine" strokeWidth={1.5} />
              </div>
              <h2 class="text-h2 text-text-primary mb-2">{$_('menu.settings')}</h2>
              <p class="text-body text-text-secondary">
                {$_('menu.settings_description')}
              </p>
            </div>
          </div>

          <!-- Competition Wizard Tile -->
          <div
            class="card cursor-pointer no-select"
            on:click={handleCompetitionWizardClick}
            role="button"
            tabindex="0"
            on:keydown={(e) => e.key === 'Enter' && handleCompetitionWizardClick()}
          >
            <div class="text-center">
              <div class="mb-4">
                <Trophy size={48} class="mx-auto text-accent-red icon-shine" strokeWidth={1.5} />
              </div>
              <h2 class="text-h2 text-text-primary mb-2">{$_('menu.create_competition')}</h2>
              <p class="text-body text-text-secondary">
                {$_('menu.create_competition_description')}
              </p>
            </div>
          </div>

          <!-- Contest View Tile -->
          <div
            class="card cursor-pointer no-select"
            on:click={handleContestViewClick}
            role="button"
            tabindex="0"
            on:keydown={(e) => e.key === 'Enter' && handleContestViewClick()}
          >
            <div class="text-center">
              <div class="mb-4">
                <BarChart3 size={48} class="mx-auto text-accent-red icon-shine" strokeWidth={1.5} />
              </div>
              <h2 class="text-h2 text-text-primary mb-2">{$_('menu.manage_competition')}</h2>
              <p class="text-body text-text-secondary">
                {$_('menu.manage_competition_description')}
              </p>
            </div>
          </div>

        </div>
      </div>
    {:else if $appView === 'contestWizard'}
      <ContestWizard />
    {:else if $appView === 'contestView'}
      <ContestView />
    {:else if $appView === 'settings'}
      <SettingsView />
    {:else if $appView === 'displayScreen'}
      <DisplayScreen />
    {/if}
  </main>

  {#if $appView !== 'displayScreen'}
    <!-- Footer -->
    <footer class="container-full py-3 border-t-2 border-border-color">
      <p class="text-caption text-center text-text-secondary">
        {$_('messages.built_for_club')}
      </p>
    </footer>
  {/if}
</div>