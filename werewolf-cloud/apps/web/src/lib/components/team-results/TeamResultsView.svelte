<script lang="ts">
  import { _ } from 'svelte-i18n';
  import { ChevronDown } from 'lucide-svelte';
  import TeamResultsTable from './TeamResultsTable.svelte';
  import type { TeamResultsBundle, TeamScoreMetric, TeamResultsTable as TeamResultsTableType } from '$lib/types';

  const metricMetadata: Record<TeamScoreMetric, { labelKey: string; descriptionKey: string }> = {
    overall: {
      labelKey: 'contest_detail.team_results.metrics.overall',
      descriptionKey: 'contest_detail.team_results.metric_descriptions.overall',
    },
    squat: {
      labelKey: 'contest_detail.team_results.metrics.squat',
      descriptionKey: 'contest_detail.team_results.metric_descriptions.squat',
    },
    bench: {
      labelKey: 'contest_detail.team_results.metrics.bench',
      descriptionKey: 'contest_detail.team_results.metric_descriptions.bench',
    },
    deadlift: {
      labelKey: 'contest_detail.team_results.metrics.deadlift',
      descriptionKey: 'contest_detail.team_results.metric_descriptions.deadlift',
    },
  };

  const orderedMetrics: TeamScoreMetric[] = ['overall', 'squat', 'bench', 'deadlift'];

  export let teamResults: TeamResultsBundle | null = null;
  export let error: string | null = null;
  export let loading = false;
  export let contestName = '';
  export let allowedMetrics: TeamScoreMetric[] = [...orderedMetrics];

  let selectedMetric: TeamScoreMetric = 'squat';
  let metricMenuOpen = false;

  function getTable(metric: TeamScoreMetric): TeamResultsTableType | null {
    if (!teamResults) return null;
    switch (metric) {
      case 'overall':
        return teamResults.overall;
      case 'squat':
        return teamResults.squat;
      case 'bench':
        return teamResults.bench;
      case 'deadlift':
        return teamResults.deadlift;
      default:
        return null;
    }
  }

  function metricHasResults(metric: TeamScoreMetric): boolean {
    const table = getTable(metric);
    if (!table || table.rows.length === 0) return false;
    if (metric === 'overall') {
      return table.rows.length > 0;
    }
    const pointCheck = (points: number) => Number.isFinite(points) && points > 0;
    switch (metric) {
      case 'squat':
        return table.rows.some((row) =>
          row.contributors.some(
            (contributor) => pointCheck(contributor.squatPoints) || pointCheck(contributor.bestSquat),
          ),
        );
      case 'bench':
        return table.rows.some((row) =>
          row.contributors.some(
            (contributor) => pointCheck(contributor.benchPoints) || pointCheck(contributor.bestBench),
          ),
        );
      case 'deadlift':
        return table.rows.some((row) =>
          row.contributors.some(
            (contributor) => pointCheck(contributor.deadliftPoints) || pointCheck(contributor.bestDeadlift),
          ),
        );
      default:
        return false;
    }
  }

  $: filteredMetrics = orderedMetrics.filter(
    (metric) => allowedMetrics.includes(metric) && (!teamResults || metricHasResults(metric)),
  );

  $: availableMetrics = filteredMetrics.length > 0 ? filteredMetrics : allowedMetrics;

  $: {
    if (!availableMetrics.includes(selectedMetric)) {
      selectedMetric = availableMetrics[0] ?? 'squat';
    }
  }

  $: activeTable = getTable(selectedMetric);
  $: selectedLabelKey = metricMetadata[selectedMetric]?.labelKey ?? metricMetadata.overall.labelKey;
  $: selectedDescriptionKey =
    metricMetadata[selectedMetric]?.descriptionKey ?? metricMetadata.overall.descriptionKey;

  function toggleMetricMenu() {
    metricMenuOpen = !metricMenuOpen;
  }

  function selectMetric(metric: TeamScoreMetric) {
    selectedMetric = metric;
    metricMenuOpen = false;
  }
</script>

<svelte:window
  on:click={() => {
    metricMenuOpen = false;
  }}
  on:keydown={(event) => {
    if (event.key === 'Escape') {
      metricMenuOpen = false;
    }
  }}
/>

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
          {$_(selectedDescriptionKey)}
        </p>

      </div>
      <div class="relative" on:click|stopPropagation>
        <button
          type="button"
          class={`px-3 py-1 text-xxs ${
            metricMenuOpen ? 'btn-primary text-black' : 'btn-secondary'
          } flex min-w-[200px] items-center justify-between gap-3`}
          aria-haspopup="menu"
          aria-expanded={metricMenuOpen}
          on:click={toggleMetricMenu}
        >
          <div class="flex flex-col text-left leading-tight">
            <span class="font-semibold">{$_('contest_detail.team_results.metric_selector.button_label')}</span>
            <span class="text-text-secondary">{$_(selectedLabelKey)}</span>
          </div>
          <ChevronDown
            class={`h-3.5 w-3.5 transition-transform ${metricMenuOpen ? 'rotate-180' : ''}`}
            aria-hidden="true"
          />
        </button>
        {#if metricMenuOpen}
          <div
            class="absolute right-0 top-full z-40 mt-2 w-56 rounded border border-border-color bg-element-bg px-3 py-3 shadow-lg"
            role="menu"
          >
            <div class="space-y-2">
              {#each availableMetrics as metric}
                <button
                  type="button"
                  class={`${
                    metric === selectedMetric ? 'btn-primary text-black' : 'btn-secondary'
                  } w-full justify-start px-3 py-1 text-xs`}
                  role="menuitem"
                  on:click={() => selectMetric(metric)}
                >
                  {$_(metricMetadata[metric]?.labelKey ?? metricMetadata.overall.labelKey)}
                </button>
              {/each}
            </div>
          </div>
        {/if}
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
      <TeamResultsTable table={activeTable} metric={selectedMetric} />
    {/if}
  </div>
</section>
