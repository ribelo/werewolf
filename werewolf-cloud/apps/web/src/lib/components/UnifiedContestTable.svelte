<script lang="ts">
  import { formatAgeClass, formatWeightClass, formatCoefficient, formatWeight } from '$lib/utils';
  import { ATTEMPT_NUMBERS, LIFTS, type AttemptCell, type LiftKind, type UnifiedRow } from '$lib/contest-table';
  import type { Attempt, Registration, AgeCategory, WeightClass } from '$lib/types';
  import { getAttemptStatusClass, getAttemptStatusLabel } from '$lib/ui/status';
  import { _ } from 'svelte-i18n';

  export let rows: UnifiedRow[] = [];
  export let sortColumn = 'order';
  export let sortDirection: 'asc' | 'desc' = 'asc';
  export let readOnly = false;
  export let activeFlight: string | null = null;
  export let weightClasses: WeightClass[] = [];
  export let ageCategories: AgeCategory[] = [];
  export let lifts: LiftKind[] = [...LIFTS];

  export let onSortChange: (column: string) => void = () => {};
  export let onOpenCompetitorModal: (registration: Registration) => void = () => {};
  export let onSetCurrentAttempt: (attempt: Attempt) => void = () => {};
  export let onAttemptStatusCycle: (attempt: Attempt) => void = () => {};
  export let onAttemptWeightChange: (payload: {
    registrationId: string;
    liftType: LiftKind;
    attemptNumber: number;
    attemptId?: string;
    weight: number;
  }) => void = () => {};

  const NAME_COLUMN_WIDTH = 220;
  const attemptLabels: Record<number, string> = { 1: 'I', 2: 'II', 3: 'III' };
  const liftHeaderKey: Record<LiftKind, string> = {
    Squat: 'contest_table.lifts.squat',
    Bench: 'contest_table.lifts.bench',
    Deadlift: 'contest_table.lifts.deadlift',
  };
  const liftAbbrevKey: Record<LiftKind, string> = {
    Squat: 'contest_table.lifts_short.squat',
    Bench: 'contest_table.lifts_short.bench',
    Deadlift: 'contest_table.lifts_short.deadlift',
  };

  let activeLifts: LiftKind[] = [...LIFTS];
  $: activeLifts = (lifts?.length ?? 0) > 0 ? [...lifts] : [...LIFTS];
  $: hasSquat = activeLifts.includes('Squat');
  $: hasBench = activeLifts.includes('Bench');

  function isSorted(column: string): boolean {
    return sortColumn === column;
  }

  function sortIndicator(column: string): string {
    if (!isSorted(column)) return '';
    return sortDirection === 'asc' ? '▲' : '▼';
  }

  function ariaSort(column: string): 'none' | 'ascending' | 'descending' {
    if (!isSorted(column)) return 'none';
    return sortDirection === 'asc' ? 'ascending' : 'descending';
  }

  function attemptWeightDisplay(cell: AttemptCell): string {
    const weight = cell.attempt?.weight;
    if (weight === undefined || weight === null || Number.isNaN(weight)) {
      return '—';
    }
    return formatWeight(weight);
  }

  function ageDisplay(row: UnifiedRow): { birth: string; age: string } {
    const birthDate = row.birthDate ?? row.registration.birthDate ?? null;
    const age = row.age ?? null;

    return {
      birth: birthDate ? `(${birthDate})` : '—',
      age: age !== null ? `${age}` : '—',
    };
  }

  function genderDisplay(registration: Registration): { symbol: string; label: string } {
    const value = registration.gender ?? '';
    const lowered = value.toLowerCase();
    if (lowered.startsWith('m')) {
      return { symbol: 'M', label: value || 'Male' };
    }
    if (lowered.startsWith('f')) {
      return { symbol: 'F', label: value || 'Female' };
    }
    if (lowered.startsWith('n')) {
      return { symbol: 'N', label: value || 'Non-binary' };
    }
    return { symbol: '—', label: value || '—' };
  }

  function genderSymbol(registration: Registration): string {
    return genderDisplay(registration).symbol;
  }

  function genderLabelText(registration: Registration): string {
    return genderDisplay(registration).label;
  }

  function handleAttemptInput(row: UnifiedRow, cell: AttemptCell, event: Event) {
    const input = event.currentTarget as HTMLInputElement;
    const value = parseFloat(input.value);
    if (!Number.isFinite(value)) {
      return;
    }

    onAttemptWeightChange({
      registrationId: row.registration.id,
      liftType: cell.liftType,
      attemptNumber: cell.attemptNumber,
      attemptId: cell.attempt?.id,
      weight: value,
    });
  }

  function competitorMeta(registration: Registration): string | null {
    const parts: string[] = [];
    if (registration.city && registration.city.trim().length > 0) {
      parts.push(registration.city.trim());
    }
    if (registration.club && registration.club.trim().length > 0) {
      parts.push(registration.club.trim());
    }
    if (parts.length === 0) {
      return null;
    }
    return parts.join(' • ');
  }
</script>

<table class="w-full min-w-[1200px] border-collapse text-sm">
  <thead class="bg-element-bg text-label sticky top-0 z-20">
    <tr>
      <th
        class="sticky left-0 top-0 z-20 bg-element-bg px-3 py-2 text-left border-r border-border-color cursor-pointer"
        rowspan="2"
        style={`min-width: ${NAME_COLUMN_WIDTH}px; width: ${NAME_COLUMN_WIDTH}px;`}
        role="columnheader"
        aria-sort={ariaSort('name')}
        on:click={() => onSortChange('name')}
      >
        <div class="flex items-center gap-1">
          <span>{$_('contest_table.columns.lifter')}</span>
          <span aria-hidden="true">{sortIndicator('name')}</span>
        </div>
      </th>
      <th
        class="sticky top-0 z-10 bg-element-bg px-3 py-2 cursor-pointer"
        rowspan="2"
        role="columnheader"
        aria-sort={ariaSort('gender')}
        on:click={() => onSortChange('gender')}
      >
        <div class="flex items-center gap-1">
          <span>{$_('contest_table.columns.sex')}</span>
          <span aria-hidden="true">{sortIndicator('gender')}</span>
        </div>
      </th>
      <th class="sticky top-0 z-10 bg-element-bg px-3 py-2 cursor-pointer" rowspan="2" role="columnheader" aria-sort={ariaSort('flight')} on:click={() => onSortChange('flight')}>
        <div class="flex items-center gap-1">
          <span>{$_('contest_table.columns.flight')}</span>
          <span aria-hidden="true">{sortIndicator('flight')}</span>
        </div>
      </th>
      <th class="sticky top-0 z-10 bg-element-bg px-3 py-2 cursor-pointer" rowspan="2" role="columnheader" aria-sort={ariaSort('age')} on:click={() => onSortChange('age')}>
        <div class="flex items-center gap-1">
          <span>{$_('contest_table.columns.age')}</span>
          <span aria-hidden="true">{sortIndicator('age')}</span>
        </div>
      </th>
      <th class="sticky top-0 z-10 bg-element-bg px-3 py-2 cursor-pointer" rowspan="2" role="columnheader" aria-sort={ariaSort('bodyweight')} on:click={() => onSortChange('bodyweight')}>
        <div class="flex items-center gap-1">
          <span>{$_('contest_table.columns.bodyweight')}</span>
          <span aria-hidden="true">{sortIndicator('bodyweight')}</span>
        </div>
      </th>
      <th class="sticky top-0 z-10 bg-element-bg px-3 py-2 cursor-pointer" rowspan="2" role="columnheader" aria-sort={ariaSort('weightClass')} on:click={() => onSortChange('weightClass')}>
        <div class="flex items-center gap-1">
          <span>{$_('contest_table.columns.weight_class')}</span>
          <span aria-hidden="true">{sortIndicator('weightClass')}</span>
        </div>
      </th>
      <th class="sticky top-0 z-10 bg-element-bg px-3 py-2 cursor-pointer" rowspan="2" role="columnheader" aria-sort={ariaSort('ageClass')} on:click={() => onSortChange('ageClass')}>
        <div class="flex items-center gap-1">
          <span>{$_('contest_table.columns.age_class')}</span>
          <span aria-hidden="true">{sortIndicator('ageClass')}</span>
        </div>
      </th>
      <th class="sticky top-0 z-10 bg-element-bg px-3 py-2 cursor-pointer" rowspan="2" role="columnheader" aria-sort={ariaSort('reshel')} on:click={() => onSortChange('reshel')}>
        <div class="flex items-center gap-1">
          <span>{$_('contest_table.columns.reshel')}</span>
          <span aria-hidden="true">{sortIndicator('reshel')}</span>
        </div>
      </th>
      <th class="sticky top-0 z-10 bg-element-bg px-3 py-2 cursor-pointer" rowspan="2" role="columnheader" aria-sort={ariaSort('mccullough')} on:click={() => onSortChange('mccullough')}>
        <div class="flex items-center gap-1">
          <span>{$_('contest_table.columns.mccullough')}</span>
          <span aria-hidden="true">{sortIndicator('mccullough')}</span>
        </div>
      </th>
      <th class="sticky top-0 z-10 bg-element-bg px-3 py-2" rowspan="2">{$_('contest_table.columns.rack')}</th>
      {#each activeLifts as lift}
        <th class="px-3 py-2 text-center uppercase tracking-[0.3em]" colspan={ATTEMPT_NUMBERS.length}>
          {$_(liftHeaderKey[lift])}
        </th>
      {/each}
      <th class="sticky top-0 z-10 bg-element-bg px-3 py-2 cursor-pointer" rowspan="2" role="columnheader" aria-sort={ariaSort('points')} on:click={() => onSortChange('points')}>
        <div class="flex items-center gap-1">
          <span>{$_('contest_table.columns.points')}</span>
          <span aria-hidden="true">{sortIndicator('points')}</span>
        </div>
      </th>
      <th class="sticky top-0 z-10 bg-element-bg px-3 py-2 cursor-pointer" rowspan="2" role="columnheader" aria-sort={ariaSort('max')} on:click={() => onSortChange('max')}>
        <div class="flex items-center gap-1">
          <span>{$_('contest_table.columns.max')}</span>
          <span aria-hidden="true">{sortIndicator('max')}</span>
        </div>
      </th>
      <th class="sticky top-0 z-10 bg-element-bg px-3 py-2" rowspan="2">{$_('contest_table.columns.labels')}</th>
      {#if !readOnly}
        <th class="sticky top-0 z-10 bg-element-bg px-3 py-2" rowspan="2">{$_('contest_table.columns.actions')}</th>
      {/if}
    </tr>
    <tr>
      {#each activeLifts as lift}
        {#each ATTEMPT_NUMBERS as attemptNumber}
          <th class="px-2 py-1 text-center text-xxs uppercase tracking-[0.3em]">
            {$_(liftAbbrevKey[lift])}&nbsp;{attemptLabels[attemptNumber]}
          </th>
        {/each}
      {/each}
    </tr>
  </thead>
  <tbody>
    {#each rows as row (row.registration.id)}
      <tr class="border-b border-border-color hover:bg-element-bg/50">
        <td
          class="sticky left-0 z-10 bg-main-bg/95 px-3 py-2 border-r border-border-color"
          style={`min-width: ${NAME_COLUMN_WIDTH}px; width: ${NAME_COLUMN_WIDTH}px;`}
        >
          <div class="flex flex-col">
            <span class="font-semibold text-text-primary">{row.registration.firstName} {row.registration.lastName}</span>
            {#if competitorMeta(row.registration)}
              <span class="text-caption text-text-secondary">{competitorMeta(row.registration)}</span>
            {:else}
              <span class="text-caption text-text-tertiary">—</span>
            {/if}
          </div>
        </td>
        <td
          class="px-3 py-2 text-center text-xxs uppercase tracking-[0.2em]"
          title={genderLabelText(row.registration)}
          aria-label={genderLabelText(row.registration)}
        >
          {genderSymbol(row.registration)}
        </td>
        <td class="px-3 py-2 text-center text-xxs">
          <span class={`inline-flex items-center justify-center rounded px-2 py-1 text-xxs font-medium uppercase tracking-[0.2em] ${row.registration.flightCode === activeFlight ? 'bg-primary-red text-black' : 'bg-element-bg text-text-secondary'}`}>
            {row.registration.flightCode ?? '—'}
          </span>
        </td>
        <td class="px-3 py-2 text-center">
          {#if row.birthDate ?? row.registration.birthDate}
            <span class="block leading-tight">({row.birthDate ?? row.registration.birthDate})</span>
          {:else}
            <span class="block leading-tight">—</span>
          {/if}
          <span class="block leading-tight">{row.age !== null ? row.age : '—'}</span>
        </td>
        <td class="px-3 py-2 text-center">{formatWeight(row.registration.bodyweight)}</td>
        <td class="px-3 py-2 text-center">{formatWeightClass(row.registration.weightClassId, weightClasses) ?? row.registration.weightClassName ?? '—'}</td>
        <td class="px-3 py-2 text-center">{formatAgeClass(row.registration.ageCategoryId, ageCategories) ?? row.registration.ageCategoryName ?? '—'}</td>
        <td class="px-3 py-2 text-center">{formatCoefficient(row.registration.reshelCoefficient)}</td>
        <td class="px-3 py-2 text-center">{formatCoefficient(row.registration.mcculloughCoefficient)}</td>
        <td class="px-3 py-2 text-center">
          <div class="flex flex-col gap-1 text-xxs uppercase tracking-[0.2em]">
            {#if hasSquat}
              <span>SQ: {row.registration.rackHeightSquat ?? '—'}</span>
            {/if}
            {#if hasBench}
              <span>BP: {row.registration.rackHeightBench ?? '—'}</span>
            {/if}
          </div>
        </td>
        {#each activeLifts as lift}
          {#each row.attempts[lift] as cell}
            <td class="px-2 py-2 text-center">
              <div class="flex flex-col items-center gap-1">
                {#if cell.attempt}
                  {#if readOnly}
                    <span
                      class={`inline-flex w-20 justify-center rounded-sm px-1 py-0.5 text-xs ${getAttemptStatusClass(cell.attempt.status)}`}
                    >
                      {getAttemptStatusLabel(cell.attempt.status)}
                    </span>
                  {:else}
                    <button
                      class={`inline-flex w-20 justify-center rounded-sm px-1 py-0.5 text-xs ${getAttemptStatusClass(cell.attempt.status)}`}
                      type="button"
                      on:click={() => onAttemptStatusCycle(cell.attempt)}
                    >
                      {getAttemptStatusLabel(cell.attempt.status)}
                    </button>
                  {/if}
                {:else}
                  <span class="text-xxs uppercase tracking-[0.2em] text-text-tertiary">—</span>
                {/if}

                {#if readOnly}
                  <span>{attemptWeightDisplay(cell)}</span>
                {:else}
                  <input
                    class="w-20 rounded border border-border-color bg-main-bg px-1 py-0.5 text-center text-xs"
                    type="text"
                    inputmode="decimal"
                    autocomplete="off"
                    value={cell.attempt?.weight ?? ''}
                    placeholder="—"
                    on:change={(event) => handleAttemptInput(row, cell, event)}
                  />
                {/if}
              </div>
            </td>
          {/each}
        {/each}
        <td class="px-3 py-2 text-center">{row.points !== null ? formatCoefficient(row.points) : '—'}</td>
        <td class="px-3 py-2 text-center">{row.maxLift > 0 ? formatWeight(row.maxLift) : '—'}</td>
        <td class="px-3 py-2">
          <div class="flex flex-wrap items-center gap-2">
            {#if row.registration.labels && row.registration.labels.length > 0}
              {#each row.registration.labels as label (label)}
                <span class="inline-flex items-center rounded bg-element-bg px-2 py-1 text-xxs uppercase tracking-[0.2em]">
                  {label}
                </span>
              {/each}
            {:else}
              <span class="text-xxs uppercase tracking-[0.2em] text-text-tertiary">—</span>
            {/if}
          </div>
        </td>
        {#if !readOnly}
          <td class="px-3 py-2">
            <div class="flex flex-wrap gap-2">
              <button class="btn-secondary px-3 py-1 text-xxs" on:click={() => onOpenCompetitorModal(row.registration)}>{$_('contest_table.actions.edit_competitor')}</button>
              {#if row.attempts.Squat.concat(row.attempts.Bench).concat(row.attempts.Deadlift).some((cell) => cell.attempt)}
                <button
                  class="btn-secondary px-3 py-1 text-xxs"
                  on:click={() => {
                    const nextAttempt = row.attempts.Squat
                      .concat(row.attempts.Bench)
                      .concat(row.attempts.Deadlift)
                      .map((cell) => cell.attempt)
                      .find((attempt) => attempt && attempt.status === 'Pending');
                    if (nextAttempt) {
                      onSetCurrentAttempt(nextAttempt);
                    }
                  }}
                >
                  {$_('contest_table.actions.set_live')}
                </button>
              {/if}
            </div>
          </td>
        {/if}
      </tr>
    {/each}
  </tbody>
</table>
