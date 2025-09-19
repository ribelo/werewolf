<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { realtimeClient } from '$lib/realtime';
  import QRShare from '$lib/components/QRShare.svelte';
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
let liveCurrentBundle: CurrentAttemptBundle | null = currentAttempt;
let liveCurrentAttempt: CurrentAttempt | null = currentAttempt ? bundleToCurrentAttempt(currentAttempt) : null;
let lastUpdateTime: Date | null = null;
let recentResultsContainer: HTMLElement | null = null;

  // Derived metrics
  $: lifterCount = registrations.length;
  $: pendingAttempts = computePendingAttempts();
  $: pendingCount = pendingAttempts.length;
  $: recentAttempts = computeRecentAttempts();

  // Shareable link for QR code
  $: shareableUrl = typeof window !== 'undefined' && contestId
    ? `${window.location.origin}${window.location.pathname}?contestId=${contestId}`
    : '';

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
    return liveAttempts
      .filter((attempt) => attempt.status === 'Pending')
      .sort((a, b) => {
        const registrationA = registrations.find((entry) => entry.id === a.registrationId);
        const registrationB = registrations.find((entry) => entry.id === b.registrationId);
        const orderA = registrationA?.competitionOrder ?? Number.POSITIVE_INFINITY;
        const orderB = registrationB?.competitionOrder ?? Number.POSITIVE_INFINITY;
        if (orderA !== orderB) return orderA - orderB;
        const priority: Record<string, number> = { Squat: 1, Bench: 2, Deadlift: 3 };
        return (priority[a.liftType] ?? 4) - (priority[b.liftType] ?? 4);
      })
      .slice(0, 12);
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
      lotNumber: attempt.lotNumber ?? null,
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

  function getCompetitor(registrationId: string): Registration | undefined {
    return registrations.find((entry) => entry.id === registrationId);
  }

  function competitorName(registrationId: string): string {
    const competitor = getCompetitor(registrationId);
    return competitor ? `${competitor.firstName} ${competitor.lastName}` : 'Unknown';
  }

  function queueLabel(attempt: Attempt): string {
    const competitor = getCompetitor(attempt.registrationId);
    const order = competitor?.competitionOrder ?? '—';
    return `#${order} ${competitorName(attempt.registrationId)}`;
  }

  import { attemptToneClass, statusBadgeClass } from '$lib/ui/status';

  function connectionLabel(): string {
    if (connectionStatus === 'connected') return 'Live';
    if (connectionStatus === 'connecting') return 'Connecting';
    return isOffline ? `Cached ${cacheAge ? `${cacheAge} min ago` : ''}` : 'Offline';
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
  <title>{contest?.name ?? 'Contest'} • Live Table</title>
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
</svelte:head>

<div class="min-h-screen bg-main-bg text-text-primary">
  <header class="border-b-2 border-border-color px-6 py-6 lg:px-10">
    <div class="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-6">
      <div>
        <h1 class="text-display uppercase tracking-[0.3em]">{contest?.name ?? 'Contest'}</h1>
        <p class="text-caption text-text-secondary uppercase tracking-[0.4em]">
          {contest?.location ?? 'Unknown venue'} • {contest?.date ? new Date(contest.date).toLocaleDateString() : 'Date TBC'}
        </p>
      </div>
      <div class="flex flex-wrap items-center gap-3">
        <span class={connectionBadge()}>{connectionLabel()}</span>
        {#if connectionStatus !== 'connected'}
          <button type="button" class="btn-secondary px-4 py-2" on:click={reconnect}>
            Retry Connection
          </button>
        {/if}
        {#if shareableUrl}
          <div class="w-full lg:w-auto">
            <QRShare url={shareableUrl} title="Share Display" />
          </div>
        {/if}
      </div>
    </div>
  </header>

  <main class="px-6 py-8 lg:px-10 space-y-8">
    {#if error}
      <div class="card border-status-error">
        <h2 class="text-h3 text-status-error mb-2">Failed to load contest data</h2>
        <p class="text-body text-text-secondary">{error}</p>
      </div>
    {:else}
      <section class="grid gap-4 lg:grid-cols-3">
        <div class="card">
          <h3 class="text-label text-text-secondary mb-2">Lifters Checked In</h3>
          <p class="text-h1 text-text-primary">{lifterCount}</p>
        </div>
        <div class="card">
          <h3 class="text-label text-text-secondary mb-2">Pending Attempts</h3>
          <p class="text-h1 text-text-primary">{pendingCount}</p>
        </div>
        <div class="card">
          <h3 class="text-label text-text-secondary mb-2">Last Update</h3>
          <p class="text-h1 text-text-primary">{lastUpdateTime ? lastUpdateTime.toLocaleTimeString() : '—'}</p>
        </div>
      </section>

      <section class="grid gap-6 xl:grid-cols-2">
        <div class="card flex flex-col">
          <header class="card-header flex items-center justify-between">
            <div>
              <h2 class="text-h3 text-text-primary">Attempt Queue</h2>
              <p class="text-body text-text-secondary">Next lifters ordered by platform rotation.</p>
            </div>
          </header>
          {#if pendingAttempts.length === 0}
            <p class="text-body text-text-secondary text-center py-8">All attempts are complete.</p>
          {:else}
            <div class="overflow-hidden">
              <ul class="divide-y divide-border-color">
                {#each pendingAttempts as attempt}
                  <li class="py-4 flex flex-col gap-2">
                    <div class="flex items-baseline justify-between">
                      <div>
                        <p class="text-body text-text-primary font-semibold uppercase tracking-[0.3em]">{queueLabel(attempt)}</p>
                        <p class="text-caption text-text-secondary">{attempt.liftType} • Attempt {attempt.attemptNumber}</p>
                      </div>
                      <p class="text-h2 text-text-primary">{attempt.weight}kg</p>
                    </div>
                  </li>
                {/each}
              </ul>
            </div>
          {/if}
        </div>

        <div class="card flex flex-col">
          <header class="card-header flex items-center justify-between">
            <div>
              <h2 class="text-h3 text-text-primary">Recent Results</h2>
              <p class="text-body text-text-secondary">Most recent judged attempts with outcomes.</p>
            </div>
          </header>
          {#if recentAttempts.length === 0}
            <p class="text-body text-text-secondary text-center py-8">No scored attempts yet.</p>
          {:else}
            <div class="overflow-hidden" bind:this={recentResultsContainer}>
              <ul class="divide-y divide-border-color">
                {#each recentAttempts as attempt}
                  <li class="py-4 flex flex-col gap-2">
                    <div class="flex items-baseline justify-between">
                      <div>
                        <p class="text-body text-text-primary font-semibold uppercase tracking-[0.3em]">{competitorName(attempt.registrationId)}</p>
                        <p class="text-caption text-text-secondary">{attempt.liftType} • Attempt {attempt.attemptNumber}</p>
                      </div>
                      <div class="flex items-center gap-4">
                        <p class="text-h2 text-text-primary">{attempt.weight}kg</p>
                        <span class={`px-3 py-1 text-xs font-semibold uppercase tracking-[0.3em] rounded ${attemptToneClass(attempt.status)}`}>
                          {attempt.status}
                        </span>
                      </div>
                    </div>
                    <p class="text-caption text-text-secondary">Updated {new Date(attempt.updatedAt).toLocaleTimeString()}</p>
                  </li>
                {/each}
              </ul>
            </div>
          {/if}
        </div>
      </section>

      {#if liveCurrentAttempt}
        <section class="card">
          <header class="card-header flex items-center justify-between">
            <div>
              <h2 class="text-h3 text-text-primary">Current Attempt</h2>
              <p class="text-body text-text-secondary">Live attempt on the platform right now.</p>
            </div>
          </header>
          <div class="grid gap-4 md:grid-cols-4">
            <div class="col-span-2">
              <p class="text-label text-text-secondary mb-1">Lifter</p>
              <p class="text-h2 text-text-primary">{competitorName(liveCurrentAttempt.registrationId)}</p>
            </div>
            <div>
              <p class="text-label text-text-secondary mb-1">Lift</p>
              <p class="text-h2 text-text-primary">{liveCurrentAttempt.liftType}</p>
            </div>
            <div>
              <p class="text-label text-text-secondary mb-1">Attempt</p>
              <p class="text-h2 text-text-primary">#{liveCurrentAttempt.attemptNumber}</p>
            </div>
            <div class="md:col-span-4">
              <p class="text-label text-text-secondary mb-1">Declared Weight</p>
              <p class="text-display text-primary-red">{liveCurrentAttempt.weight}kg</p>
            </div>
            {#if livePlatePlan}
              <div class="md:col-span-4 space-y-2">
                <p class="text-label text-text-secondary mb-1">Plate Plan</p>
                <p class="text-body text-text-secondary">
                  Bar {livePlatePlan.barWeight}kg • Total {livePlatePlan.total}kg
                </p>
                <div class="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {#each livePlatePlan.plates as plate}
                    <div class="flex items-center justify-between bg-element-bg border border-border-color rounded px-3 py-2">
                      <span>{plate.plateWeight}kg</span>
                      <span>× {plate.count}</span>
                    </div>
                  {/each}
                </div>
              </div>
            {/if}
          </div>
        </section>
      {/if}
    {/if}
  </main>
</div>
