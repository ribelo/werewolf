<script lang="ts">
  import '../app.css';
  import { onMount } from 'svelte';
  import { browser } from '$app/environment';
  import { setupI18n, locale } from '$lib/i18n';

  export let data: unknown;
  export let form: unknown;
  export let params: Record<string, string>;

  setupI18n();

  onMount(() => {
    if (!browser) return;
    const stored = localStorage.getItem('werewolf.locale');
    if (stored) {
      setupI18n(stored);
      locale.set(stored);
    }
  });

  $: void data;
  $: void form;
  $: void params;
</script>

<slot {data} {form} {params} />
