<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import Layout from '$lib/components/Layout.svelte';
  import CompetitorModal from '$lib/components/CompetitorModal.svelte';
  import AttemptEditorModal from '$lib/components/AttemptEditorModal.svelte';
  import { formatEquipment, getStatusClasses, formatWeightClass, formatAgeClass, formatCompetitorName, formatWeight } from '$lib/utils';
  import { apiClient, ApiError } from '$lib/api';
  import { realtimeClient } from "$lib/realtime";
  import { modalStore } from '$lib/ui/modal';
  import { toast } from '$lib/ui/toast';
  import { contestStore } from '$lib/ui/contest-store';
  import { setContestContext } from '$lib/ui/context-helpers';
  import { getAttemptStatusClass, getAttemptStatusLabel } from '$lib/ui/status';
  import type { PageData } from './$types';
  import type { Registration, Attempt, CurrentAttempt, CurrentAttemptBundle, LiveEvent, ConnectionStatus, AttemptStatus, AttemptNumber, LiftType } from '$lib/types';
  import { bundleToCurrentAttempt } from '$lib/current-attempt';

  export let data: PageData;
  export let params: Record<string, string> = {};

  $: void params;
  let { contest, registrations, attempts, currentAttempt, referenceData, error, apiBase, contestId } = data;

  let weightClasses = referenceData?.weightClasses ?? [];
  let ageCategories = referenceData?.ageCategories ?? [];

  // Real-time data
  let connectionStatus: ConnectionStatus = 'offline';
  let liveEvent: LiveEvent | null = null;

  // Reactive data that updates with live events
  let liveAttempts = [...attempts];
  let liveCurrentAttempt: CurrentAttempt | null = currentAttempt
    ? normaliseCurrentAttempt(currentAttempt as Attempt | CurrentAttempt | CurrentAttemptBundle)
    : null;

  const attemptStatusOptions: AttemptStatus[] = ['Pending', 'Successful', 'Failed', 'Skipped'];

  let statusLoading: Record<string, boolean> = {};
  let setCurrentLoading: Record<string, boolean> = {};
  let isClearingCurrent = false;

  const TABS = [
    { id: 'registrations', label: 'Registrations' },
    { id: 'attempts', label: 'Attempts & Live' },
    { id: 'results', label: 'Results' },
    { id: 'plates', label: 'Plate Inventory' },
    { id: 'backups', label: 'Backups' }
  ] as const;

  type TabId = typeof TABS[number]['id'];
  let activeTab: TabId = 'registrations';

  function setStatusLoadingFlag(id: string, value: boolean) {
    statusLoading = { ...statusLoading, [id]: value };
  }

  function setCurrentLoadingFlag(id: string, value: boolean) {
    setCurrentLoading = { ...setCurrentLoading, [id]: value };
  }

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



  // Helper functions to resolve competitor names
  function getRegistrationCompetitorName(registrationId: string): string {
    const registration = registrations.find((r) => r.id === registrationId);
    if (registration) {
      return formatCompetitorName(registration.firstName, registration.lastName);
    }
    return 'Unknown Competitor';
  }

  function getAttemptCompetitor(attempt: Attempt): string {
    if (attempt.competitorName) return attempt.competitorName;
    if (attempt.firstName || attempt.lastName) {
      return formatCompetitorName(attempt.firstName ?? '', attempt.lastName ?? '');
    }
    return getRegistrationCompetitorName(attempt.registrationId);
  }

  function upsertAttemptRecord(attempt: Attempt) {
    if (!attempt?.id) return;
    const index = liveAttempts.findIndex((existing) => existing.id === attempt.id);
    if (index >= 0) {
      const updated = { ...liveAttempts[index], ...attempt };
      liveAttempts = [
        ...liveAttempts.slice(0, index),
        updated,
        ...liveAttempts.slice(index + 1),
      ];
    } else {
      liveAttempts = [...liveAttempts, attempt];
    }
    contestStore.updateAttempt(attempt);
  }

  function normaliseCurrentAttempt(input: Attempt | CurrentAttempt | CurrentAttemptBundle): CurrentAttempt {
    if ('attempt' in (input as any)) {
      return bundleToCurrentAttempt(input as CurrentAttemptBundle);
    }

    if ('competitorName' in (input as any) && (input as CurrentAttempt).competitorName) {
      const current = input as CurrentAttempt;
      return {
        id: current.id,
        registrationId: current.registrationId,
        competitorName: current.competitorName,
        liftType: current.liftType,
        attemptNumber: current.attemptNumber,
        weight: current.weight,
        status: current.status,
        competitionOrder: current.competitionOrder ?? null,
        lotNumber: current.lotNumber ?? null,
        updatedAt: current.updatedAt ?? null,
      };
    }

    const attempt = input as Attempt;
    return {
      id: attempt.id,
      registrationId: attempt.registrationId,
      competitorName: getAttemptCompetitor(attempt),
      liftType: attempt.liftType as LiftType,
      attemptNumber: (attempt.attemptNumber as AttemptNumber) ?? 1,
      weight: attempt.weight,
      status: attempt.status as AttemptStatus,
      competitionOrder: attempt.competitionOrder ?? null,
      lotNumber: attempt.lotNumber ?? null,
      updatedAt: attempt.updatedAt ?? null,
    };
  }

  async function refreshAttemptsData() {
    if (!contestId) return;
    try {
      const response = await apiClient.get<Attempt[]>(`/contests/${contestId}/attempts`);
      const refreshed = response.data ?? [];
      statusLoading = {};
      setCurrentLoading = {};
      liveAttempts = [...refreshed];
      refreshed.forEach(upsertAttemptRecord);
    } catch (error) {
      console.error('Failed to refresh attempts', error);
    }
  }

  async function openAttemptModal(registrationRecord: Registration) {
    try {
      const result = (await modalStore.open({
        title: `Edit attempts – ${formatCompetitorName(registrationRecord.firstName, registrationRecord.lastName)}`,
        component: AttemptEditorModal,
        size: 'xl',
        showFooter: false,
        data: {
          contestId,
          registration: registrationRecord,
          attempts: liveAttempts.filter((attempt) => attempt.registrationId === registrationRecord.id),
        },
      })) as unknown as boolean | undefined;

      if (result) {
        await refreshAttemptsData();
      }
    } catch (error) {
      console.error('Failed to open attempt editor modal', error);
    }
  }

  async function handleStatusChange(attempt: Attempt, event: Event) {
    const select = event.target as HTMLSelectElement | null;
    if (!select) return;
    updateAttemptStatusHandler(attempt, select.value as AttemptStatus);
  }

  async function updateAttemptStatusHandler(attempt: Attempt, status: AttemptStatus) {
    if (!contestId || !attempt?.id) return;
    if (attempt.status === status) return;

    setStatusLoadingFlag(attempt.id, true);

    try {
      await apiClient.patch(`/attempts/${attempt.id}/result`, {
        attemptId: attempt.id,
        status,
      });

      upsertAttemptRecord({ ...attempt, status, updatedAt: new Date().toISOString() });
      toast.success(`Attempt updated to ${getAttemptStatusLabel(status)}`);
    } catch (error) {
      const message = error instanceof ApiError ? error.message : error instanceof Error ? error.message : 'Unable to update attempt status';
      toast.error(message);
    } finally {
      setStatusLoadingFlag(attempt.id, false);
    }
  }

  async function setCurrentAttemptHandler(attempt: Attempt) {
    if (!contestId || !attempt?.id) return;
    setCurrentLoadingFlag(attempt.id, true);

    try {
      await apiClient.put(`/contests/${contestId}/attempts/current`, { attemptId: attempt.id });
      liveCurrentAttempt = normaliseCurrentAttempt({ ...attempt, updatedAt: new Date().toISOString() });
      toast.success('Current attempt updated');
    } catch (error) {
      const message = error instanceof ApiError ? error.message : error instanceof Error ? error.message : 'Unable to set current attempt';
      toast.error(message);
    } finally {
      setCurrentLoadingFlag(attempt.id, false);
    }
  }

  async function clearCurrentAttemptHandler() {
    if (!contestId) return;
    isClearingCurrent = true;
    try {
      await apiClient.delete(`/contests/${contestId}/attempts/current`);
      liveCurrentAttempt = null;
      toast.info('Current attempt cleared');
    } catch (error) {
      const message = error instanceof ApiError ? error.message : error instanceof Error ? error.message : 'Unable to clear current attempt';
      toast.error(message);
    } finally {
      isClearingCurrent = false;
    }
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
      case 'attempt.resultUpdated': {
        const attempt = event.data as Attempt | undefined;
        if (attempt) {
          upsertAttemptRecord(attempt);
          if (liveCurrentAttempt?.id === attempt.id) {
            liveCurrentAttempt = normaliseCurrentAttempt({ ...liveCurrentAttempt, ...attempt });
          }
        }
        break;
      }
      case 'attempt.currentSet': {
        const payload = event.data as CurrentAttemptBundle | Attempt | CurrentAttempt | undefined;
        if (payload) {
          liveCurrentAttempt = normaliseCurrentAttempt(payload);
        }
        break;
      }
      case 'attempt.currentCleared':
        liveCurrentAttempt = null;
        break;
      case 'heartbeat':
        break;
    }
  }

  // Set contest in store and context when data is available
  $: if (contest) {
    contestStore.setContest(contest, registrations);
    setContestContext(contest);
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

      // Update contest store with the updated registration
      const updatedRegistration = registrations.find(r => r.id === registrationId);
      if (updatedRegistration) {
        contestStore.updateRegistration(updatedRegistration);
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

      // Update contest store with the updated registration
      const updatedRegistration = registrations.find(r => r.id === registrationId);
      if (updatedRegistration) {
        contestStore.updateRegistration(updatedRegistration);
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

  async function openCompetitorModal(registration: Registration) {
    try {
      // Create a competitor summary object from the registration
      const competitorSummary = {
        id: registration.id,
        firstName: registration.firstName,
        lastName: registration.lastName,
        birthDate: registration.birthDate,
        gender: registration.gender,
        club: registration.club,
        city: registration.city,
        competitionOrder: registration.competitionOrder,
      };

      const result = await modalStore.open({
        title: `Edit ${registration.firstName} ${registration.lastName}`,
        size: 'xl',
        component: CompetitorModal,
        data: {
          competitor: competitorSummary,
          mode: 'edit' as const,
        },
      });

      if (result) {
        // Refresh the registrations data
        toast.success('Competitor updated successfully');
      }
    } catch (error) {
      console.error('Modal error:', error);
      toast.error('Failed to update competitor');
    }
  }


</script>

<svelte:head>
  <title>{contest?.name ?? "Contest"} • Werewolf Powerlifting</title>
</svelte:head>



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
                <p class="weight-large text-text-primary">{formatWeight(liveCurrentAttempt.weight)}</p>
                <p class="text-caption text-text-secondary mt-2">{getAttemptStatusLabel(liveCurrentAttempt.status)}</p>
              </div>
            </div>
            <div class="mt-4 flex justify-end">
              <button
                type="button"
                class="btn-secondary"
                disabled={isClearingCurrent}
                on:click={clearCurrentAttemptHandler}
              >
                {#if isClearingCurrent}
                  Clearing…
                {:else}
                  Clear current
                {/if}
              </button>
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
                    <p class="text-body text-text-primary font-semibold">{getAttemptCompetitor(attempt)}</p>
                    <p class="text-caption text-text-secondary">{attempt.liftType} #{attempt.attemptNumber} • {formatWeight(attempt.weight)}</p>
                  </div>
                  <div class="text-right">
                    <span
                      class={`inline-flex items-center justify-center rounded px-2 py-1 text-xxs font-semibold ${getAttemptStatusClass(attempt.status)}`}
                    >
                      {getAttemptStatusLabel(attempt.status)}
                    </span>
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
                          <div class="flex flex-wrap justify-end gap-2">
                            <button
                              type="button"
                              class="btn-primary px-3 py-1 text-xxs"
                              on:click={() => openAttemptModal(reg)}
                            >
                              Edit attempts
                            </button>
                            <button
                              type="button"
                              class="btn-secondary px-3 py-1 text-xxs"
                              on:click={() => openCompetitorModal(reg)}
                            >
                              View details
                            </button>
                          </div>
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
                      <th class="px-4 py-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {#each liveAttempts as attempt (attempt.id)}
                      <tr class={`border-b border-border-color hover:bg-element-bg/60 transition ${liveCurrentAttempt?.id === attempt.id ? 'bg-element-bg/70' : ''}`}>
                        <td class="px-4 py-3 text-text-primary font-semibold">{getAttemptCompetitor(attempt)}</td>
                        <td class="px-4 py-3 text-text-secondary">{attempt.liftType}</td>
                        <td class="px-4 py-3 text-text-secondary">{attempt.attemptNumber}</td>
                        <td class="px-4 py-3 text-text-secondary">{formatWeight(attempt.weight)}</td>
                        <td class="px-4 py-3">
                          <div class="flex flex-col gap-2">
                            <span
                              class={`inline-flex items-center justify-center rounded px-2 py-1 text-xxs font-semibold ${getAttemptStatusClass(attempt.status)}`}
                            >
                              {getAttemptStatusLabel(attempt.status)}
                            </span>
                            <select
                              class="input text-xs"
                              value={attempt.status}
                              disabled={statusLoading[attempt.id]}
                              on:change={(event) => handleStatusChange(attempt, event)}
                            >
                              {#each attemptStatusOptions as option}
                                <option value={option}>{getAttemptStatusLabel(option)}</option>
                              {/each}
                            </select>
                          </div>
                        </td>
                        <td class="px-4 py-3 text-text-secondary">{new Date(attempt.updatedAt).toLocaleString()}</td>
                        <td class="px-4 py-3 text-right">
                          <div class="flex justify-end gap-2">
                            <button
                              type="button"
                              class="btn-secondary px-3 py-1 text-xxs"
                              disabled={setCurrentLoading[attempt.id] || liveCurrentAttempt?.id === attempt.id}
                              on:click={() => setCurrentAttemptHandler(attempt)}
                            >
                              {#if setCurrentLoading[attempt.id]}
                                Setting…
                              {:else if liveCurrentAttempt?.id === attempt.id}
                                Current
                              {:else}
                                Set current
                              {/if}
                            </button>
                          </div>
                        </td>
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


</Layout>
