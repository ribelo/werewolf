<script lang="ts">
  import { onMount } from 'svelte';
  import { apiClient } from '$lib/api';
  import { toast } from '$lib/ui/toast';
  import { formatCompetitorName } from '$lib/utils';
  import type { Attempt, AttemptNumber, AttemptStatus, LiftType, Registration } from '$lib/types';
  import { get } from 'svelte/store';
  import { _ } from 'svelte-i18n';

  export let contestId: string;
  export let registration: Registration;
  export let attempts: Attempt[] = [];
  export let onClose: () => void = () => {};
  export let onSaved: () => void = () => {};
  export let onOptimisticUpdate: (optimisticAttempts: Attempt[]) => void = () => {};
  export let getSnapshot: () => Attempt[] = () => [];
  export let restoreSnapshot: (snapshot: Attempt[]) => void = () => {};

  const LIFTS: LiftType[] = ['Squat', 'Bench', 'Deadlift'];
  const ATTEMPT_NUMBERS: AttemptNumber[] = [1, 2, 3];
  const QUICK_INCREMENT = 2.5;

  type MessageValues = Record<string, string | number | boolean | Date | null | undefined>;

  function t(key: string, values?: MessageValues): string {
    const translate = get(_);
    return translate(key, values ? { values } : undefined);
  }

  type FormKey = `${LiftType}-${AttemptNumber}`;
  type AttemptFormValue = {
    weight: string;
    status: AttemptStatus;
  };

  let formState: Partial<Record<FormKey, AttemptFormValue>> = {};
  let isSaving = false;
  let lastAttemptSnapshot: Attempt[] = [];

  function createTempAttemptId(lift: LiftType, attemptNumber: AttemptNumber): string {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return `temp-${crypto.randomUUID()}-${lift}-${attemptNumber}`;
    }
    return `temp-${Date.now()}-${Math.random()}-${lift}-${attemptNumber}`;
  }

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
    adjustWeight(lift, attemptNumber, wheel.deltaY < 0 ? QUICK_INCREMENT : -QUICK_INCREMENT);
  }

  async function saveAttempts() {
    if (!contestId || !registration?.id) {
      toast.error(t('attempt_editor.toast.missing_ids'));
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
          toast.error(t('attempt_editor.toast.weight_invalid'));
          return;
        }
        updates.push({ liftType: lift, attemptNumber: number, weight });
      }
    }

    if (updates.length === 0) {
      toast.info(t('attempt_editor.toast.nothing_to_save'));
      return;
    }

    const snapshot = getSnapshot ? getSnapshot() : [];
    const previousLocal = [...attempts];
    const optimisticAttempts: Attempt[] = [];
    const now = new Date().toISOString();

    for (const update of updates) {
      const existing = attempts.find(
        (candidate) =>
          candidate.liftType === update.liftType && candidate.attemptNumber === update.attemptNumber
      );

      const optimistic: Attempt = {
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

      optimisticAttempts.push(optimistic);

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

    if (optimisticAttempts.length > 0) {
      onOptimisticUpdate(optimisticAttempts);
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

      toast.success(t('attempt_editor.toast.save_success'));
      onSaved?.();
    } catch (error) {
      restoreSnapshot(snapshot);
      attempts = previousLocal;
      initialiseForm();
      const message = error instanceof Error ? error.message : t('attempt_editor.toast.save_error');
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
          <th class="px-4 py-3 text-left">{t('attempt_editor.table.lift')}</th>
          {#each ATTEMPT_NUMBERS as attemptNumber}
            <th class="px-4 py-3 text-left">{t('attempt_editor.table.attempt', { number: attemptNumber })}</th>
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
    <button type="button" class="btn-secondary" on:click={onClose} disabled={isSaving}>
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
