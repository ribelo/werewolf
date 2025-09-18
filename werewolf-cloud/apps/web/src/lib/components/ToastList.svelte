<script lang="ts">
  import type { Toast, ToastTone } from '$lib/ui/toast';

  export let toasts: Toast[] = [];
  export let toneClass: (tone: ToastTone) => string;
</script>

{#if toasts.length > 0}
  <div class="space-y-2">
    {#each toasts as toast (toast.id)}
      <div class={`px-4 py-2 text-sm rounded border ${toneClass(toast.tone)}`}>
        {toast.message}
      </div>
    {/each}
  </div>
{/if}
