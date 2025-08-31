<script lang="ts">
  import { createEventDispatcher, onMount } from 'svelte';
  import { invoke } from '@tauri-apps/api/core';
  import { _ } from 'svelte-i18n';
  import { Check, X, Save, Plus, Minus } from 'lucide-svelte';

  // Types
  enum LiftType {
    Squat = 'Squat',
    Bench = 'Bench',
    Deadlift = 'Deadlift',
  }

  enum AttemptStatus {
    Pending = 'Pending',
    Good = 'Good',
    Bad = 'Bad',
  }

  interface Attempt {
    id: string;
    registrationId: string;
    liftType: LiftType;
    attemptNumber: number;
    weight: number;
    status: AttemptStatus;
  }

  // Props
  export let registrationId: string;
  export let competitorName: string;
  export let liftType: LiftType;
  export let attemptNumber: number;
  export let currentWeight: number = 0;
  export let currentStatus: AttemptStatus = AttemptStatus.Pending;

  // State
  let weightInput: HTMLInputElement;
  let weight = currentWeight || '';
  let submitting = false;
  let error = '';

  const dispatch = createEventDispatcher<{
    success: { registrationId: string; weight: number };
    good: { registrationId: string; weight: number };
    bad: { registrationId: string; weight: number };
  }>();

  // Update local state when props change
  $: if (currentWeight !== parseFloat(weight as string)) {
    weight = currentWeight || '';
  }

  // Submit weight change
  async function submitWeight() {
    if (!weight || submitting) return;
    
    const numericWeight = parseFloat(weight as string);
    if (isNaN(numericWeight) || numericWeight <= 0) {
      error = $_('validation.weight_required');
      focusInput();
      return;
    }

    submitting = true;
    error = '';

    try {
      await invoke('attempt_upsert_weight', {
        attempt: {
          registrationId,
          liftType,
          attemptNumber,
          weight: numericWeight,
        }
      });
      
      dispatch('success', { registrationId, weight: numericWeight });
    } catch (e) {
      error = `${$_('attempt.failed_update_weight')} ${e}`;
      console.error('Failed to update attempt weight:', e);
    } finally {
      submitting = false;
    }
  }

  // Mark attempt as good
  async function markGood() {
    if (!weight || submitting) return;
    
    const numericWeight = parseFloat(weight as string);
    if (isNaN(numericWeight)) return;

    await submitWeight(); // Ensure weight is saved first
    
    submitting = true;
    error = '';

    try {
      await invoke('attempt_update_result', {
        update: {
          attemptId: `${registrationId}_${liftType}_${attemptNumber}`, // This might need adjustment based on actual ID format
          status: AttemptStatus.Good,
        }
      });
      
      dispatch('good', { registrationId, weight: numericWeight });
    } catch (e) {
      error = `${$_('attempt.failed_mark_good')} ${e}`;
      console.error('Failed to mark attempt as good:', e);
    } finally {
      submitting = false;
    }
  }

  // Mark attempt as bad
  async function markBad() {
    if (!weight || submitting) return;
    
    const numericWeight = parseFloat(weight as string);
    if (isNaN(numericWeight)) return;

    await submitWeight(); // Ensure weight is saved first
    
    submitting = true;
    error = '';

    try {
      await invoke('attempt_update_result', {
        update: {
          attemptId: `${registrationId}_${liftType}_${attemptNumber}`,
          status: AttemptStatus.Bad,
        }
      });
      
      dispatch('bad', { registrationId, weight: numericWeight });
    } catch (e) {
      error = `${$_('attempt.failed_mark_bad')} ${e}`;
      console.error('Failed to mark attempt as bad:', e);
    } finally {
      submitting = false;
    }
  }

  // Handle keyboard shortcuts
  function handleKeydown(event: KeyboardEvent) {
    // Prevent default for our shortcuts
    if (event.ctrlKey || event.metaKey) {
      switch (event.key) {
        case 'Enter':
          event.preventDefault();
          markGood();
          break;
        case 'x':
          event.preventDefault();
          markBad();
          break;
        case 's':
          event.preventDefault();
          submitWeight();
          break;
      }
    } else {
      switch (event.key) {
        case 'Enter':
          event.preventDefault();
          submitWeight();
          break;
        case 'Escape':
          event.preventDefault();
          clearWeight();
          break;
        case '+':
          event.preventDefault();
          incrementWeight(2.5);
          break;
        case '-':
          event.preventDefault();
          incrementWeight(-2.5);
          break;
      }
    }
  }

  // Increment weight by amount
  function incrementWeight(amount: number) {
    const currentNum = parseFloat(weight as string) || 0;
    weight = (currentNum + amount).toString();
    focusInput();
  }

  // Clear weight
  function clearWeight() {
    weight = '';
    focusInput();
  }

  // Focus the input
  function focusInput() {
    requestAnimationFrame(() => {
      weightInput?.focus();
      weightInput?.select();
    });
  }

  // Get status color class
  function getStatusClass(status: AttemptStatus): string {
    switch (status) {
      case AttemptStatus.Good: return 'status-good';
      case AttemptStatus.Bad: return 'status-bad';
      default: return 'status-pending';
    }
  }

  // Focus on mount
  onMount(() => {
    if (currentStatus === AttemptStatus.Pending) {
      focusInput();
    }
  });
</script>

<div class="attempt-entry" class:active={currentStatus === AttemptStatus.Pending}>
  <!-- Competitor and Attempt Info -->
  <div class="attempt-header">
    <div class="competitor-name">{competitorName}</div>
    <div class="attempt-details">
      {$_(`disciplines.${liftType}`)} {$_('attempt.lift_attempt')} {attemptNumber}
    </div>
  </div>

  <!-- Weight Input -->
  <div class="weight-input-container">
    <input
      bind:this={weightInput}
      bind:value={weight}
      on:keydown={handleKeydown}
      on:blur={submitWeight}
      type="number"
      step="0.5"
      min="0.5"
      max="1000"
      class="weight-input"
      class:error={error}
      placeholder="{$_('attempt.weight_placeholder')}"
      disabled={submitting}
    />
    <div class="weight-controls">
      <button
        class="btn-increment"
        on:click={() => incrementWeight(2.5)}
        disabled={submitting}
        title="{$_('attempt.increment_add')}"
      >
        <Plus size={14} strokeWidth={2} />
      </button>
      <button
        class="btn-increment"
        on:click={() => incrementWeight(-2.5)}
        disabled={submitting}
        title="{$_('attempt.increment_remove')}"
      >
        <Minus size={14} strokeWidth={2} />
      </button>
    </div>
  </div>

  <!-- Status Display -->
  <div class="attempt-status {getStatusClass(currentStatus)}">
    {#if currentStatus === AttemptStatus.Good}
      {$_('attempt.status_good')}
    {:else if currentStatus === AttemptStatus.Bad}
      {$_('attempt.status_bad')}
    {:else if submitting}
      {$_('attempt.status_saving')}
    {:else}
      {$_('attempt.status_pending')}
    {/if}
  </div>

  <!-- Action Buttons -->
  <div class="action-buttons">
    <button
      class="btn-good"
      on:click={markGood}
      disabled={submitting || !weight}
      title="{$_('buttons.good')} (Ctrl+Enter)"
    >
      {#if submitting}
        ⏳
      {:else}
        <Check size={16} strokeWidth={2} class="inline mr-1" />
        {$_('buttons.good')}
      {/if}
    </button>
    
    <button
      class="btn-save"
      on:click={submitWeight}
      disabled={submitting || !weight}
      title="{$_('buttons.save')} (Enter)"
    >
      {#if submitting}
        ⏳
      {:else}
        <Save size={16} strokeWidth={2} class="inline mr-1" />
        {$_('buttons.save')}
      {/if}
    </button>

    <button
      class="btn-bad"
      on:click={markBad}
      disabled={submitting || !weight}
      title="{$_('buttons.bad')} (Ctrl+X)"
    >
      {#if submitting}
        ⏳
      {:else}
        <X size={16} strokeWidth={2} class="inline mr-1" />
        {$_('buttons.bad')}
      {/if}
    </button>
  </div>

  <!-- Error Display -->
  {#if error}
    <div class="error-message">
      {error}
    </div>
  {/if}

  <!-- Keyboard Shortcuts Help -->
  <div class="shortcuts-help">
    <strong>{$_('attempt.shortcuts_help')}</strong>
    {$_('attempt.shortcuts_text')}
  </div>
</div>

<style>
  .attempt-entry {
    border: 1px solid #d1d5db;
    border-radius: 0.375rem;
    padding: 0.75rem;
    background: white;
    transition: all 0.2s ease;
    width: 100%;
    margin: 0;
  }

  .attempt-entry.active {
    border-color: #3b82f6;
    box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.1);
    background-color: #f8faff;
  }

  .attempt-header {
    text-align: center;
    margin-bottom: 0.75rem;
  }

  .competitor-name {
    font-size: 1rem;
    font-weight: 600;
    color: #1f2937;
    margin-bottom: 0.125rem;
  }

  .attempt-details {
    font-size: 0.75rem;
    color: #6b7280;
    font-weight: 500;
  }

  .weight-input-container {
    display: flex;
    gap: 0.5rem;
    align-items: center;
    margin-bottom: 0.75rem;
  }

  .weight-input {
    flex: 1;
    font-size: 1.25rem;
    font-weight: 600;
    text-align: center;
    padding: 0.5rem;
    border: 1px solid #d1d5db;
    border-radius: 0.25rem;
    background: white;
    transition: all 0.2s ease;
  }

  .weight-input:focus {
    outline: none;
    border-color: #3b82f6;
    box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.1);
  }

  .weight-input.error {
    border-color: #dc2626;
    background-color: #fef2f2;
  }

  .weight-input:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .weight-controls {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }

  .btn-increment {
    font-size: 0.7rem;
    padding: 0.25rem 0.375rem;
    border: 1px solid #d1d5db;
    border-radius: 0.2rem;
    background: white;
    color: #374151;
    cursor: pointer;
    transition: all 0.2s ease;
    font-weight: 500;
  }

  .btn-increment:hover:not(:disabled) {
    background-color: #f3f4f6;
    border-color: #9ca3af;
  }

  .btn-increment:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .attempt-status {
    text-align: center;
    font-weight: bold;
    padding: 0.5rem;
    border-radius: 0.375rem;
    margin-bottom: 1rem;
    transition: all 0.2s ease;
  }

  .status-good {
    background-color: #d1fae5;
    color: #065f46;
    border: 2px solid #10b981;
  }

  .status-bad {
    background-color: #fef2f2;
    color: #dc2626;
    border: 2px solid #ef4444;
  }

  .status-pending {
    background-color: #f3f4f6;
    color: #6b7280;
    border: 2px solid #d1d5db;
  }

  .action-buttons {
    display: grid;
    grid-template-columns: 1fr 1fr 1fr;
    gap: 0.5rem;
    margin-bottom: 1rem;
  }

  .action-buttons button {
    padding: 0.75rem 1rem;
    border-radius: 0.375rem;
    font-weight: bold;
    font-size: 0.875rem;
    cursor: pointer;
    transition: all 0.2s ease;
    border: 2px solid;
  }

  .btn-good {
    background-color: #10b981;
    color: white;
    border-color: #10b981;
  }

  .btn-good:hover:not(:disabled) {
    background-color: #059669;
    border-color: #059669;
  }

  .btn-save {
    background-color: #3b82f6;
    color: white;
    border-color: #3b82f6;
  }

  .btn-save:hover:not(:disabled) {
    background-color: #2563eb;
    border-color: #2563eb;
  }

  .btn-bad {
    background-color: #ef4444;
    color: white;
    border-color: #ef4444;
  }

  .btn-bad:hover:not(:disabled) {
    background-color: #dc2626;
    border-color: #dc2626;
  }

  .action-buttons button:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .error-message {
    background-color: #fef2f2;
    color: #dc2626;
    padding: 0.5rem;
    border-radius: 0.375rem;
    font-size: 0.875rem;
    margin-bottom: 1rem;
    text-align: center;
    border: 1px solid #fecaca;
  }

  .shortcuts-help {
    font-size: 0.75rem;
    color: #6b7280;
    text-align: center;
    padding: 0.5rem;
    background-color: #f9fafb;
    border-radius: 0.375rem;
    border: 1px solid #e5e7eb;
  }

  /* Focus trap for keyboard navigation */
  .attempt-entry:focus-within {
    border-color: #3b82f6;
  }

  @media (max-width: 640px) {
    .attempt-entry {
      max-width: none;
      margin: 0;
    }

    .action-buttons {
      grid-template-columns: 1fr;
      gap: 0.75rem;
    }

    .weight-input {
      font-size: 1.25rem;
    }

    .shortcuts-help {
      font-size: 0.7rem;
    }
  }
</style>