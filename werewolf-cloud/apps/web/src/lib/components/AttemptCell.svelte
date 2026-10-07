<script lang="ts">
  import { CheckCircle2, Clock, Loader2, Radio, XCircle } from 'lucide-svelte';
  import { _ } from 'svelte-i18n';
  import { getAttemptStatusClass } from '$lib/ui/status';
  import { formatWeight } from '$lib/utils';
  import type { AttemptStatus } from '$lib/types';
  import type { AttemptCell as AttemptCellData } from '$lib/contest-table';
  import type { AttemptCellActions, AttemptCellDisplay } from './attempt-cell';

  export let registrationId: string;
  export let cell: AttemptCellData;
  export let display: AttemptCellDisplay;
  export let actions: AttemptCellActions;

  const LIVE_BUTTON_BASE = 'inline-flex h-7 w-7 items-center justify-center rounded-sm border transition-colors duration-200';
  const STATUS_BUTTON_BASE = 'inline-flex h-7 w-7 items-center justify-center rounded-sm border transition-colors duration-200';
  const PLACEHOLDER_CLASS = 'inline-flex h-7 w-[3.75rem] items-center justify-center rounded border border-border-color/40 bg-element-bg/60 text-xs text-text-tertiary';
  const WEIGHT_READONLY_CLASS = 'inline-flex h-7 w-[3.75rem] items-center justify-center rounded border border-border-color/60 bg-element-bg px-2 text-xs text-text-secondary';

  const statusMessageKey: Record<AttemptStatus, string> = {
    Pending: 'attempt.status.pending',
    Successful: 'attempt.status.successful',
    Failed: 'attempt.status.failed',
  };

  const statusIconMap: Record<AttemptStatus, typeof Clock> = {
    Pending: Clock,
    Successful: CheckCircle2,
    Failed: XCircle,
  };

  function resolveStatus(input: string | null | undefined): AttemptStatus {
    switch (input) {
      case 'Successful':
        return 'Successful';
      case 'Failed':
        return 'Failed';
      default:
        return 'Pending';
    }
  }

  function liveButtonClass(isCurrent: boolean, isDisabled: boolean): string {
    if (isCurrent) {
      return `${LIVE_BUTTON_BASE} border-primary-red bg-primary-red/20 text-primary-red shadow-glow`;
    }
    if (isDisabled) {
      return `${LIVE_BUTTON_BASE} border-border-color/60 text-text-tertiary cursor-not-allowed`;
    }
    return `${LIVE_BUTTON_BASE} border-border-color text-text-secondary hover:border-primary-red hover:text-primary-red`;
  }

  function parseWeightInput(raw: string): number | null {
    if (!raw) return null;
    const normalized = raw
      .replace(/,/g, '.')
      .replace(/[^0-9.-]/g, '')
      .replace(/(\..*?)\./g, '$1');
    const value = parseFloat(normalized);
    if (!Number.isFinite(value)) {
      return null;
    }
    return Math.round(value * 100) / 100;
  }

  function formatWeightInputValue(weight: number | null | undefined): string {
    if (weight === null || weight === undefined || Number.isNaN(weight)) {
      return '';
    }
    return weight.toFixed(2);
  }

  function weightDisplay(value: number | null | undefined): string {
    if (value === undefined || value === null || Number.isNaN(value)) {
      return '—';
    }
    return formatWeight(value);
  }

  function handleSetLive(): void {
    const attempt = cell.attempt;
    if (attempt === null) {
      return;
    }
    actions.setLive(attempt);
  }

  function handleStatusCycle(): void {
    const attempt = cell.attempt;
    if (attempt === null) {
      return;
    }
    actions.cycleStatus(attempt);
  }

  function handleWeightChange(event: Event): void {
    const target = event.currentTarget;
    if (!(target instanceof HTMLInputElement) || display.weightPending) {
      return;
    }
    const parsed = parseWeightInput(target.value);
    if (parsed === null) {
      return;
    }
    actions.commitWeight(registrationId, cell, parsed);
  }
</script>

{#if !display.liftEnabled || !cell.attempt}
  <span class={PLACEHOLDER_CLASS}>—</span>
{:else}
  {@const attempt = cell.attempt}
  {@const status = resolveStatus(attempt.status)}
  {@const statusLabel = $_(statusMessageKey[status])}
  {@const liveDisabled = display.live || display.livePending || display.weightPending}
  <div class="flex flex-col items-center gap-1">
    <div class="flex items-center gap-1">
      {#if !display.readOnly}
        <button
          class={liveButtonClass(display.live, display.livePending || display.weightPending)}
          type="button"
          aria-label={display.live ? $_('contest_table.actions.live_now') : $_('contest_table.actions.set_live')}
          title={display.live ? $_('contest_table.actions.live_now') : $_('contest_table.actions.set_live')}
          aria-pressed={display.live}
          disabled={liveDisabled}
          aria-busy={display.livePending}
          on:click={handleSetLive}
        >
          {#if display.livePending}
            <Loader2 class="h-4 w-4 animate-spin" aria-hidden="true" />
          {:else}
            <Radio class="h-4 w-4" aria-hidden="true" />
          {/if}
        </button>
      {/if}
      {#if display.readOnly}
        <span
          class={`${STATUS_BUTTON_BASE} ${getAttemptStatusClass(status)} opacity-70`}
          aria-label={statusLabel}
        >
          <svelte:component this={statusIconMap[status] || Clock} class="h-4 w-4" aria-hidden="true" />
        </span>
      {:else}
        <button
          class={`${STATUS_BUTTON_BASE} ${getAttemptStatusClass(status)} ${display.statusPending ? 'cursor-progress opacity-70' : 'hover:brightness-110'}`}
          type="button"
          aria-label={statusLabel}
          title={statusLabel}
          disabled={display.statusPending}
          aria-busy={display.statusPending}
          on:click={handleStatusCycle}
        >
          {#if display.statusPending}
            <Loader2 class="h-4 w-4 animate-spin" aria-hidden="true" />
          {:else}
            <svelte:component this={statusIconMap[status] || Clock} class="h-4 w-4" aria-hidden="true" />
          {/if}
        </button>
      {/if}
    </div>

    {#if display.readOnly}
      <span class={WEIGHT_READONLY_CLASS}>
        {weightDisplay(attempt.weight)}
      </span>
    {:else}
      <input
        class={`h-7 w-[3.75rem] rounded border border-border-color bg-main-bg px-2 text-center text-xs ${display.weightPending ? 'cursor-progress opacity-60' : ''}`}
        type="text"
        inputmode="decimal"
        autocomplete="off"
        value={formatWeightInputValue(attempt.weight)}
        placeholder="—"
        disabled={display.weightPending}
        aria-busy={display.weightPending}
        on:change={handleWeightChange}
      />
    {/if}
  </div>
{/if}
