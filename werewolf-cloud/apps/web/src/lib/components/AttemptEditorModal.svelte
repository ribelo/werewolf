<script lang="ts">
  import { onMount } from 'svelte';
  import { get } from 'svelte/store';
  import { _ } from 'svelte-i18n';
  import { apiClient } from '$lib/api';
  import { toast } from '$lib/ui/toast';
  import { formatCompetitorName } from '$lib/utils';
  import type { Attempt, AttemptNumber, LiftType, Registration } from '$lib/types';
  import {
    attemptDraftKey,
    planAttemptSave,
    type AttemptDraftState,
    type AttemptDraftUpdate,
  } from './attempt-editor-draft';

  export let contestId: string;
  export let registration: Registration;
  export let attempts: Attempt[] = [];
  export let onClose: () => void = () => {};
  /** Attempts that reached the API; the modal shell resolves the modal with them. */
  export let onSaved: (savedAttempts: Attempt[]) => void | Promise<void> = () => {};
  export let onOptimisticUpdate: (optimisticAttempts: Attempt[]) => void = () => {};
  /** Replaces the caller's attempt list, used to reconcile with the server. */
  export let restoreSnapshot: (snapshot: Attempt[]) => void = () => {};
  /** Caller's pre-save attempt list, used when nothing was saved and the server is unreadable. */
  export let getSnapshot: () => Attempt[] = () => [];

  const DEFAULT_LIFTS: LiftType[] = ['Squat', 'Bench', 'Deadlift'];
  let availableLifts: LiftType[] = [...DEFAULT_LIFTS];
  const ATTEMPT_NUMBERS: AttemptNumber[] = [1, 2, 3];
  const QUICK_INCREMENT = 2.5;

  type MessageValues = Record<string, string | number | boolean | Date | null | undefined>;

  function t(key: string, values?: MessageValues): string {
    const translate = get(_);
    return translate(key, values ? { values } : undefined);
  }

  let formState: AttemptDraftState = {};
  let isSaving = false;
  let lastAttemptSnapshot: Attempt[] = [];
  $: availableLifts = registration?.lifts && registration.lifts.length > 0
    ? (registration.lifts as LiftType[])
    : [...DEFAULT_LIFTS];
  let currentRegistrationId: string | null = null;
  $: if ((registration?.id ?? null) !== currentRegistrationId) {
    currentRegistrationId = registration?.id ?? null;
    initialiseForm();
  }

  function createTempAttemptId(lift: LiftType, attemptNumber: AttemptNumber): string {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return `temp-${crypto.randomUUID()}-${lift}-${attemptNumber}`;
    }
    return `temp-${Date.now()}-${Math.random()}-${lift}-${attemptNumber}`;
  }

  function initialiseForm() {
    const draft: AttemptDraftState = {};
    for (const lift of availableLifts) {
      for (const number of ATTEMPT_NUMBERS) {
        const existing = attempts.find((attempt) => attempt.liftType === lift && attempt.attemptNumber === number);
        draft[attemptDraftKey(lift, number)] = {
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
    const key = attemptDraftKey(lift, attemptNumber);
    formState = {
      ...formState,
      [key]: {
        ...formState[key],
        weight: value,
      },
    };
  }

  function adjustWeight(lift: LiftType, attemptNumber: AttemptNumber, delta: number) {
    const key = attemptDraftKey(lift, attemptNumber);
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
    adjustWeight(lift, attemptNumber, wheel.deltaY < 0 ? QUICK_INCREMENT : -QUICK_INCREMENT);
  }

  function buildOptimisticAttempt(update: AttemptDraftUpdate, now: string): Attempt {
    const existing = attempts.find(
      (candidate) =>
        candidate.liftType === update.liftType && candidate.attemptNumber === update.attemptNumber
    );

    return {
      id: existing?.id ?? createTempAttemptId(update.liftType, update.attemptNumber),
      registrationId: registration.id,
      liftType: update.liftType,
      attemptNumber: update.attemptNumber,
      weight: update.weight,
      status: existing?.status ?? 'Pending',
      judge1Decision: existing?.judge1Decision ?? null,
      judge2Decision: existing?.judge2Decision ?? null,
      judge3Decision: existing?.judge3Decision ?? null,
      notes: existing?.notes ?? null,
      timestamp: existing?.timestamp ?? null,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
      firstName: registration.firstName ?? '',
      lastName: registration.lastName ?? '',
      competitorName: formatCompetitorName(registration.firstName ?? '', registration.lastName ?? ''),
      competitionOrder: registration.competitionOrder ?? null,
    };
  }

  function applyOptimistically(optimistic: Attempt) {
    const localIndex = attempts.findIndex((candidate) => candidate.id === optimistic.id || (
      candidate.liftType === optimistic.liftType && candidate.attemptNumber === optimistic.attemptNumber
    ));

    if (localIndex >= 0) {
      attempts = [
        ...attempts.slice(0, localIndex),
        optimistic,
        ...attempts.slice(localIndex + 1),
      ];
    } else {
      attempts = [...attempts, optimistic];
    }
  }

  /**
   * Reads the authoritative attempt list back from the API. Called after a failed
   * save: the requests that went through are committed on the server, so a
   * pre-save snapshot would show a state that no longer exists.
   */
  async function reconcileFromServer(): Promise<boolean> {
    if (!contestId || !registration?.id) return false;

    try {
      const response = await apiClient.get<Attempt[]>(`/contests/${contestId}/attempts`);
      if (response.error || !Array.isArray(response.data)) {
        console.error('Failed to store attempts: could not reconcile with the server', response.error);
        return false;
      }

      const serverAttempts = response.data;
      restoreSnapshot(serverAttempts);
      attempts = serverAttempts.filter((attempt) => attempt.registrationId === registration.id);
      return true;
    } catch (error) {
      console.error('Failed to store attempts: could not reconcile with the server', error);
      return false;
    }
  }

  async function saveAttempts() {
    if (isSaving) return;

    if (!contestId || !registration?.id) {
      toast.error(t('attempt_editor.toast.missing_ids'));
      return;
    }

    const plan = planAttemptSave(formState, attempts, availableLifts, ATTEMPT_NUMBERS);

    if (plan.invalid.length > 0) {
      toast.error(t('attempt_editor.toast.weight_invalid'));
      return;
    }

    if (plan.updates.length === 0) {
      toast.info(t('attempt_editor.toast.nothing_to_save'));
      return;
    }

    const previousLocal = [...attempts];
    const now = new Date().toISOString();
    const optimisticAttempts = plan.updates.map((update) => buildOptimisticAttempt(update, now));

    optimisticAttempts.forEach(applyOptimistically);

    if (optimisticAttempts.length > 0) {
      onOptimisticUpdate(optimisticAttempts);
    }

    isSaving = true;

    // The API takes one attempt per request. Writes are sequential and a failure
    // does not undo the requests that already went through, so the editor reports
    // what was saved instead of pretending the save was atomic.
    const saved: AttemptDraftUpdate[] = [];
    let failure: unknown = null;

    for (const update of plan.updates) {
      try {
        await apiClient.post(`/contests/${contestId}/registrations/${registration.id}/attempts`, {
          registrationId: registration.id,
          liftType: update.liftType,
          attemptNumber: update.attemptNumber,
          weight: update.weight,
        });
        saved.push(update);
      } catch (error) {
        failure = error;
        break;
      }
    }

    isSaving = false;

    if (!failure) {
      toast.success(t('attempt_editor.toast.save_success'));
      await onSaved(optimisticAttempts);
      return;
    }

    const reconciled = await reconcileFromServer();

    if (saved.length === 0) {
      if (!reconciled) {
        // Nothing reached the server and it cannot be read back, so the local
        // optimism is dropped again by returning to the pre-save state.
        restoreSnapshot(getSnapshot());
        attempts = previousLocal;
      }

      const message = failure instanceof Error ? failure.message : t('attempt_editor.toast.save_error');
      toast.error(message);
      return;
    }

    toast.error(t('attempt_editor.toast.save_partial', {
      saved: saved.length,
      total: plan.updates.length,
    }));
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
          <th class="px-4 py-3 text-left">{t('attempt_editor.table.lift')}</th>
          {#each ATTEMPT_NUMBERS as attemptNumber}
            <th class="px-4 py-3 text-left">{t('attempt_editor.table.attempt', { number: attemptNumber })}</th>
          {/each}
        </tr>
      </thead>
      <tbody>
        {#each availableLifts as lift}
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
                      value={formState[attemptDraftKey(lift, attemptNumber)]?.weight ?? ''}
                      on:input={(event) => handleInput(lift, attemptNumber, event)}
                      on:wheel|preventDefault={(event) => handleWheel(lift, attemptNumber, event)}
                    />
                    <div class="flex flex-col gap-1">
                      <button
                        type="button"
                        class="btn-secondary px-2 py-1 text-xxs"
                        on:click={() => adjustWeight(lift, attemptNumber, QUICK_INCREMENT)}
                      >
                        {t('attempt_editor.controls.increase', { delta: QUICK_INCREMENT })}
                      </button>
                      <button
                        type="button"
                        class="btn-secondary px-2 py-1 text-xxs"
                        on:click={() => adjustWeight(lift, attemptNumber, -QUICK_INCREMENT)}
                      >
                        {t('attempt_editor.controls.decrease', { delta: QUICK_INCREMENT })}
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
    <button type="button" class="btn-secondary" on:click={() => onClose()} disabled={isSaving}>
      {t('buttons.cancel')}
    </button>
    <button type="button" class="btn-primary" on:click={saveAttempts} disabled={isSaving}>
      {#if isSaving}
        {t('buttons.saving')}
      {:else}
        {t('attempt_editor.buttons.save')}
      {/if}
    </button>
  </div>
</div>
