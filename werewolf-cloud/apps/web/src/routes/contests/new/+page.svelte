<script lang="ts">
  import { goto } from '$app/navigation';
  import Layout from '$lib/components/Layout.svelte';
  import { apiClient } from '$lib/api';
  import type { PageData } from './$types';
  import type { ContestSummary } from '$lib/types';

  const AVAILABLE_EVENTS = ['Squat', 'Bench', 'Deadlift'] as const;
  const GENDERS = ['Male', 'Female'] as const;

  export let data: PageData;
  const { apiBase } = data;

  type ContestEvent = typeof AVAILABLE_EVENTS[number];
  type Gender = typeof GENDERS[number];

  interface ContestForm {
    name: string;
    date: string;
    location: string;
    discipline: 'Powerlifting' | 'Bench' | 'Squat' | 'Deadlift';
    events: ContestEvent[];
    federationRules: string;
    competitionType: string;
    organizer: string;
    notes: string;
  }

  interface CompetitorDraft {
    firstName: string;
    lastName: string;
    birthDate: string;
    gender: Gender;
    club: string;
    city: string;
    bodyweight: number;
    lotNumber: string;
    rackHeightSquat: number | null;
    rackHeightBench: number | null;
    equipmentM: boolean;
    equipmentSm: boolean;
    equipmentT: boolean;
  }

  let step = 1;
  let isSubmitting = false;
  let error: string | null = null;
  let success: string | null = null;

  const today = new Date();
  const isoToday = today.toISOString().slice(0, 10);

  let form: ContestForm = {
    name: '',
    date: isoToday,
    location: '',
    discipline: 'Powerlifting',
    events: ['Squat', 'Bench', 'Deadlift'],
    federationRules: '',
    competitionType: 'Classic Powerlifting',
    organizer: '',
    notes: '',
  };

  let competitorDraft: CompetitorDraft = {
    firstName: '',
    lastName: '',
    birthDate: '',
    gender: 'Male',
    club: '',
    city: '',
    bodyweight: 0,
    lotNumber: '',
    rackHeightSquat: null,
    rackHeightBench: null,
    equipmentM: false,
    equipmentSm: false,
    equipmentT: false,
  };

  let competitorDrafts: CompetitorDraft[] = [];
  let validationErrors: Record<string, string> = {};

  function toggleEvent(event: ContestEvent) {
    if (form.events.includes(event)) {
      form.events = form.events.filter((e) => e !== event);
    } else {
      form.events = [...form.events, event];
    }
    if (form.events.length === 0) {
      form.events = [event];
    }
    updateCompetitionType();
  }

  function updateCompetitionType() {
    if (form.events.length === 3) {
      form.competitionType = 'Powerlifting (SQ + BP + DL)';
    } else if (form.events.length === 2) {
      form.competitionType = `${form.events[0]} + ${form.events[1]}`;
      form.discipline = 'Powerlifting';
    } else if (form.events.length === 1) {
      const [singleEvent] = form.events;
      if (singleEvent) {
        form.discipline = singleEvent;
        form.competitionType = `${singleEvent} Only`;
      }
    }
  }

  function resetCompetitorDraft() {
    competitorDraft = {
      firstName: '',
      lastName: '',
      birthDate: '',
      gender: 'Male',
      club: '',
      city: '',
      bodyweight: 0,
      lotNumber: '',
      rackHeightSquat: null,
      rackHeightBench: null,
      equipmentM: false,
      equipmentSm: false,
      equipmentT: false,
    };
  }

  function addCompetitorDraft() {
    validationErrors = {};

    if (!competitorDraft.firstName.trim()) {
      validationErrors['firstName'] = 'First name is required';
    }
    if (!competitorDraft.lastName.trim()) {
      validationErrors['lastName'] = 'Last name is required';
    }
    if (!competitorDraft.birthDate) {
      validationErrors['birthDate'] = 'Birth date is required';
    }
    if (competitorDraft.bodyweight <= 0) {
      validationErrors['bodyweight'] = 'Bodyweight must be greater than 0';
    }

    if (Object.keys(validationErrors).length > 0) {
      return;
    }

    competitorDrafts = [...competitorDrafts, { ...competitorDraft, bodyweight: Number(competitorDraft.bodyweight) }];
    resetCompetitorDraft();
  }

  function removeCompetitorDraft(index: number) {
    competitorDrafts = competitorDrafts.filter((_, i) => i !== index);
  }

  function validateStep(stepNumber: number): boolean {
    validationErrors = {};

    if (stepNumber === 1) {
      if (!form.name.trim()) {
        validationErrors['name'] = 'Contest name is required';
      }
      if (!form.location.trim()) {
        validationErrors['location'] = 'Location is required';
      }
      if (!form.date) {
        validationErrors['date'] = 'Date is required';
      }
    }

    if (stepNumber === 3 && competitorDrafts.length === 0) {
      // Optional pre-registration, no validation required
      validationErrors = {};
    }

    return Object.keys(validationErrors).length === 0;
  }

  function goToStep(next: number) {
    if (next > step && !validateStep(step)) {
      return;
    }
    step = next;
  }

  async function submitContest() {
    if (!validateStep(step)) {
      return;
    }

    error = null;
    success = null;
    isSubmitting = true;

    const payload = {
      name: form.name.trim(),
      date: form.date,
      location: form.location.trim(),
      discipline: form.discipline,
      federationRules: form.federationRules.trim() || null,
      competitionType: form.competitionType.trim() || null,
      organizer: form.organizer.trim() || null,
      notes: form.notes.trim() || null,
    };

    try {
      const response = await apiClient.post<ContestSummary>('/contests', payload);
      if (response.error || !response.data) {
        throw new Error(response.error || 'Failed to create contest');
      }

      const contest = response.data;

      for (const draft of competitorDrafts) {
        try {
          const competitorResponse = await apiClient.post<{ id: string }>('/competitors', {
            firstName: draft.firstName.trim(),
            lastName: draft.lastName.trim(),
            birthDate: draft.birthDate,
            gender: draft.gender,
            club: draft.club.trim() || null,
            city: draft.city.trim() || null,
            notes: null,
          });

          if (competitorResponse.error || !competitorResponse.data) {
            throw new Error(competitorResponse.error || 'Failed to create competitor');
          }

          const competitorId = competitorResponse.data.id;

          const registrationResponse = await apiClient.post(`/contests/${contest.id}/registrations`, {
            competitorId,
            bodyweight: draft.bodyweight,
            lotNumber: draft.lotNumber || null,
            rackHeightSquat: draft.rackHeightSquat,
            rackHeightBench: draft.rackHeightBench,
            equipmentM: draft.equipmentM,
            equipmentSm: draft.equipmentSm,
            equipmentT: draft.equipmentT,
          });
          if (registrationResponse.error) {
            throw new Error(registrationResponse.error);
          }
        } catch (competitorError) {
          console.error('Failed to register competitor draft:', competitorError);
        }
      }

      success = 'Contest created successfully.';
      resetForm();
      competitorDrafts = [];

      await goto(`/contests/${contest.id}`);
    } catch (err) {
      console.error(err);
      error = err instanceof Error ? err.message : 'Failed to create contest';
    } finally {
      isSubmitting = false;
    }
  }

  function resetForm() {
    form = {
      name: '',
      date: isoToday,
      location: '',
      discipline: 'Powerlifting',
      events: ['Squat', 'Bench', 'Deadlift'],
      federationRules: '',
      competitionType: 'Classic Powerlifting',
      organizer: '',
      notes: '',
    };
    validationErrors = {};
  }
</script>

<svelte:head>
  <title>Create Contest • Werewolf Powerlifting</title>
</svelte:head>

<Layout
  title="Contest Wizard"
  subtitle="Create competition and optional roster"
  currentPage="contests"
  apiBase={apiBase}
>
  <div class="container-medium space-y-8">
    <div class="card">
      <header class="card-header flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h2 class="text-h2 text-text-primary">Contest Setup</h2>
          <p class="text-body text-text-secondary">Step {step} of 3</p>
        </div>
        <div class="flex gap-2">
          <button
            class="btn-secondary"
            on:click={() => goToStep(Math.max(step - 1, 1))}
            disabled={step === 1}
            type="button"
          >
            Previous
          </button>
          <button
            class="btn-primary"
            on:click={() => (step < 3 ? goToStep(step + 1) : submitContest())}
            type="button"
            disabled={isSubmitting}
          >
            {step < 3 ? 'Next' : (isSubmitting ? 'Creating…' : 'Create Contest')}
          </button>
        </div>
      </header>

      {#if error}
        <div class="bg-status-error/20 border border-status-error text-status-error px-4 py-3 mb-4">
          {error}
        </div>
      {/if}

      {#if success}
        <div class="bg-status-success/20 border border-status-success text-green-200 px-4 py-3 mb-4">
          {success}
        </div>
      {/if}

      {#if step === 1}
        <section class="space-y-6">
          <div class="grid gap-4 md:grid-cols-2">
            <div>
              <label class="input-label" for="contest-name">Contest name</label>
              <input
                id="contest-name"
                class="input-field"
                bind:value={form.name}
                placeholder="Werewolf Open"
                required
              />
              {#if validationErrors['name']}
                <p class="error-message">{validationErrors['name']}</p>
              {/if}
            </div>
            <div>
              <label class="input-label" for="contest-date">Contest date</label>
              <input
                id="contest-date"
                class="input-field"
                type="date"
                bind:value={form.date}
                min={isoToday}
                required
              />
              {#if validationErrors['date']}
                <p class="error-message">{validationErrors['date']}</p>
              {/if}
            </div>
          </div>

          <div class="grid gap-4 md:grid-cols-2">
            <div>
              <label class="input-label" for="location">Location</label>
              <input
                id="location"
                class="input-field"
                bind:value={form.location}
                placeholder="Warsaw Power Arena"
                required
              />
              {#if validationErrors['location']}
                <p class="error-message">{validationErrors['location']}</p>
              {/if}
            </div>
            <div class="flex flex-col gap-2">
              <span class="input-label">Events included</span>
              <div class="flex flex-wrap gap-3">
                {#each AVAILABLE_EVENTS as eventName}
                  <label class="flex items-center gap-2 text-body">
                    <input
                      type="checkbox"
                      class="accent-primary-red"
                      checked={form.events.includes(eventName)}
                      on:change={() => toggleEvent(eventName)}
                    />
                    {eventName}
                  </label>
                {/each}
              </div>
              <p class="text-caption text-text-secondary">Discipline is derived automatically from the selected events.</p>
            </div>
          </div>
        </section>
      {:else if step === 2}
        <section class="grid gap-4 md:grid-cols-2">
          <div>
            <label class="input-label" for="competitionType">Competition type</label>
            <input
              id="competitionType"
              class="input-field"
              bind:value={form.competitionType}
              placeholder="Bench + Deadlift"
            />
          </div>
          <div>
            <label class="input-label" for="organizer">Organizer</label>
            <input
              id="organizer"
              class="input-field"
              bind:value={form.organizer}
              placeholder="Werewolf Club"
            />
          </div>
          <div>
            <label class="input-label" for="federationRules">Federation rules</label>
            <input
              id="federationRules"
              class="input-field"
              bind:value={form.federationRules}
              placeholder="IPF Classic"
            />
          </div>
          <div class="md:col-span-2">
            <label class="input-label" for="notes">Notes</label>
            <textarea id="notes" class="input-field" rows="3" bind:value={form.notes} placeholder="Special equipment rules, schedule notes" />
          </div>
        </section>
      {:else}
        <section class="space-y-6">
          <div class="grid gap-4 md:grid-cols-2">
            <div>
              <label class="input-label" for="firstName">First name</label>
              <input id="firstName" class="input-field" bind:value={competitorDraft.firstName} />
              {#if validationErrors['firstName']}
                <p class="error-message">{validationErrors['firstName']}</p>
              {/if}
            </div>
            <div>
              <label class="input-label" for="lastName">Last name</label>
              <input id="lastName" class="input-field" bind:value={competitorDraft.lastName} />
              {#if validationErrors['lastName']}
                <p class="error-message">{validationErrors['lastName']}</p>
              {/if}
            </div>
            <div>
              <label class="input-label" for="birthDate">Birth date</label>
              <input id="birthDate" type="date" class="input-field" bind:value={competitorDraft.birthDate} />
              {#if validationErrors['birthDate']}
                <p class="error-message">{validationErrors['birthDate']}</p>
              {/if}
            </div>
            <div>
              <label class="input-label" for="gender">Gender</label>
              <select id="gender" class="input-field" bind:value={competitorDraft.gender}>
                {#each GENDERS as gender}
                  <option value={gender}>{gender}</option>
                {/each}
              </select>
            </div>
            <div>
              <label class="input-label" for="club">Club</label>
              <input id="club" class="input-field" bind:value={competitorDraft.club} placeholder="Werewolf Club" />
            </div>
            <div>
              <label class="input-label" for="city">City</label>
              <input id="city" class="input-field" bind:value={competitorDraft.city} placeholder="Warsaw" />
            </div>
            <div>
              <label class="input-label" for="bodyweight">Bodyweight (kg)</label>
              <input
                id="bodyweight"
                type="number"
                step="0.1"
                min="0"
                class="input-field"
                bind:value={competitorDraft.bodyweight}
              />
              {#if validationErrors['bodyweight']}
                <p class="error-message">{validationErrors['bodyweight']}</p>
              {/if}
            </div>
            <div>
              <label class="input-label" for="lotNumber">Lot number</label>
              <input id="lotNumber" class="input-field" bind:value={competitorDraft.lotNumber} placeholder="Optional" />
            </div>
            <div>
              <label class="input-label" for="rackHeightSquat">Rack height (Squat)</label>
              <input
                id="rackHeightSquat"
                type="number"
                class="input-field"
                bind:value={competitorDraft.rackHeightSquat}
              />
            </div>
            <div>
              <label class="input-label" for="rackHeightBench">Rack height (Bench)</label>
              <input
                id="rackHeightBench"
                type="number"
                class="input-field"
                bind:value={competitorDraft.rackHeightBench}
              />
            </div>
          </div>

          <div class="flex flex-wrap gap-3 text-body">
            <label class="flex items-center gap-2">
              <input type="checkbox" bind:checked={competitorDraft.equipmentM} /> Multi-ply
            </label>
            <label class="flex items-center gap-2">
              <input type="checkbox" bind:checked={competitorDraft.equipmentSm} /> Single-ply
            </label>
            <label class="flex items-center gap-2">
              <input type="checkbox" bind:checked={competitorDraft.equipmentT} /> Knee wraps
            </label>
          </div>

          <div class="flex gap-3">
            <button class="btn-primary" type="button" on:click={addCompetitorDraft}>Add competitor</button>
            <button class="btn-secondary" type="button" on:click={resetCompetitorDraft}>Reset form</button>
          </div>

          {#if competitorDrafts.length > 0}
            <div class="space-y-3">
              <h3 class="text-h3 text-text-primary">Pre-registered competitors</h3>
              {#each competitorDrafts as competitor, index}
                <div class="bg-element-bg border border-border-color p-4 flex justify-between items-center">
                  <div>
                    <p class="text-body text-text-primary font-semibold">
                      {competitor.firstName} {competitor.lastName}
                    </p>
                    <p class="text-caption text-text-secondary">
                      {competitor.birthDate} • {competitor.gender} • {competitor.bodyweight} kg
                    </p>
                    <p class="text-caption text-text-secondary">
                      {competitor.club || 'No club'} • {competitor.city || 'No city'}
                    </p>
                  </div>
                  <button class="btn-secondary" type="button" on:click={() => removeCompetitorDraft(index)}>
                    Remove
                  </button>
                </div>
              {/each}
            </div>
          {/if}
        </section>
      {/if}
    </div>
  </div>
</Layout>
