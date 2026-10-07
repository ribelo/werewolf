<script lang="ts">
  import { onMount } from 'svelte';

  export let onMounted: () => void = () => {};

  onMount(() => {
    onMounted();
  });
</script>

<span>onMount probe</span>
