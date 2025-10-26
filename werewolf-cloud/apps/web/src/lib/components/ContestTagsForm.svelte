<script lang="ts">
  import { createEventDispatcher } from 'svelte';

  export type ContestTagRowView = {
    id: string;
    label: string;
    isMandatory: boolean;
    error?: string | null;
    inputDisabled?: boolean;
    showReset?: boolean;
    showSave?: boolean;
    showDelete?: boolean;
    resetDisabled?: boolean;
    saveDisabled?: boolean;
    deleteDisabled?: boolean;
    saving?: boolean;
    deleting?: boolean;
  };

  export let title = '';
  export let description = '';
  export let mandatoryHint = '';
  export let loadingMessage = '';
  export let emptyMessage = '';
  export let orderHint = '';
  export let labelFieldTitle = '';
  export let newTagFieldTitle = '';
  export let inputMaxLength: number | undefined = 64;

  export let rows: ContestTagRowView[] = [];
  export let tagsLoading = false;
  export let tagsError: string | null = null;

  export let newTagLabel = '';
  export let newTagPlaceholder = '';
  export let newTagError: string | null = null;
  export let newTagDisabled = false;
  export let newTagSaving = false;

  export let actionLabels = {
    reset: '',
    save: '',
    saving: '',
    delete: '',
    deleting: '',
  };

  export let addButtonLabel = '';
  export let addButtonLoadingLabel = '';

  export let resetButtonClass = 'btn-secondary px-3 py-1';
  export let saveButtonClass = 'btn-primary px-3 py-1';
  export let deleteButtonClass = 'btn-secondary px-3 py-1';
  export let addButtonClass = 'btn-secondary px-3 py-1';

  export let showNewTagForm = true;

  const dispatch = createEventDispatcher<{
    rowChange: { id: string; value: string };
    reset: { id: string };
    save: { id: string };
    delete: { id: string };
    add: void;
    newTagInput: { value: string };
  }>();

  function handleInput(id: string, event: Event) {
    const input = event.currentTarget as HTMLInputElement | null;
    dispatch('rowChange', { id, value: input?.value ?? '' });
  }

  function handleNewTagInput(event: Event) {
    const input = event.currentTarget as HTMLInputElement | null;
    dispatch('newTagInput', { value: input?.value ?? '' });
  }
</script>

<div class="space-y-4 rounded-lg border border-border-color bg-element-bg/40 p-4">
  <div class="space-y-2">
    <h4 class="text-h4 text-text-primary">{title}</h4>
    {#if description}
      <p class="text-caption text-text-secondary">{description}</p>
    {/if}
  </div>

  {#if tagsError}
    <div class="border border-status-error bg-status-error/10 text-status-error px-3 py-2 text-sm">
      {tagsError}
    </div>
  {/if}

  {#if tagsLoading}
    <p class="text-caption text-text-secondary">{loadingMessage}</p>
  {:else if rows.length === 0}
    <p class="text-caption text-text-secondary">{emptyMessage}</p>
  {:else}
    <div class="space-y-3">
      {#each rows as row (row.id)}
        <div class="space-y-2 rounded-lg border border-border-color p-4">
          <div class="flex flex-col gap-2">
            <label class="input-label" for={`contest-tag-${row.id}`}>
              {labelFieldTitle}
            </label>
            <input
              id={`contest-tag-${row.id}`}
              class="input-field"
              value={row.label}
              on:input={(event) => handleInput(row.id, event)}
              disabled={row.inputDisabled}
              maxlength={inputMaxLength}
            />
          </div>
          {#if row.isMandatory && mandatoryHint}
            <p class="text-caption text-text-secondary">{mandatoryHint}</p>
          {/if}
          {#if row.error}
            <p class="error-message">{row.error}</p>
          {/if}
          <div class="flex flex-wrap gap-2">
            {#if row.showReset}
              <button
                type="button"
                class={resetButtonClass}
                on:click={() => dispatch('reset', { id: row.id })}
                disabled={row.resetDisabled}
              >
                {actionLabels.reset}
              </button>
            {/if}
            {#if row.showSave}
              <button
                type="button"
                class={saveButtonClass}
                on:click={() => dispatch('save', { id: row.id })}
                disabled={row.saveDisabled}
              >
                {row.saving ? actionLabels.saving : actionLabels.save}
              </button>
            {/if}
            {#if row.showDelete}
              <button
                type="button"
                class={deleteButtonClass}
                on:click={() => dispatch('delete', { id: row.id })}
                disabled={row.deleteDisabled}
              >
                {row.deleting ? actionLabels.deleting : actionLabels.delete}
              </button>
            {/if}
          </div>
        </div>
      {/each}
    </div>
  {/if}

  {#if showNewTagForm}
    <div class="space-y-2 rounded-lg border border-dashed border-border-color p-4">
      <div class="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
        <div class="flex-1">
          <label class="input-label" for="contest-tag-new-field">{newTagFieldTitle}</label>
          <input
            id="contest-tag-new-field"
            class="input-field"
            value={newTagLabel}
            placeholder={newTagPlaceholder}
            disabled={newTagDisabled}
            on:input={handleNewTagInput}
            maxlength={inputMaxLength}
          />
        </div>
        <div class="flex justify-end md:pb-1">
          <button
            type="button"
            class={addButtonClass}
            on:click={() => dispatch('add')}
            disabled={newTagDisabled}
          >
            {newTagSaving ? addButtonLoadingLabel : addButtonLabel}
          </button>
        </div>
      </div>
      {#if orderHint}
        <p class="text-caption text-text-secondary">{orderHint}</p>
      {/if}
      {#if newTagError}
        <p class="error-message">{newTagError}</p>
      {/if}
    </div>
  {/if}
</div>
