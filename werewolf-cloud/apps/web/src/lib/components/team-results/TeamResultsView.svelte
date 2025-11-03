<script lang="ts">
  import { _ } from 'svelte-i18n';
  import TeamResultsTable from './TeamResultsTable.svelte';
  import type { TeamResultsBundle } from '$lib/types';

  const descriptorDescriptionKey = 'contest_detail.team_results.metric_descriptions.mixed';

  export let teamResults: TeamResultsBundle | null = null;
  export let error: string | null = null;
  export let loading = false;
  export let contestName = '';
  $: activeTable = teamResults?.mixed ?? null;
</script>

<section class="space-y-6" on:click|stopPropagation>
  <header class="space-y-2">
    <p class="text-caption uppercase tracking-[0.35em] text-text-secondary">
      {$_('contest_detail.team_results.header_label')}
    </p>
    <h1 class="text-h2 text-text-primary">
      {$_('contest_detail.team_results.title')}
    </h1>
    <p class="text-body text-text-secondary">
      {contestName
        ? $_('contest_detail.team_results.subtitle_with_name', { contest: contestName })
        : $_('contest_detail.team_results.subtitle')}
    </p>
  </header>

  <div class="card space-y-6">
    <div class="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
      <div class="space-y-2">
        <h2 class="text-h3 text-text-primary">
          {$_('contest_detail.team_results.leaderboard_title')}
        </h2>
        <p class="max-w-2xl text-body text-text-secondary">
          {$_(descriptorDescriptionKey)}
        </p>

      </div>
    </div>

    {#if error}
      <div class="rounded border border-status-error bg-status-error/20 px-4 py-3 text-sm text-status-error">
        {error}
      </div>
    {:else if loading}
      <p class="text-body text-text-secondary">{$_('contest_detail.team_results.loading')}</p>
    {:else if !activeTable || activeTable.rows.length === 0}
      <p class="text-body text-text-secondary">{$_('contest_detail.team_results.empty')}</p>
    {:else}
      <TeamResultsTable table={activeTable} />
    {/if}
  </div>
</section>
