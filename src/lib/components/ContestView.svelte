<script lang="ts">
  import { onMount } from 'svelte';
  import { invoke } from '@tauri-apps/api/core';
  import { appView } from '../stores';

  interface Contest {
    id: string;
    name: string;
    date: string;
    location: string;
    discipline: string;
  }

  interface Attempt {
    attempt: number;
    weight: number;
    result: 'pending' | 'good' | 'bad';
  }

  interface Lifter {
    id: string;
    name: string;
    squat: Attempt[];
    bench: Attempt[];
    deadlift: Attempt[];
  }

  // State
  let contests: Contest[] = [];
  let selectedContestId: string = '';
  let lifters: Lifter[] = [];
  let loading = false;
  let error = '';

  // Mock lifters for now since backend doesn't have registrations implemented yet
  const mockLifters: Lifter[] = [
    {
      id: '1',
      name: 'Andrzej',
      squat: [
        { attempt: 1, weight: 200, result: 'good' },
        { attempt: 2, weight: 210, result: 'good' },
        { attempt: 3, weight: 220, result: 'bad' },
      ],
      bench: [
        { attempt: 1, weight: 140, result: 'good' },
        { attempt: 2, weight: 150, result: 'bad' },
        { attempt: 3, weight: 150, result: 'bad' },
      ],
      deadlift: [
        { attempt: 1, weight: 250, result: 'good' },
        { attempt: 2, weight: 260, result: 'good' },
        { attempt: 3, weight: 270, result: 'good' },
      ]
    },
    {
      id: '2',
      name: 'Zosia',
      squat: [
        { attempt: 1, weight: 100, result: 'good' },
        { attempt: 2, weight: 110, result: 'good' },
        { attempt: 3, weight: 120, result: 'good' },
      ],
      bench: [
        { attempt: 1, weight: 70, result: 'good' },
        { attempt: 2, weight: 75, result: 'bad' },
        { attempt: 3, weight: 75, result: 'good' },
      ],
      deadlift: [
        { attempt: 1, weight: 120, result: 'good' },
        { attempt: 2, weight: 130, result: 'good' },
        { attempt: 3, weight: 140, result: 'good' },
      ]
    }
  ];

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
        await loadLifters();
      }
    } catch (err) {
      error = `Failed to load contests: ${err}`;
      console.error('Error loading contests:', err);
    } finally {
      loading = false;
    }
  }

  async function loadLifters(): Promise<void> {
    try {
      loading = true;
      error = '';
      
      // TODO: Replace with real backend call when registrations are implemented
      // lifters = await invoke<Lifter[]>('registration_list', { contestId: selectedContestId });
      
      // For now, use mock data
      lifters = mockLifters;
      
    } catch (err) {
      error = `Failed to load lifters: ${err}`;
      console.error('Error loading lifters:', err);
    } finally {
      loading = false;
    }
  }

  async function updateAttempt(lifterId: string, liftType: 'squat' | 'bench' | 'deadlift', attemptIndex: number, weight: number): Promise<void> {
    try {
      // TODO: Replace with real backend call when attempts are implemented
      // await invoke('attempt_record', { 
      //   registrationId: lifterId, 
      //   liftType, 
      //   attemptNumber: attemptIndex + 1, 
      //   weight 
      // });
      
      // For now, update local state
      const lifter = lifters.find(l => l.id === lifterId);
      if (lifter && lifter[liftType][attemptIndex]) {
        lifter[liftType][attemptIndex].weight = weight;
        lifters = [...lifters]; // Trigger reactivity
      }
    } catch (err) {
      error = `Failed to update attempt: ${err}`;
      console.error('Error updating attempt:', err);
    }
  }

  function getBestLift(attempts: Attempt[]): number {
    return attempts.reduce((max, attempt) => {
      if (attempt.result === 'good' && attempt.weight > max) {
        return attempt.weight;
      }
      return max;
    }, 0);
  }

  function getSubtotal(lifter: Lifter): number {
    return getBestLift(lifter.squat) + getBestLift(lifter.bench);
  }

  function getTotal(lifter: Lifter): number {
    return getBestLift(lifter.squat) + getBestLift(lifter.bench) + getBestLift(lifter.deadlift);
  }

  function goBack(): void {
    appView.set('mainMenu');
  }

  $: if (selectedContestId) {
    loadLifters();
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
      <div class="mb-8">
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
    {/if}

    <!-- Error Display -->
    {#if error}
      <div class="mb-6 p-4 bg-status-error text-red-100 border border-red-600">
        {error}
      </div>
    {/if}

    <!-- Loading State -->
    {#if loading}
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
    {:else if lifters.length === 0 && selectedContestId}
      <!-- No Lifters -->
      <div class="text-center py-8">
        <div class="text-text-secondary mb-4">No lifters registered for this contest</div>
        <p class="text-text-secondary">Note: Backend registration system is not implemented yet, showing mock data.</p>
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
              <!-- Squat -->
              <th class="py-2 px-4 border border-border-color text-center text-sm">1st</th>
              <th class="py-2 px-4 border border-border-color text-center text-sm">2nd</th>
              <th class="py-2 px-4 border border-border-color text-center text-sm">3rd</th>
              <!-- Bench -->
              <th class="py-2 px-4 border border-border-color text-center text-sm">1st</th>
              <th class="py-2 px-4 border border-border-color text-center text-sm">2nd</th>
              <th class="py-2 px-4 border border-border-color text-center text-sm">3rd</th>
              <!-- Deadlift -->
              <th class="py-2 px-4 border border-border-color text-center text-sm">1st</th>
              <th class="py-2 px-4 border border-border-color text-center text-sm">2nd</th>
              <th class="py-2 px-4 border border-border-color text-center text-sm">3rd</th>
            </tr>
          </thead>
          <tbody>
            {#each lifters as lifter, lifterIndex}
              <tr class="hover:bg-element-bg transition-colors">
                <td class="py-3 px-4 border border-border-color text-text-primary font-semibold">
                  {lifter.name}
                </td>

                <!-- Squat Attempts -->
                {#each lifter.squat as attempt, attemptIndex}
                  <td class="py-3 px-4 border border-border-color text-center">
                    <div class="flex items-center justify-center">
                      <input 
                        type="number" 
                        bind:value={attempt.weight}
                        on:change={(e) => updateAttempt(lifter.id, 'squat', attemptIndex, parseFloat(e.currentTarget.value) || 0)}
                        class="w-20 input-field text-center py-1 px-2"
                        min="0"
                        step="0.5"
                      />
                      <span class="ml-2 text-sm {attempt.result === 'good' ? 'text-green-400' : attempt.result === 'bad' ? 'text-red-400' : 'text-gray-400'}">
                        {attempt.result === 'good' ? '✓' : attempt.result === 'bad' ? '✗' : '◦'}
                      </span>
                    </div>
                  </td>
                {/each}

                <!-- Bench Attempts -->
                {#each lifter.bench as attempt, attemptIndex}
                  <td class="py-3 px-4 border border-border-color text-center">
                    <div class="flex items-center justify-center">
                      <input 
                        type="number" 
                        bind:value={attempt.weight}
                        on:change={(e) => updateAttempt(lifter.id, 'bench', attemptIndex, parseFloat(e.currentTarget.value) || 0)}
                        class="w-20 input-field text-center py-1 px-2"
                        min="0"
                        step="0.5"
                      />
                      <span class="ml-2 text-sm {attempt.result === 'good' ? 'text-green-400' : attempt.result === 'bad' ? 'text-red-400' : 'text-gray-400'}">
                        {attempt.result === 'good' ? '✓' : attempt.result === 'bad' ? '✗' : '◦'}
                      </span>
                    </div>
                  </td>
                {/each}

                <!-- Subtotal -->
                <td class="py-3 px-4 border border-border-color text-center text-text-primary font-bold">
                  {getSubtotal(lifter)} kg
                </td>

                <!-- Deadlift Attempts -->
                {#each lifter.deadlift as attempt, attemptIndex}
                  <td class="py-3 px-4 border border-border-color text-center">
                    <div class="flex items-center justify-center">
                      <input 
                        type="number" 
                        bind:value={attempt.weight}
                        on:change={(e) => updateAttempt(lifter.id, 'deadlift', attemptIndex, parseFloat(e.currentTarget.value) || 0)}
                        class="w-20 input-field text-center py-1 px-2"
                        min="0"
                        step="0.5"
                      />
                      <span class="ml-2 text-sm {attempt.result === 'good' ? 'text-green-400' : attempt.result === 'bad' ? 'text-red-400' : 'text-gray-400'}">
                        {attempt.result === 'good' ? '✓' : attempt.result === 'bad' ? '✗' : '◦'}
                      </span>
                    </div>
                  </td>
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

      <!-- TODO Notice -->
      <div class="mt-8 p-4 bg-element-bg border border-border-color">
        <h3 class="text-text-primary font-semibold mb-2">Development Note</h3>
        <p class="text-text-secondary text-sm">
          This table currently uses mock data. Backend systems for competitors, registrations, and attempts are not yet implemented. 
          Input changes will update local state but won't persist to the database.
        </p>
      </div>
    {/if}
  </main>
</div>
