<script lang="ts">
import { goto } from '$app/navigation';
import Layout from '$lib/components/Layout.svelte';
import { apiClient } from '$lib/api';
import type { PageData } from './$types';
import type { ContestSummary } from '$lib/types';
import { toast } from '$lib/ui/toast';
import { _ } from 'svelte-i18n';
import { get } from 'svelte/store';

  const AVAILABLE_EVENTS = ['Squat', 'Bench', 'Deadlift'] as const;
  const EVENT_LABEL_KEYS: Record<typeof AVAILABLE_EVENTS[number], string> = {
    Squat: 'contest.wizard.events.squat',
    Bench: 'contest.wizard.events.bench',
    Deadlift: 'contest.wizard.events.deadlift',
  };

  const GENDERS = ['Male', 'Female'] as const;
  const GENDER_LABEL_KEYS: Record<typeof GENDERS[number], string> = {
    Male: 'contest.wizard.genders.male',
    Female: 'contest.wizard.genders.female',
  };

  export let data: PageData;
  export let params: Record<string, string> = {};

  $: void params;
  const { apiBase } = data;

  type ContestEvent = typeof AVAILABLE_EVENTS[number];
  type Gender = typeof GENDERS[number];

  const translate = (key: string, values?: Record<string, unknown>) => get(_)(key, values) as string;

  interface ContestForm {
    name: string;
    date: string;
    location: string;
    discipline: 'Powerlifting' | 'Bench' | 'Squat' | 'Deadlift';
    events: ContestEvent[];
    federationRules: string;
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
    rackHeightSquat: number | null;
    rackHeightBench: number | null;
    equipmentM: boolean;
    equipmentSm: boolean;
    equipmentT: boolean;
  }

  const MIN_STEP = 1;
  const MAX_STEP = 3;
  const TOTAL_STEPS = MAX_STEP;
  const BODYWEIGHT_STEP = 0.5;
  const DEFAULT_RACK_SQUAT = 10;
  const DEFAULT_RACK_BENCH = 5;

  let step = MIN_STEP;
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
    bodyweight: 70,
    rackHeightSquat: DEFAULT_RACK_SQUAT,
    rackHeightBench: DEFAULT_RACK_BENCH,
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
    updateDiscipline();
  }

  function updateDiscipline() {
    if (form.events.length >= 2) {
      form.discipline = 'Powerlifting';
      return;
    }

    const [singleEvent] = form.events;
    if (singleEvent) {
      form.discipline = singleEvent;
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
      bodyweight: 70,
      rackHeightSquat: DEFAULT_RACK_SQUAT,
      rackHeightBench: DEFAULT_RACK_BENCH,
      equipmentM: false,
      equipmentSm: false,
      equipmentT: false,
    };
  }

  function addCompetitorDraft() {
    validationErrors = {};

    if (!competitorDraft.firstName.trim()) {
      validationErrors['firstName'] = translate('contest.wizard.validation.first_name_required');
    }
    if (!competitorDraft.lastName.trim()) {
      validationErrors['lastName'] = translate('contest.wizard.validation.last_name_required');
    }
    if (!competitorDraft.birthDate) {
      validationErrors['birthDate'] = translate('contest.wizard.validation.birth_date_required');
    }
    if (competitorDraft.bodyweight <= 0) {
      validationErrors['bodyweight'] = translate('contest.wizard.validation.bodyweight_positive');
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

  function handleBodyweightWheel(event: WheelEvent) {
    event.preventDefault();
    const direction = event.deltaY > 0 ? -1 : 1;
    const nextValue = Math.max(0, (competitorDraft.bodyweight || 0) + direction * BODYWEIGHT_STEP);
    competitorDraft.bodyweight = Number(nextValue.toFixed(2));
  }

  function validateStep(stepNumber: number): boolean {
    validationErrors = {};

    if (stepNumber === 1) {
      if (!form.name.trim()) {
        validationErrors['name'] = translate('contest.wizard.validation.name_required');
      }
      if (!form.location.trim()) {
        validationErrors['location'] = translate('contest.wizard.validation.location_required');
      }
      if (!form.date) {
        validationErrors['date'] = translate('contest.wizard.validation.date_required');
      }
    }

    if (stepNumber === 2) {
      if (!form.organizer.trim()) {
        validationErrors['organizer'] = translate('contest.wizard.validation.organizer_required');
      }
    }

    if (stepNumber === 3 && competitorDrafts.length === 0) {
      // Optional pre-registration, no validation required
      validationErrors = {};
    }

    return Object.keys(validationErrors).length === 0;
  }

  function goToStep(next: number) {
    const target = Math.min(Math.max(next, MIN_STEP), MAX_STEP);
    if (target > step && !validateStep(step)) {
      toast.error(translate('contest.wizard.validation.warning'));
      return;
    }
    step = target;
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
      organizer: form.organizer.trim(),
      notes: form.notes.trim() || null,
    };

    try {
      const response = await apiClient.post<ContestSummary>('/contests', payload);
      if (response.error || !response.data) {
        throw new Error(response.error || translate('contest.wizard.messages.error'));
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
            throw new Error(competitorResponse.error || translate('contest.wizard.messages.error'));
          }

          const competitorId = competitorResponse.data.id;

          const registrationResponse = await apiClient.post(`/contests/${contest.id}/registrations`, {
            competitorId,
            bodyweight: draft.bodyweight,
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

      success = translate('contest.wizard.messages.success');
      resetForm();
      competitorDrafts = [];

      await goto(`/contests/${contest.id}`);
    } catch (err) {
      console.error(err);
      error = err instanceof Error ? err.message : translate('contest.wizard.messages.error');
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
      organizer: '',
      notes: '',
    };
    validationErrors = {};
  }
</script>

<svelte:head>
  <title>{$_('contest.wizard.page_title')}</title>
</svelte:head>

<Layout
  title={$_('contest.wizard.layout_title')}
  subtitle={$_('contest.wizard.layout_subtitle')}
  currentPage="contests"
  apiBase={apiBase}
>
  <div class="container-medium space-y-8">
    <div class="card">
      <header class="card-header flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h2 class="text-h2 text-text-primary">{$_('contest.wizard.title')}</h2>
          <p class="text-body text-text-secondary">
            {$_('contest.wizard.step_label')} {step} {$_('contest.wizard.step_connector')} {TOTAL_STEPS}
          </p>
        </div>
        <div class="flex gap-2">
          <button
            class="btn-secondary"
            on:click={() => goToStep(Math.max(step - 1, MIN_STEP))}
            disabled={step === MIN_STEP}
            type="button"
          >
            {$_('contest.wizard.actions.previous')}
          </button>
          <button
            class="btn-primary"
            on:click={() => (step < TOTAL_STEPS ? goToStep(step + 1) : submitContest())}
            type="button"
            disabled={isSubmitting}
          >
            {#if step < TOTAL_STEPS}
              {$_('contest.wizard.actions.next')}
            {:else if isSubmitting}
              {$_('contest.wizard.actions.submitting')}
            {:else}
              {$_('contest.wizard.actions.submit')}
            {/if}
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
          <div class="space-y-2">
            <h3 class="text-h3 text-text-primary">{$_('contest.wizard.steps.basic')}</h3>
            <p class="text-caption text-text-secondary">{$_('contest.wizard.steps.basic_hint')}</p>
          </div>

          <div class="grid gap-4 md:grid-cols-2">
            <div>
              <label class="input-label" for="contest-name">{$_('contest.wizard.fields.name.label')}</label>
              <input
                id="contest-name"
                class="input-field"
                bind:value={form.name}
                placeholder={$_('contest.wizard.fields.name.placeholder')}
                required
              />
              {#if validationErrors['name']}
                <p class="error-message">{validationErrors['name']}</p>
              {/if}
            </div>
            <div>
              <label class="input-label" for="contest-date">{$_('contest.wizard.fields.date.label')}</label>
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
              <label class="input-label" for="location">{$_('contest.wizard.fields.location.label')}</label>
              <input
                id="location"
                class="input-field"
                bind:value={form.location}
                placeholder={$_('contest.wizard.fields.location.placeholder')}
                required
              />
              {#if validationErrors['location']}
                <p class="error-message">{validationErrors['location']}</p>
              {/if}
            </div>
            <div class="flex flex-col gap-2">
              <span class="input-label">{$_('contest.wizard.fields.events.label')}</span>
              <div class="flex flex-wrap gap-3">
                {#each AVAILABLE_EVENTS as eventName}
                  <label class="flex items-center gap-2 text-body">
                    <input
                      type="checkbox"
                      class="accent-primary-red"
                      checked={form.events.includes(eventName)}
                      on:change={() => toggleEvent(eventName)}
                    />
                    {$_(EVENT_LABEL_KEYS[eventName])}
                  </label>
                {/each}
              </div>
              <p class="text-caption text-text-secondary">{$_('contest.wizard.messages.events_hint')}</p>
            </div>
          </div>
        </section>
      {:else if step === 2}
        <section class="space-y-6">
          <div class="space-y-2">
            <h3 class="text-h3 text-text-primary">{$_('contest.wizard.steps.details')}</h3>
            <p class="text-caption text-text-secondary">{$_('contest.wizard.steps.details_hint')}</p>
          </div>

          <div class="grid gap-4 md:grid-cols-2">
            <div>
              <label class="input-label" for="organizer">{$_('contest.wizard.fields.organizer.label')}</label>
              <input
                id="organizer"
                class="input-field"
                bind:value={form.organizer}
                placeholder={$_('contest.wizard.fields.organizer.placeholder')}
                required
              />
              {#if validationErrors['organizer']}
                <p class="error-message">{validationErrors['organizer']}</p>
              {/if}
            </div>
            <div>
              <label class="input-label" for="federationRules">{$_('contest.wizard.fields.federation_rules.label')}</label>
              <input
                id="federationRules"
                class="input-field"
                bind:value={form.federationRules}
                placeholder={$_('contest.wizard.fields.federation_rules.placeholder')}
              />
            </div>
            <div class="md:col-span-2">
              <label class="input-label" for="notes">{$_('contest.wizard.fields.notes.label')}</label>
              <textarea
                id="notes"
                class="input-field"
                rows="3"
                bind:value={form.notes}
                placeholder={$_('contest.wizard.fields.notes.placeholder')}
              />
            </div>
          </div>
        </section>
      {:else}
        <section class="space-y-6">
          <div class="space-y-2">
            <h3 class="text-h3 text-text-primary">{$_('contest.wizard.steps.competitors')}</h3>
            <p class="text-caption text-text-secondary">{$_('contest.wizard.steps.competitors_hint')}</p>
          </div>

          <div class="grid gap-4 md:grid-cols-2">
            <div>
              <label class="input-label" for="firstName">{$_('contest.wizard.competitor.first_name')}</label>
              <input id="firstName" class="input-field" bind:value={competitorDraft.firstName} />
              {#if validationErrors['firstName']}
                <p class="error-message">{validationErrors['firstName']}</p>
              {/if}
            </div>
            <div>
              <label class="input-label" for="lastName">{$_('contest.wizard.competitor.last_name')}</label>
              <input id="lastName" class="input-field" bind:value={competitorDraft.lastName} />
              {#if validationErrors['lastName']}
                <p class="error-message">{validationErrors['lastName']}</p>
              {/if}
            </div>
            <div>
              <label class="input-label" for="birthDate">{$_('contest.wizard.competitor.birth_date')}</label>
              <input id="birthDate" type="date" class="input-field" bind:value={competitorDraft.birthDate} />
              {#if validationErrors['birthDate']}
                <p class="error-message">{validationErrors['birthDate']}</p>
              {/if}
            </div>
            <div>
              <label class="input-label" for="gender">{$_('contest.wizard.competitor.gender')}</label>
              <select id="gender" class="input-field" bind:value={competitorDraft.gender}>
                {#each GENDERS as gender}
                  <option value={gender}>{$_(GENDER_LABEL_KEYS[gender])}</option>
                {/each}
              </select>
            </div>
            <div>
              <label class="input-label" for="club">{$_('contest.wizard.competitor.club')}</label>
              <input
                id="club"
                class="input-field"
                bind:value={competitorDraft.club}
                placeholder={$_('contest.wizard.competitor.club_placeholder')}
              />
            </div>
            <div>
              <label class="input-label" for="city">{$_('contest.wizard.competitor.city')}</label>
              <input
                id="city"
                class="input-field"
                bind:value={competitorDraft.city}
                placeholder={$_('contest.wizard.competitor.city_placeholder')}
              />
            </div>
            <div>
              <label class="input-label" for="bodyweight">{$_('contest.wizard.competitor.bodyweight')}</label>
              <input
                id="bodyweight"
                type="number"
                step="0.1"
                min="0"
                class="input-field"
                bind:value={competitorDraft.bodyweight}
                on:wheel={handleBodyweightWheel}
              />
              {#if validationErrors['bodyweight']}
                <p class="error-message">{validationErrors['bodyweight']}</p>
              {/if}
            </div>
            <div>
              <label class="input-label" for="rackHeightSquat">{$_('contest.wizard.competitor.rack_squat')}</label>
              <input
                id="rackHeightSquat"
                type="number"
                class="input-field"
                bind:value={competitorDraft.rackHeightSquat}
              />
            </div>
            <div>
              <label class="input-label" for="rackHeightBench">{$_('contest.wizard.competitor.rack_bench')}</label>
              <input
                id="rackHeightBench"
                type="number"
                class="input-field"
                bind:value={competitorDraft.rackHeightBench}
              />
            </div>
          </div>

          <fieldset class="space-y-2">
            <legend class="input-label">{$_('contest.wizard.competitor.equipment.legend')}</legend>
            <div class="flex flex-wrap gap-3 text-body">
              <label class="flex items-center gap-2">
                <input type="checkbox" bind:checked={competitorDraft.equipmentM} />
                {$_('contest.wizard.competitor.equipment.multi')}
              </label>
              <label class="flex items-center gap-2">
                <input type="checkbox" bind:checked={competitorDraft.equipmentSm} />
                {$_('contest.wizard.competitor.equipment.single')}
              </label>
              <label class="flex items-center gap-2">
                <input type="checkbox" bind:checked={competitorDraft.equipmentT} />
                {$_('contest.wizard.competitor.equipment.wraps')}
              </label>
            </div>
          </fieldset>

          <div class="flex gap-3">
            <button class="btn-primary" type="button" on:click={addCompetitorDraft}>
              {$_('contest.wizard.competitor.add_button')}
            </button>
            <button class="btn-secondary" type="button" on:click={resetCompetitorDraft}>
              {$_('contest.wizard.competitor.reset_button')}
            </button>
          </div>

          {#if competitorDrafts.length > 0}
            <div class="space-y-3">
              <h3 class="text-h3 text-text-primary">{$_('contest.wizard.drafts.title')}</h3>
              {#each competitorDrafts as competitor, index}
                <div class="bg-element-bg border border-border-color p-4 flex justify-between items-center">
                  <div>
                    <p class="text-body text-text-primary font-semibold">
                      {competitor.firstName} {competitor.lastName}
                    </p>
                    <p class="text-caption text-text-secondary">
                      {$_('contest.wizard.drafts.meta', {
                        values: {
                          birthDate: competitor.birthDate,
                          gender: $_(GENDER_LABEL_KEYS[competitor.gender]),
                          bodyweight: competitor.bodyweight,
                        }
                      })}
                    </p>
                    <p class="text-caption text-text-secondary">
                      {$_('contest.wizard.drafts.club_city', {
                        values: {
                          club: competitor.club.trim() ? competitor.club : $_('contest.wizard.drafts.no_club'),
                          city: competitor.city.trim() ? competitor.city : $_('contest.wizard.drafts.no_city'),
                        }
                      })}
                    </p>
                  </div>
                  <button class="btn-secondary" type="button" on:click={() => removeCompetitorDraft(index)}>
                    {$_('contest.wizard.drafts.remove')}
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
