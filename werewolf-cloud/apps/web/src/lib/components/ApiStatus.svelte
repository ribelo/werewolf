<script lang="ts">
  import { onMount } from 'svelte';
  import { apiClient, ApiError } from '$lib/api';
  import { _ } from 'svelte-i18n';
  import type { SystemHealth } from '$lib/types';

  type ApiStatus = 'checking' | 'online' | 'degraded' | 'offline';

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
    setStatus('checking');

    try {
      const response = await apiClient.get<SystemHealth>('/system/health');

      if (response.error) {
        setStatus('degraded', response.error, null);
        return;
      }

      const normalized = (response.data?.status ?? '').toLowerCase();

      if (['ok', 'healthy', 'online'].includes(normalized)) {
        setStatus('online');
      } else if (normalized === 'unknown' || normalized === '') {
        setStatus('degraded', '', 'layout.status.fallback_detail');
      } else {
        setStatus('degraded', response.data?.status ?? normalized, null);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : '';
      setStatus('offline', message, message ? null : 'layout.status.fallback_detail');
    }
  }

  function setStatus(newStatus: ApiStatus, detail = '', detailKey: string | null = null) {
    status = newStatus;
    statusDetail = detail;
    statusDetailKey = detailKey;
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