<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { realtimeClient } from '$lib/realtime';
  import type { PageData } from './$types';
  import type {
    Attempt,
    ConnectionStatus,
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
  import { statusBadgeClass, getAttemptStatusLabel, getAttemptStatusClass } from '$lib/ui/status';
  import { buildRisingBarQueue } from '$lib/rising-bar';
  import UnifiedContestTable from '$lib/components/UnifiedContestTable.svelte';
  import { buildUnifiedRows, deriveContestLifts, sortUnifiedRows, filterRowsByFlight, type UnifiedRow, type LiftKind } from '$lib/contest-table';

  type MessageValues = Record<string, string | number | boolean | Date | null | undefined>;

  function t(key: string, values?: MessageValues): string {
    const translate = get(_);
    return translate(key, values ? { values } : undefined);
  }

  function formatWeight(value?: number | null): string {
    if (value == null || Number.isNaN(value) || value <= 0) return '—';
    return Number.isInteger(value) ? `${Math.trunc(value)}` : value.toFixed(1);
  }

  type FlightFilter = 'ALL' | 'UNASSIGNED' | string;

  export let data: PageData;

  let {
    contest,
    registrations,
    attempts,
    currentAttempt,
    referenceData,
    error,
    contestId,
    isOffline,
    cacheAge,
  } = data;

  // Real-time state
  let connectionStatus: ConnectionStatus = 'offline';
let liveAttempts: Attempt[] = [...attempts];
let contestLifts: LiftKind[] = deriveContestLifts(contest, liveAttempts);
let liveCurrentBundle: CurrentAttemptBundle | null = currentAttempt;
let liveCurrentAttempt: CurrentAttempt | null = currentAttempt ? bundleToCurrentAttempt(currentAttempt) : null;
let lastUpdateTime: Date | null = null;

let sortColumn = 'order';
let sortDirection: 'asc' | 'desc' = 'asc';
let selectedFlightFilter: FlightFilter = 'ALL';
let availableFlights: string[] = [];
let unifiedRows: UnifiedRow[] = [];
let sortedRows: UnifiedRow[] = [];
let filteredRows: UnifiedRow[] = [];
let mensBarWeightSetting: number | null = contest?.mensBarWeight ?? null;
let womensBarWeightSetting: number | null = contest?.womensBarWeight ?? null;
let defaultBarWeightSetting: number | null = contest?.mensBarWeight ?? null;
let clampWeightSetting: number | null = contest?.clampWeight ?? 2.5;

  // Derived metrics
  $: lifterCount = registrations.length;
  $: pendingAttempts = computePendingAttempts();
  $: pendingCount = pendingAttempts.length;
  $: recentAttempts = computeRecentAttempts();

  // Shareable link for QR code
  const unsubscribeStatus = realtimeClient.connectionStatus.subscribe((status) => {
    connectionStatus = status;
  });

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
  });

  onDestroy(() => {
    realtimeClient.disconnect();
    unsubscribeStatus();
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

$: availableFlights = Array.from(new Set(registrations
        .map((reg) => reg.flightCode)
        .filter((code): code is string => Boolean(code)))).sort((a, b) => a.localeCompare(b));
$: unifiedRows = buildUnifiedRows({
        registrations,
        attempts: liveAttempts,
        contest,
      });
$: contestLifts = deriveContestLifts(contest, liveAttempts);
$: mensBarWeightSetting = contest?.mensBarWeight ?? null;
$: womensBarWeightSetting = contest?.womensBarWeight ?? null;
$: defaultBarWeightSetting = contest?.mensBarWeight ?? null;
$: clampWeightSetting = contest?.clampWeight ?? 2.5;
  $: sortedRows = sortUnifiedRows(unifiedRows, sortColumn, sortDirection);
  $: filteredRows = selectedFlightFilter === 'UNASSIGNED'
        ? sortedRows.filter((row) => !row.registration.flightCode)
        : filterRowsByFlight(sortedRows, selectedFlightFilter === 'ALL' ? null : selectedFlightFilter);
  $: if (selectedFlightFilter !== 'ALL' && selectedFlightFilter !== 'UNASSIGNED' && !availableFlights.includes(selectedFlightFilter)) {
        selectedFlightFilter = availableFlights.length > 0 ? availableFlights[0] : 'ALL';
      }

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
      ? `${registration.firstName} ${registration.lastName}`
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

  function selectFlightFilter(filter: FlightFilter) {
    selectedFlightFilter = filter;
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

  function getCompetitor(registrationId: string): Registration | undefined {
    return registrations.find((entry) => entry.id === registrationId);
  }

  function competitorName(registrationId: string): string {
    const competitor = getCompetitor(registrationId);
    return competitor ? `${competitor.firstName} ${competitor.lastName}` : 'Unknown';
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

  function connectionLabel(): string {
    if (connectionStatus === 'connected') return t('display_table.connection.live');
    if (connectionStatus === 'connecting') return t('display_table.connection.connecting');
    if (isOffline) {
      return cacheAge
        ? t('display_table.connection.cached_with_age', { minutes: cacheAge })
        : t('display_table.connection.cached');
    }
    return t('display_table.connection.offline');
  }

  function connectionBadge(): string {
    if (connectionStatus === 'connected') return statusBadgeClass('connected');
    if (connectionStatus === 'connecting') return statusBadgeClass('connecting');
    return statusBadgeClass(isOffline ? 'warning' : 'error');
  }

  function reconnect() {
    realtimeClient.disconnect();
    if (contestId) {
      realtimeClient.connect(contestId);
    }
  }
</script>

<svelte:head>
  <title>{(contest?.name ?? t('display_table.head.default_contest')) + ' • ' + t('display_table.head.subtitle')}</title>
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
</svelte:head>

<div class="min-h-screen bg-black text-white flex flex-col">
  <header class="w-full bg-black px-10 py-10">
    <div class="flex flex-col items-center gap-4 text-center">
      <h1 class="font-display text-5xl uppercase tracking-[0.2rem] text-white" style="text-shadow: 0 0 20px rgba(220, 20, 60, 0.5), 0 0 40px rgba(220, 20, 60, 0.3);">{contest?.name ?? t('display_table.head.default_contest')}</h1>
      <p class="text-caption text-text-secondary uppercase tracking-[0.4em]">{t('display_table.header.tagline')}</p>
      <div class="flex items-center gap-4">
        <span class={connectionBadge()}>{connectionLabel()}</span>
        {#if connectionStatus !== 'connected'}
          <button type="button" class="btn-secondary px-4 py-2 text-xxs" on:click={reconnect}>
            {t('display_table.connection.retry')}
          </button>
        {/if}
      </div>
    </div>
  </header>

  <main class="flex-1 container-full py-12 space-y-10">
    {#if error}
      <div class="card border-primary-red text-center space-y-4">
        <h2 class="text-h2 text-status-error">{t('display_table.errors.load_failed_title')}</h2>
        <p class="text-body text-text-secondary">{error}</p>
      </div>
    {:else}
      <section class="grid gap-6 md:grid-cols-3">
        <div class="card text-center space-y-3">
          <p class="text-label text-text-secondary uppercase tracking-[0.4em]">{t('display_table.metrics.lifters')}</p>
          <p class="text-h1 text-text-primary">{lifterCount}</p>
        </div>
        <div class="card text-center space-y-3">
          <p class="text-label text-text-secondary uppercase tracking-[0.4em]">{t('display_table.metrics.pending')}</p>
          <p class="text-h1 text-text-primary">{pendingCount}</p>
        </div>
        <div class="card text-center space-y-3">
          <p class="text-label text-text-secondary uppercase tracking-[0.4em]">{t('display_table.metrics.last_update')}</p>
          <p class="text-h1 text-text-primary">{lastUpdateTime ? lastUpdateTime.toLocaleTimeString() : '—'}</p>
        </div>
      </section>

      <section class="card space-y-6">
        <header class="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 class="text-h2 text-text-primary uppercase tracking-[0.3em]">{$_('contest_detail.registrations.title')}</h2>
            <p class="text-caption text-text-secondary uppercase tracking-[0.3em]">{$_('contest_detail.registrations.subtitle')}</p>
          </div>
          <div class="flex flex-wrap items-center gap-2">
            <button type="button" class={`px-3 py-1 text-xxs ${selectedFlightFilter === 'ALL' ? 'btn-primary text-black' : 'btn-secondary'}`} on:click={() => selectFlightFilter('ALL')}>
              {$_('contest_detail.registrations.filters.all')}
            </button>
            <button type="button" class={`px-3 py-1 text-xxs ${selectedFlightFilter === 'UNASSIGNED' ? 'btn-primary text-black' : 'btn-secondary'}`} on:click={() => selectFlightFilter('UNASSIGNED')}>
              {$_('contest_detail.registrations.filters.unassigned')}
            </button>
            {#each availableFlights as flight}
              <button type="button" class={`px-3 py-1 text-xxs ${selectedFlightFilter === flight ? 'btn-primary text-black' : 'btn-secondary'}`} on:click={() => selectFlightFilter(flight)}>{flight}</button>
            {/each}
          </div>
        </header>
        {#if filteredRows.length === 0}
          <p class="text-caption text-text-secondary text-center py-8">{$_('contest_detail.registrations.empty_filter')}</p>
        {:else}
          <div class="overflow-x-auto">
            <UnifiedContestTable
              rows={filteredRows}
              sortColumn={sortColumn}
              sortDirection={sortDirection}
              readOnly={true}
              activeFlight={contest?.activeFlight ?? null}
              lifts={contestLifts}
              weightClasses={referenceData?.weightClasses ?? []}
              ageCategories={referenceData?.ageCategories ?? []}
              onSortChange={handleSortChange}
            />
          </div>
        {/if}
      </section>

      <section class="grid gap-8 xl:grid-cols-2">
        <div class="card space-y-6">
          <header class="card-header">
            <h2 class="text-h2 text-text-primary uppercase tracking-[0.3em]">{t('display_table.queue.title')}</h2>
            <p class="text-caption text-text-secondary uppercase tracking-[0.3em]">{t('display_table.queue.subtitle')}</p>
          </header>
          {#if pendingAttempts.length === 0}
            <p class="text-caption text-text-secondary text-center py-8">{t('display_table.queue.empty')}</p>
          {:else}
            <ul class="space-y-4">
              {#each pendingAttempts as attempt}
                <li class="flex flex-col gap-3 md:flex-row md:items-center md:justify-between border border-border-color bg-element-bg/60 px-4 py-3">
                  <div class="space-y-1">
                    <p class="text-body text-text-primary font-semibold uppercase tracking-[0.3em]">{queueLabel(attempt)}</p>
                    <p class="text-caption text-text-secondary uppercase tracking-[0.3em]">{t('display_table.queue.meta', { lift: liftLabel(attempt.liftType), number: attempt.attemptNumber })}</p>
                  </div>
                  <p class="weight-medium text-text-primary font-mono">{t('display_table.common.weight_kg', { weight: attempt.weight })}</p>
                </li>
              {/each}
            </ul>
          {/if}
        </div>

        <div class="card space-y-6">
          <header class="card-header">
            <h2 class="text-h2 text-text-primary uppercase tracking-[0.3em]">{t('display_table.recent.title')}</h2>
            <p class="text-caption text-text-secondary uppercase tracking-[0.3em]">{t('display_table.recent.subtitle')}</p>
          </header>
          {#if recentAttempts.length === 0}
            <p class="text-caption text-text-secondary text-center py-8">{t('display_table.recent.empty')}</p>
          {:else}
            <ul class="space-y-4">
              {#each recentAttempts as attempt}
                <li class="border border-border-color bg-element-bg/60 px-4 py-3">
                  <div class="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                    <div class="space-y-1">
                      <p class="text-body text-text-primary font-semibold uppercase tracking-[0.3em]">{competitorName(attempt.registrationId)}</p>
                      <p class="text-caption text-text-secondary uppercase tracking-[0.3em]">{t('display_table.recent.meta', { lift: liftLabel(attempt.liftType), number: attempt.attemptNumber })}</p>
                    </div>
                    <div class="flex flex-col items-end gap-2 lg:flex-row lg:items-center lg:gap-4">
                      <p class="weight-medium text-text-primary font-mono">{t('display_table.common.weight_kg', { weight: attempt.weight })}</p>
                      <span class={`${getAttemptStatusClass(attempt.status)} px-3 py-1 text-xxs font-semibold uppercase tracking-[0.3em] rounded`}>{getAttemptStatusLabel(attempt.status)}</span>
                    </div>
                  </div>
                  <p class="text-xxs text-text-secondary uppercase tracking-[0.3em] mt-2">{t('display_table.recent.updated', { time: new Date(attempt.updatedAt).toLocaleTimeString() })}</p>
                </li>
              {/each}
            </ul>
          {/if}
        </div>
      </section>

      {#if liveCurrentAttempt}
        <section class="card border-primary-red shadow-[0_0_35px_rgba(220,20,60,0.35)] space-y-8">
          <header class="card-header space-y-2">
            <h2 class="text-h2 text-primary-red uppercase tracking-[0.3em]">{t('display_table.current.title')}</h2>
            <p class="text-caption text-text-secondary uppercase tracking-[0.3em]">{t('display_table.current.subtitle')}</p>
          </header>
          <div class="grid gap-6 md:grid-cols-4">
            <div class="md:col-span-2 space-y-2">
              <p class="text-label text-text-secondary uppercase tracking-[0.4em]">{t('display_table.current.lifter')}</p>
              <p class="text-h2 text-text-primary uppercase tracking-[0.3em]">{competitorName(liveCurrentAttempt.registrationId)}</p>
            </div>
            <div class="space-y-2">
              <p class="text-label text-text-secondary uppercase tracking-[0.4em]">{t('display_table.current.lift')}</p>
              <p class="text-h3 text-text-primary uppercase tracking-[0.3em]">{liftLabel(liveCurrentAttempt.liftType)}</p>
            </div>
            <div class="space-y-2">
              <p class="text-label text-text-secondary uppercase tracking-[0.4em]">{t('display_table.current.attempt')}</p>
              <p class="text-h3 text-text-primary uppercase tracking-[0.3em]">#{liveCurrentAttempt.attemptNumber}</p>
            </div>
            <div class="md:col-span-4 space-y-4">
              <p class="text-label text-text-secondary uppercase tracking-[0.4em]">{t('display_table.current.weight')}</p>
              <div class="flex items-baseline gap-4">
                <span class="text-[6rem] leading-none font-mono text-primary-red">{liveCurrentAttempt.weight}</span>
                <span class="text-3xl font-mono text-text-secondary uppercase tracking-[0.3em]">kg</span>
              </div>
            </div>
            {#if livePlatePlan && livePlatePlan.plates.length > 0}
              <div class="md:col-span-4 space-y-4">
                <p class="text-label text-text-secondary uppercase tracking-[0.4em]">{t('display_table.current.plate_title')}</p>
                <div class="flex flex-wrap items-center gap-6">
                  {#each livePlatePlan.plates as plate, index (plate.plateWeight + '-' + index)}
                    <div class="flex items-end gap-3 text-text-secondary uppercase tracking-[0.2em]">
                      <span class="text-text-primary font-mono text-4xl">{plate.plateWeight} kg</span>
                      <span class="text-text-secondary font-mono text-xl opacity-70">{t('display_current.sidebar.plates_per_side', { count: plate.count })}</span>
                    </div>
                  {/each}
                </div>
                {#if livePlatePlan.clampWeight}
                  <div class="flex flex-wrap items-center gap-4 text-text-secondary uppercase tracking-[0.2em]">
                    <span class="text-2xl">
                      {t('display_table.current.plate_clamps', {
                        total: formatWeight(livePlatePlan.clampWeight),
                        perClamp: formatWeight(livePlatePlan.clampWeightPerClamp ?? livePlatePlan.clampWeight / 2)
                      })}
                    </span>
                  </div>
                {/if}
              </div>
            {/if}
          </div>
        </section>
      {/if}
    {/if}
  </main>
</div>
