<script lang="ts">
  import { onMount } from 'svelte';
  import { _ } from 'svelte-i18n';
  import { appView } from './lib/stores';
  import ContestWizard from './lib/components/ContestWizard.svelte';
  import ContestView from './lib/components/ContestView.svelte';
  import LanguageSwitcher from './lib/components/LanguageSwitcher.svelte';
  import CustomTitlebar from './lib/components/CustomTitlebar.svelte';
  import SettingsView from './lib/components/SettingsView.svelte';
  import { Settings, Trophy, BarChart3 } from 'lucide-svelte';
  import './lib/i18n';

  console.log('🔧 App.svelte script executing');

  onMount(() => {
    console.log('🏋️ App.svelte mounted');
  });

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

<!-- Custom Titlebar -->
<CustomTitlebar />

<div class="min-h-screen bg-main-bg flex flex-col" style="padding-top: 40px;">
  <!-- Header -->
  <header class="container-full py-3 border-b-2 border-border-color">
    <div class="flex justify-between items-center">
      <div class="flex-1"></div>
      <div class="text-center">
        <h1 class="text-h1 text-text-primary">
          {$_('app.title')}
        </h1>
        <p class="text-caption text-text-secondary mt-2">
          {$_('app.subtitle')}
        </p>
      </div>
      <div class="flex-1"></div>
    </div>
  </header>

  <!-- Main Content -->
  <main class="flex-1">
    {#if $appView === 'mainMenu'}
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
    {/if}
  </main>

  <!-- Footer -->
  <footer class="container-full py-3 border-t-2 border-border-color">
    <p class="text-caption text-center text-text-secondary">
      {$_('messages.built_for_club')}
    </p>
  </footer>
</div>