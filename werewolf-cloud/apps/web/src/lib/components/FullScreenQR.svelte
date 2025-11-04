<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import QRCode from 'qrcode';
  import { createEventDispatcher } from 'svelte';
  import { get } from 'svelte/store';
  import { _ } from 'svelte-i18n';

  export let url: string = '';
  export let title: string = 'Share Display';
  export let requestFullscreen: boolean = false;

  const dispatch = createEventDispatcher();

  let dataUrl: string | null = null;
  let isGenerating = false;
  let lastUrl: string | null = null;
  let overlayEl: HTMLElement | null = null;

  function t(key: string) {
    const translate = get(_);
    return translate(key);
  }

  async function generate(sizeOverride?: number) {
    if (!url) return;
    if (url === lastUrl && dataUrl) return;
    isGenerating = true;
    try {
      // compute size based on viewport with safe margins
      const rawSize = typeof sizeOverride === 'number' ? sizeOverride : Math.min(window.innerWidth, window.innerHeight) - 120;
      const size = Math.max(128, Math.min(1024, Math.floor(rawSize)));
      dataUrl = await QRCode.toDataURL(url, {
        width: size,
        margin: 1,
        color: {
          dark: '#FFFFFFFF',
          light: '#00000000'
        }
      });
      lastUrl = url;
    } catch (err) {
      console.error('FullScreenQR generation failed', err);
      dataUrl = null;
    } finally {
      isGenerating = false;
    }
  }

  function close() {
    try {
      if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    } catch {}
    dispatch('close');
  }

  function onKey(e: KeyboardEvent) {
    if (e.key === 'Escape') close();
  }

  onMount(() => {
    document.addEventListener('keydown', onKey);
    generate();
  });

  onDestroy(() => {
    document.removeEventListener('keydown', onKey);
  });

  async function enterFullscreen() {
    try {
      if (overlayEl && overlayEl.requestFullscreen) {
        await overlayEl.requestFullscreen();
      }
    } catch (err) {
      console.warn('Fullscreen request failed', err);
    }
  }
</script>

<div bind:this={overlayEl} class="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-8" role="dialog" aria-modal="true" aria-label={title} on:click|self={close}>
  <div class="max-w-full max-h-full text-center">
    {#if isGenerating}
      <div class="w-32 h-32 bg-gray-700 rounded animate-pulse inline-block" />
    {:else if dataUrl}
      <img src={dataUrl} alt={title} class="mx-auto rounded" style="max-width: calc(100vw - 120px); max-height: calc(100vh - 120px);" />
    {:else}
      <div class="text-white">{t('display_table.actions.qr_error') || 'Unable to generate QR'}</div>
    {/if}

    <div class="mt-6 flex justify-center gap-4">
      <button type="button" class="px-3 py-1 text-xxs btn-secondary" on:click={close}>
        {t('buttons.close')}
      </button>
      <button type="button" class="px-3 py-1 text-xxs btn-secondary" on:click={enterFullscreen}>
        {t('display_table.actions.qr_fullscreen') || 'Enter Full Screen'}
      </button>
    </div>
  </div>
</div>
