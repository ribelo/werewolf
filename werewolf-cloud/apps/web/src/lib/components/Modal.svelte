<script lang="ts">
  import { onDestroy } from 'svelte';
  import { modalStore, lockBodyScroll, unlockBodyScroll } from '$lib/ui/modal';
  import type { ActiveModal } from '$lib/ui/modal';

  export let modal: ActiveModal;
  export let zIndex = 80;

  let modalElement: HTMLElement;
  let previousFocus: HTMLElement | null = null;
  let focusableElements: HTMLElement[] = [];
  let firstFocusable: HTMLElement | null = null;
  let lastFocusable: HTMLElement | null = null;
  let closed = false;
  let wired = false;
  let focusTimer: ReturnType<typeof setTimeout> | null = null;

  // Default values for modal configuration
  $: config = {
    size: 'md' as const,
    closable: true,
    backdropClosable: false,
    showCloseButton: true,
    confirmText: 'OK',
    cancelText: 'Cancel',
    variant: 'default' as const,
    showFooter: !modal.component, // Hide footer by default for component modals
    ...modal,
  };

  // Only the modal on top of the stack reacts to Escape and traps focus.
  $: isTopmost = $modalStore.length > 0 && $modalStore[$modalStore.length - 1]?.id === modal.id;

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
    if (!isTopmost) return;

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
    if (closed) return;
    closed = true;
    modalStore.close(modal.id, result);
  }

  function callerSavedHandler(): ((payload?: unknown) => unknown) | null {
    const data = modal.data;
    if (!data || typeof data !== 'object') return null;

    const candidate = (data as Record<string, unknown>)['onSaved'];
    return typeof candidate === 'function' ? (candidate as (payload?: unknown) => unknown) : null;
  }

  function componentProps(): Record<string, unknown> {
    const data = modal.data;
    return data && typeof data === 'object' ? { ...(data as Record<string, unknown>) } : {};
  }

  /**
   * Contract of the component rendered inside the modal: it reports what it
   * saved through its `onSaved` prop, e.g. `onSaved(assignments)`. The payload
   * is handed to the caller's hook (`data.onSaved`), which is awaited because it
   * performs the persistence work, and the modal then resolves exactly once with
   * that payload. A failing hook keeps the modal open so the edits are not lost.
   */
  async function handleComponentSaved(payload?: unknown) {
    if (closed) return;

    const handler = callerSavedHandler();
    if (handler) {
      try {
        await handler(payload);
      } catch (error) {
        console.error('Modal onSaved handler failed', error);
        return;
      }
    }

    closeModal(payload);
  }

  function handleConfirm() {
    closeModal(true);
  }

  function handleCancel() {
    closeModal(false);
  }

  function restoreFocus() {
    const target = previousFocus;
    if (!target || !target.isConnected || typeof target.focus !== 'function') return;

    const active = document.activeElement;
    // Do not steal focus when another modal (or a control outside this one) owns it.
    if (active && active !== document.body && modalElement && !modalElement.contains(active)) {
      return;
    }

    target.focus();
  }

  function wireModal() {
    // Store the currently focused element
    previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;

    // Focus the modal when it opens
    modalElement.focus();

    // Update focusable elements after a short delay to ensure DOM is ready
    focusTimer = setTimeout(updateFocusableElements, 100);

    // Add keyboard event listener
    document.addEventListener('keydown', handleKeydown);

    // Prevent body scroll while any modal is open
    lockBodyScroll();
  }

  // Wiring is triggered by the bound element instead of by onMount: the web test
  // runtime resolves the SSR lifecycle stubs of 'svelte', where onMount never
  // runs, and Escape, the scroll lock and focus must work there too.
  $: if (modalElement && !wired) {
    wired = true;
    wireModal();
  }

  onDestroy(() => {
    if (focusTimer !== null) clearTimeout(focusTimer);

    // Remove keyboard event listener
    document.removeEventListener('keydown', handleKeydown);

    // Restore body scroll once the last modal is gone
    unlockBodyScroll();

    // Restore focus to the previously focused element
    restoreFocus();
  });

  // Update focusable elements when modal content changes
  $: if (modalElement) {
    setTimeout(updateFocusableElements, 0);
  }
</script>

<!-- svelte-ignore a11y-no-noninteractive-element-interactions -->
<div
  class="fixed inset-0 flex items-center justify-center"
  style={`z-index: ${zIndex}`}
  role="dialog"
  aria-modal="true"
  aria-labelledby="modal-title-{modal.id}"
  aria-describedby={config.content ? `modal-content-${modal.id}` : undefined}
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
    class="relative z-10 w-full {sizeClasses[config.size]} card focus:outline-none max-h-[90vh] overflow-hidden flex flex-col transform transition-all duration-300 ease-out"
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
    <div class="flex-1 overflow-y-auto pr-2 min-h-0">
      {#if config.content}
        <div id="modal-content-{modal.id}" class="text-body text-text-primary mb-6">
          {config.content}
        </div>
      {/if}

        <!-- Custom content slot -->
        {#if config.component}
          <svelte:component
            this={config.component}
            {...componentProps()}
            onClose={closeModal}
            onSaved={handleComponentSaved}
          />
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
