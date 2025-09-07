<script lang="ts">
  import { invoke } from '@tauri-apps/api/core';
  import { _ } from 'svelte-i18n';
  import { onMount, onDestroy } from 'svelte';
  import PhotoUpload from './PhotoUpload.svelte';

  interface Competitor {
    id: string;
    firstName: string;
    lastName: string;
    birthDate: string;
    gender: string;
    club?: string;
    city?: string;
    notes?: string;
    photoBase64?: string;
  }

  export let competitor: Competitor;
  export let onClose: () => void = () => {};
  export let onSave: () => void = () => {};

  let editForm = {
    firstName: competitor.firstName,
    lastName: competitor.lastName,
    birthDate: competitor.birthDate,
    gender: competitor.gender,
    club: competitor.club || '',
    city: competitor.city || '',
    notes: competitor.notes || '',
    photoBase64: competitor.photoBase64 || undefined,
    photoFilename: undefined as string | undefined
  };

  let isLoading = false;
  let error = '';
  let successMessage = '';

  function handlePhotoSelected(event: CustomEvent<{ base64: string; filename: string }>) {
    editForm.photoBase64 = event.detail.base64;
    editForm.photoFilename = event.detail.filename;
  }

  function handlePhotoRemoved() {
    editForm.photoBase64 = undefined;
    editForm.photoFilename = undefined;
  }

  async function handleSave() {
    // Basic validation
    if (!editForm.firstName.trim() || !editForm.lastName.trim() || !editForm.birthDate) {
      error = $_('competitor.validation_error');
      return;
    }

    isLoading = true;
    error = '';

    try {
      // Update competitor
      await invoke('competitor_update', {
        competitorId: competitor.id,
        competitor: {
          firstName: editForm.firstName.trim(),
          lastName: editForm.lastName.trim(),
          birthDate: editForm.birthDate,
          gender: editForm.gender,
          photoBase64: editForm.photoBase64 || null,
          photoFilename: editForm.photoFilename || null,
        }
      });

      successMessage = $_('competitor.update_success');
      setTimeout(() => {
        onSave();
        onClose();
      }, 1000);
    } catch (err) {
      console.error('Failed to update competitor:', err);
      error = `${$_('competitor.update_error')}: ${err}`;
    } finally {
      isLoading = false;
    }
  }

  function handleKeydown(event: KeyboardEvent) {
    if (event.key === 'Escape') {
      onClose();
    }
  }

  onMount(() => {
    document.body.style.overflow = 'hidden';
  });

  onDestroy(() => {
    document.body.style.overflow = '';
  });
</script>

<svelte:window on:keydown={handleKeydown} />

<div class="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50" on:click={onClose} on:keydown={(e) => { if (e.key === 'Escape') onClose(); }} role="presentation" tabindex="-1">
  <div class="bg-card-bg border-2 border-border-color rounded-lg p-6 max-w-2xl max-h-[90vh] w-full mx-4 flex flex-col" on:click|stopPropagation on:keydown|stopPropagation role="dialog" aria-modal="true" tabindex="-1">
    
    <!-- Header -->
    <div class="flex items-center justify-between mb-6">
      <h2 class="text-h2 text-text-primary">{$_('competitor.edit')}</h2>
      <button 
        class="text-text-secondary hover:text-text-primary text-2xl leading-none"
        on:click={onClose}
      >
        ×
      </button>
    </div>

    <!-- Form -->
    <div class="flex-1 overflow-y-auto">
      <div class="space-y-4">
        
        <!-- Name Fields -->
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label class="input-label" for="firstName">{$_('general.first_name')} *</label>
            <input
              id="firstName"
              type="text"
              class="input-field"
              bind:value={editForm.firstName}
              placeholder={$_('general.first_name')}
              disabled={isLoading}
            />
          </div>
          <div>
            <label class="input-label" for="lastName">{$_('general.last_name')} *</label>
            <input
              id="lastName"
              type="text"
              class="input-field"
              bind:value={editForm.lastName}
              placeholder={$_('general.last_name')}
              disabled={isLoading}
            />
          </div>
        </div>

        <!-- Birth Date and Gender -->
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label class="input-label" for="birthDate">{$_('general.birth_date')} *</label>
            <input
              id="birthDate"
              type="date"
              class="input-field"
              bind:value={editForm.birthDate}
              disabled={isLoading}
            />
          </div>
          <div>
            <label class="input-label" for="gender">{$_('general.gender')} *</label>
            <select
              id="gender"
              class="input-field"
              bind:value={editForm.gender}
              disabled={isLoading}
            >
              <option value="Male">{$_('general.male')}</option>
              <option value="Female">{$_('general.female')}</option>
            </select>
          </div>
        </div>

        <!-- Optional Fields -->
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label class="input-label" for="club">{$_('general.club')}</label>
            <input
              id="club"
              type="text"
              class="input-field"
              bind:value={editForm.club}
              placeholder={$_('general.club')}
              disabled={isLoading}
            />
          </div>
          <div>
            <label class="input-label" for="city">{$_('general.city')}</label>
            <input
              id="city"
              type="text"
              class="input-field"
              bind:value={editForm.city}
              placeholder={$_('general.city')}
              disabled={isLoading}
            />
          </div>
        </div>

        <!-- Notes -->
        <div>
          <label class="input-label" for="notes">{$_('general.notes')}</label>
          <textarea
            id="notes"
            class="input-field"
            rows="3"
            bind:value={editForm.notes}
            placeholder={$_('general.notes')}
            disabled={isLoading}
          ></textarea>
        </div>

        <!-- Photo -->
        <div>
          <label class="input-label" for="photo-upload">{$_('competitor.photo')}</label>
          <div id="photo-upload">
            <PhotoUpload
              currentPhoto={editForm.photoBase64 || null}
              on:photoSelected={handlePhotoSelected}
              on:photoRemoved={handlePhotoRemoved}
              disabled={isLoading}
            />
          </div>
        </div>

      </div>
    </div>

    <!-- Messages -->
    {#if error}
      <div class="mt-4 p-3 bg-red-900/50 border border-red-600 rounded text-red-200 text-sm">
        {error}
      </div>
    {/if}

    {#if successMessage}
      <div class="mt-4 p-3 bg-green-900/50 border border-green-600 rounded text-green-200 text-sm">
        {successMessage}
      </div>
    {/if}

    <!-- Buttons -->
    <div class="flex justify-end space-x-3 mt-6 pt-4 border-t border-border-color">
      <button
        type="button"
        class="btn-secondary"
        on:click={onClose}
        disabled={isLoading}
      >
        {$_('buttons.cancel')}
      </button>
      <button
        type="button"
        class="btn-primary"
        on:click={handleSave}
        disabled={isLoading}
      >
        {#if isLoading}
          <span class="loading-spinner"></span>
          {$_('buttons.saving')}
        {:else}
          {$_('buttons.save')}
        {/if}
      </button>
    </div>
  </div>
</div>

<style>
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
</style>