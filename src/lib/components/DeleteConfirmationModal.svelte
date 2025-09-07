<script lang="ts">
  import { _ } from 'svelte-i18n';
  import { onMount, onDestroy } from 'svelte';
  import { AlertTriangle } from 'lucide-svelte';

  export let title: string = $_('competitor.delete_title');
  export let message: string;
  export let confirmText: string = $_('buttons.delete');
  export let cancelText: string = $_('buttons.cancel');
  export let onConfirm: () => void = () => {};
  export let onCancel: () => void = () => {};
  export let isDestructive: boolean = true;
  export let isLoading: boolean = false;

  function handleKeydown(event: KeyboardEvent) {
    if (event.key === 'Escape') {
      onCancel();
    } else if (event.key === 'Enter') {
      onConfirm();
    }
  }

  onMount(() => {
    document.body.style.overflow = 'hidden';
  });

  onDestroy(() => {
    document.body.style.overflow = '';
  });
</script>

<svelte:window on:keydown={handleKeydown} />

<div class="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50" on:click={onCancel} on:keydown={(e) => { if (e.key === 'Escape') onCancel(); }} role="presentation" tabindex="-1">
  <div class="bg-card-bg border-2 border-border-color rounded-lg p-6 max-w-md w-full mx-4" on:click|stopPropagation on:keydown|stopPropagation role="dialog" aria-modal="true" tabindex="-1">
    
    <!-- Header with Icon -->
    <div class="flex items-center justify-center mb-4">
      <div class="flex items-center justify-center w-12 h-12 bg-red-900/20 rounded-full">
        <AlertTriangle size={24} class="text-red-400" />
      </div>
    </div>

    <!-- Title -->
    <div class="text-center mb-4">
      <h3 class="text-h3 text-text-primary mb-2">
        {title}
      </h3>
    </div>

    <!-- Message -->
    <div class="text-center mb-6">
      <p class="text-body text-text-secondary leading-relaxed">
        {message}
      </p>
    </div>

    <!-- Buttons -->
    <div class="flex justify-center space-x-3">
      <button
        type="button"
        class="btn-secondary"
        on:click={onCancel}
        disabled={isLoading}
      >
        {cancelText}
      </button>
      
      <button
        type="button"
        class="btn-primary {isDestructive ? 'bg-red-600 hover:bg-red-700 border-red-600' : ''}"
        on:click={onConfirm}
        disabled={isLoading}
      >
        {#if isLoading}
          <span class="loading-spinner"></span>
          {$_('buttons.deleting')}
        {:else}
          {confirmText}
        {/if}
      </button>
    </div>

    <!-- Warning Text -->
    {#if isDestructive}
      <div class="mt-4 text-center">
        <p class="text-caption text-red-400">
          {$_('general.action_irreversible')}
        </p>
      </div>
    {/if}
  </div>
</div>

<style>
  .loading-spinner {
    display: inline-block;
    width: 1rem;
    height: 1rem;
    border: 2px solid #f3f4f6;
    border-top: 2px solid #dc2626;
    border-radius: 50%;
    animation: spin 1s linear infinite;
    margin-right: 0.5rem;
  }

  @keyframes spin {
    0% { transform: rotate(0deg); }
    100% { transform: rotate(360deg); }
  }
</style>