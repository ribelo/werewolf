<script lang="ts">
  import TeamResultsView from '$lib/components/team-results/TeamResultsView.svelte';
  import { deriveContestLifts } from '$lib/contest-table';
  import type { TeamScoreMetric } from '$lib/types';
  import type { PageData } from './$types';

  export let data: PageData;

  $: contestName = data.contest?.name ?? '';
  $: isLoading = !data.teamResults && !data.error;
  $: contestLifts = deriveContestLifts(data.contest ?? null, data.attempts ?? []);
  $: allowedMetrics = (() => {
    const base: TeamScoreMetric[] = [];
    for (const lift of contestLifts) {
      if (lift === 'Squat' && !base.includes('squat')) base.push('squat');
      if (lift === 'Bench' && !base.includes('bench')) base.push('bench');
      if (lift === 'Deadlift' && !base.includes('deadlift')) base.push('deadlift');
    }
    return base;
  })();
</script>

<TeamResultsView
  {contestName}
  teamResults={data.teamResults}
  error={data.error}
  loading={isLoading}
  {allowedMetrics}
/>
