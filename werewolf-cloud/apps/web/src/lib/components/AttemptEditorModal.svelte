<script lang="ts">
  import { onMount } from 'svelte';
  import { apiClient } from '$lib/api';
  import { toast } from '$lib/ui/toast';
  import { formatCompetitorName } from '$lib/utils';
  import type { Attempt, AttemptNumber, AttemptStatus, LiftType, Registration } from '$lib/types';

  export let contestId: string;
  export let registration: Registration;
  export let attempts: Attempt[] = [];
  export let onClose: () => void = () => {};
  export let onSaved: () => void = () => {};

  const LIFTS: LiftType[] = ['Squat', 'Bench', 'Deadlift'];
  const ATTEMPT_NUMBERS: AttemptNumber[] = [1, 2, 3];

  type FormKey = `${LiftType}-${AttemptNumber}`;
  type AttemptFormValue = {
    weight: string;
    status: AttemptStatus;
  };

  let formState: Partial<Record<FormKey, AttemptFormValue>> = {};
  let isSaving = false;
  let lastAttemptSnapshot: Attempt[] = [];

  function buildKey(lift: LiftType, attemptNumber: AttemptNumber): FormKey {
    return `${lift}-${attemptNumber}` as FormKey;
  }

  function initialiseForm() {
    const draft: Partial<Record<FormKey, AttemptFormValue>> = {};
    for (const lift of LIFTS) {
      for (const number of ATTEMPT_NUMBERS) {
        const existing = attempts.find((attempt) => attempt.liftType === lift && attempt.attemptNumber === number);
        draft[buildKey(lift, number)] = {
          weight: existing ? String(existing.weight) : '',
          status: existing?.status ?? 'Pending',
        };
      }
    }
    formState = draft;
    lastAttemptSnapshot = attempts;
  }

  onMount(() => {
    initialiseForm();
  });

  $: if (attempts !== lastAttemptSnapshot) {
    initialiseForm();
  }

  function updateWeight(lift: LiftType, attemptNumber: AttemptNumber, value: string) {
    const key = buildKey(lift, attemptNumber);
    formState = {
      ...formState,
      [key]: {
        ...formState[key],
        weight: value,
      },
    };
  }

  function adjustWeight(lift: LiftType, attemptNumber: AttemptNumber, delta: number) {
    const key = buildKey(lift, attemptNumber);
    const current = parseFloat(formState[key]?.weight ?? '') || 0;
    const next = Math.max(0, Math.round((current + delta) * 100) / 100);
    formState = {
      ...formState,
      [key]: {
        ...formState[key],
        weight: next === 0 ? '' : next.toString(),
      },
    };
  }

  function handleInput(lift: LiftType, attemptNumber: AttemptNumber, event: Event) {
    updateWeight(lift, attemptNumber, (event.target as HTMLInputElement).value);
  }

  function handleWheel(lift: LiftType, attemptNumber: AttemptNumber, event: Event) {
    const wheel = event as WheelEvent;
    adjustWeight(lift, attemptNumber, wheel.deltaY < 0 ? 2.5 : -2.5);
  }

  async function saveAttempts() {
    if (!contestId || !registration?.id) {
      toast.error('Missing contest or registration identifier');
      return;
    }

    const updates: Array<{ liftType: LiftType; attemptNumber: AttemptNumber; weight: number }> = [];

    for (const lift of LIFTS) {
      for (const number of ATTEMPT_NUMBERS) {
        const key = buildKey(lift, number);
        const value = formState[key]?.weight?.trim();
        if (!value) continue;
        const weight = Number(value);
        if (!Number.isFinite(weight) || weight <= 0) {
          toast.error('All attempt weights must be greater than zero.');
          return;
        }
        updates.push({ liftType: lift, attemptNumber: number, weight });
      }
    }

    if (updates.length === 0) {
      toast.info('No attempts to save. Enter a weight before saving.');
      return;
    }

    isSaving = true;

    try {
      for (const update of updates) {
        await apiClient.post(`/contests/${contestId}/registrations/${registration.id}/attempts`, {
          registrationId: registration.id,
          liftType: update.liftType,
          attemptNumber: update.attemptNumber,
          weight: update.weight,
        });
      }

      toast.success('Attempt weights saved');
      onSaved?.();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to save attempts';
      toast.error(message);
    } finally {
      isSaving = false;
    }
  }
</script>

<div class="space-y-6">
  <div class="space-y-1">
    <p class="text-h3 text-text-primary">{formatCompetitorName(registration.firstName, registration.lastName)}</p>
    <p class="text-body text-text-secondary">
      {registration.club ? `${registration.club} • ` : ''}{registration.city ?? ''}
    </p>
  </div>

  <div class="overflow-x-auto">
    <table class="min-w-full text-sm text-text-secondary">
      <thead class="bg-element-bg text-label">
        <tr>
          <th class="px-4 py-3 text-left">Lift</th>
          {#each ATTEMPT_NUMBERS as attemptNumber}
            <th class="px-4 py-3 text-left">Attempt {attemptNumber}</th>
          {/each}
        </tr>
      </thead>
      <tbody>
        {#each LIFTS as lift}
          <tr class="border-b border-border-color">
            <td class="px-4 py-3 font-semibold text-text-primary">{lift}</td>
            {#each ATTEMPT_NUMBERS as attemptNumber}
              {#key `${lift}-${attemptNumber}`}
                <td class="px-4 py-3">
                  <div class="flex items-center gap-2">
                    <input
                      class="input w-full"
                      type="number"
                      min="0"
                      step="0.5"
                      inputmode="decimal"
                      value={formState[buildKey(lift, attemptNumber)]?.weight ?? ''}
                      on:input={(event) => handleInput(lift, attemptNumber, event)}
                      on:wheel|preventDefault={(event) => handleWheel(lift, attemptNumber, event)}
                    />
                    <div class="flex flex-col gap-1">
                      <button
                        type="button"
                        class="btn-secondary px-2 py-1 text-xxs"
                        on:click={() => adjustWeight(lift, attemptNumber, 2.5)}
                      >
                        +2.5
                      </button>
                      <button
                        type="button"
                        class="btn-secondary px-2 py-1 text-xxs"
                        on:click={() => adjustWeight(lift, attemptNumber, -2.5)}
                      >
                        -2.5
                      </button>
                    </div>
                  </div>
                </td>
              {/key}
            {/each}
          </tr>
        {/each}
      </tbody>
    </table>
  </div>

  <div class="flex justify-end gap-3">
    <button type="button" class="btn-secondary" on:click={onClose} disabled={isSaving}>
      Cancel
    </button>
    <button type="button" class="btn-primary" on:click={saveAttempts} disabled={isSaving}>
      {#if isSaving}
        Saving…
      {:else}
        Save attempts
      {/if}
    </button>
  </div>
</div>
