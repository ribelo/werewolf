<script lang="ts">
  import { get } from 'svelte/store';
  import { _ } from 'svelte-i18n';
  import { apiClient, ApiError } from '$lib/api';
  import { toast } from '$lib/ui/toast';
  import type { ContestDetail, ContestTag } from '$lib/types';
  import type { LiftKind } from '$lib/contest-table';

  const translateStore = _;
  type MessageValues = Record<string, string | number | boolean | Date | null | undefined>;
  const t = (key: string, values?: MessageValues) => {
    const translate = get(translateStore);
    return translate(key, values ? { values } : undefined);
  };

  const AVAILABLE_EVENTS: LiftKind[] = ['Squat', 'Bench', 'Deadlift'];
  const EVENT_LABEL_KEYS: Record<LiftKind, string> = {
    Squat: 'contest.wizard.events.squat',
    Bench: 'contest.wizard.events.bench',
    Deadlift: 'contest.wizard.events.deadlift',
  };
  const MANDATORY_TAG_LABEL = 'Open';


  export let contest: ContestDetail;
  export let initialEvents: LiftKind[] = [...AVAILABLE_EVENTS];
  export let contestTags: ContestTag[] = [];
  export let onClose: (result?: ContestDetail) => void = () => {};

  let form = {
    name: contest?.name ?? '',
    date: contest?.date ?? '',
    location: contest?.location ?? '',
    organizer: contest?.organizer ?? '',
    federationRules: contest?.federationRules ?? '',
    notes: contest?.notes ?? '',
  };

  let selectedEvents: LiftKind[] = deriveInitialEvents(initialEvents);
  let errors: Record<string, string> = {};
  let isSaving = false;
  let statusMessage: string | null = null;
  let tagRowsInitialised = false;

  type TagRow = {
    id: string;
    label: string;
    originalLabel: string;
    isMandatory: boolean;
    saving: boolean;
    deleting: boolean;
    error: string | null;
  };

  let tagRows: TagRow[] = [];
  let tagsLoading = false;
  let tagsError: string | null = null;
  let newTagLabel = '';
  let newTagSaving = false;
  let newTagError: string | null = null;


  function deriveInitialEvents(events: LiftKind[]): LiftKind[] {
    const normalised = Array.isArray(events) && events.length > 0 ? events : [...AVAILABLE_EVENTS];
    return AVAILABLE_EVENTS.filter((event) => normalised.includes(event));
  }

  function toggleEvent(event: LiftKind) {
    if (selectedEvents.includes(event)) {
      const remaining = selectedEvents.filter((entry) => entry !== event);
      selectedEvents = remaining.length > 0 ? remaining : [...selectedEvents];
    } else {
      selectedEvents = [...selectedEvents, event].sort(
        (a, b) => AVAILABLE_EVENTS.indexOf(a) - AVAILABLE_EVENTS.indexOf(b)
      );
    }
    errors = {};
  }

  function computeDiscipline(events: LiftKind[]): 'Bench' | 'Squat' | 'Deadlift' | 'Powerlifting' {
    if (!events || events.length === 0) {
      return 'Powerlifting';
    }
    if (events.length >= 2) {
      return 'Powerlifting';
    }
    return events[0] ?? 'Powerlifting';
  }

  function computeCompetitionType(events: LiftKind[]): string | null {
    if (!events || events.length === 0) {
      return null;
    }
    return events.join(', ');
  }

  function mapTagToRow(tag: ContestTag): TagRow {
    return {
      id: tag.id,
      label: tag.label,
      originalLabel: tag.label,
      isMandatory: tag.label === MANDATORY_TAG_LABEL,
      saving: false,
      deleting: false,
      error: null,
    };
  }

  function setTagRows(tags: ContestTag[]) {
    tagRows = (tags ?? []).map(mapTagToRow);
    tagRowsInitialised = true;
  }

  $: if (!tagRowsInitialised && Array.isArray(contestTags)) {
    setTagRows(contestTags);
  }

  function hasTagChanges(row: TagRow): boolean {
    return row.label.trim() !== row.originalLabel;
  }

  function resetTagRow(row: TagRow) {
    row.label = row.originalLabel;
    row.error = null;
  }

  async function refreshTags() {
    tagsLoading = true;
    tagsError = null;
    try {
      const response = await apiClient.get<ContestTag[]>(`/contests/${contest.id}/tags`);
      if (response.error) {
        throw new Error(response.error);
      }
      setTagRows(response.data ?? []);
    } catch (error) {
      if (error instanceof ApiError) {
        tagsError = error.message;
      } else if (error instanceof Error) {
        tagsError = error.message;
      } else {
        tagsError = t('contest_edit.tags.load_failed');
      }
    } finally {
      tagsLoading = false;
    }
  }

  async function saveTagRow(row: TagRow) {
    if (row.isMandatory) {
      row.error = t('contest_edit.tags.mandatory_hint');
      return;
    }

    const label = row.label.trim();
    if (!label) {
      row.error = t('contest_edit.tags.validation.label_required');
      return;
    }

    if (!hasTagChanges(row)) {
      row.error = t('contest_edit.tags.validation.no_changes');
      return;
    }

    const payload: { label: string } = { label };

    row.saving = true;
    row.error = null;
    try {
      const response = await apiClient.patch<ContestTag>(
        `/contests/${contest.id}/tags/${row.id}`,
        payload
      );
      if (response.error) {
        throw new Error(response.error);
      }
      toast.success(t('contest_edit.tags.toast.updated'));
      await refreshTags();
    } catch (error) {
      if (error instanceof ApiError) {
        row.error = error.message;
      } else if (error instanceof Error) {
        row.error = error.message;
      } else {
        row.error = t('contest_edit.tags.unknown_error');
      }
    } finally {
      row.saving = false;
    }
  }

  async function deleteTagRow(row: TagRow) {
    if (row.isMandatory) {
      row.error = t('contest_edit.tags.mandatory_hint');
      return;
    }

    const confirmed =
      typeof window === 'undefined'
        ? true
        : window.confirm(t('contest_edit.tags.confirm_delete', { label: row.originalLabel }));

    if (!confirmed) {
      return;
    }

    row.deleting = true;
    row.error = null;
    try {
      const response = await apiClient.delete<{ success: boolean }>(
        `/contests/${contest.id}/tags/${row.id}`
      );
      if (response.error) {
        throw new Error(response.error);
      }
      toast.success(t('contest_edit.tags.toast.deleted'));
      await refreshTags();
    } catch (error) {
      if (error instanceof ApiError) {
        row.error = error.message;
      } else if (error instanceof Error) {
        row.error = error.message;
      } else {
        row.error = t('contest_edit.tags.unknown_error');
      }
    } finally {
      row.deleting = false;
    }
  }

  async function createTag() {
    const label = newTagLabel.trim();
    if (!label) {
      newTagError = t('contest_edit.tags.validation.label_required');
      return;
    }

    newTagSaving = true;
    newTagError = null;
    try {
      const response = await apiClient.post<ContestTag>(`/contests/${contest.id}/tags`, {
        label,
      });
      if (response.error) {
        throw new Error(response.error);
      }
      toast.success(t('contest_edit.tags.toast.created', { label }));
      newTagLabel = '';
      await refreshTags();
    } catch (error) {
      if (error instanceof ApiError) {
        newTagError = error.message;
      } else if (error instanceof Error) {
        newTagError = error.message;
      } else {
        newTagError = t('contest_edit.tags.unknown_error');
      }
    } finally {
      newTagSaving = false;
    }
  }

  function validate(): boolean {
    const nextErrors: Record<string, string> = {};

    if (!form.name.trim()) {
      nextErrors.name = t('contest.wizard.validation.name_required');
    }
    if (!form.date) {
      nextErrors.date = t('contest.wizard.validation.date_required');
    }
    if (!form.location.trim()) {
      nextErrors.location = t('contest.wizard.validation.location_required');
    }
    if (selectedEvents.length === 0) {
      nextErrors.events = t('contest_edit.validation.events_required');
    }

    errors = nextErrors;
    return Object.keys(nextErrors).length === 0;
  }

  async function handleSubmit() {
    statusMessage = null;
    if (!validate()) {
      return;
    }

    isSaving = true;
    try {
      const trimmedNotes = form.notes.trim();
      const trimmedRules = form.federationRules.trim();
      const trimmedOrganizer = form.organizer.trim();

      const updatedDiscipline = computeDiscipline(selectedEvents);
      const updatedCompetitionType = computeCompetitionType(selectedEvents);

      const payload = {
        name: form.name.trim(),
        date: form.date,
        location: form.location.trim(),
        organizer: trimmedOrganizer || null,
        federationRules: trimmedRules || null,
        notes: trimmedNotes || null,
        discipline: updatedDiscipline,
        competitionType: updatedCompetitionType,
      };

      const response = await apiClient.patch<ContestDetail>(`/contests/${contest.id}`, payload);
      if (response.error) {
        throw new Error(response.error);
      }

      const updatedContest: ContestDetail = response.data
        ? { ...response.data }
        : {
            ...contest,
            ...payload,
            organizer: payload.organizer ?? undefined,
            federationRules: payload.federationRules ?? undefined,
            notes: payload.notes ?? undefined,
          };

      onClose(updatedContest);
    } catch (error) {
      if (error instanceof ApiError) {
        statusMessage = error.message;
      } else if (error instanceof Error) {
        statusMessage = error.message;
      } else {
        statusMessage = t('contest_edit.toast_failed');
      }
    } finally {
      isSaving = false;
    }
  }
</script>

<div class="space-y-6">
  {#if statusMessage}
    <div class="bg-status-error/20 border border-status-error text-status-error px-4 py-2 text-sm">
      {statusMessage}
    </div>
  {/if}

  <form class="space-y-6" on:submit|preventDefault={handleSubmit}>
    <div class="grid gap-4 md:grid-cols-2">
      <div>
        <label class="input-label" for="contest-name">
          {t('contest.wizard.fields.name.label')}
        </label>
        <input
          id="contest-name"
          class="input-field"
          bind:value={form.name}
          placeholder={t('contest.wizard.fields.name.placeholder')}
          required
        />
        {#if errors.name}
          <p class="error-message">{errors.name}</p>
        {/if}
      </div>

      <div>
        <label class="input-label" for="contest-date">
          {t('contest.wizard.fields.date.label')}
        </label>
        <input
          id="contest-date"
          class="input-field"
          type="date"
          bind:value={form.date}
          required
        />
        {#if errors.date}
          <p class="error-message">{errors.date}</p>
        {/if}
      </div>
    </div>

    <div class="grid gap-4 md:grid-cols-2">
      <div>
        <label class="input-label" for="contest-location">
          {t('contest.wizard.fields.location.label')}
        </label>
        <input
          id="contest-location"
          class="input-field"
          bind:value={form.location}
          placeholder={t('contest.wizard.fields.location.placeholder')}
          required
        />
        {#if errors.location}
          <p class="error-message">{errors.location}</p>
        {/if}
      </div>

      <div>
        <label class="input-label" for="contest-organizer">
          {t('contest.wizard.fields.organizer.label')}
        </label>
        <input
          id="contest-organizer"
          class="input-field"
          bind:value={form.organizer}
          placeholder={t('contest.wizard.fields.organizer.placeholder')}
        />
      </div>
    </div>

    <div class="grid gap-4 md:grid-cols-2">
      <div>
        <label class="input-label" for="contest-rules">
          {t('contest.wizard.fields.federation_rules.label')}
        </label>
        <input
          id="contest-rules"
          class="input-field"
          bind:value={form.federationRules}
          placeholder={t('contest.wizard.fields.federation_rules.placeholder')}
        />
      </div>

      <div class="flex flex-col gap-2">
        <span class="input-label">{t('contest.wizard.fields.events.label')}</span>
        <div class="flex flex-wrap gap-3">
          {#each AVAILABLE_EVENTS as eventName}
            <label class="flex items-center gap-2 text-body">
              <input
                type="checkbox"
                class="accent-primary-red"
                checked={selectedEvents.includes(eventName)}
                on:change={() => toggleEvent(eventName)}
              />
              {t(EVENT_LABEL_KEYS[eventName])}
            </label>
          {/each}
        </div>
        <p class="text-caption text-text-secondary">
          {t('contest.wizard.messages.events_hint')}
        </p>
        {#if errors.events}
          <p class="error-message">{errors.events}</p>
        {/if}
      </div>
    </div>

    <div>
      <label class="input-label" for="contest-notes">
        {t('contest.wizard.fields.notes.label')}
      </label>
      <textarea
        id="contest-notes"
        class="input-field"
        rows="3"
        bind:value={form.notes}
        placeholder={t('contest.wizard.fields.notes.placeholder')}
      />
    </div>

    <div class="space-y-4">
      <div>
        <span class="input-label">{t('contest_edit.tags.title')}</span>
        <p class="text-caption text-text-secondary">{t('contest_edit.tags.description')}</p>
      </div>

      {#if tagsError}
        <div class="border border-status-error bg-status-error/10 text-status-error px-3 py-2 text-sm">
          {tagsError}
        </div>
      {/if}

      {#if tagsLoading}
        <p class="text-caption text-text-secondary">{t('contest_edit.tags.loading')}</p>
      {:else if tagRows.length === 0}
        <p class="text-caption text-text-secondary">{t('contest_edit.tags.empty')}</p>
      {:else}
        <div class="space-y-3">
          {#each tagRows as row, index (row.id)}
            <div
              class="border border-border-color rounded-lg p-4 space-y-3"
            >
              <div class="grid gap-3 md:grid-cols-[minmax(0,1fr)] md:items-start">
                <div class="flex flex-col gap-2">
                  <label class="input-label" for={`contest-tag-label-${row.id}`}>{t('contest_edit.tags.fields.label')}</label>
                  <input
                    id={`contest-tag-label-${row.id}`}
                    class="input-field"
                    bind:value={row.label}
                    disabled={row.isMandatory || row.saving || row.deleting || tagsLoading}
                    maxlength="64"
                    on:input={() => (row.error = null)}
                  />
                </div>
              </div>
              {#if row.error}
                <p class="error-message">{row.error}</p>
              {/if}
              <div class="flex flex-wrap gap-2">
                {#if row.isMandatory}
                  <span class="text-caption text-text-secondary">{t('contest_edit.tags.mandatory_hint')}</span>
                {:else}
                  <button
                    type="button"
                    class="btn-secondary px-3 py-1"
                    on:click={() => resetTagRow(row)}
                    disabled={row.saving || row.deleting || tagsLoading || !hasTagChanges(row)}
                  >
                    {t('contest_edit.tags.actions.reset')}
                  </button>
                  <button
                    type="button"
                    class="btn-primary px-3 py-1"
                    on:click={() => saveTagRow(row)}
                    disabled={row.saving || row.deleting || tagsLoading || !hasTagChanges(row)}
                  >
                    {row.saving ? t('contest_edit.tags.actions.saving') : t('contest_edit.tags.actions.save')}
                  </button>
                  <button
                    type="button"
                    class="btn-danger px-3 py-1"
                    on:click={() => deleteTagRow(row)}
                    disabled={row.saving || row.deleting || tagsLoading}
                  >
                    {row.deleting ? t('contest_edit.tags.actions.deleting') : t('contest_edit.tags.actions.delete')}
                  </button>
                {/if}
              </div>
            </div>
          {/each}
        </div>
      {/if}

      <div class="border border-dashed border-border-color rounded-lg p-4 space-y-3">
        <div class="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div class="flex-1 flex flex-col gap-2">
            <label class="input-label" for="contest-new-tag-label">{t('contest_edit.tags.new.label')}</label>
            <input
              id="contest-new-tag-label"
              class="input-field"
              bind:value={newTagLabel}
              placeholder={t('contest_edit.tags.new.placeholder')}
              maxlength="64"
              disabled={newTagSaving || tagsLoading}
              on:input={() => (newTagError = null)}
            />
          </div>
          <div class="flex justify-end">
            <button
              type="button"
              class="btn-primary px-3 py-1"
              on:click={createTag}
              disabled={newTagSaving || tagsLoading}
            >
              {newTagSaving ? t('contest_edit.tags.new.saving') : t('contest_edit.tags.new.add')}
            </button>
          </div>
        </div>
        <p class="text-caption text-text-secondary">{t('contest_edit.tags.new.order_hint')}</p>
        {#if newTagError}
          <p class="error-message">{newTagError}</p>
        {/if}
      </div>
    </div>

    <div class="flex justify-end gap-3">
      <button type="button" class="btn-secondary" on:click={() => onClose()}>
        {t('contest_edit.actions.cancel')}
      </button>
      <button type="submit" class="btn-primary" disabled={isSaving}>
        {#if isSaving}
          {t('contest_edit.actions.saving')}
        {:else}
          {t('contest_edit.actions.save')}
        {/if}
      </button>
    </div>
  </form>
</div>
