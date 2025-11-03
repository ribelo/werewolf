<script lang="ts">
  import TeamResultsView from '$lib/components/team-results/TeamResultsView.svelte';
  import type { PageData } from './$types';

  export let data: PageData;

  $: contestName = data.contest?.name ?? '';
  $: isLoading = !data.teamResults && !data.error;
</script>

<TeamResultsView
  {contestName}
  teamResults={data.teamResults}
  error={data.error}
  loading={isLoading}
/>
