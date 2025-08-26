<script lang="ts">
  import { invoke } from '@tauri-apps/api/core';
  import { appView } from '../stores';

  // --- Types ---
  enum Discipline {
    BenchPress = 'BenchPress',
    Squat = 'Squat',
    Deadlift = 'Deadlift',
    Powerlifting = 'Powerlifting',
  }

  interface NewContest {
    name: string;
    date: string;
    location: string;
    discipline: Discipline;
    federation_rules: string | null;
    competition_type: string | null;
    organizer: string | null;
    notes: string | null;
  }

  // --- State ---
  let currentStep = 1;
  let newContest: NewContest = {
    name: '',
    date: new Date().toISOString().split('T')[0] || '', // Default to today
    location: '',
    discipline: Discipline.Powerlifting,
    federation_rules: '',
    competition_type: '',
    organizer: '',
    notes: '',
  };
  let errorMessage = '';
  let isLoading = false;

  // --- Functions ---
  function handleCancel() {
    appView.set('mainMenu');
  }

  function nextStep() {
    if (currentStep < 3) {
      currentStep += 1;
    }
  }

  function prevStep() {
    if (currentStep > 1) {
      currentStep -= 1;
    }
  }

  async function createContest() {
    isLoading = true;
    errorMessage = '';

    // Convert empty strings to null for optional fields
    const payload = {
      ...newContest,
      federation_rules: newContest.federation_rules || null,
      competition_type: newContest.competition_type || null,
      organizer: newContest.organizer || null,
      notes: newContest.notes || null,
    };

    try {
      await invoke('contest_create', { newContest: payload });
      alert('Competition created successfully!');
      appView.set('mainMenu');
      // Optionally reset state here if wizard is re-used
    } catch (err) {
      console.error('Failed to create contest:', err);
      errorMessage = `Error: ${err}`;
      alert(`Failed to create competition: ${err}`);
    } finally {
      isLoading = false;
    }
  }
</script>

<div class="container-medium py-16">
  <h1 class="text-h1 text-center text-text-primary mb-8">Create New Competition</h1>

  <!-- Step 1: Basic Info -->
  {#if currentStep === 1}
    <div class="card">
      <h2 class="text-h2 text-text-primary mb-6">Step 1: Basic Information</h2>
      <p class="text-body text-text-secondary mb-8">
        Start by providing the essential details for your competition.
      </p>
      <div class="space-y-6">
        <div>
          <label for="name" class="form-label">Competition Name</label>
          <input type="text" id="name" class="form-input" bind:value={newContest.name} placeholder="e.g., Club Championship 2024" required />
        </div>
        <div>
          <label for="date" class="form-label">Date</label>
          <input type="date" id="date" class="form-input" bind:value={newContest.date} required />
        </div>
        <div>
          <label for="location" class="form-label">Location</label>
          <input type="text" id="location" class="form-input" bind:value={newContest.location} placeholder="e.g., City, Venue" required />
        </div>
      </div>
    </div>
  {/if}

  <!-- Step 2: Details -->
  {#if currentStep === 2}
    <div class="card">
      <h2 class="text-h2 text-text-primary mb-6">Step 2: Competition Details</h2>
      <p class="text-body text-text-secondary mb-8">
        Specify the rules, discipline, and other organizational details.
      </p>
      <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div>
          <label for="discipline" class="form-label">Discipline</label>
          <select id="discipline" class="form-input" bind:value={newContest.discipline}>
            {#each Object.values(Discipline) as discipline}
              <option value={discipline}>{discipline}</option>
            {/each}
          </select>
        </div>
        <div>
          <label for="competition_type" class="form-label">Competition Type (Optional)</label>
          <input type="text" id="competition_type" class="form-input" bind:value={newContest.competition_type} placeholder="e.g., National Qualifier" />
        </div>
        <div>
          <label for="organizer" class="form-label">Organizer (Optional)</label>
          <input type="text" id="organizer" class="form-input" bind:value={newContest.organizer} placeholder="e.g., Powerlifting Club" />
        </div>
        <div>
          <label for="federation_rules" class="form-label">Federation/Rules (Optional)</label>
          <input type="text" id="federation_rules" class="form-input" bind:value={newContest.federation_rules} placeholder="e.g., IPF Rules" />
        </div>
        <div class="md:col-span-2">
          <label for="notes" class="form-label">Notes (Optional)</label>
          <textarea id="notes" class="form-input" bind:value={newContest.notes} rows="3" placeholder="Any additional details about the competition..."></textarea>
        </div>
      </div>
    </div>
  {/if}

  <!-- Step 3: Confirmation -->
  {#if currentStep === 3}
    <div class="card">
      <h2 class="text-h2 text-text-primary mb-6">Step 3: Review and Create</h2>
      <p class="text-body text-text-secondary mb-8">
        Please review the competition details below before creating it.
      </p>
      <div class="space-y-4">
        <div class="summary-item"><strong>Name:</strong> {newContest.name}</div>
        <div class="summary-item"><strong>Date:</strong> {newContest.date}</div>
        <div class="summary-item"><strong>Location:</strong> {newContest.location}</div>
        <div class="summary-item"><strong>Discipline:</strong> {newContest.discipline}</div>
        <div class="summary-item"><strong>Competition Type:</strong> {newContest.competition_type || 'N/A'}</div>
        <div class="summary-item"><strong>Organizer:</strong> {newContest.organizer || 'N/A'}</div>
        <div class="summary-item"><strong>Federation/Rules:</strong> {newContest.federation_rules || 'N/A'}</div>
        <div class="summary-item"><strong>Notes:</strong> {newContest.notes || 'N/A'}</div>
      </div>
      {#if errorMessage}
        <div class="text-red-500 mt-4">{errorMessage}</div>
      {/if}
    </div>
  {/if}

  <!-- Navigation -->
  <div class="flex justify-between mt-12">
    <button class="btn btn-secondary" on:click={handleCancel} disabled={isLoading}>Cancel</button>

    <div>
      {#if currentStep > 1}
        <button class="btn btn-secondary mr-4" on:click={prevStep} disabled={isLoading}>Back</button>
      {/if}

      {#if currentStep < 3}
        <button class="btn btn-primary" on:click={nextStep}>Next</button>
      {/if}

      {#if currentStep === 3}
        <button class="btn btn-primary" on:click={createContest} disabled={isLoading}>
          {isLoading ? 'Creating...' : 'Create Contest'}
        </button>
      {/if}
    </div>
  </div>
</div>
