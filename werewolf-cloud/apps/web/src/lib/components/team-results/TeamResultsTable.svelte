<script lang="ts">
  import { _ } from 'svelte-i18n';
  import type { TeamResultsTable, TeamResultContributor, TeamResultRow } from '$lib/types';

  export let table: TeamResultsTable;

  const TEAM_SLOT_COUNT = 5;

  const bestLabelKey = 'contest_detail.team_results.columns.lift_weight';
  const pointsLabelKey = 'contest_detail.team_results.columns.lift_points';
  const liftTypeLabelKey = 'contest_detail.team_results.columns.lift_type';

  function formatLift(value?: number | null): string {
    const normalised = typeof value === 'number' ? value : Number(value ?? 0);
    if (!Number.isFinite(normalised) || normalised <= 0) {
      return '–';
    }
    return `${normalised.toFixed(1)} kg`;
  }

  function formatPoints(value?: number | null): string {
    const normalised = typeof value === 'number' ? value : Number(value ?? 0);
    if (!Number.isFinite(normalised) || normalised === 0) {
      return '0.00';
    }
    return normalised.toFixed(2);
  }

  function formatBodyweight(value?: number | null): string {
    const normalised = typeof value === 'number' ? value : Number(value ?? 0);
    if (!Number.isFinite(normalised) || normalised <= 0) {
      return '–';
    }
    return `${normalised.toFixed(2)} kg`;
  }

  function formatCoefficient(value?: number | null): string {
    const normalised = typeof value === 'number' ? value : Number(value ?? 0);
    if (!Number.isFinite(normalised) || normalised <= 0) {
      return '–';
    }
    return normalised.toFixed(3);
  }

  function formatMetricBest(contributor: TeamResultContributor): string {
    const selected = contributor.selectedLift;
    if (selected === 'squat') return formatLift(contributor.bestSquat);
    if (selected === 'bench') return formatLift(contributor.bestBench);
    if (selected === 'deadlift') return formatLift(contributor.bestDeadlift);
    return '–';
  }

  function formatMetricPoints(contributor: TeamResultContributor): string {
    return formatPoints(contributor.points);
  }

  function activeContributorCount(contributors: TeamResultContributor[]): number {
    return contributors.filter((contributor) => !contributor.isPlaceholder).length;
  }

  const liftLabelKeys: Record<string, string> = {
    squat: 'contest_detail.team_results.labels.lift_types.squat',
    bench: 'contest_detail.team_results.labels.lift_types.bench',
    deadlift: 'contest_detail.team_results.labels.lift_types.deadlift',
  };

  function getLiftKindKey(contributor: TeamResultContributor): string | null {
    if (contributor.isPlaceholder) return null;
    if (!contributor.selectedLift) return null;
    return liftLabelKeys[contributor.selectedLift] ?? null;
  }

  function compareRows(a: TeamResultRow, b: TeamResultRow): number {
    const metricDiff = b.totalPoints - a.totalPoints;
    if (Math.abs(metricDiff) > 0.0001) {
      return metricDiff;
    }

    return a.club.localeCompare(b.club);
  }

  $: sortedRows =
    table && Array.isArray(table.rows)
      ? [...table.rows].sort(compareRows)
      : [];

  $: rankedRows = sortedRows.map((row, index) => ({ row, displayRank: index + 1 }));

  const sexLabelKeys: Record<string, string> = {
    Male: 'contest_detail.team_results.labels.sex_m',
    Female: 'contest_detail.team_results.labels.sex_f',
  };

  const placeholderLabelKeys: Record<string, string> = {
    Male: 'contest_detail.team_results.placeholder.male',
    Female: 'contest_detail.team_results.placeholder.female',
  };

</script>

<div class="overflow-x-auto rounded-lg border border-border-color/60 bg-element-bg">
  <table class="min-w-full border-separate border-spacing-0 text-left text-sm text-text-secondary">
    <thead class="bg-element-bg text-xxs font-semibold uppercase tracking-[0.3em] text-text-secondary">
      <tr>
        <th class="px-4 py-3 text-left">{$_('contest_detail.team_results.columns.place')}</th>
        <th class="px-4 py-3 text-left">{$_('contest_detail.team_results.columns.team_or_lifter')}</th>
        <th class="px-4 py-3 text-left">{$_('contest_detail.team_results.columns.gender')}</th>
        <th class="px-4 py-3 text-left">{$_('contest_detail.team_results.columns.bodyweight')}</th>
        <th class="px-4 py-3 text-left">{$_('contest_detail.team_results.columns.weight_class')}</th>
        <th class="px-4 py-3 text-left">{$_('contest_detail.team_results.columns.age')}</th>
        <th class="px-4 py-3 text-left">{$_('contest_detail.team_results.columns.age_category')}</th>
        <th class="px-4 py-3 text-left">{$_(liftTypeLabelKey)}</th>
        <th class="px-4 py-3 text-left">{$_(bestLabelKey)}</th>
        <th class="px-4 py-3 text-left">{$_('contest_detail.team_results.columns.reshel')}</th>
        <th class="px-4 py-3 text-left">{$_('contest_detail.team_results.columns.mcc')}</th>
        <th class="px-4 py-3 text-left">{$_(pointsLabelKey)}</th>
      </tr>
    </thead>
    <tbody>
      {#each rankedRows as { row, displayRank } (row.club)}
        <tr class="bg-main-bg/30 text-text-primary">
          <td class="px-4 py-4 align-top font-semibold">{displayRank}</td>
          <td class="px-4 py-4 align-top">
            <div class="flex flex-col gap-1">
              <span class="text-body font-semibold text-text-primary">{row.club}</span>
              <span class="text-xxs uppercase tracking-[0.3em] text-text-secondary">
                {activeContributorCount(row.contributors)}/{TEAM_SLOT_COUNT} {$_('contest_detail.team_results.labels.slots_filled')}
              </span>
            </div>
          </td>
          <td class="px-4 py-4 align-top text-text-secondary">–</td> <!-- SEX -->
          <td class="px-4 py-4 align-top text-text-secondary">–</td> <!-- Bodyweight -->
          <td class="px-4 py-4 align-top text-text-secondary">–</td> <!-- Weight class -->
          <td class="px-4 py-4 align-top text-text-secondary">–</td> <!-- Age -->
          <td class="px-4 py-4 align-top text-text-secondary">–</td> <!-- Age category -->
          <td class="px-4 py-4 align-top text-text-secondary">–</td> <!-- Lift type -->
          <td class="px-4 py-4 align-top text-text-secondary">–</td> <!-- Best -->
          <td class="px-4 py-4 align-top text-text-secondary">–</td> <!-- Reshel -->
          <td class="px-4 py-4 align-top text-text-secondary">–</td> <!-- McC -->
          <td class="px-4 py-4 align-top font-semibold text-text-primary">{formatPoints(row.totalPoints)}</td>
        </tr>
        {#each row.contributors as contributor (contributor.registrationId)}
          <tr class={`border-t border-border-color/40 ${contributor.isPlaceholder ? 'bg-main-bg/20 italic text-text-secondary' : 'text-text-primary'}`}>
            <td class="px-4 py-3 align-top text-text-secondary">–</td>
            <td class="px-4 py-3 align-top">
              {#if contributor.isPlaceholder}
                <span>{$_(placeholderLabelKeys[contributor.gender] ?? 'contest_detail.team_results.placeholder.generic')}</span>
              {:else}
                <span class="font-medium text-text-primary">{contributor.firstName} {contributor.lastName}</span>
              {/if}
            </td>
            <td class="px-4 py-3 align-top">
              {#if contributor.isPlaceholder}
                <span>–</span>
              {:else}
                <span>{$_(sexLabelKeys[contributor.gender] ?? 'contest_detail.team_results.labels.sex_unknown')}</span>
              {/if}
            </td>
            <td class="px-4 py-3 align-top">{contributor.isPlaceholder ? '–' : formatBodyweight(contributor.bodyweight)}</td>
            <td class="px-4 py-3 align-top">{contributor.isPlaceholder ? '–' : contributor.weightClass ?? '–'}</td>
            <td class="px-4 py-3 align-top">{contributor.isPlaceholder ? '–' : (typeof contributor.ageYears === 'number' ? String(contributor.ageYears) : '–')}</td>
            <td class="px-4 py-3 align-top">{contributor.isPlaceholder ? '–' : contributor.ageCategory ?? '–'}</td>
            <td class="px-4 py-3 align-top">{#if contributor.isPlaceholder}–{:else}{$_(getLiftKindKey(contributor) ?? 'contest_detail.team_results.labels.lift_types.unknown')}{/if}</td>
            <td class="px-4 py-3 align-top">{contributor.isPlaceholder ? '–' : formatMetricBest(contributor)}</td>
            <td class="px-4 py-3 align-top">{contributor.isPlaceholder ? '–' : formatCoefficient(contributor.reshelCoefficient)}</td>
            <td class="px-4 py-3 align-top">{contributor.isPlaceholder ? '–' : formatCoefficient(contributor.mcculloughCoefficient)}</td>
            <td class="px-4 py-3 align-top">
              {#if contributor.isPlaceholder}
                <span>–</span>
              {:else}
                <span class="font-semibold text-text-primary">{formatMetricPoints(contributor)}</span>
              {/if}
            </td>
          </tr>
        {/each}
      {/each}
    </tbody>
  </table>
</div>
