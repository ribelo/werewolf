<script lang="ts">
  import { onMount } from 'svelte';
  import { invoke } from '@tauri-apps/api/core';
  import { appView } from '../stores';

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
  let loading = false;
  let error = '';
  let showRegistrationForm = false;

  // New Competitor Form State
  let newCompetitor = {
    firstName: '',
    lastName: '',
    birthDate: '',
    gender: 'Male',
    bodyweight: 0,
  };

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
    if (!selectedContestId) return;

    try {
      loading = true;
      error = '';
      
      // Load lifters
      const registrations = await invoke<Registration[]>('registration_list', { contestId: selectedContestId });
      const allAttempts = await invoke<Attempt[]>('attempt_list_for_contest', { contestId: selectedContestId });

      const lifterPromises = registrations.map(async (reg) => {
        const competitor = await invoke<Competitor>('competitor_get', { competitorId: reg.competitorId });
        const lifterAttempts = allAttempts.filter(a => a.registrationId === reg.id);
        const attemptsByType = {
          [LiftType.Squat]: lifterAttempts.filter(a => a.liftType === LiftType.Squat).sort((a,b) => a.attemptNumber - b.attemptNumber),
          [LiftType.Bench]: lifterAttempts.filter(a => a.liftType === LiftType.Bench).sort((a,b) => a.attemptNumber - b.attemptNumber),
          [LiftType.Deadlift]: lifterAttempts.filter(a => a.liftType === LiftType.Deadlift).sort((a,b) => a.attemptNumber - b.attemptNumber),
        };
        return {
          registrationId: reg.id,
          competitor,
          bodyweight: reg.bodyweight,
          attempts: attemptsByType,
        };
      });
      lifters = await Promise.all(lifterPromises);
      
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
      console.error('Error loading contest data:', err);
    } finally {
      loading = false;
    }
  }

  async function handleRegisterCompetitor(): Promise<void> {
    try {
      loading = true;
      error = '';

      const createdCompetitor = await invoke<Competitor>('competitor_create', {
        competitor: {
          firstName: newCompetitor.firstName,
          lastName: newCompetitor.lastName,
          birthDate: newCompetitor.birthDate,
          gender: newCompetitor.gender,
        }
      });

      await invoke('registration_create', {
        registration: {
          contestId: selectedContestId,
          competitorId: createdCompetitor.id,
          bodyweight: newCompetitor.bodyweight,
        }
      });
      
      showRegistrationForm = false;
      newCompetitor = { firstName: '', lastName: '', birthDate: '', gender: 'Male', bodyweight: 0 };
      await loadContestData();

    } catch (err) {
      error = `Failed to register competitor: ${err}`;
      console.error('Error registering competitor:', err);
    } finally {
      loading = false;
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
    return attempts.reduce((max, attempt) => {
      if (attempt.status === AttemptStatus.Good && attempt.weight > max) {
        return attempt.weight;
      }
      return max;
    }, 0);
  }

  function getSubtotal(lifter: Lifter): number {
    return getBestLift(lifter.attempts.Squat) + getBestLift(lifter.attempts.Bench);
  }

  function getTotal(lifter: Lifter): number {
    return getBestLift(lifter.attempts.Squat) + getBestLift(lifter.attempts.Bench) + getBestLift(lifter.attempts.Deadlift);
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

  $: if (selectedContestId) {
    loadContestData();
  }
</script>

<div class="min-h-screen bg-main-bg">
  <!-- Header -->
  <header class="container-full py-6 border-b border-border-color">
    <div class="flex items-center justify-between">
      <div>
        <h1 class="text-h2 text-text-primary">Contest Management</h1>
        <p class="text-caption text-text-secondary mt-1">
          Manage lifters and attempts for powerlifting contests
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
          <label for="contest-select" class="input-label">Select Contest</label>
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
        <button class="btn-primary" on:click={() => showRegistrationForm = !showRegistrationForm}>
          {#if showRegistrationForm}Cancel{:else}Register Competitor{/if}
        </button>
      </div>
    {/if}

    <!-- Contest State Management -->
    {#if contestState}
      <div class="mb-8 p-6 bg-card-bg border border-border-color">
        <h3 class="text-h3 text-text-primary mb-4">Contest Status: {contestState.status}</h3>
        <div class="flex space-x-4">
          {#if contestState.status === ContestStatus.Setup}
            <button class="btn-primary" on:click={() => updateContestStatus(ContestStatus.Registration)}>Open Registration</button>
          {/if}
          {#if contestState.status === ContestStatus.Registration}
            <button class="btn-primary" on:click={() => updateContestStatus(ContestStatus.InProgress)}>Start Contest</button>
          {/if}
          {#if contestState.status === ContestStatus.InProgress}
            <button class="btn-secondary" on:click={() => updateContestStatus(ContestStatus.Paused)}>Pause Contest</button>
            <button class="btn-danger" on:click={() => updateContestStatus(ContestStatus.Complete)}>Finish Contest</button>
          {/if}
          {#if contestState.status === ContestStatus.Paused}
            <button class="btn-primary" on:click={() => updateContestStatus(ContestStatus.InProgress)}>Resume Contest</button>
          {/if}
        </div>
        {#if contestState.status === ContestStatus.InProgress}
          <div class="mt-4">
            <p>Current Lift: {contestState.currentLift || 'N/A'}</p>
            <p>Current Round: {contestState.currentRound}</p>
          </div>
        {/if}
      </div>
    {/if}

    <!-- Next Up Queue -->
    {#if contestState?.status === ContestStatus.InProgress && nextUpQueue.length > 0}
      <div class="mb-8 p-6 bg-card-bg border border-border-color">
        <h3 class="text-h3 text-text-primary mb-4">Next Up</h3>
        <ul>
          {#each nextUpQueue as attempt}
            <li class="flex items-center justify-between py-2 border-b border-border-color">
              <span>
                Lifter: {getLifterName(attempt.registrationId)} - Attempt {attempt.attemptNumber} - {attempt.weight} kg
              </span>
              <button class="btn-secondary" on:click={() => callNextLifter(attempt.id)}>Call Lifter</button>
            </li>
          {/each}
        </ul>
      </div>
    {/if}

    <!-- Registration Form -->
    {#if showRegistrationForm}
      <div class="p-6 bg-card-bg border border-border-color mb-8">
        <h3 class="text-h3 text-text-primary mb-4">Register New Competitor</h3>
        <form on:submit|preventDefault={handleRegisterCompetitor} class="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div class="col-span-1">
            <label for="firstName" class="input-label">First Name</label>
            <input type="text" id="firstName" bind:value={newCompetitor.firstName} class="input-field" required>
          </div>
          <div class="col-span-1">
            <label for="lastName" class="input-label">Last Name</label>
            <input type="text" id="lastName" bind:value={newCompetitor.lastName} class="input-field" required>
          </div>
          <div class="col-span-1">
            <label for="birthDate" class="input-label">Birth Date</label>
            <input type="date" id="birthDate" bind:value={newCompetitor.birthDate} class="input-field" required>
          </div>
          <div class="col-span-1">
            <label for="gender" class="input-label">Gender</label>
            <select id="gender" bind:value={newCompetitor.gender} class="input-field">
              <option value="Male">Male</option>
              <option value="Female">Female</option>
            </select>
          </div>
          <div class="col-span-1">
            <label for="bodyweight" class="input-label">Bodyweight (kg)</label>
            <input type="number" step="0.1" id="bodyweight" bind:value={newCompetitor.bodyweight} class="input-field" required>
          </div>
          <div class="col-span-3 flex justify-end">
            <button type="submit" class="btn-primary" disabled={loading}>
              {loading ? 'Registering...' : 'Register'}
            </button>
          </div>
        </form>
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
        <div class="text-text-secondary">Loading contest data...</div>
      </div>
    {:else if contests.length === 0 && !error}
      <!-- No Contests -->
      <div class="text-center py-8">
        <div class="text-text-secondary mb-4">No contests found</div>
        <p class="text-text-secondary">Create a contest using the Competition Wizard first.</p>
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
        <div class="text-text-secondary mb-4">No lifters registered for this contest.</div>
      </div>
    {:else if lifters.length > 0}
      <!-- Lifters Table -->
      <div class="overflow-x-auto">
        <table class="min-w-full border-collapse bg-card-bg">
          <thead class="bg-element-bg text-text-primary">
            <tr>
              <th rowspan="2" class="py-3 px-4 border border-border-color text-left">Lifter</th>
              <th colspan="3" class="py-3 px-4 border border-border-color text-center">Squat</th>
              <th colspan="3" class="py-3 px-4 border border-border-color text-center">Bench</th>
              <th rowspan="2" class="py-3 px-4 border border-border-color text-center">Subtotal</th>
              <th colspan="3" class="py-3 px-4 border border-border-color text-center">Deadlift</th>
              <th rowspan="2" class="py-3 px-4 border border-border-color text-center">Total</th>
            </tr>
            <tr>
              <!-- Attempt headers -->
              {#each [1, 2, 3] as i}
                <th class="py-2 px-4 border border-border-color text-center text-sm">{i}st</th>
              {/each}
              {#each [1, 2, 3] as i}
                <th class="py-2 px-4 border border-border-color text-center text-sm">{i}nd</th>
              {/each}
               {#each [1, 2, 3] as i}
                <th class="py-2 px-4 border border-border-color text-center text-sm">{i}rd</th>
              {/each}
            </tr>
          </thead>
          <tbody>
            {#each lifters as lifter (lifter.registrationId)}
              <tr class="hover:bg-element-bg transition-colors">
                <td class="py-3 px-4 border border-border-color text-text-primary font-semibold">
                  {lifter.competitor.firstName} {lifter.competitor.lastName}
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
                <td class="py-3 px-4 border border-border-color text-center text-primary-red font-bold text-lg">
                  {getTotal(lifter)} kg
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    {/if}
  </main>
</div>
