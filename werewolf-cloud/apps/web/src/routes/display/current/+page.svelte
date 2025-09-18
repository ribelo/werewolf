<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { realtimeClient } from '$lib/realtime';
  import QRShare from '$lib/components/QRShare.svelte';
  import type { PageData } from './$types';
  import type {
    Attempt,
    ConnectionStatus,
    CurrentAttempt,
    LiveEvent,
    Registration,
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
  let liveCurrentAttempt: CurrentAttempt | null = currentAttempt;

  // Derived competitor data
  $: currentRegistration = liveCurrentAttempt
    ? registrations.find((item) => item.id === liveCurrentAttempt?.registrationId)
    : null;

  $: competitorHistory = currentRegistration
    ? liveAttempts
        .filter((attempt) => attempt.registrationId === currentRegistration!.id && attempt.status !== 'Pending')
        .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
        .slice(0, 3)
    : [];

  $: sanitizedName = liveCurrentAttempt
    ? truncate(liveCurrentAttempt.competitorName, 28)
    : '';

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
        const index = liveAttempts.findIndex((item) => item.id === event.data.id);
        if (index >= 0) {
          liveAttempts[index] = event.data;
        } else {
          liveAttempts = [...liveAttempts, event.data];
        }
        liveAttempts = [...liveAttempts];
        break;
      }
      case 'attempt.resultUpdated': {
        const index = liveAttempts.findIndex((item) => item.id === event.data.id);
        if (index >= 0) {
          liveAttempts[index] = { ...liveAttempts[index], ...event.data };
          liveAttempts = [...liveAttempts];
        }
        break;
      }
      case 'attempt.currentSet': {
        liveCurrentAttempt = event.data;
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
    return isOffline ? 'status-badge status-warning' : 'status-badge status-error';
  }

  function connectionLabel(): string {
    if (connectionStatus === 'connected') return 'Live';
    if (connectionStatus === 'connecting') return 'Connecting';
    return isOffline ? `Cached ${cacheAge ? `${cacheAge} min ago` : ''}` : 'Offline';
  }

  function reconnect() {
    realtimeClient.disconnect();
    if (contestId) {
      realtimeClient.connect(contestId);
    }
  }

  function rackHeight(): string | null {
    if (!currentRegistration || !liveCurrentAttempt) return null;
    if (liveCurrentAttempt.liftType === 'Squat' && currentRegistration.rackHeightSquat) {
      return `${currentRegistration.rackHeightSquat} cm`;
    }
    if (liveCurrentAttempt.liftType === 'Bench' && currentRegistration.rackHeightBench) {
      return `${currentRegistration.rackHeightBench} cm`;
    }
    return null;
  }

  import { attemptToneClass, statusBadgeClass } from '$lib/ui/status';

  function liftLabel(): string {
    return liveCurrentAttempt ? liveCurrentAttempt.liftType.toUpperCase() : '';
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
            {#if currentRegistration?.club}
              <p>{currentRegistration.club}{currentRegistration.city ? ` • ${currentRegistration.city}` : ''}</p>
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
          <p class="text-h2 text-text-primary">{currentRegistration?.weightClassId ?? '—'}</p>
        </div>
      </section>

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
          <p class="text-caption text-text-secondary mt-2">{history.status}</p>
        </div>
      {/each}
          </div>
        </section>
      {/if}
    </main>
  {/if}
</div>
