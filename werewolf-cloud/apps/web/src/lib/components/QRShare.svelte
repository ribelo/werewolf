<script lang="ts">
  import { onMount } from 'svelte';
  import QRCode from 'qrcode';

  export let url: string;
  export let title: string = 'Share Display';
  export let size: number = 128;

  let qrDataUrl: string = '';
  let isGenerating = true;
  let error: string | null = null;

  onMount(async () => {
    try {
      qrDataUrl = await QRCode.toDataURL(url, {
        width: size,
        margin: 2,
        color: {
          dark: '#FFFFFF',
          light: '#000000'
        }
      });
      isGenerating = false;
    } catch (err) {
      error = 'Failed to generate QR code';
      isGenerating = false;
      console.error('QR code generation error:', err);
    }
  });

  function copyToClipboard() {
    navigator.clipboard.writeText(url).catch(err => {
      console.error('Failed to copy URL:', err);
    });
  }
</script>

<div class="bg-gray-800 rounded-lg p-4 border border-gray-700">
  <div class="flex items-center justify-between mb-3">
    <h3 class="text-sm font-medium text-gray-300">{title}</h3>
    <button
      on:click={copyToClipboard}
      class="text-xs bg-gray-700 hover:bg-gray-600 text-gray-300 px-2 py-1 rounded transition-colors"
      title="Copy URL to clipboard"
    >
      📋 Copy
    </button>
  </div>

  <div class="flex items-center space-x-4">
    {#if isGenerating}
      <div class="w-32 h-32 bg-gray-700 rounded animate-pulse flex items-center justify-center">
        <div class="text-xs text-gray-500">Generating...</div>
      </div>
    {:else if error}
      <div class="w-32 h-32 bg-red-900 rounded flex items-center justify-center">
        <div class="text-xs text-red-300 text-center p-2">{error}</div>
      </div>
    {:else}
      <img
        src={qrDataUrl}
        alt="QR code for {title}"
        class="w-32 h-32 rounded border border-gray-600"
      />
    {/if}

    <div class="flex-1 min-w-0">
      <div class="text-xs text-gray-400 mb-1">Shareable URL:</div>
      <div class="text-sm text-gray-200 font-mono break-all bg-gray-900 p-2 rounded">
        {url}
      </div>
    </div>
  </div>
</div>