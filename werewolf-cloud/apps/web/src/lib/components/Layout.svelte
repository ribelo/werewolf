<script lang="ts">
  import { onMount } from 'svelte';
  import { apiClient, ApiError } from '$lib/api';
  import { PAGE_LINKS } from '$lib/nav';
  import { _ } from 'svelte-i18n';
  import type { SystemHealth } from '$lib/types';
  import { initializeMutationQueue, queueCounts } from '$lib/offline/mutation-queue';
  import MutationQueueModal from '$lib/components/MutationQueueModal.svelte';
  import { modalStore } from '$lib/ui/modal';
  import { goto } from '$app/navigation';

  type SessionInfo = { authenticated: boolean; checked?: boolean };

  type ApiStatus = 'checking' | 'online' | 'degraded' | 'offline';

  export let title: string | null = null;
  export let subtitle = '';
  export let currentPage: keyof typeof PAGE_LINKS = 'contests';
  export let apiBase = '';
  export let session: SessionInfo = { authenticated: false, checked: false };

  let status: ApiStatus = 'checking';
  let statusDetail = '';
  let statusDetailKey: string | null = null;
  $: counts = $queueCounts;
  $: queueHasFailures = counts.failed > 0;
  $: queueButtonClasses = queueHasFailures
    ? 'btn-secondary px-3 py-1 text-xxs border-status-warning text-status-warning bg-status-warning/20'
    : 'btn-secondary px-3 py-1 text-xxs';

  const STATUS_LABEL_KEYS: Record<ApiStatus, string> = {
    checking: 'layout.status.checking',
    online: 'layout.status.online',
    degraded: 'layout.status.degraded',
    offline: 'layout.status.offline',
  };

  type WindowWithStatus = Window & {
    __werewolfStatus?: {
      status: ApiStatus;
      statusDetail: string;
      statusDetailKey: string | null;
    };
  };

  function setStatus(newStatus: ApiStatus, detail = '', detailKey: string | null = null) {
    status = newStatus;
    statusDetail = detail;
    statusDetailKey = detailKey;

    if (typeof window !== 'undefined') {
      (window as WindowWithStatus).__werewolfStatus = {
        status,
        statusDetail,
        statusDetailKey,
      };
    }
  }

  onMount(() => {
    console.log('[layout] onMount');
    void initializeMutationQueue();
    checkApiStatus();
  });

  async function checkApiStatus(): Promise<void> {
    setStatus('checking');

    try {
      const response = await apiClient.get<SystemHealth>('/system/health');

      if (response.error) {
        console.log('[layout] checkApiStatus degraded due to error', response.error);
        setStatus('degraded', response.error, null);
        return;
      }

      const normalized = (response.data?.status ?? '').toLowerCase();

      if (['ok', 'healthy', 'online'].includes(normalized)) {
        console.log('[layout] checkApiStatus online');
        setStatus('online');
      } else if (normalized === 'unknown' || normalized === '') {
        console.log('[layout] checkApiStatus unknown -> degraded');
        setStatus('degraded', '', 'layout.status.fallback_detail');
      } else {
        console.log('[layout] checkApiStatus degraded', response.data?.status);
        setStatus('degraded', response.data?.status ?? normalized, null);
      }
    } catch (error) {
      console.error('[layout] checkApiStatus offline', error);
      const message = error instanceof Error ? error.message : '';
      setStatus('offline', message, message ? null : 'layout.status.fallback_detail');
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

  const openQueueModal = () => {
    void modalStore.open({
      title: $_('queue.modal.title'),
      size: 'lg',
      component: MutationQueueModal,
      showFooter: false,
    });
  };

  const handleSignOut = async () => {
    try {
      await apiClient.post('/auth/logout');
    } catch (err) {
      console.error('Failed to logout', err instanceof ApiError ? err.message : err);
    } finally {
      await goto('/login');
    }
  };
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
          {#if session.authenticated}
            <button
              type="button"
              class="px-4 py-2 font-display text-xs tracking-[0.4em] uppercase border-2 transition border-border-color text-text-secondary hover:text-text-primary hover:border-primary-red"
              on:click={handleSignOut}
            >
              {$_('layout.nav.sign_out')}
            </button>
          {/if}
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
          {#if counts.total > 0}
            <button
              type="button"
              class={queueButtonClasses}
              on:click={openQueueModal}
            >
              {$_(queueHasFailures ? 'layout.queue.button_failed' : 'layout.queue.button_pending', {
                values: {
                  total: counts.total,
                  pending: counts.pending,
                  failed: counts.failed,
                }
              })}
            </button>
          {/if}
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
