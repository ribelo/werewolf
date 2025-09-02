<script lang="ts">
  import { invoke } from '@tauri-apps/api/core';
  import { _ } from 'svelte-i18n';
  import { appView } from '../stores';
  import PhotoUpload from './PhotoUpload.svelte';

  // --- Types ---
  enum Discipline {
    Bench = 'Bench',
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

  interface Competitor {
    firstName: string;
    lastName: string;
    birthDate: string;
    gender: string;
    bodyweight: number;
    photoBase64?: string;
    photoFilename?: string;
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
  let validationErrors: { [key: string]: string } = {};
  
  // Competitor registration state
  let competitors: Competitor[] = [];
  let newCompetitor: Competitor = {
    firstName: '',
    lastName: '',
    birthDate: '',
    gender: 'Male',
    bodyweight: 0,
  };

  // --- Functions ---
  function handleCancel() {
    appView.set('mainMenu');
  }

  function nextStep() {
    if (validateCurrentStep()) {
      if (currentStep < 4) {
        currentStep += 1;
      }
    }
  }

  function validateCurrentStep(): boolean {
    validationErrors = {};
    
    if (currentStep === 1) {
      // Validate basic information
      if (!newContest.name.trim()) {
        validationErrors.name = $_('validation.name_required');
      } else if (newContest.name.trim().length < 3) {
        validationErrors.name = $_('validation.name_min_length');
      }
      
      if (!newContest.date) {
        validationErrors.date = $_('validation.date_required');
      } else {
        const selectedDate = new Date(newContest.date + 'T00:00:00'); // Ensure local timezone
        const today = new Date();
        today.setHours(0, 0, 0, 0); // Reset time for comparison
        if (selectedDate < today) {
          validationErrors.date = $_('validation.date_past');
        }
      }
      
      if (!newContest.location.trim()) {
        validationErrors.location = $_('validation.location_required');
      } else if (newContest.location.trim().length < 2) {
        validationErrors.location = $_('validation.location_min_length');
      }
    } else if (currentStep === 3) {
      // Validate that at least one competitor is registered
      if (competitors.length === 0) {
        validationErrors.competitors = $_('contest.no_competitors_message');
      }
    }
    
    return Object.keys(validationErrors).length === 0;
  }

  function getFieldError(fieldName: string): string {
    return validationErrors[fieldName] || '';
  }

  function addCompetitor() {
    if (!newCompetitor.firstName.trim() || !newCompetitor.lastName.trim() || 
        !newCompetitor.birthDate || newCompetitor.bodyweight <= 0) {
      return;
    }
    
    competitors = [...competitors, { ...newCompetitor }];
    // Reset form
    newCompetitor = {
      firstName: '',
      lastName: '',
      birthDate: '',
      gender: 'Male',
      bodyweight: 0,
    };
  }

  function removeCompetitor(index: number) {
    competitors = competitors.filter((_, i) => i !== index);
  }

  function handlePhotoSelected(event: CustomEvent<{ base64: string; filename: string }>) {
    newCompetitor.photoBase64 = event.detail.base64;
    newCompetitor.photoFilename = event.detail.filename;
    newCompetitor = { ...newCompetitor }; // Trigger reactivity
  }

  function handlePhotoRemoved() {
    newCompetitor.photoBase64 = undefined;
    newCompetitor.photoFilename = undefined;
    newCompetitor = { ...newCompetitor }; // Trigger reactivity
  }

  function prevStep() {
    if (currentStep > 1) {
      currentStep -= 1;
    }
  }

  // Handle mouse wheel scrolling on bodyweight input
  function handleBodyweightWheel(event: WheelEvent) {
    event.preventDefault();
    const currentValue = parseFloat(newCompetitor.bodyweight) || 0;
    const delta = event.deltaY > 0 ? -0.1 : 0.1; // Reverse direction for intuitive scrolling
    const newValue = Math.max(0, currentValue + delta);
    newCompetitor.bodyweight = newValue.toFixed(1);
  }

  async function createContest() {
    // Final validation
    if (!validateCurrentStep()) {
      return;
    }

    isLoading = true;
    errorMessage = '';

    // Convert empty strings to null for optional fields
    const payload = {
      ...newContest,
      name: newContest.name.trim(),
      location: newContest.location.trim(),
      federation_rules: newContest.federation_rules?.trim() || null,
      competition_type: newContest.competition_type?.trim() || null,
      organizer: newContest.organizer?.trim() || null,
      notes: newContest.notes?.trim() || null,
    };

    try {
      const contest = await invoke('contest_create', { newContest: payload });
      console.log('Contest created:', contest);
      
      // Register competitors if any were added
      console.log(`🏃‍♂️ Attempting to register ${competitors.length} competitors`);
      if (competitors.length > 0) {
        for (const competitor of competitors) {
          try {
            console.log(`📝 Creating competitor:`, competitor);
            
            // Step 1: Create the competitor
            const createdCompetitor = await invoke('competitor_create', {
              competitor: {
                firstName: competitor.firstName,
                lastName: competitor.lastName,
                birthDate: competitor.birthDate,
                gender: competitor.gender,
                photoBase64: competitor.photoBase64 || null,
                photoFilename: competitor.photoFilename || null,
              }
            });
            console.log(`✅ Created competitor:`, createdCompetitor);
            
            // Step 2: Create the registration
            console.log(`📋 Creating registration for competitor ${createdCompetitor.id} in contest ${contest.id}`);
            const registration = await invoke('registration_create', {
              registration: {
                contestId: contest.id,
                competitorId: createdCompetitor.id,
                bodyweight: competitor.bodyweight,
              }
            });
            console.log(`✅ Successfully registered competitor ${competitor.firstName} ${competitor.lastName}:`, registration);
            
          } catch (compErr) {
            console.error(`❌ Failed to register competitor ${competitor.firstName} ${competitor.lastName}:`, compErr);
            // Continue with other competitors even if one fails
          }
        }
      } else {
        console.log(`ℹ️ No competitors to register`);
      }
      
      // Create automatic backup after contest creation
      try {
        await invoke('backup_database');
        console.log('Automatic backup created after contest creation');
      } catch (backupErr) {
        console.warn('Failed to create automatic backup:', backupErr);
        // Don't fail the entire operation if backup fails
      }
      
      // Show success message and return to main menu
      const successMessage = `${$_('messages.competition_created_success')} "${payload.name}"!`;
      const competitorCount = competitors.length;
      const finalMessage = competitorCount > 0 
        ? `${successMessage}\n\n${$_('messages.competitors_registered').replace('{count}', competitorCount.toString())}`
        : successMessage;
      
      alert(finalMessage);
      appView.set('mainMenu');
      
      // Reset form for next use
      resetForm();
      
    } catch (err) {
      console.error('Failed to create contest:', err);
      errorMessage = `Failed to create competition: ${err}`;
      // Don't use alert for errors, show in UI instead
    } finally {
      isLoading = false;
    }
  }

  function resetForm() {
    currentStep = 1;
    newContest = {
      name: '',
      date: new Date().toISOString().split('T')[0] || '',
      location: '',
      discipline: Discipline.Powerlifting,
      federation_rules: '',
      competition_type: '',
      organizer: '',
      notes: '',
    };
    competitors = [];
    newCompetitor = {
      firstName: '',
      lastName: '',
      birthDate: '',
      gender: 'Male',
      bodyweight: 0,
    };
    validationErrors = {};
    errorMessage = '';
  }
</script>

<div class="container-medium py-8">
  <h1 class="text-h1 text-center text-text-primary mb-6">{$_('contest.create_title')}</h1>

  <!-- Step 1: Basic Info -->
  {#if currentStep === 1}
    <div class="card">
      <h2 class="text-h2 text-text-primary mb-4">{$_('contest.step_1_title')}</h2>
      <p class="text-body text-text-secondary mb-6">
        {$_('contest.step_1_description')}
      </p>
      <div class="space-y-4">
        <div>
          <label for="name" class="input-label">{$_('contest.name_label')}</label>
          <input 
            type="text" 
            id="name" 
            class="input-field" 
            class:error={getFieldError('name')}
            bind:value={newContest.name} 
            placeholder="{$_('contest.name_placeholder')}" 
            required 
          />
          {#if getFieldError('name')}
            <div class="error-message">{getFieldError('name')}</div>
          {/if}
        </div>
        <div>
          <label for="date" class="input-label">{$_('contest.date_label')}</label>
          <input 
            type="date" 
            id="date" 
            class="input-field" 
            class:error={getFieldError('date')}
            bind:value={newContest.date} 
            required 
          />
          {#if getFieldError('date')}
            <div class="error-message">{getFieldError('date')}</div>
          {/if}
        </div>
        <div>
          <label for="location" class="input-label">{$_('contest.location_label')}</label>
          <input 
            type="text" 
            id="location" 
            class="input-field" 
            class:error={getFieldError('location')}
            bind:value={newContest.location} 
            placeholder="{$_('contest.location_placeholder')}" 
            required 
          />
          {#if getFieldError('location')}
            <div class="error-message">{getFieldError('location')}</div>
          {/if}
        </div>
      </div>
    </div>
  {/if}

  <!-- Step 2: Details -->
  {#if currentStep === 2}
    <div class="card">
      <h2 class="text-h2 text-text-primary mb-2">{$_('contest.step_2_title')}</h2>
      <p class="text-body text-text-secondary mb-3">
        {$_('contest.step_2_description')}
      </p>
      <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label for="discipline" class="input-label">{$_('contest.discipline_label')}</label>
          <select id="discipline" class="input-field" bind:value={newContest.discipline}>
            {#each Object.values(Discipline) as discipline}
              <option value={discipline}>{$_(`disciplines.${discipline}`)}</option>
            {/each}
          </select>
        </div>
        <div>
          <label for="competition_type" class="input-label">{$_('contest.competition_type_label')}</label>
          <input type="text" id="competition_type" class="input-field" bind:value={newContest.competition_type} placeholder="{$_('contest.competition_type_placeholder')}" />
        </div>
        <div>
          <label for="organizer" class="input-label">{$_('contest.organizer_label')}</label>
          <input type="text" id="organizer" class="input-field" bind:value={newContest.organizer} placeholder="{$_('contest.organizer_placeholder')}" />
        </div>
        <div>
          <label for="federation_rules" class="input-label">{$_('contest.federation_rules_label')}</label>
          <input type="text" id="federation_rules" class="input-field" bind:value={newContest.federation_rules} placeholder="{$_('contest.federation_rules_placeholder')}" />
        </div>
        <div class="md:col-span-2">
          <label for="notes" class="input-label">{$_('contest.notes_label')}</label>
          <textarea id="notes" class="input-field" bind:value={newContest.notes} rows="3" placeholder="{$_('contest.notes_placeholder')}"></textarea>
        </div>
      </div>
    </div>
  {/if}

  <!-- Step 3: Competitors -->
  {#if currentStep === 3}
    <div class="card">
      <h2 class="text-h2 text-text-primary mb-4">{$_('contest.step_3_title')}</h2>
      <p class="text-body text-text-secondary mb-6">
        {$_('contest.step_3_description')}
      </p>
      
      <!-- Add Competitor Form -->
      <div class="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <div>
          <label for="competitor-firstName" class="input-label">{$_('contest_view.first_name')}</label>
          <input 
            type="text" 
            id="competitor-firstName" 
            class="input-field" 
            bind:value={newCompetitor.firstName}
            placeholder="Jan"
          />
        </div>
        <div>
          <label for="competitor-lastName" class="input-label">{$_('contest_view.last_name')}</label>
          <input 
            type="text" 
            id="competitor-lastName" 
            class="input-field" 
            bind:value={newCompetitor.lastName}
            placeholder="Kowalski"
          />
        </div>
        <div>
          <label for="competitor-birthDate" class="input-label">{$_('contest_view.birth_date')}</label>
          <input 
            type="date" 
            id="competitor-birthDate" 
            class="input-field" 
            bind:value={newCompetitor.birthDate}
          />
        </div>
        <div>
          <label for="competitor-gender" class="input-label">{$_('contest_view.gender')}</label>
          <select id="competitor-gender" class="input-field" bind:value={newCompetitor.gender}>
            <option value="Male">{$_('contest_view.male')}</option>
            <option value="Female">{$_('contest_view.female')}</option>
          </select>
        </div>
        <div>
          <label for="competitor-bodyweight" class="input-label">{$_('contest_view.body_weight')} ({$_('contest_view.kg')})</label>
          <input 
            type="number" 
            step="0.1" 
            id="competitor-bodyweight" 
            class="input-field" 
            bind:value={newCompetitor.bodyweight}
            on:wheel={handleBodyweightWheel}
            placeholder="75.0"
          />
        </div>
        <div>
          <label class="input-label">{$_('contest_view.photo')} (Optional)</label>
          <PhotoUpload
            currentPhoto={newCompetitor.photoBase64}
            on:photoSelected={handlePhotoSelected}
            on:photoRemoved={handlePhotoRemoved}
          />
        </div>
        <div class="flex items-end">
          <button type="button" class="btn-primary" on:click={addCompetitor}>
            {$_('contest_view.register_competitor')}
          </button>
        </div>
      </div>

      <!-- Competitors List -->
      {#if competitors.length > 0}
        <div class="competitors-list">
          <h3 class="text-h3 text-text-primary mb-4">{$_('contest.registered_competitors')} ({competitors.length})</h3>
          <div class="space-y-2">
            {#each competitors as competitor, index}
              <div class="competitor-item">
                <div class="competitor-info">
                  <strong>{competitor.firstName} {competitor.lastName}</strong>
                  <span class="competitor-details">
                    {competitor.gender} • {competitor.bodyweight}kg • {competitor.birthDate}
                  </span>
                </div>
                <button type="button" class="btn-remove" on:click={() => removeCompetitor(index)}>
                  ✕
                </button>
              </div>
            {/each}
          </div>
        </div>
      {:else}
        <div class="no-competitors">
          <p class="text-body text-text-secondary text-center">
            {$_('contest.no_competitors_message')}
          </p>
        </div>
      {/if}
      
      <!-- Show validation error if no competitors -->
      {#if getFieldError('competitors')}
        <div class="error-message mt-4">{getFieldError('competitors')}</div>
      {/if}
    </div>
  {/if}
  

  <!-- Step 4: Confirmation -->
  {#if currentStep === 4}
    <div class="card">
      <h2 class="text-h2 text-text-primary mb-2">{$_('contest.step_4_title')}</h2>
      <p class="text-body text-text-secondary mb-3">
        {$_('contest.step_4_description')}
      </p>
      <div class="space-y-2">
        <div class="summary-item"><strong class="text-accent-red">{$_('general.name')}</strong> {newContest.name}</div>
        <div class="summary-item"><strong class="text-accent-red">{$_('general.date')}</strong> {newContest.date}</div>
        <div class="summary-item"><strong class="text-accent-red">{$_('general.location')}</strong> {newContest.location}</div>
        <div class="summary-item"><strong class="text-accent-red">{$_('general.discipline')}</strong> {$_(`disciplines.${newContest.discipline}`)}</div>
        <div class="summary-item"><strong class="text-accent-red">{$_('general.competition_type')}</strong> {newContest.competition_type || $_('general.not_available')}</div>
        <div class="summary-item"><strong class="text-accent-red">{$_('general.organizer')}</strong> {newContest.organizer || $_('general.not_available')}</div>
        <div class="summary-item"><strong class="text-accent-red">{$_('general.federation_rules')}</strong> {newContest.federation_rules || $_('general.not_available')}</div>
        <div class="summary-item"><strong class="text-accent-red">{$_('general.notes')}</strong> {newContest.notes || $_('general.not_available')}</div>
      </div>
      {#if errorMessage}
        <div class="error-box mt-4">
          <strong class="text-accent-red">{$_('general.error')}</strong> {errorMessage}
        </div>
      {/if}
    </div>
  {/if}

  <!-- Navigation -->
  <div class="flex justify-between mt-6">
    <button class="btn-secondary" on:click={handleCancel} disabled={isLoading}>{$_('buttons.cancel')}</button>

    <div class="space-x-2">
      {#if currentStep > 1}
        <button class="btn-secondary" on:click={prevStep} disabled={isLoading}>{$_('buttons.back')}</button>
      {/if}

      {#if currentStep < 4}
        <button class="btn-primary" on:click={nextStep}>
          {$_('buttons.next')}
        </button>
      {/if}

      {#if currentStep === 4}
        <button class="btn-primary" on:click={createContest} disabled={isLoading}>
          {#if isLoading}
            <span class="loading-spinner"></span>{$_('buttons.creating_contest')}
          {:else}
            {$_('buttons.create_contest')}
          {/if}
        </button>
      {/if}
    </div>
  </div>

  <!-- Progress Indicator -->
  <div class="step-indicator mt-4">
    <div class="step" class:completed={currentStep > 1} class:active={currentStep === 1}>1</div>
    <div class="step" class:completed={currentStep > 2} class:active={currentStep === 2}>2</div>
    <div class="step" class:completed={currentStep > 3} class:active={currentStep === 3}>3</div>
    <div class="step" class:active={currentStep === 4}>4</div>
  </div>
</div>

<style>
  .error-message {
    color: #dc2626;
    font-size: 0.875rem;
    margin-top: 0.25rem;
    font-weight: 500;
  }

  .error-box {
    background-color: #1a1a1a;
    border: 1px solid #dc2626;
    border-radius: 0.375rem;
    padding: 1rem;
    color: #f9fafb;
  }

  .input-field.error {
    border-color: #dc2626;
    box-shadow: 0 0 0 1px #dc2626;
  }

  .input-field.error:focus {
    border-color: #dc2626;
    box-shadow: 0 0 0 2px rgba(220, 38, 38, 0.1);
  }

  .summary-item {
    padding: 0.5rem;
    background-color: #1a1a1a;
    border-radius: 0.25rem;
    border-left: 3px solid #dc2626;
    color: #f9fafb;
    font-size: 0.875rem;
  }

  /* Compact step progress indicator */
  .step-indicator {
    display: flex;
    justify-content: center;
    gap: 0.5rem;
  }

  .step-indicator .step {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 1.5rem;
    height: 1.5rem;
    border-radius: 50%;
    background-color: #374151;
    color: #d1d5db;
    font-weight: 500;
    font-size: 0.75rem;
    transition: all 0.2s;
  }

  .step-indicator .step.active {
    background-color: #dc2626;
    color: white;
    box-shadow: 0 0 10px rgba(220, 38, 38, 0.5);
  }

  .step-indicator .step.completed {
    background-color: #059669;
    color: white;
  }

  .btn-primary:disabled,
  .btn-secondary:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .loading-spinner {
    display: inline-block;
    width: 1rem;
    height: 1rem;
    border: 2px solid #f3f4f6;
    border-top: 2px solid #3b82f6;
    border-radius: 50%;
    animation: spin 1s linear infinite;
    margin-right: 0.5rem;
  }

  @keyframes spin {
    0% { transform: rotate(0deg); }
    100% { transform: rotate(360deg); }
  }

  /* Competitor Management Styles */
  .competitors-list {
    background-color: #1a1a1a;
    border: 2px solid #374151;
    border-radius: 0.375rem;
    padding: 1rem;
  }

  .competitor-item {
    display: flex;
    justify-content: space-between;
    align-items: center;
    background-color: #2C2C2C;
    border: 1px solid #374151;
    border-radius: 0.25rem;
    padding: 0.75rem;
    transition: all 0.2s;
  }

  .competitor-item:hover {
    border-color: #dc2626;
    background-color: #1f1f1f;
  }

  .competitor-info {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }

  .competitor-details {
    color: #9ca3af;
    font-size: 0.875rem;
  }

  .btn-remove {
    background-color: #dc2626;
    color: white;
    border: none;
    border-radius: 50%;
    width: 1.5rem;
    height: 1.5rem;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 0.75rem;
    cursor: pointer;
    transition: all 0.2s;
  }

  .btn-remove:hover {
    background-color: #b91c1c;
    transform: scale(1.1);
  }

  .no-competitors {
    text-align: center;
    padding: 2rem;
    background-color: #1a1a1a;
    border: 2px dashed #374151;
    border-radius: 0.375rem;
  }

</style>
