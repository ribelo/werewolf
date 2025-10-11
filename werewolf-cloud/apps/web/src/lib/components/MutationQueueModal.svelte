<script lang="ts">
  import { _ } from 'svelte-i18n';
  import { mutationQueueState, retryMutation, discardMutation } from '$lib/offline/mutation-queue';

  const queue = mutationQueueState;

  const formatTimestamp = (ts: number) => {
    return new Date(ts).toLocaleString();
  };
</script>

<div class="space-y-6">
  <section>
    {#if $queue.pending.length === 0 && $queue.failed.length === 0}
      <p class="text-body text-text-secondary">{$_('queue.empty')}</p>
    {:else}
      <div class="flex flex-wrap gap-3 text-xxs uppercase tracking-[0.3em] text-text-secondary">
        <span>{$_('queue.summary.pending', { values: { count: $queue.pending.length } })}</span>
        <span>{$_('queue.summary.in_flight', { values: { count: $queue.inFlight.length } })}</span>
        {#if $queue.failed.length > 0}
          <span class="text-status-warning">{$_('queue.summary.failed', { values: { count: $queue.failed.length } })}</span>
        {/if}
      </div>
    {/if}
  </section>

  {#if $queue.pending.length > 0}
    <section class="space-y-2">
      <h3 class="text-h4 text-text-primary">{$_('queue.sections.pending')}</h3>
      <table class="w-full text-left text-sm text-text-secondary">
        <thead class="bg-element-bg text-label">
          <tr>
            <th class="px-3 py-2">{$_('queue.columns.endpoint')}</th>
            <th class="px-3 py-2">{$_('queue.columns.method')}</th>
            <th class="px-3 py-2">{$_('queue.columns.age')}</th>
          </tr>
        </thead>
        <tbody>
          {#each $queue.pending as item (item.id)}
            <tr class="border-b border-border-color last:border-b-0">
              <td class="px-3 py-2 font-mono text-xxs break-all">{item.endpoint}</td>
              <td class="px-3 py-2 uppercase">{item.method}</td>
              <td class="px-3 py-2 text-xxs">{formatTimestamp(item.createdAt)}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    </section>
  {/if}

  {#if $queue.failed.length > 0}
    <section class="space-y-2">
      <h3 class="text-h4 text-status-warning">{$_('queue.sections.failed')}</h3>
      <table class="w-full text-left text-sm text-text-secondary">
        <thead class="bg-element-bg text-label">
          <tr>
            <th class="px-3 py-2">{$_('queue.columns.endpoint')}</th>
            <th class="px-3 py-2">{$_('queue.columns.error')}</th>
            <th class="px-3 py-2 text-right" colspan="2">{$_('queue.columns.actions')}</th>
          </tr>
        </thead>
        <tbody>
          {#each $queue.failed as item (item.id)}
            <tr class="border-b border-border-color last:border-b-0">
              <td class="px-3 py-2 font-mono text-xxs break-all">{item.endpoint}</td>
              <td class="px-3 py-2 text-xxs">{item.lastError ?? $_('queue.labels.unknown_error')}</td>
              <td class="px-3 py-2 text-right">
                <button type="button" class="btn-secondary px-3 py-1 text-xxs" on:click={() => retryMutation(item.id)}>
                  {$_('queue.actions.retry')}
                </button>
              </td>
              <td class="px-3 py-2 text-right">
                <button type="button" class="btn-secondary px-3 py-1 text-xxs" on:click={() => discardMutation(item.id)}>
                  {$_('queue.actions.discard')}
                </button>
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    </section>
  {/if}
</div>
