<script lang="ts">
  import { createEventDispatcher, onMount } from 'svelte';
  import { page } from '$app/stores';
  import { goto } from '$app/navigation';
  import { _ } from 'svelte-i18n';
  import IndividualResultsTab from './IndividualResultsTab.svelte';
  import TeamResultsTab from './TeamResultsTab.svelte';
  import type { ContestDetail, PublicResultsBundle } from '$lib/types';

  export let contest: ContestDetail | null = null;
  export let resultsBundle: PublicResultsBundle | null = null;
  export let loading = false;
  export let selectedTab: 'individual' | 'team' = 'individual';

  const dispatch = createEventDispatcher();

  // Update URL when tab changes
  function handleTabChange(tab: 'individual' | 'team') {
    selectedTab = tab;
    const url = new URL($page.url);
    url.searchParams.set('tab', tab);
    goto(url.toString(), { replaceState: true, noScroll: true });
  }

  function handleExport(event: CustomEvent) {
    dispatch('export', event.detail);
  }

  // Initialize selectedTab from URL on mount
  onMount(() => {
    const urlTab = $page.url.searchParams.get('tab') as 'individual' | 'team';
    if (urlTab && (urlTab === 'individual' || urlTab === 'team')) {
      selectedTab = urlTab;
    }
  });
</script>

<div class="space-y-6">
  <!-- Main Tab Navigation -->
  <div class="border-b border-border-color">
    <nav class="flex space-x-8" aria-label={$_('public.results.tabs.navigation')}>
      <button
        type="button"
        class={`whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm transition-colors ${
          selectedTab === 'individual'
            ? 'border-primary text-primary'
            : 'border-transparent text-text-secondary hover:text-text-primary hover:border-border-color'
        }`}
        on:click={() => handleTabChange('individual')}
        disabled={loading}
      >
        {$_('public.results.tabs.individual')}
      </button>
      <button
        type="button"
        class={`whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm transition-colors ${
          selectedTab === 'team'
            ? 'border-primary text-primary'
            : 'border-transparent text-text-secondary hover:text-text-primary hover:border-border-color'
        }`}
        on:click={() => handleTabChange('team')}
        disabled={loading}
      >
        {$_('public.results.tabs.team')}
      </button>
    </nav>
  </div>

  <!-- Tab Content -->
  <div class="min-h-[400px]">
    {#if selectedTab === 'individual'}
      <IndividualResultsTab
        {contest}
        results={resultsBundle?.individual || { open: [], age: [], weight: [] }}
        scoreboard={resultsBundle?.scoreboard || null}
        {loading}
        on:export={handleExport}
      />
    {:else if selectedTab === 'team'}
      <TeamResultsTab
        {contest}
        teamResults={resultsBundle?.team || null}
        {loading}
        on:export={handleExport}
      />
    {/if}
  </div>
</div>
