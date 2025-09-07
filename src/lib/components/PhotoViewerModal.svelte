<script lang="ts">
  import { _ } from 'svelte-i18n';
  import { onMount, onDestroy } from 'svelte';
  import { User, X } from 'lucide-svelte';

  interface Competitor {
    id: string;
    firstName: string;
    lastName: string;
    photoBase64?: string;
    gender: string;
  }

  export let competitor: Competitor;
  export let onClose: () => void = () => {};

  let photoSrc: string | null = null;
  let imageLoaded = false;
  let imageError = false;

  // Prepare photo source
  $: if (competitor.photoBase64 && competitor.photoBase64.length > 0) {
    photoSrc = `data:image/webp;base64,${competitor.photoBase64}`;
  } else {
    photoSrc = null;
  }

  function handleKeydown(event: KeyboardEvent) {
    if (event.key === 'Escape') {
      onClose();
    }
  }

  function handleImageLoad() {
    imageLoaded = true;
    imageError = false;
  }

  function handleImageError() {
    imageError = true;
    imageLoaded = false;
  }

  onMount(() => {
    document.body.style.overflow = 'hidden';
  });

  onDestroy(() => {
    document.body.style.overflow = '';
  });
</script>

<svelte:window on:keydown={handleKeydown} />

<div class="fixed inset-0 bg-black bg-opacity-90 flex items-center justify-center z-50" on:click={onClose} on:keydown={(e) => { if (e.key === 'Escape') onClose(); }} role="dialog" aria-modal="true" tabindex="-1">
  <div class="relative w-full h-full flex items-center justify-center p-4">
    
    <!-- Close Button -->
    <button
      class="absolute top-4 right-4 z-10 p-2 bg-black/50 hover:bg-black/70 rounded-full text-white transition-colors"
      on:click={onClose}
      title={$_('buttons.close')}
    >
      <X size={24} />
    </button>

    <!-- Competitor Name -->
    <div class="absolute top-4 left-4 z-10 bg-black/50 rounded px-3 py-2">
      <h3 class="text-white font-semibold">
        {competitor.firstName} {competitor.lastName}
      </h3>
    </div>

    <!-- Photo Content -->
    <div class="flex items-center justify-center w-full h-full" on:click|stopPropagation on:keydown|stopPropagation role="presentation">
      {#if photoSrc}
        <!-- Loading indicator -->
        {#if !imageLoaded && !imageError}
          <div class="flex flex-col items-center text-white">
            <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-white mb-4"></div>
            <p class="text-body">{$_('general.loading')}</p>
          </div>
        {/if}

        <!-- Photo -->
        <img
          src={photoSrc}
          alt="{competitor.firstName} {competitor.lastName}"
          class="max-w-full max-h-full object-contain cursor-default {imageLoaded ? 'opacity-100' : 'opacity-0'}"
          on:load={handleImageLoad}
          on:error={handleImageError}
        />

        <!-- Error state -->
        {#if imageError}
          <div class="flex flex-col items-center text-white">
            <div class="bg-red-600/20 rounded-full p-6 mb-4">
              <User size={48} class="text-red-400" />
            </div>
            <h4 class="text-h4 mb-2">{$_('competitor.photo_error')}</h4>
            <p class="text-body text-gray-400">{$_('competitor.photo_error_desc')}</p>
          </div>
        {/if}
      {:else}
        <!-- No Photo State -->
        <div class="flex flex-col items-center text-white">
          <div class="bg-gray-600/20 rounded-full p-8 mb-6">
            <User size={64} class="text-gray-400" />
          </div>
          <h4 class="text-h4 mb-2">{$_('competitor.no_photo')}</h4>
          <p class="text-body text-gray-400">{$_('competitor.no_photo_desc')}</p>
          <div class="mt-4 text-caption text-gray-500">
            {competitor.gender === 'Male' ? $_('general.male') : $_('general.female')}
          </div>
        </div>
      {/if}
    </div>

    <!-- Instructions -->
    <div class="absolute bottom-4 left-1/2 transform -translate-x-1/2 text-center">
      <p class="text-caption text-gray-400">
        {$_('competitor.photo_modal_instructions')}
      </p>
    </div>
  </div>
</div>

<style>
  img {
    transition: opacity 0.3s ease;
  }
</style>