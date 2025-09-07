<script lang="ts">
  import { invoke } from '@tauri-apps/api/core';
  import { _ } from 'svelte-i18n';
  import type { Contest } from '../types/contest';
  import { VALIDATION } from '../constants/validation';

  export let contest: Contest;
  export let onSave: () => void = () => {};
  export let onClose: () => void = () => {};

  let loading = false;
  let error = '';
  let successMessage = '';
  let validationErrors: Record<string, string> = {};

  // Contest details form data
  let formData = {
    name: contest.name || '',
    date: contest.date || '',
    location: contest.location || '',
    discipline: contest.discipline || 'Powerlifting',
    competitionType: contest.competitionType || '',
    organizer: contest.organizer || '',
    federationRules: contest.federationRules || '',
    notes: contest.notes || ''
  };

  function validateForm(): boolean {
    validationErrors = {};

    // Name validation
    if (!formData.name.trim()) {
      validationErrors['name'] = $_('validation.name_required');
    } else if (formData.name.trim().length < VALIDATION.MIN_NAME_LENGTH) {
      validationErrors['name'] = $_('validation.name_too_short');
    }

    // Date validation
    if (!formData.date) {
      validationErrors['date'] = $_('validation.date_required');
    }

    // Location validation
    if (!formData.location.trim()) {
      validationErrors['location'] = $_('validation.location_required');
    } else if (formData.location.trim().length < VALIDATION.MIN_LOCATION_LENGTH) {
      validationErrors['location'] = $_('validation.location_min_length');
    }

    return Object.keys(validationErrors).length === 0;
  }

  async function saveContestDetails() {
    loading = true;
    error = '';
    successMessage = '';

    if (!validateForm()) {
      loading = false;
      return;
    }

    try {
      const updatedContest = {
        ...contest,
        name: formData.name,
        date: formData.date,
        location: formData.location,
        discipline: formData.discipline,
        competitionType: formData.competitionType || null,
        organizer: formData.organizer || null,
        federationRules: formData.federationRules || null,
        notes: formData.notes || null
      };

      await invoke('contest_update', { 
        contestId: contest.id, 
        contest: updatedContest 
      });

      successMessage = $_('contest.saved_successfully');
      onSave();
      onClose();
    } catch (err) {
      error = $_('contest.save_error');
      console.error('Error saving contest:', err);
    } finally {
      loading = false;
    }
  }

  export { saveContestDetails, loading, error, successMessage, formData, validationErrors };
</script>

<!-- Contest Details Form -->
<div class="space-y-4">
  <!-- Name -->
  <div>
    <label class="input-label" for="contest-name">{$_('contest.name_label')}</label>
    <input
      id="contest-name"
      type="text"
      bind:value={formData.name}
      class="input-field w-full {validationErrors['name'] ? 'border-red-500' : ''}"
      placeholder={$_('contest.name_placeholder')}
      required
    />
    {#if validationErrors['name']}
      <div class="text-red-500 text-sm mt-1">{validationErrors['name']}</div>
    {/if}
  </div>

  <!-- Date and Location -->
  <div class="grid grid-cols-2 gap-4">
    <div>
      <label class="input-label" for="contest-date">{$_('contest.date_label')}</label>
      <input
        id="contest-date"
        type="date"
        bind:value={formData.date}
        class="input-field w-full {validationErrors['date'] ? 'border-red-500' : ''}"
        required
      />
      {#if validationErrors['date']}
        <div class="text-red-500 text-sm mt-1">{validationErrors['date']}</div>
      {/if}
    </div>
    <div>
      <label class="input-label" for="contest-location">{$_('contest.location_label')}</label>
      <input
        id="contest-location"
        type="text"
        bind:value={formData.location}
        class="input-field w-full {validationErrors['location'] ? 'border-red-500' : ''}"
        placeholder={$_('contest.location_placeholder')}
        required
      />
      {#if validationErrors['location']}
        <div class="text-red-500 text-sm mt-1">{validationErrors['location']}</div>
      {/if}
    </div>
  </div>

  <!-- Discipline -->
  <div>
    <label class="input-label" for="contest-discipline">{$_('contest.discipline_label')}</label>
    <select
      id="contest-discipline"
      bind:value={formData.discipline}
      class="input-field w-full"
    >
      <option value="Powerlifting">{$_('disciplines.Powerlifting')}</option>
      <option value="Bench">{$_('disciplines.Bench')}</option>
      <option value="Squat">{$_('disciplines.Squat')}</option>
      <option value="Deadlift">{$_('disciplines.Deadlift')}</option>
    </select>
  </div>

  <!-- Competition Type -->
  <div>
    <label class="input-label" for="competition-type">{$_('contest.competition_type_label')}</label>
    <input
      id="competition-type"
      type="text"
      bind:value={formData.competitionType}
      class="input-field w-full"
      placeholder={$_('contest.competition_type_placeholder')}
    />
  </div>

  <!-- Organizer -->
  <div>
    <label class="input-label" for="organizer">{$_('contest.organizer_label')}</label>
    <input
      id="organizer"
      type="text"
      bind:value={formData.organizer}
      class="input-field w-full"
      placeholder={$_('contest.organizer_placeholder')}
    />
  </div>

  <!-- Federation Rules -->
  <div>
    <label class="input-label" for="federation-rules">{$_('contest.federation_rules_label')}</label>
    <input
      id="federation-rules"
      type="text"
      bind:value={formData.federationRules}
      class="input-field w-full"
      placeholder={$_('contest.federation_rules_placeholder')}
    />
  </div>

  <!-- Notes -->
  <div>
    <label class="input-label" for="notes">{$_('contest.notes_label')}</label>
    <textarea
      id="notes"
      bind:value={formData.notes}
      class="input-field w-full"
      rows="3"
      placeholder={$_('contest.notes_placeholder')}
    ></textarea>
  </div>
</div>