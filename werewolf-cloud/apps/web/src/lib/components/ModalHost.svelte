<script lang="ts">
  import { onDestroy } from 'svelte';
  import { modalStore } from '$lib/ui/modal';
  import Modal from './Modal.svelte';
  import type { ActiveModal } from '$lib/ui/modal';

  let modals: ActiveModal[] = [];

  // Subscribe to modal store
  const unsubscribe = modalStore.subscribe((activeModals) => {
    modals = activeModals;
  });

  // Calculate z-index for each modal (higher index = higher z-index)
  $: modalStack = modals.map((modal, index) => ({
    modal,
    zIndex: 40 + index * 10, // Base z-index of 40, increment by 10 for each modal
  }));

  // Cleanup subscription on destroy
  onDestroy(() => {
    unsubscribe();
  });
</script>

{#if modals.length > 0}
  <!-- Render all active modals, keyed by id so each keeps its own state while the stack changes -->
  {#each modalStack as { modal, zIndex } (modal.id)}
    <Modal {modal} {zIndex} />
  {/each}
{/if}
