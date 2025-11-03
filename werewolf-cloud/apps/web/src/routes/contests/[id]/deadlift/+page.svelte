<script lang="ts">
  import ContestManagerView from '$lib/components/ContestManagerView.svelte';
  import type { PageData } from './$types';

  export let data: PageData;
  export let params: Record<string, string> = {};
</script>

<ContestManagerView {data} {params} view="deadlift" />

