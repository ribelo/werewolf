<script lang="ts">
  import '../app.css';
  import { onMount, onDestroy } from 'svelte';
  import { browser } from '$app/environment';
  import { setupI18n, locale } from '$lib/i18n';
  import ModalHost from '$lib/components/ModalHost.svelte';
  import ToastList from '$lib/components/ToastList.svelte';
  import { initializeNotificationBridge } from '$lib/ui/notification-bridge';

  export let data: unknown;
  export let form: unknown;
  export let params: Record<string, string> = {};
  export let errors: unknown = undefined;
  setupI18n();

  // Suppress unused export warnings for SvelteKit props
  $: void params;
  $: void errors;

  let cleanupNotificationBridge: (() => void) | undefined;

  onMount(() => {
    if (!browser) return;
    const stored = localStorage.getItem('werewolf.locale');
    if (stored) {
      setupI18n(stored);
      locale.set(stored);
    }

    // Initialize notification bridge for real-time updates
    cleanupNotificationBridge = initializeNotificationBridge();
  });

  onDestroy(() => {
    cleanupNotificationBridge?.();
  });

  $: void data;
  $: void form;
</script>

<slot {data} {form} {params} {errors} />

<!-- Modal Host for rendering all active modals -->
<ModalHost />

<!-- Global Toast Notifications -->
<ToastList />
