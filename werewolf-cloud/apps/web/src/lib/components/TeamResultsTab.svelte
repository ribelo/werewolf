<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import { _ } from 'svelte-i18n';
  import TeamResultsTable from './team-results/TeamResultsTable.svelte';
  import Download from 'lucide-svelte/icons/download';
  import Minus from 'lucide-svelte/icons/minus';
  import type { ContestDetail, TeamResultsBundle } from '$lib/types';

  export let contest: ContestDetail | null = null;
  export let teamResults: TeamResultsBundle | null = null;
  export let loading = false;

  const dispatch = createEventDispatcher();

  $: hasResults = teamResults?.mixed?.rows && teamResults.mixed.rows.length > 0;

  function handleExport(format: 'csv' | 'json') {
    if (!hasResults) return;

    const data = teamResults.mixed.rows;
    dispatch('export', { format, view: 'team', data });
  }
</script>

<div class="space-y-4">
  <!-- Header with Export -->
  <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
    <div>
      <h3 class="text-h3 text-text-primary">{$_('public.results.team.title')}</h3>
      <p class="text-body text-text-secondary">{$_('public.results.team.subtitle')}</p>
    </div>

    <!-- Export Buttons -->
    <div class="flex gap-2">
      <button
        type="button"
        class="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium text-text-secondary bg-element-bg rounded-md hover:bg-element-bg/80 transition-colors"
        on:click={() => handleExport('csv')}
        disabled={loading || !hasResults}
        title={$_('public.results.export.csv')}
      >
        <Download class="h-4 w-4" />
        CSV
      </button>
      <button
        type="button"
        class="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium text-text-secondary bg-element-bg rounded-md hover:bg-element-bg/80 transition-colors"
        on:click={() => handleExport('json')}
        disabled={loading || !hasResults}
        title={$_('public.results.export.json')}
      >
        <Download class="h-4 w-4" />
        JSON
      </button>
    </div>
  </div>

  <!-- Team Results Count -->
  {#if hasResults}
    <p class="text-sm text-text-secondary">
      {$_('public.results.team.count', { count: teamResults.mixed.rows.length })}
    </p>
  {:else if !loading}
    <p class="text-sm text-text-secondary italic">
      {$_('public.results.team.no_results')}
    </p>
  {/if}

  <!-- Results Table -->
  {#if loading}
    <div class="flex items-center justify-center py-12">
      <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      <span class="ml-3 text-text-secondary">{$_('public.results.loading')}</span>
    </div>
  {:else if hasResults}
    <TeamResultsTable table={teamResults.mixed} />
  {:else}
    <div class="text-center py-12">
      <Minus class="h-12 w-12 text-text-secondary mx-auto mb-4" />
      <p class="text-text-secondary">{$_('public.results.team.no_data')}</p>
    </div>
  {/if}
</div>