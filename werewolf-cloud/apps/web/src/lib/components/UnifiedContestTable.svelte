<script lang="ts">
  import { get } from 'svelte/store';
  import { formatAgeClass, formatWeightClass, formatCoefficient, formatWeight } from '$lib/utils';
  import { ATTEMPT_NUMBERS, LIFTS, type AttemptCell, type LiftKind, type UnifiedRow, type AttemptNumber } from '$lib/contest-table';
  import type { Attempt, Registration, AgeCategory, WeightClass, AttemptStatus } from '$lib/types';
  import { getAttemptStatusClass } from '$lib/ui/status';
  import { _ } from 'svelte-i18n';
  import { CheckCircle2, Circle, Clock, Loader2, Radio, XCircle, ArrowUpDown, ChevronUp, ChevronDown } from 'lucide-svelte';
  import { locale } from 'svelte-i18n';

  export let rows: UnifiedRow[] = [];
  export let sortColumn = 'order';
  export let sortDirection: 'asc' | 'desc' = 'asc';
  export let readOnly = false;
  export let activeFlight: string | null = null;
  export let weightClasses: WeightClass[] = [];
  export let ageCategories: AgeCategory[] = [];
  export let lifts: LiftKind[] = [...LIFTS];
  export let showPointsColumn = true;
  export let showMaxColumn = true;
  export let attemptNumbers: AttemptNumber[] = [...ATTEMPT_NUMBERS];
  export let mode: 'attempts' | 'registration' = 'attempts';
  export let showRowNumbers = false;

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
  export let onToggleLift: (registration: Registration, lift: LiftKind, nextValue: boolean) => void = () => {};
  export let currentAttemptId: string | null = null;
  export let currentAttemptLoading: Record<string, boolean> = {};
  export let toggleLiftLoading: Record<string, boolean> = {};
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

  const LIVE_BUTTON_BASE = 'inline-flex h-7 w-7 items-center justify-center rounded-sm border transition-colors duration-200';
  const STATUS_BUTTON_BASE = 'inline-flex h-7 w-7 items-center justify-center rounded-sm border transition-colors duration-200';
  const TOGGLE_BUTTON_BASE = 'inline-flex h-7 w-[3.75rem] items-center justify-center rounded border transition-colors duration-200';
  const statusIconMap: Record<AttemptStatus, typeof Clock> = {
    Pending: Clock,
    Successful: CheckCircle2,
    Failed: XCircle,
  };

  $: translate = get(_);
  $: statusLabels = {
    Pending: translate('attempt.status.pending'),
    Successful: translate('attempt.status.successful'),
    Failed: translate('attempt.status.failed'),
  };

  function resolveStatus(input: string | null | undefined): AttemptStatus {
    switch (input) {
      case 'Successful':
        return 'Successful';
      case 'Failed':
        return 'Failed';
      default:
        return 'Pending';
    }
  }

  function liveButtonClass(isCurrent: boolean, isDisabled: boolean): string {
    if (isCurrent) {
      return `${LIVE_BUTTON_BASE} border-primary-red bg-primary-red/20 text-primary-red shadow-glow`;
    }
    if (isDisabled) {
      return `${LIVE_BUTTON_BASE} border-border-color/60 text-text-tertiary cursor-not-allowed`;
    }
    return `${LIVE_BUTTON_BASE} border-border-color text-text-secondary hover:border-primary-red hover:text-primary-red`;
  }

  function liftToggleButtonClass(isActive: boolean): string {
    if (isActive) {
      return `${TOGGLE_BUTTON_BASE} border-primary-red bg-primary-red/20 text-primary-red shadow-glow`;
    }
    return `${TOGGLE_BUTTON_BASE} border-border-color text-text-secondary hover:border-primary-red hover:text-primary-red`;
  }

  let activeLifts: LiftKind[] = [...LIFTS];
  let activeAttemptNumbers: AttemptNumber[] = [...ATTEMPT_NUMBERS];
  $: activeLifts = (lifts?.length ?? 0) > 0 ? [...lifts] : [...LIFTS];
  $: activeAttemptNumbers = (attemptNumbers?.length ?? 0) > 0 ? [...attemptNumbers] : [...ATTEMPT_NUMBERS];
  $: hasSquat = activeLifts.includes('Squat');
  $: hasBench = activeLifts.includes('Bench');
  $: soleLift = activeLifts.length === 1 ? activeLifts[0] : null;
  $: maxSortKey = soleLift ? `max:${soleLift}` : 'max';
  $: pointsSortKey = soleLift ? `points:${soleLift}` : 'points';

  // Sorting indicator state for Max/Points (support legacy 'max'/'points' keys)
  let isMaxSorted = false;
  let isPointsSorted = false;
  let maxAriaSort: 'none' | 'ascending' | 'descending' = 'none';
  let pointsAriaSort: 'none' | 'ascending' | 'descending' = 'none';
  let maxSortIcon: typeof ArrowUpDown | typeof ChevronUp | typeof ChevronDown = ArrowUpDown;
  let pointsSortIcon: typeof ArrowUpDown | typeof ChevronUp | typeof ChevronDown = ArrowUpDown;

  $: isMaxSorted = sortColumn === 'max' || sortColumn === maxSortKey;
  $: isPointsSorted = sortColumn === 'points' || sortColumn === pointsSortKey;
  $: maxAriaSort = isMaxSorted ? (sortDirection === 'asc' ? 'ascending' : 'descending') : 'none';
  $: pointsAriaSort = isPointsSorted ? (sortDirection === 'asc' ? 'ascending' : 'descending') : 'none';
  $: maxSortIcon = isMaxSorted ? (sortDirection === 'asc' ? ChevronUp : ChevronDown) : ArrowUpDown;
  $: pointsSortIcon = isPointsSorted ? (sortDirection === 'asc' ? ChevronUp : ChevronDown) : ArrowUpDown;

  function isSorted(column: string): boolean {
    // Handle dynamic mapping for points and max columns
    if (column === pointsSortKey && (sortColumn.startsWith('points:') || sortColumn === 'points')) {
      return true;
    }
    if (column === maxSortKey && (sortColumn.startsWith('max:') || sortColumn === 'max')) {
      return true;
    }
    return sortColumn === column;
  }

  function sortIndicatorIcon(column: string): typeof ArrowUpDown | typeof ChevronUp | typeof ChevronDown | null {
    if (!isSorted(column)) return ArrowUpDown;
    return sortDirection === 'asc' ? ChevronUp : ChevronDown;
  }

  function ariaSort(column: string): 'none' | 'ascending' | 'descending' {
    if (!isSorted(column)) return 'none';
    return sortDirection === 'asc' ? 'ascending' : 'descending';
  }

  function attemptSortKey(lift: LiftKind, attemptNumber: AttemptNumber): string {
    return `attempt:${lift}:${attemptNumber}`;
  }

  function attemptWeightDisplay(cell: AttemptCell): string {
    const weight = cell.attempt?.weight;
    if (weight === undefined || weight === null || Number.isNaN(weight)) {
      return '—';
    }
    return formatWeight(weight);
  }

  function resolvePoints(row: UnifiedRow): number | null {
    if (!row) return null;
    if (activeLifts.length === 1) {
      const [soleLift] = activeLifts;
      return row.pointsByLift?.[soleLift] ?? row.points ?? null;
    }
    return row.points ?? null;
  }

  function displayPoints(row: UnifiedRow): string {
    const value = resolvePoints(row);
    return value !== null ? formatCoefficient(value) : '—';
  }

  function resolveBestForLift(row: UnifiedRow, lift: LiftKind): number {
    switch (lift) {
      case 'Squat':
        return row.bestSquat;
      case 'Bench':
        return row.bestBench;
      case 'Deadlift':
        return row.bestDeadlift;
      default:
        return 0;
    }
  }

  function resolveMax(row: UnifiedRow): number {
    if (!row) return 0;
    if (activeLifts.length === 1) {
      const [soleLift] = activeLifts;
      return resolveBestForLift(row, soleLift);
    }
    return row.maxLift ?? 0;
  }

  function displayMax(row: UnifiedRow): string {
    const value = resolveMax(row);
    return value > 0 ? formatWeight(value) : '—';
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
      // In Polish locale, use 'K' (Kobieta) instead of 'F'
      const currentLocale = get(locale);
      const symbol = (currentLocale === 'pl') ? 'K' : 'F';
      return { symbol, label: value || 'Female' };
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

  function parseWeightInput(raw: string): number | null {
    if (!raw) return null;
    const normalized = raw
      .replace(/,/g, '.')
      .replace(/[^0-9.\-]/g, '')
      .replace(/(\..*?)\./g, '$1');
    const value = parseFloat(normalized);
    return Number.isFinite(value) ? value : null;
  }

  function handleAttemptInput(row: UnifiedRow, cell: AttemptCell, event: Event) {
    const input = event.currentTarget as HTMLInputElement;
    const parsed = parseWeightInput(input.value);
    if (!Number.isFinite(parsed as number)) {
      return;
    }

    onAttemptWeightChange({
      registrationId: row.registration.id,
      liftType: cell.liftType,
      attemptNumber: cell.attemptNumber,
      attemptId: cell.attempt?.id,
      weight: parsed as number,
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
      {#if showRowNumbers}
        <th
          class="sticky left-0 top-0 z-20 bg-element-bg px-2 py-2 text-center border-r border-border-color"
          rowspan="2"
          style="min-width: 40px; width: 40px;"
          role="columnheader"
        >
          <span class="text-xs uppercase tracking-[0.3em]">#</span>
        </th>
      {/if}
      <th
        class="sticky left-0 top-0 z-20 bg-element-bg px-3 py-2 text-left border-r border-border-color cursor-pointer"
        rowspan="2"
        style={`min-width: ${NAME_COLUMN_WIDTH}px; width: ${NAME_COLUMN_WIDTH}px; ${showRowNumbers ? 'left: 40px;' : ''}`}
        role="columnheader"
        aria-sort={ariaSort('name')}
        on:click={() => onSortChange('name')}
      >
        <div class="flex items-center gap-1">
          <span>{$_('contest_table.columns.lifter')}</span>
          <span aria-hidden="true">{#if sortIndicatorIcon('name')}<svelte:component this={sortIndicatorIcon('name')} class="h-3.5 w-3.5 opacity-70" />{/if}</span>
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
          <span aria-hidden="true">{#if sortIndicatorIcon('gender')}<svelte:component this={sortIndicatorIcon('gender')} class="h-3.5 w-3.5 opacity-70" />{/if}</span>
        </div>
      </th>
      <th class="sticky top-0 z-10 bg-element-bg px-3 py-2 cursor-pointer" rowspan="2" role="columnheader" aria-sort={ariaSort('flight')} on:click={() => onSortChange('flight')}>
        <div class="flex items-center gap-1">
          <span>{$_('contest_table.columns.flight')}</span>
          <span aria-hidden="true">{#if sortIndicatorIcon('flight')}<svelte:component this={sortIndicatorIcon('flight')} class="h-3.5 w-3.5 opacity-70" />{/if}</span>
        </div>
      </th>
      <th class="sticky top-0 z-10 bg-element-bg px-3 py-2 cursor-pointer" rowspan="2" role="columnheader" aria-sort={ariaSort('age')} on:click={() => onSortChange('age')}>
        <div class="flex items-center gap-1">
          <span>{$_('contest_table.columns.age')}</span>
          <span aria-hidden="true">{#if sortIndicatorIcon('age')}<svelte:component this={sortIndicatorIcon('age')} class="h-3.5 w-3.5 opacity-70" />{/if}</span>
        </div>
      </th>
      <th class="sticky top-0 z-10 bg-element-bg px-3 py-2 cursor-pointer" rowspan="2" role="columnheader" aria-sort={ariaSort('bodyweight')} on:click={() => onSortChange('bodyweight')}>
        <div class="flex items-center gap-1">
          <span>{$_('contest_table.columns.bodyweight')}</span>
          <span aria-hidden="true">{#if sortIndicatorIcon('bodyweight')}<svelte:component this={sortIndicatorIcon('bodyweight')} class="h-3.5 w-3.5 opacity-70" />{/if}</span>
        </div>
      </th>
      <th class="sticky top-0 z-10 bg-element-bg px-3 py-2 cursor-pointer" rowspan="2" role="columnheader" aria-sort={ariaSort('weightClass')} on:click={() => onSortChange('weightClass')}>
        <div class="flex items-center gap-1">
          <span>{$_('contest_table.columns.weight_class')}</span>
          <span aria-hidden="true">{#if sortIndicatorIcon('weightClass')}<svelte:component this={sortIndicatorIcon('weightClass')} class="h-3.5 w-3.5 opacity-70" />{/if}</span>
        </div>
      </th>
      <th class="sticky top-0 z-10 bg-element-bg px-3 py-2 cursor-pointer" rowspan="2" role="columnheader" aria-sort={ariaSort('ageClass')} on:click={() => onSortChange('ageClass')}>
        <div class="flex items-center gap-1">
          <span>{$_('contest_table.columns.age_class')}</span>
          <span aria-hidden="true">{#if sortIndicatorIcon('ageClass')}<svelte:component this={sortIndicatorIcon('ageClass')} class="h-3.5 w-3.5 opacity-70" />{/if}</span>
        </div>
      </th>
      <th class="sticky top-0 z-10 bg-element-bg px-3 py-2 cursor-pointer" rowspan="2" role="columnheader" aria-sort={ariaSort('reshel')} on:click={() => onSortChange('reshel')}>
        <div class="flex items-center gap-1">
          <span>{$_('contest_table.columns.reshel')}</span>
          <span aria-hidden="true">{#if sortIndicatorIcon('reshel')}<svelte:component this={sortIndicatorIcon('reshel')} class="h-3.5 w-3.5 opacity-70" />{/if}</span>
        </div>
      </th>
      <th class="sticky top-0 z-10 bg-element-bg px-3 py-2 cursor-pointer" rowspan="2" role="columnheader" aria-sort={ariaSort('mccullough')} on:click={() => onSortChange('mccullough')}>
        <div class="flex items-center gap-1">
          <span>{$_('contest_table.columns.mccullough')}</span>
          <span aria-hidden="true">{#if sortIndicatorIcon('mccullough')}<svelte:component this={sortIndicatorIcon('mccullough')} class="h-3.5 w-3.5 opacity-70" />{/if}</span>
        </div>
      </th>
      {#if hasSquat || hasBench}
        <th class="sticky top-0 z-10 bg-element-bg px-3 py-2" rowspan="2">{$_('contest_table.columns.rack')}</th>
      {/if}
      {#each activeLifts as lift}
        <th class="px-3 py-2 text-center uppercase tracking-[0.3em]" colspan={activeAttemptNumbers.length}>
          {$_(liftHeaderKey[lift])}
        </th>
      {/each}
      {#if showPointsColumn}
        <th class="sticky top-0 z-10 bg-element-bg px-3 py-2 cursor-pointer" rowspan="2" role="columnheader" aria-sort={pointsAriaSort} on:click={() => onSortChange(pointsSortKey)}>
          <div class="flex items-center gap-1">
            <span>{$_('contest_table.columns.points')}</span>
            <span aria-hidden="true"><svelte:component this={pointsSortIcon} class="h-3.5 w-3.5 opacity-70" /></span>
          </div>
        </th>
      {/if}
      {#if showMaxColumn}
        <th class="sticky top-0 z-10 bg-element-bg px-3 py-2 cursor-pointer" rowspan="2" role="columnheader" aria-sort={maxAriaSort} on:click={() => onSortChange(maxSortKey)}>
          <div class="flex items-center gap-1">
            <span>{$_('contest_table.columns.max')}</span>
            <span aria-hidden="true"><svelte:component this={maxSortIcon} class="h-3.5 w-3.5 opacity-70" /></span>
          </div>
        </th>
      {/if}
      <th class="sticky top-0 z-10 bg-element-bg px-3 py-2" rowspan="2">{$_('contest_table.columns.labels')}</th>
      {#if !readOnly}
        <th class="sticky top-0 z-10 bg-element-bg px-3 py-2" rowspan="2">{$_('contest_table.columns.actions')}</th>
      {/if}
    </tr>
    <tr>
      {#each activeLifts as lift}
        {#each activeAttemptNumbers as attemptNumber}
          {@const attemptKey = attemptSortKey(lift, attemptNumber)}
          {@const attemptSorted = sortColumn === attemptKey}
          {@const attemptAria = attemptSorted ? (sortDirection === 'asc' ? 'ascending' : 'descending') : 'none'}
          {@const attemptIcon = attemptSorted ? (sortDirection === 'asc' ? ChevronUp : ChevronDown) : ArrowUpDown}
          <th
            class="px-2 py-1 text-center text-xxs uppercase tracking-[0.3em] cursor-pointer select-none"
            role="columnheader"
            aria-sort={attemptAria}
            on:click={() => onSortChange(attemptKey)}
            title={`${$_(liftAbbrevKey[lift])} ${attemptLabels[attemptNumber]}`}
          >
            <div class="inline-flex items-center gap-1">
              <span>{$_(liftAbbrevKey[lift])}&nbsp;{attemptLabels[attemptNumber]}</span>
              <span aria-hidden="true"><svelte:component this={attemptIcon} class="h-3 w-3 opacity-70" /></span>
            </div>
          </th>
        {/each}
      {/each}
    </tr>
  </thead>
  <tbody>
    {#each rows as row, index (row.registration.id)}
      <tr class="border-b border-border-color hover:bg-element-bg/50">
        {#if showRowNumbers}
          <td
            class="sticky left-0 z-10 bg-main-bg/95 px-2 py-2 text-center border-r border-border-color"
            style="min-width: 40px; width: 40px;"
          >
            <span class="text-sm text-text-secondary">{index + 1}</span>
          </td>
        {/if}
        <td
          class="sticky left-0 z-10 bg-main-bg/95 px-3 py-2 border-r border-border-color"
          style={`min-width: ${NAME_COLUMN_WIDTH}px; width: ${NAME_COLUMN_WIDTH}px; ${showRowNumbers ? 'left: 40px;' : ''}`}
        >
          <div class="flex flex-col">
            <span class="font-semibold text-text-primary">{row.registration.lastName} {row.registration.firstName}</span>
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
        <td class="px-3 py-2 text-center">{row.registration.weightClassName ?? formatWeightClass(row.registration.weightClassId, weightClasses)}</td>
        <td class="px-3 py-2 text-center">{formatAgeClass(row.registration.ageCategoryId, ageCategories) ?? row.registration.ageCategoryName ?? '—'}</td>
        <td class="px-3 py-2 text-center">{formatCoefficient(row.registration.reshelCoefficient)}</td>
        <td class="px-3 py-2 text-center">{formatCoefficient(row.registration.mcculloughCoefficient)}</td>
        {#if hasSquat || hasBench}
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
        {/if}
        {#each activeLifts as lift}
          {#each row.attempts[lift].filter((cell) => activeAttemptNumbers.includes(cell.attemptNumber)) as cell}
            <td class="px-2 py-2 text-center">
              {#if mode === 'registration'}
                {@const isActive = !row.registration.lifts || row.registration.lifts.includes(lift)}
                {@const toggleKey = `${row.registration.id}:${lift}`}
                {@const isLoading = Boolean(toggleLiftLoading[toggleKey])}
                {@const label = isActive
                  ? translate('contest_table.actions.disable_lift', { lift: translate(liftHeaderKey[lift]) })
                  : translate('contest_table.actions.enable_lift', { lift: translate(liftHeaderKey[lift]) })}
                <button
                  class={liftToggleButtonClass(isActive)}
                  type="button"
                  aria-label={label}
                  title={label}
                  aria-pressed={isActive}
                  disabled={isLoading}
                  on:click={() => onToggleLift(row.registration, lift, !isActive)}
                >
                  {#if isLoading}
                    <Loader2 class="h-4 w-4 animate-spin" aria-hidden="true" />
                  {:else if isActive}
                    <CheckCircle2 class="h-4 w-4" aria-hidden="true" />
                  {:else}
                    <Circle class="h-4 w-4" aria-hidden="true" />
                  {/if}
                </button>
              {:else if !row.registration.lifts || row.registration.lifts.includes(lift)}
                <div class="flex flex-col items-center gap-1">
                  <div class="flex items-center gap-1">
                    {#if cell.attempt}
                      {@const attemptId = cell.attempt.id}
                      {@const status = resolveStatus(cell.attempt.status)}
                      {#if !readOnly}
                        {@const isCurrent = currentAttemptId === attemptId}
                        {@const isLoading = Boolean(currentAttemptLoading[attemptId])}
                        <button
                          class={liveButtonClass(isCurrent, isLoading)}
                          type="button"
                          aria-label={isCurrent ? $_('contest_table.actions.live_now') : $_('contest_table.actions.set_live')}
                          title={isCurrent ? $_('contest_table.actions.live_now') : $_('contest_table.actions.set_live')}
                          aria-pressed={isCurrent}
                          disabled={isCurrent || isLoading}
                          on:click={() => onSetCurrentAttempt(cell.attempt)}
                        >
                          {#if isLoading}
                            <Loader2 class="h-4 w-4 animate-spin" aria-hidden="true" />
                          {:else}
                            <Radio class="h-4 w-4" aria-hidden="true" />
                          {/if}
                        </button>
                      {/if}
                      {#if readOnly}
                        <span
                          class={`${STATUS_BUTTON_BASE} ${getAttemptStatusClass(status)} opacity-70`}
                          aria-label={statusLabels[status]}
                        >
                          <svelte:component this={statusIconMap[status] || Clock} class="h-4 w-4" aria-hidden="true" />
                        </span>
                      {:else}
                        <button
                          class={`${STATUS_BUTTON_BASE} ${getAttemptStatusClass(status)} hover:brightness-110`}
                          type="button"
                          aria-label={statusLabels[status]}
                          title={statusLabels[status]}
                          on:click={() => onAttemptStatusCycle(cell.attempt)}
                        >
                          <svelte:component this={statusIconMap[status] || Clock} class="h-4 w-4" aria-hidden="true" />
                        </button>
                      {/if}
                    {:else}
                      <span class="inline-flex h-7 w-[3.75rem] items-center justify-center rounded border border-border-color/40 bg-element-bg/60 text-xs text-text-tertiary">
                        —
                      </span>
                    {/if}
                  </div>

                  {#if readOnly}
                    <span class="inline-flex h-7 w-[3.75rem] items-center justify-center rounded border border-border-color/60 bg-element-bg px-2 text-xs text-text-secondary">
                      {attemptWeightDisplay(cell)}
                    </span>
                  {:else}
                    <input
                      class="h-7 w-[3.75rem] rounded border border-border-color bg-main-bg px-2 text-center text-xs"
                      type="text"
                      inputmode="decimal"
                      autocomplete="off"
                      value={cell.attempt?.weight ?? ''}
                      placeholder="—"
                      on:change={(event) => handleAttemptInput(row, cell, event)}
                    />
                  {/if}
                </div>
              {:else}
                <span class="inline-flex h-7 w-[3.75rem] items-center justify-center rounded border border-border-color/40 bg-element-bg/60 text-xs text-text-tertiary">
                  —
                </span>
              {/if}
            </td>
          {/each}
        {/each}
        {#if showPointsColumn}
          <td class="px-3 py-2 text-center">{displayPoints(row)}</td>
        {/if}
        {#if showMaxColumn}
          <td class="px-3 py-2 text-center">{displayMax(row)}</td>
        {/if}
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
            </div>
          </td>
        {/if}
      </tr>
    {/each}
  </tbody>
</table>
