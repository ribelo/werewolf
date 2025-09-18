<script lang="ts">
  import { onMount } from 'svelte';
  import { apiClient } from '$lib/api';
  import type {
    CompetitorSummary,
    CompetitorDetail,
    CompetitorPhoto,
  } from '$lib/types';

  export let competitor: CompetitorSummary | null = null;
  export let mode: 'create' | 'edit' = 'create';
  export let onClose: () => void = () => {};
  export let onSaved: () => void = () => {};

  const genderOptions = ['Male', 'Female'];

  let detail: CompetitorDetail | null = null;
  let isLoading = false;
  let isSaving = false;
  let error: string | null = null;
  let success: string | null = null;

  let photo: CompetitorPhoto | null = null;
  let newPhotoBase64: string | null = null;
  let newPhotoFilename: string | null = null;
  let removeExistingPhoto = false;

  let reorderValue: number | null = null;

  let form = {
    firstName: '',
    lastName: '',
    birthDate: '',
    gender: 'Male',
    club: '',
    city: '',
    notes: '',
  };

  let fileInput: HTMLInputElement | null = null;

  onMount(async () => {
    if (mode === 'edit' && competitor) {
      await loadCompetitor(competitor.id);
    }
  });

  async function loadCompetitor(id: string) {
    isLoading = true;
    error = null;
    try {
      const [detailResp, photoResp] = await Promise.all([
        apiClient.get<CompetitorDetail>(`/competitors/${id}`),
        apiClient.get<CompetitorPhoto>(`/competitors/${id}/photo`).catch((err) => {
          // photo endpoint returns 404 when not present; ignore
          return { data: null, error: null } as any;
        }),
      ]);

      if (detailResp.data) {
        detail = detailResp.data;
        form = {
          firstName: detailResp.data.firstName,
          lastName: detailResp.data.lastName,
          birthDate: detailResp.data.birthDate,
          gender: detailResp.data.gender,
          club: detailResp.data.club ?? '',
          city: detailResp.data.city ?? '',
          notes: detailResp.data.notes ?? '',
        };
        reorderValue = detailResp.data.competitionOrder ?? null;
      } else if (detailResp.error) {
        error = detailResp.error;
      }

      if (photoResp && photoResp.data) {
        photo = photoResp.data;
      } else {
        photo = null;
      }
    } catch (err) {
      error = err instanceof Error ? err.message : 'Failed to load competitor';
    } finally {
      isLoading = false;
    }
  }

  function resetState() {
    if (competitor && detail) {
      form = {
        firstName: detail.firstName,
        lastName: detail.lastName,
        birthDate: detail.birthDate,
        gender: detail.gender,
        club: detail.club ?? '',
        city: detail.city ?? '',
        notes: detail.notes ?? '',
      };
      reorderValue = detail.competitionOrder ?? null;
      newPhotoBase64 = null;
      newPhotoFilename = null;
      removeExistingPhoto = false;
      success = null;
      error = null;
    }
  }

  function openFilePicker() {
    fileInput?.click();
  }

  function handleFileSelected(event: Event) {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      error = 'Please select an image file.';
      input.value = '';
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result === 'string') {
        const [, base64] = result.split('base64,');
        newPhotoBase64 = base64 ?? null;
        newPhotoFilename = file.name;
        removeExistingPhoto = false;
        success = null;
      }
    };
    reader.readAsDataURL(file);
  }

  function handleRemovePhoto() {
    if (photo || newPhotoBase64) {
      newPhotoBase64 = null;
      newPhotoFilename = null;
      if (photo) {
        removeExistingPhoto = true;
      }
    }
  }

  function validateForm(): boolean {
    if (!form.firstName.trim() || !form.lastName.trim()) {
      error = 'First and last name are required.';
      return false;
    }
    if (!form.birthDate) {
      error = 'Birth date is required.';
      return false;
    }
    if (!genderOptions.includes(form.gender)) {
      error = 'Gender must be Male or Female.';
      return false;
    }
    return true;
  }

  async function handleSubmit() {
    error = null;
    success = null;

    if (!validateForm()) {
      return;
    }

    isSaving = true;
    try {
      const payload = {
        firstName: form.firstName.trim(),
        lastName: form.lastName.trim(),
        birthDate: form.birthDate,
        gender: form.gender,
        club: form.club.trim() || null,
        city: form.city.trim() || null,
        notes: form.notes.trim() || null,
      };

      let targetId = competitor?.id ?? null;

      if (mode === 'create') {
        const response = await apiClient.post<{ id: string }>('/competitors', payload);
        if (response.error || !response.data) {
          throw new Error(response.error ?? 'Failed to create competitor');
        }
        targetId = response.data.id;
      } else if (mode === 'edit' && competitor) {
        const response = await apiClient.patch(`/competitors/${competitor.id}`, payload);
        if (response.error) {
          throw new Error(response.error);
        }
      }

      if (targetId && newPhotoBase64) {
        const response = await apiClient.put(`/competitors/${targetId}/photo`, {
          photoData: newPhotoBase64,
          filename: newPhotoFilename,
        });
        if (response.error) {
          throw new Error(response.error);
        }
      }

      if (targetId && removeExistingPhoto) {
        const response = await apiClient.delete(`/competitors/${targetId}/photo`);
        if (response.error) {
          throw new Error(response.error);
        }
        removeExistingPhoto = false;
      }

      if (
        mode === 'edit' &&
        targetId &&
        reorderValue !== null &&
        reorderValue > 0 &&
        reorderValue !== detail?.competitionOrder
      ) {
        const response = await apiClient.post(`/competitors/${targetId}/reorder`, {
          newOrder: reorderValue,
        });
        if (response.error) {
          throw new Error(response.error);
        }
      }

      success = mode === 'create' ? 'Competitor created successfully.' : 'Competitor updated successfully.';
      await onSaved();
      onClose();
    } catch (err) {
      error = err instanceof Error ? err.message : 'Failed to save competitor';
    } finally {
      isSaving = false;
    }
  }

  const photoSrc = () => {
    if (newPhotoBase64) {
      return `data:image/*;base64,${newPhotoBase64}`;
    }
    if (photo?.data) {
      return `data:image/${photo.format ?? 'webp'};base64,${photo.data}`;
    }
    return null;
  };
</script>

<div class="fixed inset-0 z-40 flex items-center justify-center">
  <button
    type="button"
    class="absolute inset-0 bg-black/70"
    aria-label="Close competitor modal"
    on:click={onClose}
  ></button>

  <div class="relative z-50 w-full max-w-3xl card focus:outline-none max-h-[90vh] overflow-hidden">
    <header class="flex items-center justify-between mb-6">
      <div>
        <h2 class="text-h2 text-text-primary">
          {mode === 'create' ? 'Add Competitor' : 'Edit Competitor'}
        </h2>
        {#if detail && mode === 'edit'}
          <p class="text-caption text-text-secondary uppercase tracking-[0.3em] mt-1">
            Updated {new Date(detail.updatedAt).toLocaleString()}
          </p>
        {/if}
      </div>
      <button type="button" class="btn-secondary px-3 py-1" on:click={onClose}>
        Close
      </button>
    </header>

    {#if error}
      <div class="bg-status-error/20 border border-status-error text-status-error px-4 py-2 mb-4 text-sm">
        {error}
      </div>
    {/if}

    {#if success}
      <div class="bg-status-success/20 border border-status-success text-green-100 px-4 py-2 mb-4 text-sm">
        {success}
      </div>
    {/if}

    {#if isLoading}
      <div class="py-12 text-center text-text-secondary text-body">
        Loading competitor details...
      </div>
    {:else}
      <form class="space-y-6 overflow-y-auto pr-2" on:submit|preventDefault={handleSubmit}>
        <div class="grid gap-4 md:grid-cols-2">
          <label class="flex flex-col gap-2">
            <span class="input-label">First Name *</span>
            <input
              class="input-field"
              bind:value={form.firstName}
              autocomplete="given-name"
              required
            />
          </label>
          <label class="flex flex-col gap-2">
            <span class="input-label">Last Name *</span>
            <input
              class="input-field"
              bind:value={form.lastName}
              autocomplete="family-name"
              required
            />
          </label>
          <label class="flex flex-col gap-2">
            <span class="input-label">Birth Date *</span>
            <input
              class="input-field"
              type="date"
              bind:value={form.birthDate}
              required
            />
          </label>
          <label class="flex flex-col gap-2">
            <span class="input-label">Gender *</span>
            <select class="input-field" bind:value={form.gender}>
              {#each genderOptions as option}
                <option value={option}>{option}</option>
              {/each}
            </select>
          </label>
          <label class="flex flex-col gap-2">
            <span class="input-label">Club</span>
            <input class="input-field" bind:value={form.club} placeholder="Club name" />
          </label>
          <label class="flex flex-col gap-2">
            <span class="input-label">City</span>
            <input class="input-field" bind:value={form.city} placeholder="City" />
          </label>
        </div>

        <label class="flex flex-col gap-2">
          <span class="input-label">Notes</span>
          <textarea class="input-field" rows={3} bind:value={form.notes} placeholder="Coach notes, best lifts, etc."></textarea>
        </label>

        <section class="grid gap-4 md:grid-cols-2">
          <div class="space-y-3">
            <h3 class="text-label text-text-secondary">Photo</h3>
            <input
              bind:this={fileInput}
              type="file"
              accept="image/*"
              class="hidden"
              on:change={handleFileSelected}
            />
            {#if photoSrc()}
              <div class="flex flex-col items-start gap-3">
                <img src={photoSrc()} alt="Competitor portrait" class="w-40 h-52 object-cover border border-border-color" />
                <div class="flex gap-3">
                  <button type="button" class="btn-primary px-3 py-1" on:click={openFilePicker} disabled={isSaving}>
                    Replace Photo
                  </button>
                  <button type="button" class="btn-secondary px-3 py-1" on:click={handleRemovePhoto} disabled={isSaving}>
                    Remove
                  </button>
                </div>
              </div>
            {:else}
              <div class="flex flex-col gap-3">
                <p class="text-caption text-text-secondary">No photo uploaded yet.</p>
                <button type="button" class="btn-primary px-3 py-1" on:click={openFilePicker} disabled={isSaving}>
                  Upload Photo
                </button>
              </div>
            {/if}
          </div>

          {#if mode === 'edit'}
            <div class="space-y-3">
              <h3 class="text-label text-text-secondary">Competition Order</h3>
              <p class="text-caption text-text-secondary">
                Adjust the queue order for lifter introductions and attempt rotation.
              </p>
              <input
                type="number"
                min="1"
                class="input-field w-32"
                bind:value={reorderValue}
              />
            </div>
          {/if}
        </section>

        <div class="flex items-center justify-between">
          <div class="space-x-3">
            <button type="button" class="btn-secondary px-4 py-2" on:click={() => (mode === 'edit' ? resetState() : onClose())} disabled={isSaving}>
              {mode === 'edit' ? 'Reset' : 'Cancel'}
            </button>
            <button type="button" class="btn-secondary px-4 py-2" on:click={onClose} disabled={isSaving}>
              Close
            </button>
          </div>
          <button type="submit" class="btn-primary px-6 py-2" disabled={isSaving}>
            {isSaving ? 'Saving…' : mode === 'create' ? 'Create Competitor' : 'Save Changes'}
          </button>
        </div>
      </form>
    {/if}
  </div>
</div>
