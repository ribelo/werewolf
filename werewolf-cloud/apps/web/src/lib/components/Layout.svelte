<script lang="ts">
  import { onMount } from 'svelte';
  import { apiClient } from '$lib/api';
  import { PAGE_LINKS } from '$lib/nav';
  import { _ } from 'svelte-i18n';
  import type { SystemHealth } from '$lib/types';

  type ApiStatus = 'checking' | 'online' | 'degraded' | 'offline';

  export let title: string | null = null;
  export let subtitle = '';
  export let currentPage: keyof typeof PAGE_LINKS = 'contests';
  export let apiBase = '';

  let status: ApiStatus = 'checking';
  let statusDetail = '';
  let statusDetailKey: string | null = null;

  const STATUS_LABEL_KEYS: Record<ApiStatus, string> = {
    checking: 'layout.status.checking',
    online: 'layout.status.online',
    degraded: 'layout.status.degraded',
    offline: 'layout.status.offline',
  };

  onMount(() => {
    checkApiStatus();
  });

  async function checkApiStatus(): Promise<void> {
    status = 'checking';
    statusDetail = '';
    statusDetailKey = null;

    try {
      const response = await apiClient.get<SystemHealth>('/system/health');

      if (response.error) {
        status = 'degraded';
        statusDetail = response.error;
        statusDetailKey = null;
        return;
      }

      const { status: healthStatus } = response.data ?? { status: 'unknown' };
      status = healthStatus?.toLowerCase() === 'ok' ? 'online' : 'degraded';
      statusDetailKey = null;
    } catch (error) {
      status = 'offline';
      statusDetail = error instanceof Error ? error.message : '';
      statusDetailKey = statusDetail ? null : 'layout.status.fallback_detail';
    }
  }

  function statusClass(): string {
    switch (status) {
      case 'online':
        return 'status-badge status-active';
      case 'degraded':
        return 'status-badge status-warning';
      case 'checking':
        return 'status-badge status-warning';
      default:
        return 'status-badge status-error';
    }
  }
</script>

<div class="min-h-screen bg-main-bg text-text-primary flex flex-col">
  <header class="border-b-2 border-border-color bg-main-bg">
    <div class="container-full py-6 flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
      <div class="space-y-2">
        <h1 class="text-display uppercase tracking-[0.25em] text-text-primary">{title ?? $_('layout.title')}</h1>
        {#if subtitle}
          <p class="text-caption uppercase tracking-[0.4em] text-text-secondary">{subtitle}</p>
        {/if}
      </div>

      <div class="flex flex-col items-start gap-4 lg:items-end">
        <nav class="flex flex-wrap gap-3">
          {#each Object.entries(PAGE_LINKS) as [key, link]}
            <a
              href={link.href}
              class={`px-4 py-2 font-display text-xs tracking-[0.4em] uppercase border-2 transition ${
                currentPage === key
                  ? 'bg-primary-red text-black border-primary-red'
                  : 'border-border-color text-text-secondary hover:text-text-primary hover:border-primary-red'
              }`}
            >
              {$_(link.labelKey)}
            </a>
          {/each}
        </nav>

        <div class="flex flex-wrap items-center gap-3 text-xs uppercase tracking-[0.4em] text-text-secondary">
          <span>{$_('layout.api_label')}</span>
          <code class="bg-element-bg px-2 py-1 font-mono text-[11px] text-text-secondary">{apiBase}</code>
          <span class={statusClass()}>{$_(STATUS_LABEL_KEYS[status])}</span>
          {#if statusDetail}
            <span class="text-text-secondary text-xxs">{statusDetail}</span>
          {:else if statusDetailKey}
            <span class="text-text-secondary text-xxs">{$_(statusDetailKey)}</span>
          {/if}
          <button
            type="button"
            on:click={checkApiStatus}
            class="btn-secondary px-3 py-1 text-xxs"
          >
            {$_('layout.check_status')}
          </button>
        </div>
      </div>
    </div>
  </header>

  <main class="flex-1">
    <div class="container-full py-8">
      <slot />
    </div>
  </main>
</div>
