<script lang="ts">
  import { onMount } from 'svelte';
  import { getCurrentWindow } from '@tauri-apps/api/window';
  import { Minus, Square, Copy, X } from 'lucide-svelte';
  import { _ } from 'svelte-i18n';
  
  let appWindow: any;
  let isMaximized = false;
  
  onMount(() => {
    appWindow = getCurrentWindow();
    
    let unlistenMaximize: (() => void) | null = null;
    
    // Setup async listeners
    (async () => {
      // Listen for maximize/unmaximize events
      unlistenMaximize = await appWindow.onResized(() => {
        checkMaximized();
      });
      
      // Initial check
      await checkMaximized();
    })();
    
    // Cleanup
    return () => {
      unlistenMaximize?.();
    };
  });
  
  async function checkMaximized() {
    if (appWindow) {
      isMaximized = await appWindow.isMaximized();
    }
  }
  
  async function minimizeWindow() {
    if (appWindow) {
      await appWindow.minimize();
    }
  }
  
  async function toggleMaximize() {
    if (appWindow) {
      await appWindow.toggleMaximize();
      await checkMaximized();
    }
  }
  
  async function closeWindow() {
    if (appWindow) {
      await appWindow.close();
    }
  }
</script>

<!-- Custom Titlebar -->
<div class="titlebar" data-tauri-drag-region>
  <div class="titlebar-content" data-tauri-drag-region>
    <div class="titlebar-title" data-tauri-drag-region>
      <span class="app-title">WEREWOLF</span>
    </div>
    
    <div class="window-controls">
      <button 
        class="window-control minimize-btn" 
        on:click={minimizeWindow}
        title={$_('ui.minimize')}
      >
        <Minus size={14} strokeWidth={2} />
      </button>
      
      <button 
        class="window-control maximize-btn" 
        on:click={toggleMaximize}
        title={isMaximized ? $_('ui.restore') : $_('ui.maximize')}
      >
        {#if isMaximized}
          <Copy size={14} strokeWidth={2} />
        {:else}
          <Square size={14} strokeWidth={2} />
        {/if}
      </button>
      
      <button 
        class="window-control close-btn" 
        on:click={closeWindow}
        title={$_('ui.close')}
      >
        <X size={14} strokeWidth={2} />
      </button>
    </div>
  </div>
</div>

<style>
  .titlebar {
    display: flex;
    align-items: center;
    background: #1a1a1a;
    border-bottom: 2px solid #374151;
    height: 40px;
    user-select: none;
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    z-index: 1000;
  }
  
  .titlebar-content {
    display: flex;
    align-items: center;
    justify-content: space-between;
    width: 100%;
    height: 100%;
    padding: 0 16px;
  }
  
  .titlebar-title {
    display: flex;
    align-items: center;
    height: 100%;
  }
  
  .app-title {
    color: #dc2626;
    font-family: 'Bebas Neue', sans-serif;
    font-size: 16px;
    font-weight: normal;
    letter-spacing: 0.125rem;
    margin: 0;
  }
  
  .window-controls {
    display: flex;
    align-items: center;
    gap: 0;
    height: 100%;
  }
  
  .window-control {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 46px;
    height: 100%;
    border: none;
    background: transparent;
    color: #9ca3af;
    cursor: pointer;
    transition: all 0.2s ease;
    -webkit-app-region: no-drag;
  }
  
  .window-control:hover {
    background: #374151;
    color: #ffffff;
  }
  
  .close-btn:hover {
    background: #dc2626;
    color: #ffffff;
  }
  
  .minimize-btn:hover,
  .maximize-btn:hover {
    background: #4b5563;
    color: #ffffff;
  }
  
  /* Ensure the drag region works properly */
  [data-tauri-drag-region] {
    -webkit-app-region: drag;
  }
</style>