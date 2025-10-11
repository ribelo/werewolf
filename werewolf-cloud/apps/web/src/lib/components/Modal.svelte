<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { modalStore } from '$lib/ui/modal';
  import type { ActiveModal } from '$lib/ui/modal';

  export let modal: ActiveModal;
export let zIndex: number = 80;



  let modalElement: HTMLElement;
  let previousFocus: HTMLElement | null = null;
  let focusableElements: HTMLElement[] = [];
  let firstFocusable: HTMLElement | null = null;
  let lastFocusable: HTMLElement | null = null;

  // Default values for modal configuration
  $: config = {
    size: 'md' as const,
    closable: true,
    backdropClosable: true,
    showCloseButton: true,
    confirmText: 'OK',
    cancelText: 'Cancel',
    variant: 'default' as const,
    showFooter: !modal.component, // Hide footer by default for component modals
    ...modal,
  };

  // Size classes mapping
  $: sizeClasses = {
    sm: 'max-w-md',
    md: 'max-w-lg',
    lg: 'max-w-2xl',
    xl: 'max-w-4xl',
    full: 'max-w-full mx-4',
  };

  // Variant classes for buttons
  $: variantClasses = {
    default: 'btn-primary',
    danger: 'btn-danger',
    success: 'btn-success',
    warning: 'btn-warning',
    info: 'btn-info',
  };

  function handleBackdropClick() {
    if (config.backdropClosable) {
      closeModal();
    }
  }

  function handleKeydown(event: KeyboardEvent) {
    if (event.key === 'Escape' && config.closable) {
      event.preventDefault();
      closeModal();
    }

    if (event.key === 'Tab') {
      handleTabNavigation(event);
    }
  }

  function handleTabNavigation(event: KeyboardEvent) {
    if (!firstFocusable || !lastFocusable) return;

    if (event.shiftKey) {
      // Shift + Tab
      if (document.activeElement === firstFocusable) {
        event.preventDefault();
        lastFocusable.focus();
      }
    } else {
      // Tab
      if (document.activeElement === lastFocusable) {
        event.preventDefault();
        firstFocusable.focus();
      }
    }
  }

  function updateFocusableElements() {
    if (!modalElement) return;

    focusableElements = Array.from(
      modalElement.querySelectorAll(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      )
    ) as HTMLElement[];

    firstFocusable = focusableElements[0] || null;
    lastFocusable = focusableElements[focusableElements.length - 1] || null;
  }

  function closeModal(result?: unknown) {
    modalStore.close(modal.id, result);
  }

  function handleConfirm() {
    closeModal(true);
  }

  function handleCancel() {
    closeModal(false);
  }

  onMount(() => {
    // Store the currently focused element
    previousFocus = document.activeElement as HTMLElement;

    // Focus the modal when it opens
    if (modalElement) {
      modalElement.focus();
    }

    // Update focusable elements after a short delay to ensure DOM is ready
    setTimeout(updateFocusableElements, 100);

    // Add keyboard event listener
    document.addEventListener('keydown', handleKeydown);

    // Prevent body scroll
    document.body.style.overflow = 'hidden';
  });

  onDestroy(() => {
    // Restore focus to the previously focused element
    if (previousFocus && typeof previousFocus.focus === 'function') {
      previousFocus.focus();
    }

    // Remove keyboard event listener
    document.removeEventListener('keydown', handleKeydown);

    // Restore body scroll
    document.body.style.overflow = '';
  });

  // Update focusable elements when modal content changes
  $: if (modalElement) {
    setTimeout(updateFocusableElements, 0);
  }
</script>

<!-- svelte-ignore a11y-no-noninteractive-element-interactions -->
<div
  class="fixed inset-0 z-{zIndex} flex items-center justify-center"
  role="dialog"
  aria-modal="true"
  aria-labelledby="modal-title-{modal.id}"
  aria-describedby={config.content ? "modal-content-{modal.id}" : undefined}
  bind:this={modalElement}
  tabindex="-1"
  on:click={handleBackdropClick}
  on:keydown={handleKeydown}
>
  <!-- Backdrop -->
  <button
    type="button"
    class="absolute inset-0 bg-black/70 transition-opacity duration-300"
    aria-label="Close modal"
    on:click={handleBackdropClick}
  ></button>

  <!-- Modal Content -->
  <div
    class="relative z-10 w-full {sizeClasses[config.size]} card focus:outline-none max-h-[90vh] overflow-hidden transform transition-all duration-300 ease-out"
    role="document"
    on:click|stopPropagation
    on:keydown={handleKeydown}
  >
    <!-- Header -->
    {#if config.title || config.showCloseButton}
      <header class="flex items-center justify-between mb-6">
        {#if config.title}
          <div>
            <h2 id="modal-title-{modal.id}" class="text-h2 text-text-primary">
              {config.title}
            </h2>
          </div>
        {/if}
        {#if config.showCloseButton && config.closable}
          <button
            type="button"
            class="btn-secondary px-3 py-1 hover:bg-element-bg-hover transition-colors"
            on:click={() => closeModal()}
            aria-label="Close modal"
          >
            ✕
          </button>
        {/if}
      </header>
    {/if}

    <!-- Content -->
    <div class="flex-1 overflow-y-auto pr-2">
      {#if config.content}
        <div id="modal-content-{modal.id}" class="text-body text-text-primary mb-6">
          {config.content}
        </div>
      {/if}

        <!-- Custom content slot -->
        {#if config.component}
          <svelte:component this={config.component} {...(config.data && typeof config.data === 'object' ? config.data : {})} onClose={closeModal} onSaved={() => closeModal(true)} />
        {:else}
          <slot {modal} {closeModal} />
        {/if}
    </div>

    <!-- Footer with buttons -->
    {#if config.showFooter && (config.confirmText || config.cancelText)}
      <footer class="flex items-center justify-end gap-3 mt-6 pt-4 border-t border-border-color">
        {#if config.cancelText}
          <button
            type="button"
            class="btn-secondary px-4 py-2"
            on:click={handleCancel}
          >
            {config.cancelText}
          </button>
        {/if}
        {#if config.confirmText}
          <button
            type="button"
            class="{variantClasses[config.variant]} px-4 py-2"
            on:click={handleConfirm}
          >
            {config.confirmText}
          </button>
        {/if}
      </footer>
    {/if}
  </div>
</div>

<style>
  /* Ensure modal appears above other content */
  .card {
    box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
  }

  /* Focus trap styles */
  .card:focus {
    outline: 2px solid var(--color-primary);
    outline-offset: 2px;
  }

  /* Smooth entrance animation */
  .card {
    animation: modal-enter 0.3s ease-out;
  }

  @keyframes modal-enter {
    from {
      opacity: 0;
      transform: scale(0.95) translateY(-10px);
    }
    to {
      opacity: 1;
      transform: scale(1) translateY(0);
    }
  }
</style>
