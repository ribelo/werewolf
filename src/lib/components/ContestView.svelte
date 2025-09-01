<script lang="ts">
  import { onMount } from 'svelte';
  import { invoke } from '@tauri-apps/api/core';
  import { _ } from 'svelte-i18n';
  import { appView } from '../stores';
  import CompetitorThumbnail from './CompetitorThumbnail.svelte';

  // Backend Models
  interface Contest {
    id: string;
    name: string;
    date: string;
    location: string;
    discipline: string;
  }

  interface Competitor {
    id: string;
    firstName: string;
    lastName: string;
    birthDate: string;
    gender: string;
    club?: string;
    city?: string;
    notes?: string;
    photoBase64?: string; // Base64 encoded photo data from backend
    createdAt: string;
    updatedAt: string;
  }

  interface Registration {
    id: string;
    contestId: string;
    competitorId: string;
    bodyweight: number;
  }

  enum LiftType {
    Squat = 'Squat',
    Bench = 'Bench',
    Deadlift = 'Deadlift',
  }

  enum AttemptStatus {
    Pending = 'Pending',
    Good = 'Good',
    Bad = 'Bad',
  }

  interface Attempt {
    id: string;
    registrationId: string;
    liftType: LiftType;
    attemptNumber: number;
    weight: number;
    status: AttemptStatus;
  }

  // Frontend-specific composite model
  interface Lifter {
    registrationId: string;
    competitor: Competitor;
    bodyweight: number;
    attempts: {
      [key in LiftType]: Attempt[];
    };
  }

  enum ContestStatus {
    Setup = 'Setup',
    Registration = 'Registration',
    InProgress = 'InProgress',
    Paused = 'Paused',
    Complete = 'Complete',
  }

  interface ContestState {
    contestId: string;
    status: ContestStatus;
    currentLift: LiftType | null;
    currentRound: number;
  }

  // Component State
  let contests: Contest[] = [];
  let contestState: ContestState | null = null;
  let nextUpQueue: Attempt[] = [];
  let selectedContestId: string = '';
  let lifters: Lifter[] = [];
  let results: LifterResult[] = [];
  let loading = false;
  let error = '';


  onMount(async () => {
    await loadContests();
  });

  async function loadContests(): Promise<void> {
    try {
      loading = true;
      error = '';
      contests = await invoke<Contest[]>('contest_list');
      
      if (contests.length > 0) {
        selectedContestId = contests[0]?.id || '';
        await loadContestData();
      }
    } catch (err) {
      error = `Failed to load contests: ${err}`;
      console.error('Error loading contests:', err);
    } finally {
      loading = false;
    }
  }

  async function loadNextUpQueue(): Promise<void> {
    if (!selectedContestId) return;
    try {
      nextUpQueue = await invoke<Attempt[]>('attempt_get_next_in_queue', { contestId: selectedContestId });
    } catch (err) {
      error = `Failed to load next up queue: ${err}`;
      console.error('Error loading next up queue:', err);
    }
  }

  async function loadContestData(): Promise<void> {
    console.log('🚀 loadContestData called with selectedContestId:', selectedContestId);
    if (!selectedContestId) {
      console.log('❌ No selectedContestId, returning early');
      return;
    }

    try {
      loading = true;
      error = '';
      console.log('📥 Starting data loading process...');
      
      // Load lifters
      const registrations = await invoke<Registration[]>('registration_list', { contestId: selectedContestId });
      const allAttempts = await invoke<Attempt[]>('attempt_list_for_contest', { contestId: selectedContestId });

      console.log('🔍 Registrations found:', registrations.length, registrations);
      
      const lifterPromises = registrations.map(async (reg) => {
        try {
          const competitor = await invoke<Competitor>('competitor_get', { competitorId: reg.competitorId });
          console.log('👤 Raw competitor data:', competitor);
          
          console.log('📄 Processing attempts for registration:', reg.id);
          const lifterAttempts = allAttempts.filter(a => a.registrationId === reg.id);
          console.log('🎯 Found', lifterAttempts.length, 'attempts for this registration');
          
          const attemptsByType = {
            [LiftType.Squat]: lifterAttempts.filter(a => a.liftType === LiftType.Squat).sort((a,b) => a.attemptNumber - b.attemptNumber),
            [LiftType.Bench]: lifterAttempts.filter(a => a.liftType === LiftType.Bench).sort((a,b) => a.attemptNumber - b.attemptNumber),
            [LiftType.Deadlift]: lifterAttempts.filter(a => a.liftType === LiftType.Deadlift).sort((a,b) => a.attemptNumber - b.attemptNumber),
          };
          
          console.log('🔢 Attempts by type:', {
            squat: attemptsByType[LiftType.Squat].length,
            bench: attemptsByType[LiftType.Bench].length,
            deadlift: attemptsByType[LiftType.Deadlift].length
          });
          
          const lifter = {
            registrationId: reg.id,
            competitor,
            bodyweight: reg.bodyweight,
            attempts: attemptsByType,
          };
          
          console.log('🏋️‍♂️ Created lifter:', lifter);
          return lifter;
        } catch (mapError) {
          console.error('💥 Error processing registration:', reg.id, mapError);
          throw mapError;
        }
      });
      
      console.log('⏳ About to resolve', lifterPromises.length, 'promises');
      const resolvedLifters = await Promise.all(lifterPromises);
      console.log('✅ Resolved lifters:', resolvedLifters.length, resolvedLifters);
      
      lifters = resolvedLifters;
      console.log('🎯 Assigned to lifters variable:', lifters.length, lifters);
      
      // Load contest state
      contestState = await invoke<ContestState | null>('contest_state_get', { contestId: selectedContestId });

      // Load next up queue if contest is in progress
      if (contestState?.status === ContestStatus.InProgress) {
        await loadNextUpQueue();
      } else {
        nextUpQueue = [];
      }

    } catch (err) {
      error = `Failed to load contest data: ${err}`;
      console.error('💥 Error loading contest data:', err);
      console.error('💥 Error details:', JSON.stringify(err, null, 2));
    } finally {
      loading = false;
      console.log('🏁 loadContestData finished, loading =', loading);
    }
  }


  async function updateAttempt(registrationId: string, liftType: LiftType, attemptNumber: number, weight: number): Promise<void> {
    try {
      await invoke('attempt_upsert_weight', {
        attempt: {
          registrationId,
          liftType,
          attemptNumber,
          weight
        }
      });

      // For now, just reload all lifters to see the change.
      // A more optimized approach would be to update the local state directly.
      await loadContestData();

    } catch (err) {
      error = `Failed to update attempt: ${err}`;
      console.error('Error updating attempt:', err);
    }
  }

  function getAttempt(lifter: Lifter, liftType: LiftType, attemptNumber: number): Attempt | undefined {
    return lifter.attempts[liftType].find(a => a.attemptNumber === attemptNumber);
  }

  function getLifterName(registrationId: string): string {
    const lifter = lifters.find(l => l.registrationId === registrationId);
    return lifter ? `${lifter.competitor.firstName} ${lifter.competitor.lastName}` : 'Unknown';
  }

  async function callNextLifter(attemptId: string): Promise<void> {
    if (!selectedContestId) return;
    try {
      await invoke('attempt_set_current', { contestId: selectedContestId, attemptId });
      // Reload data to reflect the change in the queue and current lifter
      await loadContestData();
    } catch (err) {
      error = `Failed to call next lifter: ${err}`;
      console.error('Error calling next lifter:', err);
    }
  }

  function getBestLift(attempts: Attempt[]): number {
    if (!attempts || attempts.length === 0) {
      return 0;
    }
    return attempts.reduce((max, attempt) => {
      if (attempt.status === AttemptStatus.Good && attempt.weight > max) {
        return attempt.weight;
      }
      return max;
    }, 0);
  }

  function getSubtotal(lifter: Lifter): number {
    if (!lifter || !lifter.attempts) return 0;
    return getBestLift(lifter.attempts.Squat) + getBestLift(lifter.attempts.Bench);
  }

  function getTotal(lifter: Lifter): number {
    if (!lifter || !lifter.attempts) return 0;
    return getBestLift(lifter.attempts.Squat) + getBestLift(lifter.attempts.Bench) + getBestLift(lifter.attempts.Deadlift);
  }

  // Results calculation and ranking functions
  interface LifterResult {
    lifter: Lifter;
    total: number;
    subtotal: number;
    squatBest: number;
    benchBest: number;
    deadliftBest: number;
    rank: number;
    bombed: boolean; // Failed all attempts in any lift
  }

  function calculateResults(): LifterResult[] {
    console.log('🧮 calculateResults called with lifters:', lifters.length);
    if (!lifters || lifters.length === 0) {
      console.log('❌ No lifters to calculate results for');
      return [];
    }

    // Calculate results for each lifter
    const results = lifters.map((lifter): LifterResult => {
      const squatBest = getBestLift(lifter.attempts.Squat);
      const benchBest = getBestLift(lifter.attempts.Bench);
      const deadliftBest = getBestLift(lifter.attempts.Deadlift);
      
      const total = squatBest + benchBest + deadliftBest;
      const subtotal = squatBest + benchBest;
      
      // Check if bombed (zero in any lift means bombed)
      const bombed = squatBest === 0 || benchBest === 0 || deadliftBest === 0;
      
      return {
        lifter,
        total,
        subtotal,
        squatBest,
        benchBest,
        deadliftBest,
        rank: 0, // Will be calculated below
        bombed
      };
    });

    // Sort by total (descending), bombed lifters go to bottom
    results.sort((a, b) => {
      if (a.bombed && !b.bombed) return 1;
      if (!a.bombed && b.bombed) return -1;
      if (a.bombed && b.bombed) return 0; // Both bombed, keep original order
      
      return b.total - a.total; // Higher total wins
    });

    // Assign ranks (handle ties)
    let currentRank = 1;
    for (let i = 0; i < results.length; i++) {
      if (results[i].bombed) {
        results[i].rank = 0; // Bombed lifters get no rank
      } else {
        if (i > 0 && !results[i-1].bombed && results[i].total === results[i-1].total) {
          // Same total as previous, same rank
          results[i].rank = results[i-1].rank;
        } else {
          // Different total or first non-bombed lifter
          results[i].rank = currentRank;
        }
        currentRank++;
      }
    }

    console.log('📊 Calculated results:', results.length, 'results');
    return results;
  }

  // Reactive statement to calculate results
  $: {
    console.log('⚡ Reactive statement triggered, lifters.length =', lifters.length);
    results = calculateResults();
    console.log('🎯 Results updated:', results.length);
  }

  async function updateContestStatus(newStatus: ContestStatus): Promise<void> {
    if (!contestState) return;

    try {
      loading = true;
      error = '';

      const newState: ContestState = { ...contestState, status: newStatus };

      // When starting contest, set lift to Squat
      if (newStatus === ContestStatus.InProgress && contestState.status !== ContestStatus.InProgress) {
        newState.currentLift = LiftType.Squat;
        newState.currentRound = 1;
      }

      await invoke('contest_state_update', { contestState: newState });
      await loadContestData();

    } catch (err) {
      error = `Failed to update contest status: ${err}`;
      console.error('Error updating contest status:', err);
    } finally {
      loading = false;
    }
  }

  function goBack(): void {
    appView.set('mainMenu');
  }

  let lastLoadedContestId: string = '';
  
  $: if (selectedContestId && selectedContestId !== lastLoadedContestId) {
    lastLoadedContestId = selectedContestId;
    loadContestData();
  }
</script>

<div class="min-h-screen bg-main-bg">
  <!-- Header -->
  <header class="container-full py-6 border-b border-border-color">
    <div class="flex items-center justify-between">
      <div>
        <h1 class="text-h2 text-text-primary">{$_('contest_view.title')}</h1>
        <p class="text-caption text-text-secondary mt-1">
          {$_('contest_view.subtitle')}
        </p>
      </div>
      <button 
        class="btn-secondary"
        on:click={goBack}
      >
        ← Back to Menu
      </button>
    </div>
  </header>

  <main class="container-full py-8">
    <!-- Contest Selection -->
    {#if contests.length > 0}
      <div class="mb-8 flex items-center justify-between">
        <div>
          <label for="contest-select" class="input-label">{$_('contest_view.select_contest')}</label>
          <select
            id="contest-select"
            bind:value={selectedContestId}
            class="input-field max-w-md"
          >
            {#each contests as contest}
              <option value={contest.id}>
                {contest.name} - {contest.date} ({contest.location})
              </option>
            {/each}
          </select>
        </div>
      </div>
    {/if}

    <!-- Contest State Management -->
    {#if contestState}
      <div class="mb-8 p-6 bg-card-bg border border-border-color">
        <h3 class="text-h3 text-text-primary mb-4">{$_('contest_view.contest_status')} {contestState.status}</h3>
        <div class="flex space-x-4">
          {#if contestState.status === ContestStatus.Setup}
            <button class="btn-primary" on:click={() => updateContestStatus(ContestStatus.Registration)}>{$_('contest_view.open_registration')}</button>
          {/if}
          {#if contestState.status === ContestStatus.Registration}
            <button class="btn-primary" on:click={() => updateContestStatus(ContestStatus.InProgress)}>{$_('contest_view.start_contest')}</button>
          {/if}
          {#if contestState.status === ContestStatus.InProgress}
            <button class="btn-secondary" on:click={() => updateContestStatus(ContestStatus.Paused)}>{$_('contest_view.pause_contest')}</button>
            <button class="btn-danger" on:click={() => updateContestStatus(ContestStatus.Complete)}>{$_('contest_view.finish_contest')}</button>
          {/if}
          {#if contestState.status === ContestStatus.Paused}
            <button class="btn-primary" on:click={() => updateContestStatus(ContestStatus.InProgress)}>{$_('contest_view.resume_contest')}</button>
          {/if}
        </div>
        {#if contestState.status === ContestStatus.InProgress}
          <div class="mt-4">
            <p>{$_('contest_view.current_lift')} {contestState.currentLift || $_('contest_view.na')}</p>
            <p>{$_('contest_view.current_round')} {contestState.currentRound}</p>
          </div>
        {/if}
      </div>
    {/if}

    <!-- Next Up Queue -->
    {#if contestState?.status === ContestStatus.InProgress && nextUpQueue.length > 0}
      <div class="mb-8 p-6 bg-card-bg border border-border-color">
        <h3 class="text-h3 text-text-primary mb-4">{$_('contest_view.next_up')}</h3>
        <ul>
          {#each nextUpQueue as attempt}
            <li class="flex items-center justify-between py-2 border-b border-border-color">
              <span>
                Lifter: {getLifterName(attempt.registrationId)} - Attempt {attempt.attemptNumber} - {attempt.weight} kg
              </span>
              <button class="btn-secondary" on:click={() => callNextLifter(attempt.id)}>{$_('contest_view.call_lifter')}</button>
            </li>
          {/each}
        </ul>
      </div>
    {/if}


    <!-- Error Display -->
    {#if error}
      <div class="mb-6 p-4 bg-status-error text-red-100 border border-red-600">
        {error}
      </div>
    {/if}

    <!-- Loading State -->
    {#if loading && lifters.length === 0}
      <div class="text-center py-8">
        <div class="text-text-secondary">{$_('contest_view.loading_contest_data')}</div>
      </div>
    {:else if contests.length === 0 && !error}
      <!-- No Contests -->
      <div class="text-center py-8">
        <div class="text-text-secondary mb-4">{$_('contest_view.no_contests_found')}</div>
        <p class="text-text-secondary">{$_('contest_view.create_contest_first')}</p>
        <button 
          class="btn-primary mt-4"
          on:click={() => appView.set('contestWizard')}
        >
          Create Contest
        </button>
      </div>
    {:else if lifters.length === 0 && selectedContestId && !loading}
      <!-- No Lifters -->
      <div class="text-center py-8">
        <div class="text-text-secondary mb-4">{$_('contest_view.no_lifters_registered')}</div>
      </div>
    {:else if lifters.length > 0}
      <!-- Lifters Table -->
      <div class="overflow-x-auto">
        <table class="min-w-full border-collapse bg-card-bg">
          <thead class="bg-element-bg text-text-primary">
            <tr>
              <th rowspan="2" class="py-3 px-4 border border-border-color text-center w-16">{$_('contest_view.rank')}</th>
              <th rowspan="2" class="py-3 px-4 border border-border-color text-left min-w-[200px]">{$_('contest_view.lifter')}</th>
              <th colspan="3" class="py-3 px-4 border border-border-color text-center">{$_('contest_view.squat')}</th>
              <th colspan="3" class="py-3 px-4 border border-border-color text-center">{$_('contest_view.bench')}</th>
              <th rowspan="2" class="py-3 px-4 border border-border-color text-center">{$_('contest_view.subtotal')}</th>
              <th colspan="3" class="py-3 px-4 border border-border-color text-center">{$_('contest_view.deadlift')}</th>
              <th rowspan="2" class="py-3 px-4 border border-border-color text-center">{$_('contest_view.total')}</th>
            </tr>
            <tr>
              <!-- Attempt headers -->
              {#each [1, 2, 3] as i}
                <th class="py-2 px-4 border border-border-color text-center text-sm">{$_('contest_view.attempt_ordinal_' + i)}</th>
              {/each}
              {#each [1, 2, 3] as i}
                <th class="py-2 px-4 border border-border-color text-center text-sm">{$_('contest_view.attempt_ordinal_' + i)}</th>
              {/each}
               {#each [1, 2, 3] as i}
                <th class="py-2 px-4 border border-border-color text-center text-sm">{$_('contest_view.attempt_ordinal_' + i)}</th>
              {/each}
            </tr>
          </thead>
          <tbody>
            {#each lifters as lifter (lifter.registrationId)}
              <tr class="hover:bg-element-bg transition-colors">
                <!-- Rank Column -->
                <td class="py-3 px-4 border border-border-color text-center font-bold">
                  <span class="text-text-primary">-</span>
                </td>
                
                <!-- Lifter Info -->
                <td class="py-3 px-4 border border-border-color text-text-primary font-semibold">
                  <div class="flex items-center space-x-3">
                    <CompetitorThumbnail competitor={lifter.competitor} size="small" />
                    <div class="flex flex-col">
                      <span class="font-semibold">{lifter.competitor.firstName} {lifter.competitor.lastName}</span>
                      {#if lifter.competitor.club}
                        <span class="text-xs text-text-secondary">{lifter.competitor.club}</span>
                      {/if}
                    </div>
                  </div>
                </td>

                <!-- Attempts -->
                {#each [LiftType.Squat, LiftType.Bench, LiftType.Deadlift] as liftType}
                  {#each [1, 2, 3] as attemptNumber}
                    {@const attempt = getAttempt(lifter, liftType, attemptNumber)}
                    <td class="py-3 px-4 border border-border-color text-center">
                      <div class="flex items-center justify-center">
                        <input
                          type="number"
                          value={attempt?.weight || ''}
                          on:change={(e) => updateAttempt(lifter.registrationId, liftType, attemptNumber, parseFloat(e.currentTarget.value) || 0)}
                          class="w-20 input-field text-center py-1 px-2"
                          min="0"
                          step="0.5"
                          placeholder="-"
                        />
                        {#if attempt}
                          <span class="ml-2 text-sm {attempt.status === AttemptStatus.Good ? 'text-green-400' : attempt.status === AttemptStatus.Bad ? 'text-red-400' : 'text-gray-400'}">
                            {attempt.status === AttemptStatus.Good ? '✓' : attempt.status === AttemptStatus.Bad ? '✗' : '◦'}
                          </span>
                        {/if}
                      </div>
                    </td>
                  {/each}

                  <!-- Subtotal after Bench -->
                  {#if liftType === LiftType.Bench}
                    <td class="py-3 px-4 border border-border-color text-center text-text-primary font-bold">
                      {getSubtotal(lifter)} kg
                    </td>
                  {/if}
                {/each}

                <!-- Total -->
                <td class="py-3 px-4 border border-border-color text-center font-bold text-lg text-primary-red">
                  {getTotal(lifter)} kg
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    {/if}
    <!-- Results Summary -->
    {#if results.length > 0 && contestState?.status === ContestStatus.Complete}
      <div class="mt-8 p-6 bg-card-bg border border-border-color rounded-lg">
        <h3 class="text-h3 text-text-primary mb-4">Competition Results Summary</h3>
        <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
          <!-- Top 3 Finishers -->
          <div>
            <h4 class="text-h4 text-text-primary mb-3">Top 3 Finishers</h4>
            {#each results.slice(0, 3).filter(r => !r.bombed) as result, i}
              <div class="flex items-center justify-between py-2 border-b border-border-color">
                <div class="flex items-center space-x-2">
                  <span class="text-lg">
                    {result.rank === 1 ? '🥇' : result.rank === 2 ? '🥈' : '🥉'}
                  </span>
                  <span class="font-semibold">
                    {result.lifter.competitor.firstName} {result.lifter.competitor.lastName}
                  </span>
                </div>
                <span class="font-bold text-primary-red">{result.total} kg</span>
              </div>
            {/each}
          </div>

          <!-- Competition Stats -->
          <div>
            <h4 class="text-h4 text-text-primary mb-3">Competition Stats</h4>
            <div class="space-y-2">
              <div class="flex justify-between">
                <span>Total Competitors:</span>
                <span class="font-semibold">{results.length}</span>
              </div>
              <div class="flex justify-between">
                <span>Successful Finishers:</span>
                <span class="font-semibold">{results.filter(r => !r.bombed).length}</span>
              </div>
              <div class="flex justify-between">
                <span>Bombed Out:</span>
                <span class="font-semibold text-red-400">{results.filter(r => r.bombed).length}</span>
              </div>
              {#if results.filter(r => !r.bombed).length > 0}
                <div class="flex justify-between">
                  <span>Winning Total:</span>
                  <span class="font-semibold text-primary-red">{results.find(r => !r.bombed)?.total || 0} kg</span>
                </div>
              {/if}
            </div>
          </div>

          <!-- Best Lifts -->
          <div>
            <h4 class="text-h4 text-text-primary mb-3">Best Lifts</h4>
            <div class="space-y-2">
              {#if results.length > 0}
                {@const bestSquat = Math.max(...results.map(r => r.squatBest).filter(w => w > 0))}
                {@const bestBench = Math.max(...results.map(r => r.benchBest).filter(w => w > 0))}
                {@const bestDeadlift = Math.max(...results.map(r => r.deadliftBest).filter(w => w > 0))}
                
                <div class="flex justify-between">
                  <span>Best Squat:</span>
                  <span class="font-semibold">{isFinite(bestSquat) ? bestSquat : 0} kg</span>
                </div>
                <div class="flex justify-between">
                  <span>Best Bench:</span>
                  <span class="font-semibold">{isFinite(bestBench) ? bestBench : 0} kg</span>
                </div>
                <div class="flex justify-between">
                  <span>Best Deadlift:</span>
                  <span class="font-semibold">{isFinite(bestDeadlift) ? bestDeadlift : 0} kg</span>
                </div>
              {/if}
            </div>
          </div>
        </div>
      </div>
    {/if}
  </main>
</div>

<style>
  .bombed {
    background-color: rgba(220, 38, 38, 0.1);
    opacity: 0.7;
  }
  
  .bombed:hover {
    background-color: rgba(220, 38, 38, 0.15);
  }
</style>
