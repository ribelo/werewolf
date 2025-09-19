<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { realtimeClient } from '$lib/realtime';
  import QRShare from '$lib/components/QRShare.svelte';
  import type { PageData } from './$types';
  import { bundleToCurrentAttempt } from '$lib/current-attempt';
  import type {
    Attempt,
    ConnectionStatus,
    CurrentAttempt,
    CurrentAttemptBundle,
    LiveEvent,
    Registration,
    LiftAttemptSnapshot,
    AttemptStatus,
  } from '$lib/types';

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

  let connectionStatus: ConnectionStatus = 'offline';
  let liveAttempts: Attempt[] = [...attempts];
  let liveCurrentBundle: CurrentAttemptBundle | null = currentAttempt;
  let liveCurrentAttempt: CurrentAttempt | null = currentAttempt ? bundleToCurrentAttempt(currentAttempt) : null;

  // Derived competitor data
  $: currentRegistration = liveCurrentBundle?.registration ?? null;

  $: currentCompetitor = liveCurrentBundle?.competitor ?? null;

  $: sanitizedName = currentCompetitor
    ? truncate(`${currentCompetitor.firstName} ${currentCompetitor.lastName}`, 28)
    : '';

  $: attemptsByLift = liveCurrentBundle?.attemptsByLift ?? { Squat: [], Bench: [], Deadlift: [] };

  $: highlightedLift = liveCurrentBundle?.highlight?.liftType ?? null;

  $: currentLiftAttempts = highlightedLift ? attemptsByLift[highlightedLift] ?? [] : [];

  $: attemptTiles = currentLiftAttempts.length > 0
    ? [1, 2, 3].map((num) => {
        const match = currentLiftAttempts.find((item) => item.attemptNumber === num);
        return {
          number: num,
          weight: match?.weight ?? 0,
          status: (match?.status ?? 'Pending') as AttemptStatus,
          isHighlighted: liveCurrentBundle?.highlight?.attemptNumber === num,
        };
      })
    : [1, 2, 3].map((num) => ({
        number: num,
        weight: 0,
        status: 'Pending' as AttemptStatus,
        isHighlighted: false,
      }));

  $: competitorHistory = liveCurrentBundle
    ? Object.values(liveCurrentBundle.attemptsByLift)
        .flat()
        .filter((attempt) => attempt.status !== 'Pending')
        .sort((a, b) => new Date(b.updatedAt ?? '').getTime() - new Date(a.updatedAt ?? '').getTime())
        .slice(0, 3)
    : [];

  $: platePlan = liveCurrentBundle?.platePlan ?? null;

  $: weightClassLabel = currentRegistration?.weightClassName ?? currentRegistration?.weightClassId ?? '—';

  $: shareableUrl = typeof window !== 'undefined' && contestId
    ? `${window.location.origin}${window.location.pathname}?contestId=${contestId}`
    : '';

  const unsubscribeStatus = realtimeClient.connectionStatus.subscribe((status) => {
    connectionStatus = status;
  });

  const unsubscribeEvents = realtimeClient.events.subscribe((event) => {
    if (!event || event.contestId !== contestId) return;
    handleLiveEvent(event);
  });

  onMount(() => {
    if (contestId) {
      realtimeClient.connect(contestId);
    }
  });

  onDestroy(() => {
    realtimeClient.disconnect();
    unsubscribeStatus();
    unsubscribeEvents();
  });

  function handleLiveEvent(event: LiveEvent) {
    switch (event.type) {
      case 'attempt.upserted': {
        const payload = event.data as Attempt;
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
        const payload = event.data as Attempt;
        if (!payload) break;
        const index = liveAttempts.findIndex((item) => item.id === payload.id);
        if (index >= 0) {
          liveAttempts[index] = { ...liveAttempts[index], ...payload };
          liveAttempts = [...liveAttempts];
        }
        break;
      }
      case 'attempt.currentSet': {
        const bundle = event.data as CurrentAttemptBundle | null;
        if (bundle) {
          liveCurrentBundle = bundle;
          liveCurrentAttempt = bundleToCurrentAttempt(bundle);
        }
        break;
      }
      case 'attempt.currentCleared': {
        liveCurrentBundle = null;
        liveCurrentAttempt = null;
        break;
      }
      default:
        break;
    }
  }

  function truncate(value: string, length: number): string {
    if (value.length <= length) return value;
    return `${value.slice(0, length - 3)}...`;
  }

  function connectionBadge(): string {
    if (connectionStatus === 'connected') return 'status-badge status-active';
    if (connectionStatus === 'connecting') return 'status-badge status-warning';
    if (isOffline) return 'status-badge status-warning';
    return 'status-badge status-warning';
  }

  function connectionLabel(): string {
    if (connectionStatus === 'connected') return 'Live';
    if (connectionStatus === 'connecting') return 'Connecting';
    if (isOffline) {
      const suffix = cacheAge ? `${cacheAge} min ago` : '';
      return suffix ? `Cached ${suffix}` : 'Cached';
    }
    return 'Polling';
  }

  function reconnect() {
    realtimeClient.disconnect();
    if (contestId) {
      realtimeClient.connect(contestId);
    }
  }

  function rackHeight(): string | null {
    if (!currentRegistration) return null;
    const lift = highlightedLift ?? liveCurrentAttempt?.liftType ?? null;
    if (lift === 'Squat' && currentRegistration.rackHeightSquat) {
      return `${currentRegistration.rackHeightSquat} cm`;
    }
    if (lift === 'Bench' && currentRegistration.rackHeightBench) {
      return `${currentRegistration.rackHeightBench} cm`;
    }
    return null;
  }

  import { attemptToneClass, statusBadgeClass, getAttemptStatusClass, getAttemptStatusLabel } from '$lib/ui/status';

  function liftLabel(): string {
    const lift = highlightedLift ?? liveCurrentAttempt?.liftType ?? null;
    return lift ? lift.toUpperCase() : '';
  }
</script>

<svelte:head>
  <title>{contest?.name ?? 'Contest'} • Current Lift</title>
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
</svelte:head>

<div class="min-h-screen bg-main-bg text-text-primary flex flex-col">
  <header class="border-b-2 border-border-color px-6 py-6 lg:px-10 flex flex-col lg:flex-row lg:items-end lg:justify-between gap-6">
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
          <QRShare url={shareableUrl} title="Share Current Display" />
        </div>
      {/if}
    </div>
  </header>

  {#if error}
    <main class="flex-1 flex items-center justify-center px-6 py-12">
      <div class="card max-w-2xl text-center">
        <h2 class="text-h2 text-status-error mb-4">Failed to load contest</h2>
        <p class="text-body text-text-secondary">{error}</p>
      </div>
    </main>
  {:else if !contest}
    <main class="flex-1 flex items-center justify-center px-6 py-12">
      <div class="card max-w-xl text-center">
        <h2 class="text-h2 text-text-primary mb-4">Contest not found</h2>
        <p class="text-body text-text-secondary">Verify the display URL or choose a contest from the dashboard.</p>
      </div>
    </main>
  {:else if !liveCurrentAttempt}
    <main class="flex-1 flex items-center justify-center px-6 py-12">
      <div class="card max-w-3xl text-center space-y-4">
        <h2 class="text-display text-text-primary">Awaiting First Attempt</h2>
        <p class="text-body text-text-secondary">The rotation will appear here the moment the first attempt goes live.</p>
      </div>
    </main>
  {:else}
    <main class="flex-1 px-6 py-10 lg:px-16 flex flex-col gap-10">
      <section class="grid gap-6 lg:grid-cols-[2fr_1fr] items-center">
        <div>
          <p class="text-label text-text-secondary mb-3">Lifter</p>
          <h2 class="text-display text-text-primary uppercase tracking-[0.35em]">{sanitizedName}</h2>
          <div class="mt-6 space-y-2 text-body text-text-secondary">
            {#if currentCompetitor?.club}
              <p>{currentCompetitor.club}{currentCompetitor.city ? ` • ${currentCompetitor.city}` : ''}</p>
            {/if}
            <p>Lot #{currentRegistration?.competitionOrder ?? '—'} • Bodyweight {currentRegistration?.bodyweight ?? '—'} kg</p>
          </div>
        </div>
        <div class="text-right space-y-3">
          <p class="text-label text-text-secondary">Discipline</p>
          <p class="text-h2 text-text-primary">{liftLabel()}</p>
          <div class="grid grid-cols-2 gap-3 text-body text-text-secondary">
            <div>
              <span class="text-label text-text-secondary block">Attempt</span>
              <span class="text-h2 text-text-primary">#{liveCurrentAttempt.attemptNumber}</span>
            </div>
            <div>
              <span class="text-label text-text-secondary block">Declared</span>
              <span class="text-h2 text-primary-red">{liveCurrentAttempt.weight} kg</span>
            </div>
          </div>
        </div>
      </section>

      <section class="card attempt-grid">
        <header class="flex items-center justify-between mb-4">
          <div>
            <h3 class="text-h3 text-text-primary">Attempt Progress</h3>
            <p class="text-body text-text-secondary">Latest attempts for this lift.</p>
          </div>
          <span class="status-badge status-active">{liftLabel()}</span>
        </header>
        <div class="grid gap-4 md:grid-cols-3">
          {#each attemptTiles as tile}
            <div class={`rounded-lg p-4 transition duration-300 ${getAttemptStatusClass(tile.status)} ${tile.isHighlighted ? 'ring-2 ring-primary-red bg-primary-red/20' : ''}`}>
              <p class="text-caption uppercase tracking-[0.3em] text-text-secondary">Attempt {tile.number}</p>
              <p class="text-display font-semibold">{tile.weight ? `${tile.weight} kg` : '—'}</p>
              <p class="text-body text-text-secondary">{getAttemptStatusLabel(tile.status)}</p>
            </div>
          {/each}
        </div>
      </section>

      <section class="grid gap-6 lg:grid-cols-3">
        <div class="card">
          <p class="text-label text-text-secondary mb-2">Rack Height</p>
          <p class="text-h2 text-text-primary">{rackHeight() ?? '—'}</p>
        </div>
        <div class="card">
          <p class="text-label text-text-secondary mb-2">Equipment</p>
          <p class="text-h2 text-text-primary">
            {#if currentRegistration}
              {currentRegistration.equipmentM ? 'Multi-ply ' : ''}
              {currentRegistration.equipmentSm ? 'Single-ply ' : ''}
              {currentRegistration.equipmentT ? 'Wraps' : ''}
              {#if !currentRegistration.equipmentM && !currentRegistration.equipmentSm && !currentRegistration.equipmentT}
                Raw
              {/if}
            {:else}
              —
            {/if}
          </p>
        </div>
        <div class="card">
          <p class="text-label text-text-secondary mb-2">Weight Class</p>
          <p class="text-h2 text-text-primary">{weightClassLabel}</p>
        </div>
      </section>

      {#if platePlan && platePlan.plates.length > 0}
        <section class="card">
          <header class="card-header flex items-center justify-between">
            <div>
              <h3 class="text-h3 text-text-primary">Plate Loading Plan</h3>
              <p class="text-body text-text-secondary">Bar {platePlan.barWeight} kg • Total {platePlan.total.toFixed(1)} kg</p>
            </div>
          </header>
          <div class="grid gap-3 md:grid-cols-2">
            <ul class="space-y-2">
              {#each platePlan.plates as plate}
                <li class="flex items-center justify-between bg-element-bg border border-border-color rounded px-3 py-2">
                  <span class="text-body">{plate.plateWeight} kg</span>
                  <span class="text-body font-semibold">× {plate.count} per side</span>
                </li>
              {/each}
            </ul>
            <div class="space-y-2 text-body text-text-secondary">
              <p>Weight to load: {platePlan.weightToLoad.toFixed(1)} kg</p>
              <p>Increment step: {platePlan.increment.toFixed(1)} kg</p>
              <p>Status: {platePlan.exact ? 'Exact match' : 'Adjusted to nearest available weight'}</p>
            </div>
          </div>
        </section>
      {/if}

      {#if competitorHistory.length > 0}
        <section class="card">
          <header class="card-header">
            <h3 class="text-h3 text-text-primary">Recent Attempts</h3>
            <p class="text-body text-text-secondary">Latest judged lifts for this athlete.</p>
          </header>
          <div class="grid gap-4 md:grid-cols-3">
            {#each competitorHistory as history}
        <div class="border border-border-color p-4 bg-element-bg">
          <p class="text-caption text-text-secondary uppercase tracking-[0.3em]">{history.liftType} #{history.attemptNumber}</p>
          <p class={`text-h2 ${attemptToneClass(history.status)}`}>{history.weight} kg</p>
          <p class="text-caption text-text-secondary mt-2">{getAttemptStatusLabel(history.status)}</p>
        </div>
      {/each}
          </div>
        </section>
      {/if}
    </main>
  {/if}
</div>
