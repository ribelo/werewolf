<script lang="ts">
  import { onMount } from 'svelte';
  import { flip } from 'svelte/animate';
  import { fade, slide } from 'svelte/transition';
  import { toast, type Toast, toneClass, getIcon } from '$lib/ui/toast';

  let mounted = false;

  onMount(() => {
    mounted = true;
  });

  function handleAction(action: { callback: () => void }) {
    action.callback();
  }

  function getPositionClasses(position: string = 'top-right') {
    switch (position) {
      case 'top-left':
        return 'top-4 left-4';
      case 'top-center':
        return 'top-4 left-1/2 transform -translate-x-1/2';
      case 'top-right':
        return 'top-4 right-4';
      case 'bottom-left':
        return 'bottom-4 left-4';
      case 'bottom-center':
        return 'bottom-4 left-1/2 transform -translate-x-1/2';
      case 'bottom-right':
        return 'bottom-4 right-4';
      default:
        return 'top-4 right-4';
    }
  }

  function getProgressBarColor(level: string) {
    switch (level) {
      case 'success': return 'bg-green-500';
      case 'error': return 'bg-red-500';
      case 'warning': return 'bg-yellow-500';
      case 'info': return 'bg-blue-500';
      default: return 'bg-gray-500';
    }
  }
</script>

{#if mounted}
  <!-- Group toasts by position -->
  {#each ['top-left', 'top-center', 'top-right', 'bottom-left', 'bottom-center', 'bottom-right'] as position}
    {@const positionToasts = $toast.filter(t => (t.position || 'top-right') === position)}
    {#if positionToasts.length > 0}
      <div class={`fixed z-50 pointer-events-none ${getPositionClasses(position)}`}>
        <div class="flex flex-col gap-2 pointer-events-auto">
          {#each positionToasts as toastItem (toastItem.id)}
            <div
              class="max-w-sm w-full"
              animate:flip={{ duration: 300 }}
              transition:slide={{ duration: 200 }}
            >
              <div class={`shadow-lg rounded-lg border ${toneClass(toastItem.level)}`}>
                <div class="flex items-start p-4">
                  <!-- Icon -->
                  <div class="flex-shrink-0 mr-3">
                    <span class="text-lg">{getIcon(toastItem.level)}</span>
                  </div>

                  <!-- Content -->
                  <div class="flex-1 min-w-0">
                    <p class="text-sm font-medium text-current">
                      {toastItem.message}
                    </p>

                    <!-- Action buttons -->
                    {#if toastItem.actions && toastItem.actions.length > 0}
                      <div class="mt-3 flex space-x-2">
                        {#each toastItem.actions as action}
                          <button
                            class={`px-3 py-1 text-xs font-medium rounded transition-colors ${
                              action.variant === 'primary'
                                ? 'bg-current text-white hover:bg-opacity-80'
                                : 'bg-transparent border border-current text-current hover:bg-current hover:text-white'
                            }`}
                            on:click={() => handleAction(action)}
                          >
                            {action.label}
                          </button>
                        {/each}
                      </div>
                    {/if}
                  </div>

                  <!-- Close button -->
                  <button
                    class="flex-shrink-0 ml-3 text-current hover:text-opacity-70 transition-colors"
                    on:click={() => toast.remove(toastItem.id)}
                    aria-label="Close toast"
                  >
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
                    </svg>
                  </button>
                </div>

                <!-- Progress bar for auto-dismiss -->
                {#if toastItem.duration && toastItem.duration > 0}
                  <div class="h-1 bg-current bg-opacity-20 rounded-b-lg overflow-hidden">
                    <div
                      class={`h-full ${getProgressBarColor(toastItem.level)} transition-all ease-linear`}
                      style="animation: progress {toastItem.duration}ms linear forwards"
                    ></div>
                  </div>
                {/if}
              </div>
            </div>
          {/each}
        </div>
      </div>
    {/if}
  {/each}
{/if}

<style>
  @keyframes progress {
    from {
      width: 100%;
    }
    to {
      width: 0%;
    }
  }
</style>
