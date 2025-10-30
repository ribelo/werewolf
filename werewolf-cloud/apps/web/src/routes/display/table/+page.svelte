<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { realtimeClient } from '$lib/realtime';
  import type { PageData } from './$types';
  import type {
    Attempt,
    LiveEvent,
    Registration,
    CurrentAttempt,
    CurrentAttemptBundle,
    AttemptStatus,
    AttemptNumber,
  } from '$lib/types';
  import { bundleToCurrentAttempt } from '$lib/current-attempt';
  import { get } from 'svelte/store';
  import { _ } from 'svelte-i18n';
  import { getAttemptStatusLabel, getAttemptStatusClass } from '$lib/ui/status';
  import { buildRisingBarQueue } from '$lib/rising-bar';
  import UnifiedContestTable from '$lib/components/UnifiedContestTable.svelte';
  import { buildUnifiedRows, deriveContestLifts, sortUnifiedRows, type UnifiedRow, type LiftKind } from '$lib/contest-table';
  import ApiStatus from '$lib/components/ApiStatus.svelte';

  type MessageValues = Record<string, string | number | boolean | Date | null | undefined>;

  function t(key: string, values?: MessageValues): string {
    const translate = get(_);
    return translate(key, values ? { values } : undefined);
  }

  function formatWeight(value?: number | null): string {
    if (value == null || Number.isNaN(value) || value <= 0) return '—';
    return Number.isInteger(value) ? `${Math.trunc(value)}` : value.toFixed(1);
  }

  export let data: PageData;

  let {
    contest,
    registrations,
    attempts,
    currentAttempt,
    referenceData,
    error,
    contestId,
  } = data;

  let apiBase = '';

  // Real-time state
  let liveAttempts: Attempt[] = [...attempts];
  let contestLifts: LiftKind[] = deriveContestLifts(contest, liveAttempts);
  let liveCurrentBundle: CurrentAttemptBundle | null = currentAttempt;
  let liveCurrentAttempt: CurrentAttempt | null = currentAttempt ? bundleToCurrentAttempt(currentAttempt) : null;
  let lastUpdateTime: Date | null = null;

  let sortColumn = 'order';
  let sortDirection: 'asc' | 'desc' = 'asc';
  let selectedLift: LiftKind | null = null;
  let visibleLifts: LiftKind[] = [...contestLifts];
  let unifiedRows: UnifiedRow[] = [];
  let sortedRows: UnifiedRow[] = [];
  let filteredRows: UnifiedRow[] = [];
  let mensBarWeightSetting: number | null = contest?.mensBarWeight ?? null;
  let womensBarWeightSetting: number | null = contest?.womensBarWeight ?? null;
  let clampWeightSetting: number | null = contest?.clampWeight ?? 2.5;

  // Derived metrics
  $: lifterCount = registrations.length;
  $: pendingAttempts = computePendingAttempts();
  $: pendingCount = pendingAttempts.length;
  $: recentAttempts = computeRecentAttempts();

  // Shareable link for QR code
  const unsubscribeEvents = realtimeClient.events.subscribe((event) => {
    if (!event || event.contestId !== contestId) return;
    updateLastUpdateTime();
    handleLiveEvent(event);
  });

  onMount(() => {
    updateLastUpdateTime();
    if (contestId) {
      realtimeClient.connect(contestId);
    }
    // Set API base from environment
    apiBase = import.meta.env.PUBLIC_API_BASE || '';
  });

  onDestroy(() => {
    realtimeClient.disconnect();
    unsubscribeEvents();
  });

  function updateLastUpdateTime() {
    lastUpdateTime = new Date();
  }

  function handleLiveEvent(event: LiveEvent) {
    switch (event.type) {
      case 'attempt.upserted': {
        const payload = event.data as Attempt | undefined;
        if (!payload) break;
        const index = liveAttempts.findIndex((item) => item.id === payload.id);
        if (index >= 0) {
          liveAttempts[index] = payload;
        } else {
          liveAttempts = [...liveAttempts, payload];
        }
        liveAttempts = [...liveAttempts];
        break;
      }
      case 'attempt.resultUpdated': {
        const payload = event.data as Attempt | undefined;
        if (!payload) break;
        const index = liveAttempts.findIndex((item) => item.id === payload.id);
        if (index >= 0) {
          liveAttempts[index] = { ...liveAttempts[index], ...payload };
          liveAttempts = [...liveAttempts];
        }
        break;
      }
      case 'attempt.currentSet': {
        const payload = event.data as CurrentAttemptBundle | Attempt | CurrentAttempt | undefined;
        if (payload) {
          liveCurrentBundle = 'attempt' in (payload as any) ? (payload as CurrentAttemptBundle) : liveCurrentBundle;
          liveCurrentAttempt = toCurrentAttemptSummary(payload);
        }
        break;
      }
      case 'attempt.currentCleared': {
        liveCurrentAttempt = null;
        liveCurrentBundle = null;
        break;
      }
      case 'registration.upserted': {
        const payload = event.data as Registration | undefined;
        if (!payload) break;
        const index = registrations.findIndex((item) => item.id === payload.id);
        if (index >= 0) {
          const next = [...registrations];
          next[index] = { ...next[index], ...payload };
          registrations = next;
        } else {
          registrations = [...registrations, payload];
        }
        break;
      }
      case 'registration.deleted': {
        const payload = event.data as { registrationId?: string } | undefined;
        const registrationId = payload?.registrationId;
        if (!registrationId) break;
        const before = registrations.length;
        registrations = registrations.filter((entry) => entry.id !== registrationId);
        if (registrations.length !== before) {
          liveAttempts = liveAttempts.filter((attempt) => attempt.registrationId !== registrationId);
        }
        break;
      }
      default:
        break;
    }
  }

  function computePendingAttempts(): Attempt[] {
    return buildRisingBarQueue(liveAttempts, {
      currentAttempt: liveCurrentAttempt,
      registrations,
      limit: 12,
    }).attempts;
  }

  $: unifiedRows = buildUnifiedRows({
        registrations,
        attempts: liveAttempts,
        contest,
      });
  $: contestLifts = deriveContestLifts(contest, liveAttempts);
  $: mensBarWeightSetting = contest?.mensBarWeight ?? null;
  $: womensBarWeightSetting = contest?.womensBarWeight ?? null;
  $: clampWeightSetting = contest?.clampWeight ?? 2.5;
  $: sortedRows = sortUnifiedRows(unifiedRows, sortColumn, sortDirection);
  $: if (!selectedLift || !contestLifts.includes(selectedLift)) {
        selectedLift = contestLifts.length > 0 ? contestLifts[0] : null;
      }
  $: visibleLifts = selectedLift ? [selectedLift] : [...contestLifts];
  $: filteredRows = sortedRows;

  function toCurrentAttemptSummary(input: CurrentAttemptBundle | Attempt | CurrentAttempt): CurrentAttempt {
    if ('attempt' in (input as any)) {
      return bundleToCurrentAttempt(input as CurrentAttemptBundle);
    }

    if ('competitorName' in (input as any) && (input as CurrentAttempt).competitorName) {
      return input as CurrentAttempt;
    }

    const attempt = input as Attempt;
    const registration = registrations.find((entry) => entry.id === attempt.registrationId);
    const competitorName = registration
      ? `${registration.lastName} ${registration.firstName}`
      : attempt.competitorName ?? 'Unknown Competitor';

    return {
      id: attempt.id,
      registrationId: attempt.registrationId,
      competitorName,
      liftType: attempt.liftType,
      attemptNumber: attempt.attemptNumber as AttemptNumber,
      weight: attempt.weight,
      status: attempt.status as AttemptStatus,
      competitionOrder: registration?.competitionOrder ?? null,
      updatedAt: attempt.updatedAt ?? null,
    };
  }

  $: livePlatePlan = liveCurrentBundle?.platePlan ?? null;

  function computeRecentAttempts(): Attempt[] {
    return liveAttempts
      .filter((attempt) => attempt.status !== 'Pending')
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
      .slice(0, 16);
  }

  function handleSortChange(column: string) {
    if (sortColumn === column) {
      sortDirection = sortDirection === 'asc' ? 'desc' : 'asc';
    } else {
      sortColumn = column;
      sortDirection = 'asc';
    }
  }

  function liftLabel(liftType: string): string {
    if (!liftType) return '';
    const key = liftType.toLowerCase();
    const translated = t(`display_current.lifts.${key}`);
    if (translated && translated !== `display_current.lifts.${key}`) {
      return translated;
    }
    return liftType;
  }

  function liftTabLabel(lift: LiftKind): string {
    return liftLabel(lift);
  }

  function selectLift(lift: LiftKind) {
    selectedLift = lift;
  }

  function getCompetitor(registrationId: string): Registration | undefined {
    return registrations.find((entry) => entry.id === registrationId);
  }

  function competitorName(registrationId: string): string {
    const competitor = getCompetitor(registrationId);
    return competitor ? `${competitor.lastName} ${competitor.firstName}` : 'Unknown';
  }

  function queueLabel(attempt: Attempt): string {
    const competitor = getCompetitor(attempt.registrationId);
    const orderSource = null;
    const orderLabel =
      orderSource != null && Number.isFinite(orderSource)
        ? t('display_table.queue.order', { order: orderSource })
        : t('display_table.queue.order_unknown');
    return t('display_table.queue.label', {
      order: orderLabel,
      name: competitorName(attempt.registrationId)
    });
  }

</script>

<svelte:head>
  <title>{(contest?.name ?? t('display_table.head.default_contest')) + ' • ' + t('display_table.head.subtitle')}</title>
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
</svelte:head>

<div class="min-h-screen bg-black text-white flex flex-col">
  <header class="w-full bg-black px-3 sm:px-4 py-3 sm:py-4">
    <div class="flex flex-col items-center gap-3 sm:gap-4 text-center">
      <h1 class="font-display text-xl sm:text-2xl md:text-3xl uppercase tracking-[0.1rem] sm:tracking-[0.15rem] text-white" style="text-shadow: 0 0 16px rgba(220, 20, 60, 0.5), 0 0 32px rgba(220, 20, 60, 0.3);">{contest?.name ?? t('display_table.head.default_contest')}</h1>
      <ApiStatus {apiBase} />
    </div>
  </header>

  <main class="flex-1 container-full py-3 sm:py-4 space-y-3 sm:space-y-4">
    {#if error}
      <div class="card border-primary-red text-center space-y-4">
        <h2 class="text-h2 text-status-error">{t('display_table.errors.load_failed_title')}</h2>
        <p class="text-body text-text-secondary">{error}</p>
      </div>
    {:else}
      <section class="grid gap-3 md:grid-cols-2">
        <div class="card text-center space-y-2">
          <p class="text-label text-text-secondary uppercase tracking-[0.4em]">{t('display_table.metrics.lifters')}</p>
          <p class="text-h2 text-text-primary">{lifterCount}</p>
        </div>
        <div class="card text-center space-y-2">
          <p class="text-label text-text-secondary uppercase tracking-[0.4em]">{t('display_table.metrics.last_update')}</p>
          <p class="text-h2 text-text-primary">{lastUpdateTime ? lastUpdateTime.toLocaleTimeString() : '—'}</p>
        </div>
      </section>

      <section class="card space-y-3">
        <div class="flex flex-wrap items-center justify-center gap-2 md:justify-start">
          {#each contestLifts as lift}
            <button
              type="button"
              class={`px-2 py-1 text-xxs ${selectedLift === lift ? 'btn-primary text-black' : 'btn-secondary'}`}
              on:click={() => selectLift(lift)}
            >
              {liftTabLabel(lift)}
            </button>
          {/each}
        </div>
        {#if filteredRows.length === 0}
          <p class="text-caption text-text-secondary text-center py-4">{$_('contest_detail.registrations.empty_filter')}</p>
        {:else}
          <div class="overflow-x-auto">
            <UnifiedContestTable
              rows={filteredRows}
              sortColumn={sortColumn}
              sortDirection={sortDirection}
              readOnly={true}
              activeFlight={contest?.activeFlight ?? null}
              lifts={visibleLifts}
              weightClasses={referenceData?.weightClasses ?? []}
              ageCategories={referenceData?.ageCategories ?? []}
              showRowNumbers={true}
              onSortChange={handleSortChange}
            />
          </div>
        {/if}
      </section>


    {/if}
  </main>
</div>
