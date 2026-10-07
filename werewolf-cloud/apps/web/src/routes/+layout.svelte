<script lang="ts">
  import '../app.css';
  import { onMount, onDestroy } from 'svelte';
  import { browser } from '$app/environment';
  import { setupI18n, locale } from '$lib/i18n';
  import ModalHost from '$lib/components/ModalHost.svelte';
  import ToastList from '$lib/components/ToastList.svelte';
  import { initializeNotificationBridge } from '$lib/ui/notification-bridge';
  import type { LayoutData } from './$types';

  export let data: LayoutData;

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
</script>

<slot {data} />

<!-- Modal Host for rendering all active modals -->
<ModalHost />

<!-- Global Toast Notifications -->
<ToastList />
