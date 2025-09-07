<script lang="ts">
  import { _ } from 'svelte-i18n';
  import { onMount, onDestroy } from 'svelte';
  import ContestDetailsTab from './ContestDetailsTab.svelte';
  import PlateInventoryTab from './PlateInventoryTab.svelte';
  import type { Contest } from '../types/contest';

  export let contest: Contest;
  export let onClose: () => void = () => {};
  export let onSave: () => void = () => {};

  let activeTab: 'details' | 'plates' = 'details';
  let contestDetailsTab: ContestDetailsTab;
  let plateInventoryTab: PlateInventoryTab;

  function switchTab(tab: 'details' | 'plates') {
    // Clear errors from current tab before switching
    if (activeTab === 'details' && contestDetailsTab) {
      contestDetailsTab['error'] = '';
      contestDetailsTab['successMessage'] = '';
    } else if (activeTab === 'plates' && plateInventoryTab) {
      plateInventoryTab['plateError'] = '';
    }
    activeTab = tab;
  }

  function handleKeydown(event: KeyboardEvent) {
    if (event.key === 'Escape') {
      onClose();
    }
  }

  onMount(() => {
    // Block scrolling on the main body when modal opens
    document.body.style.overflow = 'hidden';
  });

  onDestroy(() => {
    // Restore scrolling when modal closes
    document.body.style.overflow = '';
    
    // Note: In Svelte 5, child components clean up automatically
    // No need to manually call $destroy() on child components
  });
</script>

<svelte:window on:keydown={handleKeydown} />

<div class="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50" on:click={onClose} on:keydown={(e) => { if (e.key === 'Escape') onClose(); }} role="presentation" tabindex="-1">
  <div class="bg-card-bg border-2 border-border-color rounded-lg p-6 max-w-4xl max-h-[90vh] w-full mx-4 flex flex-col" on:click|stopPropagation on:keydown|stopPropagation role="dialog" aria-modal="true" aria-labelledby="modal-title" tabindex="-1">
    <!-- Header -->
    <div class="flex items-center justify-between mb-6 border-b border-border-color pb-4">
      <h2 id="modal-title" class="text-h2 text-text-primary">{$_('contest.edit_title')}</h2>
      <button
        on:click={onClose}
        class="text-text-secondary hover:text-text-primary transition-colors text-2xl"
        aria-label="Close"
      >
        ×
      </button>
    </div>

    <!-- Tab Navigation -->
    <div class="flex space-x-4 mb-6 border-b border-border-color">
      <button
        on:click={() => switchTab('details')}
        class="pb-2 px-4 transition-all {activeTab === 'details' ? 'text-primary-red border-b-2 border-primary-red' : 'text-text-secondary hover:text-text-primary'}"
      >
        {$_('contest.details_tab')}
      </button>
      <button
        on:click={() => switchTab('plates')}
        class="pb-2 px-4 transition-all {activeTab === 'plates' ? 'text-primary-red border-b-2 border-primary-red' : 'text-text-secondary hover:text-text-primary'}"
      >
        {$_('contest.plates_tab')}
      </button>
    </div>

    <!-- Tab Content -->
    <div class="flex-1 overflow-y-auto">
      {#if activeTab === 'details'}
        <ContestDetailsTab bind:this={contestDetailsTab} {contest} {onSave} {onClose} />
      {:else}
        <PlateInventoryTab bind:this={plateInventoryTab} {contest} />
      {/if}
    </div>

    <!-- Footer -->
    <div class="flex justify-between items-center mt-6 pt-4 border-t border-border-color">
      <div>
        {#if activeTab === 'details' && contestDetailsTab}
          {#if contestDetailsTab['error']}
            <div class="text-red-500">{contestDetailsTab['error']}</div>
          {/if}
          {#if contestDetailsTab['successMessage']}
            <div class="text-green-500">{contestDetailsTab['successMessage']}</div>
          {/if}
        {:else if activeTab === 'plates' && plateInventoryTab}
          {#if plateInventoryTab['plateError']}
            <div class="text-red-500">{plateInventoryTab['plateError']}</div>
          {/if}
        {/if}
      </div>
      <div class="flex space-x-3">
        <button
          on:click={onClose}
          class="btn-secondary"
          disabled={activeTab === 'details' && contestDetailsTab?.['loading']}
        >
          {$_('contest.cancel_changes')}
        </button>
        {#if activeTab === 'details' && contestDetailsTab}
          <button
            on:click={contestDetailsTab.saveContestDetails}
            class="btn-primary"
            disabled={contestDetailsTab['loading'] || !contestDetailsTab['formData']?.name || !contestDetailsTab['formData']?.date || !contestDetailsTab['formData']?.location}
          >
            {contestDetailsTab['loading'] ? $_('general.saving') : $_('contest.save_changes')}
          </button>
        {/if}
      </div>
    </div>
  </div>
</div>

<style>
  /* Ensure the modal is properly styled */
  :global(.dark) {
    color-scheme: dark;
  }
</style>