<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import Layout from "$lib/components/Layout.svelte";
  import { formatEquipment, getStatusClasses, formatWeightClass, formatAgeClass } from "$lib/utils";
  import { apiClient } from "$lib/api";
  import { realtimeClient } from "$lib/realtime";
  import type { PageData } from "./$types";
  import type { Registration, Attempt, CurrentAttempt, LiveEvent, ConnectionStatus } from "$lib/types";

  export let data: PageData;
  let { contest, registrations, attempts, currentAttempt, referenceData, error, apiBase, contestId } = data;

  let weightClasses = referenceData?.weightClasses ?? [];
  let ageCategories = referenceData?.ageCategories ?? [];

  // Real-time data
  let connectionStatus: ConnectionStatus = 'offline';
  let liveEvent: LiveEvent | null = null;

  // Reactive data that updates with live events
  let liveAttempts = [...attempts];
  let liveCurrentAttempt = currentAttempt;

  const TABS = [
    { id: 'registrations', label: 'Registrations' },
    { id: 'attempts', label: 'Attempts & Live' },
    { id: 'results', label: 'Results' },
    { id: 'plates', label: 'Plate Inventory' },
    { id: 'backups', label: 'Backups' }
  ] as const;

  type TabId = typeof TABS[number]['id'];
  let activeTab: TabId = 'registrations';
  let showModal = false;
  let selectedRegistration: Registration | null = null;

  // Inline editing state
  let editingRackHeights: { [key: string]: boolean } = {};
  let editingEquipment: { [key: string]: boolean } = {};
  let tempRackHeights: { [key: string]: { squat?: number | null; bench?: number | null } } = {};
  let tempEquipment: { [key: string]: { m: boolean; sm: boolean; t: boolean } } = {};

  // Summary data
  $: liftersCount = registrations.length;
  $: attemptsQueued = Array.isArray(liveAttempts) ? liveAttempts.filter((a: Attempt) => a.status === 'Pending').length : 0;
  $: lastUpdate = liveEvent?.timestamp ? new Date(liveEvent.timestamp).toLocaleString() :
                  (contest?.updatedAt ? new Date(contest.updatedAt).toLocaleString() :
                  (contest?.date ? new Date(contest.date).toLocaleString() : new Date().toLocaleString()));
  $: weightClasses = referenceData?.weightClasses ?? [];
  $: ageCategories = referenceData?.ageCategories ?? [];

  function connectionBadge(status: ConnectionStatus): string {
    if (status === 'connected') return 'status-badge status-active';
    if (status === 'connecting') return 'status-badge status-warning';
    return 'status-badge status-error';
  }

  function connectionLabel(status: ConnectionStatus): string {
    if (status === 'connected') return 'Live';
    if (status === 'connecting') return 'Connecting';
    return 'Offline';
  }

  function handleModalKeydown(event: KeyboardEvent): void {
    if (showModal && event.key === 'Escape') {
      closeModal();
    }
  }

  // Helper function to get competitor name from registration ID
  function getCompetitorName(registrationId: string): string {
    const registration = registrations.find(r => r.id === registrationId);
    if (registration) {
      return `${registration.firstName} ${registration.lastName}`;
    }
    return 'Unknown Competitor';
  }

  // Get recent attempts (last 5 completed attempts)
  $: recentAttempts = Array.isArray(liveAttempts)
    ? liveAttempts
        .filter((a: Attempt) => a.status !== 'Pending')
        .sort((a: Attempt, b: Attempt) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
        .slice(0, 5)
    : [];

  // Subscribe to real-time updates
  const unsubscribeStatus = realtimeClient.connectionStatus.subscribe(status => {
    connectionStatus = status;
  });

  const unsubscribeEvents = realtimeClient.events.subscribe(event => {
    liveEvent = event;
    if (event && event.contestId === contestId) {
      handleLiveEvent(event);
    }
  });

  function handleLiveEvent(event: LiveEvent) {
    switch (event.type) {
      case 'attempt.upserted':
        // Update or add attempt
        const existingIndex = liveAttempts.findIndex(a => a.id === event.data.id);
        if (existingIndex >= 0) {
          liveAttempts[existingIndex] = event.data;
        } else {
          liveAttempts = [...liveAttempts, event.data];
        }
        liveAttempts = [...liveAttempts]; // Trigger reactivity
        break;

      case 'attempt.resultUpdated':
        // Update attempt result
        const resultIndex = liveAttempts.findIndex(a => a.id === event.data.id);
        if (resultIndex >= 0) {
          liveAttempts[resultIndex] = { ...liveAttempts[resultIndex], ...event.data };
          liveAttempts = [...liveAttempts]; // Trigger reactivity
        }
        break;

      case 'attempt.currentSet':
        // Update current attempt
        liveCurrentAttempt = event.data;
        break;

      case 'heartbeat':
        // Connection is alive
        break;
    }
  }

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

  // Inline editing functions
  function startEditingRackHeights(registrationId: string, currentSquat: number | null | undefined, currentBench: number | null | undefined) {
    editingRackHeights[registrationId] = true;
    tempRackHeights[registrationId] = { squat: currentSquat ?? null, bench: currentBench ?? null };
    // Trigger reactivity
    tempRackHeights = { ...tempRackHeights };
  }

  function cancelEditingRackHeights(registrationId: string) {
    editingRackHeights[registrationId] = false;
    delete tempRackHeights[registrationId];
  }

  function handleSquatInput(registrationId: string, e: Event) {
    const target = e.target as HTMLInputElement;
    if (tempRackHeights[registrationId] && target) {
      tempRackHeights[registrationId].squat = target.value ? Number(target.value) : null;
    }
  }

  function handleBenchInput(registrationId: string, e: Event) {
    const target = e.target as HTMLInputElement;
    if (tempRackHeights[registrationId] && target) {
      tempRackHeights[registrationId].bench = target.value ? Number(target.value) : null;
    }
  }

  function handleEquipmentChange(registrationId: string, type: 'm' | 'sm' | 't', e: Event) {
    const target = e.target as HTMLInputElement;
    if (tempEquipment[registrationId] && target) {
      tempEquipment[registrationId][type] = target.checked;
    }
  }

  async function saveRackHeights(registrationId: string) {
    const tempData = tempRackHeights[registrationId];
    if (!tempData) return;

    try {
      // Optimistic update
      const registrationIndex = registrations.findIndex(r => r.id === registrationId);
      if (registrationIndex !== -1) {
        registrations[registrationIndex] = {
          ...registrations[registrationIndex],
          rackHeightSquat: tempData.squat,
          rackHeightBench: tempData.bench
        } as Registration;
        registrations = [...registrations]; // Trigger reactivity
      }

      // API call
      const response = await apiClient.patch(`/registrations/${registrationId}`, {
        rackHeightSquat: tempData.squat,
        rackHeightBench: tempData.bench
      });

      if (response.error) {
        throw new Error(response.error);
      }

      // Success - clean up editing state
      editingRackHeights[registrationId] = false;
      delete tempRackHeights[registrationId];

    } catch (error) {
      console.error('Failed to update rack heights:', error);
      // Revert optimistic update on error
      // Note: In a real app, you'd want to show a toast here
      cancelEditingRackHeights(registrationId);
    }
  }

  function startEditingEquipment(registrationId: string, currentM: boolean, currentSm: boolean, currentT: boolean) {
    editingEquipment[registrationId] = true;
    tempEquipment[registrationId] = { m: currentM, sm: currentSm, t: currentT };
  }

  function cancelEditingEquipment(registrationId: string) {
    editingEquipment[registrationId] = false;
    delete tempEquipment[registrationId];
  }

  async function saveEquipment(registrationId: string) {
    const tempData = tempEquipment[registrationId];
    if (!tempData) return;

    try {
      // Optimistic update
      const registrationIndex = registrations.findIndex(r => r.id === registrationId);
      if (registrationIndex !== -1) {
        registrations[registrationIndex] = {
          ...registrations[registrationIndex],
          equipmentM: tempData.m,
          equipmentSm: tempData.sm,
          equipmentT: tempData.t
        } as Registration;
        registrations = [...registrations]; // Trigger reactivity
      }

      // API call
      const response = await apiClient.patch(`/registrations/${registrationId}`, {
        equipmentM: tempData.m,
        equipmentSm: tempData.sm,
        equipmentT: tempData.t
      });

      if (response.error) {
        throw new Error(response.error);
      }

      // Success - clean up editing state
      editingEquipment[registrationId] = false;
      delete tempEquipment[registrationId];

    } catch (error) {
      console.error('Failed to update equipment:', error);
      // Revert optimistic update on error
      cancelEditingEquipment(registrationId);
    }
  }

  function openModal(registration: Registration) {
    selectedRegistration = registration;
    showModal = true;
  }

  function closeModal() {
    showModal = false;
    selectedRegistration = null;
  }
</script>

<svelte:head>
  <title>{contest?.name ?? "Contest"} • Werewolf Powerlifting</title>
</svelte:head>

<svelte:window on:keydown={handleModalKeydown} />

<Layout
  title={contest?.name ?? "Contest"}
  subtitle="Contest Details"
  currentPage="contests"
  apiBase={apiBase}
>
  {#if error}
    <div class="card border-status-error">
      <h3 class="text-h3 text-status-error">Error loading contest</h3>
      <p class="text-body text-text-secondary mt-2">{error}</p>
    </div>
  {:else if !contest}
    <div class="card">
      <p class="text-body text-text-secondary">Contest not found.</p>
    </div>
  {:else}
    <div class="space-y-8">
      <section class="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <div class="card">
          <h3 class="text-label text-text-secondary mb-2">Contest Status</h3>
          <div class="flex items-center justify-between">
            <span class="text-h2 text-text-primary uppercase tracking-[0.3em]">{contest.status}</span>
            <span class={getStatusClasses(contest.status)}>{contest.status}</span>
          </div>
          <p class="text-caption text-text-secondary mt-3">
            {contest.location} • {new Date(contest.date).toLocaleDateString()}
          </p>
        </div>
        <div class="card">
          <h3 class="text-label text-text-secondary mb-2">Lifters</h3>
          <p class="text-h1 text-text-primary">{liftersCount}</p>
          <p class="text-caption text-text-secondary mt-3">Registered competitors</p>
        </div>
        <div class="card">
          <h3 class="text-label text-text-secondary mb-2">Attempts Queued</h3>
          <p class="text-h1 text-text-primary">{attemptsQueued}</p>
          <p class="text-caption text-text-secondary mt-3">Pending lifts in the rotation</p>
        </div>
        <div class="card">
          <h3 class="text-label text-text-secondary mb-2">Last Update</h3>
          <p class="text-h1 text-text-primary">{lastUpdate}</p>
          <p class="text-caption text-text-secondary mt-3">
            Connection: <span class={connectionBadge(connectionStatus)}>{connectionLabel(connectionStatus)}</span>
          </p>
        </div>
      </section>

      <section class="grid gap-4 md:grid-cols-2">
        <a
          class="card transition-transform hover:-translate-y-1 focus:outline-none focus:ring-2 focus:ring-primary-red focus:ring-offset-2 focus:ring-offset-main-bg"
          href={`/display/table?contestId=${contestId}`}
          target="_blank"
          rel="noreferrer"
        >
          <div class="flex items-center justify-between mb-3">
            <h3 class="text-h3 text-text-primary">Announcer Table</h3>
            <span class="text-h2">📊</span>
          </div>
          <p class="text-body text-text-secondary">Open the live table for scoring and commentary.</p>
        </a>
        <a
          class="card transition-transform hover:-translate-y-1 focus:outline-none focus:ring-2 focus:ring-primary-red focus:ring-offset-2 focus:ring-offset-main-bg"
          href={`/display/current?contestId=${contestId}`}
          target="_blank"
          rel="noreferrer"
        >
          <div class="flex items-center justify-between mb-3">
            <h3 class="text-h3 text-text-primary">Big Screen Display</h3>
            <span class="text-h2">🏋️</span>
          </div>
          <p class="text-body text-text-secondary">Share the current lift on projectors or audience devices.</p>
        </a>
      </section>

      <section class="grid gap-4 lg:grid-cols-2">
        <div class="card">
          <header class="flex items-center justify-between mb-4">
            <div>
              <h3 class="text-h3 text-text-primary">Current Attempt</h3>
              <p class="text-body text-text-secondary">Live from Werewolf Cloud</p>
            </div>
            <span class={connectionBadge(connectionStatus)}>{connectionLabel(connectionStatus)}</span>
          </header>
          {#if liveCurrentAttempt}
            <div class="grid gap-4 md:grid-cols-2">
              <div>
                <p class="text-label text-text-secondary mb-1">Lifter</p>
                <p class="text-h2 text-text-primary">{liveCurrentAttempt.competitorName}</p>
                <p class="text-body text-text-secondary mt-2">Attempt {liveCurrentAttempt.attemptNumber} • {liveCurrentAttempt.liftType}</p>
              </div>
              <div class="text-right">
                <p class="text-label text-text-secondary mb-1">Weight</p>
                <p class="weight-large text-text-primary">{liveCurrentAttempt.weight} kg</p>
                <p class="text-caption text-text-secondary mt-2">{liveCurrentAttempt.status}</p>
              </div>
            </div>
          {:else}
            <div class="text-center py-8 text-text-secondary">
              <p class="text-body">No active attempt.</p>
              <p class="text-caption mt-2">Start the rotation to stream lifts here.</p>
            </div>
          {/if}
        </div>

        <div class="card">
          <header class="flex items-center justify-between mb-4">
            <h3 class="text-h3 text-text-primary">Recent Attempts</h3>
            <span class="text-caption text-text-secondary uppercase tracking-[0.4em]">{recentAttempts.length}</span>
          </header>
          {#if recentAttempts.length > 0}
            <ul class="space-y-3">
              {#each recentAttempts as attempt (attempt.id)}
                <li class="flex items-center justify-between border-b border-border-color pb-3 last:border-b-0">
                  <div>
                    <p class="text-body text-text-primary font-semibold">{getCompetitorName(attempt.registrationId)}</p>
                    <p class="text-caption text-text-secondary">{attempt.liftType} #{attempt.attemptNumber} • {attempt.weight} kg</p>
                  </div>
                  <div class="text-right">
                    <span class={getStatusClasses(attempt.status)}>{attempt.status}</span>
                    <p class="text-xxs text-text-secondary mt-1">{new Date(attempt.updatedAt).toLocaleTimeString()}</p>
                  </div>
                </li>
              {/each}
            </ul>
          {:else}
            <div class="text-center py-8 text-text-secondary">
              <p class="text-body">No attempts recorded yet.</p>
            </div>
          {/if}
        </div>
      </section>

      <nav class="flex flex-wrap gap-3 border-b-2 border-border-color pb-3">
        {#each TABS as tab}
          <button
            type="button"
            class={`px-4 py-2 font-display text-xs uppercase tracking-[0.4em] border-2 transition ${activeTab === tab.id ? 'bg-primary-red text-black border-primary-red' : 'border-border-color text-text-secondary hover:text-text-primary hover:border-primary-red'}`}
            on:click={() => (activeTab = tab.id)}
          >
            {tab.label}
          </button>
        {/each}
      </nav>

      {#if activeTab === 'registrations'}
        <section class="space-y-4">
          <div class="card">
            <header class="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-4">
              <div>
                <h3 class="text-h3 text-text-primary">Registrations</h3>
                <p class="text-body text-text-secondary">Manage rack heights, equipment, and view competitor details.</p>
              </div>
              <span class="text-caption text-text-secondary uppercase tracking-[0.4em]">{liftersCount} lifters</span>
            </header>
            {#if registrations.length === 0}
              <div class="text-center py-8 text-text-secondary">No registrations yet.</div>
            {:else}
              <div class="overflow-x-auto">
                <table class="min-w-full text-left text-sm text-text-secondary">
                  <thead class="bg-element-bg text-label">
                    <tr>
                      <th class="px-4 py-3">Lifter</th>
                      <th class="px-4 py-3">Bodyweight</th>
                      <th class="px-4 py-3">Lot</th>
                      <th class="px-4 py-3">Weight Class</th>
                      <th class="px-4 py-3">Age Class</th>
                      <th class="px-4 py-3">Rack Heights</th>
                      <th class="px-4 py-3">Equipment</th>
                      <th class="px-4 py-3">Order</th>
                      <th class="px-4 py-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {#each registrations as reg (reg.id)}
                      <tr class="border-b border-border-color hover:bg-element-bg/60">
                        <td class="px-4 py-3 text-text-primary font-semibold">
                          {reg.firstName} {reg.lastName}
                          <div class="text-caption text-text-secondary mt-1">
                            {formatWeightClass(reg.weightClassId, weightClasses)} • {formatAgeClass(reg.ageClassId, ageCategories)}
                          </div>
                        </td>
                        <td class="px-4 py-3 text-text-secondary">
                          {reg.bodyweight ? `${reg.bodyweight.toFixed(1)} kg` : '—'}
                        </td>
                        <td class="px-4 py-3 text-text-secondary">{reg.lotNumber ?? '—'}</td>
                        <td class="px-4 py-3 text-text-secondary">{formatWeightClass(reg.weightClassId, weightClasses)}</td>
                        <td class="px-4 py-3 text-text-secondary">{formatAgeClass(reg.ageClassId, ageCategories)}</td>
                        <td class="px-4 py-3 text-text-secondary">
                          {#if editingRackHeights[reg.id]}
                            <div class="flex flex-wrap items-center gap-3">
                              <label class="flex items-center gap-2 text-caption text-text-secondary">
                                <span>SQ</span>
                                <input
                                  type="number"
                                  class="table-input-field w-16"
                                  value={tempRackHeights[reg.id]?.squat ?? reg.rackHeightSquat ?? ''}
                                  on:input={(e) => handleSquatInput(reg.id, e)}
                                />
                              </label>
                              <label class="flex items-center gap-2 text-caption text-text-secondary">
                                <span>BP</span>
                                <input
                                  type="number"
                                  class="table-input-field w-16"
                                  value={tempRackHeights[reg.id]?.bench ?? reg.rackHeightBench ?? ''}
                                  on:input={(e) => handleBenchInput(reg.id, e)}
                                />
                              </label>
                              <div class="flex gap-2">
                                <button type="button" class="btn-primary px-3 py-1 text-xxs" on:click={() => saveRackHeights(reg.id)}>Save</button>
                                <button type="button" class="btn-secondary px-3 py-1 text-xxs" on:click={() => cancelEditingRackHeights(reg.id)}>Cancel</button>
                              </div>
                            </div>
                          {:else}
                            <div class="flex items-center gap-3">
                              <span class="text-text-secondary">{reg.rackHeightSquat ?? '—'} / {reg.rackHeightBench ?? '—'}</span>
                              <button
                                type="button"
                                class="btn-secondary px-3 py-1 text-xxs"
                                on:click={() => startEditingRackHeights(reg.id, reg.rackHeightSquat ?? null, reg.rackHeightBench ?? null)}
                              >
                                Edit
                              </button>
                            </div>
                          {/if}
                        </td>
                        <td class="px-4 py-3 text-text-secondary">
                          {#if editingEquipment[reg.id]}
                            <div class="flex flex-wrap items-center gap-3">
                              <label class="flex items-center gap-2 text-caption text-text-secondary">
                                <input
                                  type="checkbox"
                                  checked={tempEquipment[reg.id]?.m ?? false}
                                  on:change={(e) => handleEquipmentChange(reg.id, 'm', e)}
                                />
                                Multi
                              </label>
                              <label class="flex items-center gap-2 text-caption text-text-secondary">
                                <input
                                  type="checkbox"
                                  checked={tempEquipment[reg.id]?.sm ?? false}
                                  on:change={(e) => handleEquipmentChange(reg.id, 'sm', e)}
                                />
                                Single
                              </label>
                              <label class="flex items-center gap-2 text-caption text-text-secondary">
                                <input
                                  type="checkbox"
                                  checked={tempEquipment[reg.id]?.t ?? false}
                                  on:change={(e) => handleEquipmentChange(reg.id, 't', e)}
                                />
                                Wraps
                              </label>
                              <div class="flex gap-2">
                                <button type="button" class="btn-primary px-3 py-1 text-xxs" on:click={() => saveEquipment(reg.id)}>Save</button>
                                <button type="button" class="btn-secondary px-3 py-1 text-xxs" on:click={() => cancelEditingEquipment(reg.id)}>Cancel</button>
                              </div>
                            </div>
                          {:else}
                            <div class="flex items-center gap-3">
                              <span>{formatEquipment(reg)}</span>
                              <button
                                type="button"
                                class="btn-secondary px-3 py-1 text-xxs"
                                on:click={() => startEditingEquipment(reg.id, reg.equipmentM, reg.equipmentSm, reg.equipmentT)}
                              >
                                Edit
                              </button>
                            </div>
                          {/if}
                        </td>
                        <td class="px-4 py-3 text-text-secondary">{reg.competitionOrder ?? '—'}</td>
                        <td class="px-4 py-3 text-right">
                          <button type="button" class="btn-secondary px-3 py-1 text-xxs" on:click={() => openModal(reg)}>
                            View details
                          </button>
                        </td>
                      </tr>
                    {/each}
                  </tbody>
                </table>
              </div>
            {/if}
          </div>
        </section>
      {:else if activeTab === 'attempts'}
        <section class="space-y-4">
          <div class="card">
            <header class="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-4">
              <div>
                <h3 class="text-h3 text-text-primary">Attempt Log</h3>
                <p class="text-body text-text-secondary">All attempts recorded for this contest.</p>
              </div>
              <span class="text-caption text-text-secondary uppercase tracking-[0.4em]">{Array.isArray(liveAttempts) ? liveAttempts.length : 0} entries</span>
            </header>
            {#if Array.isArray(liveAttempts) && liveAttempts.length > 0}
              <div class="overflow-x-auto">
                <table class="min-w-full text-left text-sm text-text-secondary">
                  <thead class="bg-element-bg text-label">
                    <tr>
                      <th class="px-4 py-3">Lifter</th>
                      <th class="px-4 py-3">Lift</th>
                      <th class="px-4 py-3">Attempt</th>
                      <th class="px-4 py-3">Weight</th>
                      <th class="px-4 py-3">Status</th>
                      <th class="px-4 py-3">Updated</th>
                    </tr>
                  </thead>
                  <tbody>
                    {#each liveAttempts as attempt (attempt.id)}
                      <tr class="border-b border-border-color hover:bg-element-bg/60">
                        <td class="px-4 py-3 text-text-primary font-semibold">{getCompetitorName(attempt.registrationId)}</td>
                        <td class="px-4 py-3 text-text-secondary">{attempt.liftType}</td>
                        <td class="px-4 py-3 text-text-secondary">{attempt.attemptNumber}</td>
                        <td class="px-4 py-3 text-text-secondary">{attempt.weight} kg</td>
                        <td class="px-4 py-3">
                          <span class={getStatusClasses(attempt.status)}>{attempt.status}</span>
                        </td>
                        <td class="px-4 py-3 text-text-secondary">{new Date(attempt.updatedAt).toLocaleString()}</td>
                      </tr>
                    {/each}
                  </tbody>
                </table>
              </div>
            {:else}
              <div class="text-center py-8 text-text-secondary">No attempts recorded yet.</div>
            {/if}
          </div>
        </section>
      {:else if activeTab === 'results'}
        <section class="space-y-4">
          <div class="card">
            <h3 class="text-h3 text-text-primary mb-2">Results & Rankings</h3>
            <p class="text-body text-text-secondary">
              Result calculations will be hooked up once the scoring endpoints are finalised. Expect overall, age, and weight class leaderboards here.
            </p>
          </div>
        </section>
      {:else if activeTab === 'plates'}
        <section class="space-y-4">
          <div class="card">
            <h3 class="text-h3 text-text-primary mb-2">Plate Inventory</h3>
            <p class="text-body text-text-secondary">
              Plate management UI is coming back next. We will mirror the legacy rack loading calculator and integrate with Cloudflare storage.
            </p>
          </div>
        </section>
      {:else}
        <section class="space-y-4">
          <div class="card">
            <h3 class="text-h3 text-text-primary mb-2">Backups & Recovery</h3>
            <p class="text-body text-text-secondary">
              Backup controls will call the Cloud worker endpoints for snapshotting D1 and KV. For now, use the CLI runbook in docs/cloudflare-environments.md.
            </p>
          </div>
        </section>
      {/if}
    </div>
  {/if}

  {#if showModal && selectedRegistration}
    <div class="fixed inset-0 z-40 flex items-center justify-center">
      <button
        type="button"
        class="absolute inset-0 bg-black/70"
        aria-label="Close modal"
        on:click={closeModal}
      ></button>
      <div
        class="relative z-50 w-full max-w-3xl card focus:outline-none"
        role="dialog"
        aria-modal="true"
        aria-labelledby="registration-modal-title"
        aria-describedby="registration-modal-description"
        tabindex="-1"
      >
        <header class="flex items-center justify-between mb-6">
          <h3 id="registration-modal-title" class="text-h2 text-text-primary">
            Registration • {selectedRegistration.firstName} {selectedRegistration.lastName}
          </h3>
          <button type="button" class="btn-secondary px-3 py-1" on:click={closeModal}>Close</button>
        </header>
        <p id="registration-modal-description" class="sr-only">
          Detailed registration information for the selected competitor.
        </p>
        <div class="grid gap-6 md:grid-cols-2">
          <div>
            <h4 class="text-label text-text-secondary mb-2">Competitor</h4>
            <dl class="space-y-2 text-body text-text-secondary">
              <div>
                <dt>Name</dt>
                <dd class="text-text-primary">{selectedRegistration.firstName} {selectedRegistration.lastName}</dd>
              </div>
              <div>
                <dt>Birth date</dt>
                <dd class="text-text-primary">{new Date(selectedRegistration.birthDate).toLocaleDateString()}</dd>
              </div>
              <div>
                <dt>Gender</dt>
                <dd class="text-text-primary">{selectedRegistration.gender}</dd>
              </div>
              <div>
                <dt>Lot number</dt>
                <dd class="text-text-primary">{selectedRegistration.lotNumber ?? '—'}</dd>
              </div>
            </dl>
          </div>
          <div>
            <h4 class="text-label text-text-secondary mb-2">Performance</h4>
            <dl class="space-y-2 text-body text-text-secondary">
              <div>
                <dt>Bodyweight</dt>
                <dd class="text-text-primary">{selectedRegistration.bodyweight ? `${selectedRegistration.bodyweight.toFixed(1)} kg` : '—'}</dd>
              </div>
              <div>
                <dt>Weight class</dt>
                <dd class="text-text-primary">{formatWeightClass(selectedRegistration.weightClassId, weightClasses)}</dd>
              </div>
              <div>
                <dt>Age class</dt>
                <dd class="text-text-primary">{formatAgeClass(selectedRegistration.ageClassId, ageCategories)}</dd>
              </div>
              <div>
                <dt>Equipment</dt>
                <dd class="text-text-primary">{formatEquipment(selectedRegistration)}</dd>
              </div>
            </dl>
          </div>
        </div>
      </div>
    </div>
  {/if}
</Layout>
