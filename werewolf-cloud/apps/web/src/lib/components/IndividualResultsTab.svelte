<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import { get } from 'svelte/store';
  import { _ } from 'svelte-i18n';
  import Download from 'lucide-svelte/icons/download';
  import Minus from 'lucide-svelte/icons/minus';
  import ChevronDown from 'lucide-svelte/icons/chevron-down';
  import UnifiedContestTable from './UnifiedContestTable.svelte';
  import {
    ATTEMPT_NUMBERS,
    buildUnifiedRows,
    deriveContestLifts,
    sortUnifiedRows,
    type AttemptNumber,
    type LiftKind,
    type UnifiedRow,
  } from '$lib/contest-table';
  import {
    applyRegistrationFilters,
    type AgeFilter,
    type LabelFilter,
    type RegistrationFilterState,
    type WeightFilter,
  } from '$lib/filters/registrations';
  import { buildPublicFilterOptions, type PublicWeightFilterOption } from './public-results-filters';
  import type { ScoreboardExportDetail } from './public-results';
  import type {
    AgeCategory,
    ContestDetail,
    ContestRankingEntry,
    PublicScoreboardBundle,
    WeightClass,
  } from '$lib/types';

  export let contest: ContestDetail | null = null;
  export let results: { open: ContestRankingEntry[]; age: ContestRankingEntry[]; weight: ContestRankingEntry[] };
  export let scoreboard: PublicScoreboardBundle | null = null;
  export let loading = false;

  const dispatch = createEventDispatcher<{ export: ScoreboardExportDetail }>();

  type LiftFilter = LiftKind;

  const FALLBACK_LIFTS: LiftKind[] = ['Bench'];
  const liftLabelKey: Record<LiftKind, string> = {
    Squat: 'contest_table.lifts.squat',
    Bench: 'contest_table.lifts.bench',
    Deadlift: 'contest_table.lifts.deadlift',
  };

  let sortColumn = 'order';
  let sortDirection: 'asc' | 'desc' = 'asc';
  let selectedLift: LiftFilter = 'Bench';
  let attemptNumbers: AttemptNumber[] = [...ATTEMPT_NUMBERS];
  let availableLifts: LiftKind[] = [...FALLBACK_LIFTS];
  let tableLifts: LiftKind[] = [...FALLBACK_LIFTS];
  let weightClasses: WeightClass[] = [];
  let ageCategories: AgeCategory[] = [];
  $: registrationsList = scoreboard?.registrations ?? [];
  $: weightClasses = scoreboard?.referenceData?.weightClasses ?? [];
  $: ageCategories = scoreboard?.referenceData?.ageCategories ?? [];
  type FilterKind = 'weight' | 'age' | 'label';
  let selectedWeightFilter: WeightFilter = 'ALL';
  let selectedAgeFilter: AgeFilter = 'ALL';
  let selectedLabelFilter: LabelFilter = 'ALL';
  let openFilter: FilterKind | null = null;

  $: filterOptions = buildPublicFilterOptions({
    weightClasses,
    ageCategories,
    registrations: registrationsList,
    translate,
  });

  $: weightFilterGroups = filterOptions.weightGroups;
  $: weightFilterOptions = filterOptions.weight;
  $: ageFilterOptions = filterOptions.age;
  $: labelFilterOptions = filterOptions.label;

  $: weightFilterGenderMap = (() => {
    const map = new Map<WeightFilter, 'female' | 'male'>();
    weightFilterGroups.female.forEach((option) => map.set(option.id, 'female'));
    weightFilterGroups.male.forEach((option) => map.set(option.id, 'male'));
    return map;
  })();

  $: if (!weightFilterOptions.some((option) => option.id === selectedWeightFilter)) {
    selectedWeightFilter = 'ALL';
  }
  $: if (!ageFilterOptions.some((option) => option.id === selectedAgeFilter)) {
    selectedAgeFilter = 'ALL';
  }
  $: if (!labelFilterOptions.some((option) => option.id === selectedLabelFilter)) {
    selectedLabelFilter = 'ALL';
  }

  let registrationFilterState: RegistrationFilterState = {
    weight: 'ALL',
    age: 'ALL',
    label: 'ALL',
  };

  $: registrationFilterState = {
    weight: selectedWeightFilter,
    age: selectedAgeFilter,
    label: selectedLabelFilter,
  };

  function toggleFilter(filter: FilterKind) {
    openFilter = openFilter === filter ? null : filter;
  }

  function selectWeightFilter(id: WeightFilter) {
    selectedWeightFilter = id;
    openFilter = null;
  }

  function selectAgeFilter(id: AgeFilter) {
    selectedAgeFilter = id;
    openFilter = null;
  }

  function selectLabelFilter(id: LabelFilter) {
    selectedLabelFilter = id;
    openFilter = null;
  }

  function getWeightFilterSummary(id: WeightFilter): string {
    if (id === 'ALL') {
      return translate('contest_detail.registrations.filters.all');
    }
    if (id === 'FEMALE_OPEN') {
      return `${translate('contest_detail.registrations.filters.sex_female')} ${translate('contest_detail.registrations.filters.open')}`;
    }
    if (id === 'MALE_OPEN') {
      return `${translate('contest_detail.registrations.filters.sex_male')} ${translate('contest_detail.registrations.filters.open')}`;
    }
    const match = weightFilterOptions.find((option) => option.id === id);
    if (!match) {
      return translate('contest_detail.registrations.filters.weight_button_all');
    }
    const gender = weightFilterGenderMap.get(id);
    if (!gender) {
      return match.label;
    }
    const genderLabel =
      gender === 'female'
        ? translate('contest_detail.registrations.filters.sex_female')
        : translate('contest_detail.registrations.filters.sex_male');
    return `${genderLabel} ${match.label}`;
  }

  function getWeightOptionLabel(option: PublicWeightFilterOption): string {
    if (option.id === 'FEMALE_OPEN') {
      return `${translate('contest_detail.registrations.filters.sex_female')} ${translate('contest_detail.registrations.filters.open')}`;
    }
    if (option.id === 'MALE_OPEN') {
      return `${translate('contest_detail.registrations.filters.sex_male')} ${translate('contest_detail.registrations.filters.open')}`;
    }
    const gender = weightFilterGenderMap.get(option.id);
    if (!gender) {
      return option.label;
    }
    const genderLabel =
      gender === 'female'
        ? translate('contest_detail.registrations.filters.sex_female')
        : translate('contest_detail.registrations.filters.sex_male');
    return `${genderLabel} ${option.label}`;
  }

  function getAgeFilterSummary(id: AgeFilter): string {
    if (id === 'ALL') {
      return translate('contest_detail.registrations.filters.age_all');
    }
    if (id === 'UNASSIGNED') {
      return translate('contest_detail.registrations.filters.age_unassigned');
    }
    return ageFilterOptions.find((option) => option.id === id)?.label ?? '';
  }

  function getLabelFilterSummary(id: LabelFilter): string {
    if (id === 'ALL') {
      return translate('contest_detail.registrations.filters.labels_all');
    }
    if (id === 'UNLABELED') {
      return translate('contest_detail.registrations.filters.labels_unlabeled');
    }
    return labelFilterOptions.find((option) => option.id === id)?.label ?? '';
  }

  function registrationIncludesLift(registration: { lifts?: LiftKind[] }, lift: LiftKind): boolean {
    if (!registration) return false;
    const configuredLifts = Array.isArray(registration.lifts) && registration.lifts.length > 0
      ? registration.lifts as LiftKind[]
      : (availableLifts.length > 0 ? availableLifts : FALLBACK_LIFTS);
    return configuredLifts.includes(lift);
  }

  function translate(key: string, values?: Record<string, string | number>) {
    const translator = get(_);
    return translator(key, values ? { values } : undefined);
  }

  function getLiftLabel(lift: LiftFilter): string {
    return translate(liftLabelKey[lift]);
  }

  $: contestLifts = deriveContestLifts(contest, scoreboard?.attempts ?? []);
  $: resolvedLifts = (() => {
    if (contestLifts.length > 0) {
      return contestLifts;
    }
    const fromRegistrations = new Set<LiftKind>();
    for (const registration of scoreboard?.registrations ?? []) {
      for (const lift of registration.lifts ?? []) {
        fromRegistrations.add(lift);
      }
    }
    return fromRegistrations.size > 0 ? Array.from(fromRegistrations) : FALLBACK_LIFTS;
  })();
  $: availableLifts = resolvedLifts;
  $: if (!availableLifts.includes(selectedLift)) {
    selectedLift = availableLifts[0] ?? 'Bench';
  }
  $: tableLifts = [selectedLift];

  $: unifiedRows = scoreboard
    ? buildUnifiedRows({
        registrations: scoreboard.registrations ?? [],
        attempts: scoreboard.attempts ?? [],
        contest,
        resultsOpen: results.open,
        resultsAge: results.age,
        resultsWeight: results.weight,
      })
    : [];

  $: filteredByRegistration = applyRegistrationFilters(unifiedRows, registrationFilterState);
  $: filteredRows = filteredByRegistration.filter((row) => registrationIncludesLift(row.registration, selectedLift));

  $: displayedRows = sortUnifiedRows(filteredRows, sortColumn, sortDirection);
  $: hasScoreboardData = (scoreboard?.registrations?.length ?? 0) > 0;

  const showPointsColumn = true;
  const showMaxColumn = true;

  function handleSortChange(column: string) {
    if (sortColumn === column) {
      sortDirection = sortDirection === 'asc' ? 'desc' : 'asc';
    } else {
      sortColumn = column;
      sortDirection = column.startsWith('attempt:') || column.startsWith('max') || column.startsWith('points') ? 'desc' : 'asc';
    }
  }

  function handleExport(format: 'csv' | 'json' | 'pdf' | 'jpg') {
    if (displayedRows.length === 0) {
      return;
    }
    dispatch('export', {
      kind: 'scoreboard',
      format,
      rows: displayedRows,
      lifts: tableLifts.length > 0 ? tableLifts : availableLifts,
      attemptNumbers,
      showPointsColumn,
      showMaxColumn,
      showRowNumbers: true,
    });
    exportMenuOpen = false;
  }

  let exportMenuOpen = false;
</script>

<div class="space-y-4" on:click={() => exportMenuOpen = false}>
  <div class="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
    <div>
      <h3 class="text-h3 text-text-primary">{$_('public.results.tabs.individual')}</h3>
      <p class="text-body text-text-secondary">{$_('public.results.subtitle')}</p>
    </div>
    <div class="relative" on:click|stopPropagation>
      <button
        type="button"
        class="btn-secondary flex items-center gap-2 px-3 py-2 text-sm"
        on:click={() => exportMenuOpen = !exportMenuOpen}
        disabled={loading || displayedRows.length === 0}
      >
        <Download class="h-4 w-4" />
        <span>{$_('contest_detail.export.menu')}</span>
        <ChevronDown class={`h-4 w-4 transition-transform ${exportMenuOpen ? 'rotate-180' : ''}`} />
      </button>
      {#if exportMenuOpen}
        <div class="absolute right-0 top-full z-50 mt-2 w-48 rounded-md border border-border-color bg-element-bg shadow-lg">
          <div class="py-1">
            <button
              type="button"
              class="flex w-full items-center gap-2 px-4 py-2 text-sm text-text-primary hover:bg-main-bg/50 focus:bg-main-bg/50 focus:outline-none disabled:opacity-50"
              on:click={() => handleExport('csv')}
              disabled={loading || displayedRows.length === 0}
            >
              {$_('contest_detail.export.csv')}
            </button>
            <button
              type="button"
              class="flex w-full items-center gap-2 px-4 py-2 text-sm text-text-primary hover:bg-main-bg/50 focus:bg-main-bg/50 focus:outline-none disabled:opacity-50"
              on:click={() => handleExport('pdf')}
              disabled={loading || displayedRows.length === 0}
            >
              {$_('contest_detail.export.pdf')}
            </button>
            <button
              type="button"
              class="flex w-full items-center gap-2 px-4 py-2 text-sm text-text-primary hover:bg-main-bg/50 focus:bg-main-bg/50 focus:outline-none disabled:opacity-50"
              on:click={() => handleExport('jpg')}
              disabled={loading || displayedRows.length === 0}
            >
              {$_('contest_detail.export.jpg')}
            </button>
            <button
              type="button"
              class="flex w-full items-center gap-2 px-4 py-2 text-sm text-text-primary hover:bg-main-bg/50 focus:bg-main-bg/50 focus:outline-none disabled:opacity-50"
              on:click={() => handleExport('json')}
              disabled={loading || displayedRows.length === 0}
            >
              JSON
            </button>
          </div>
        </div>
      {/if}
    </div>
  </div>

  <div class="flex flex-wrap items-center gap-2" on:click={() => (openFilter = null)}>
    <div class="relative">
      <button
        type="button"
        class="px-3 py-1 text-xxs btn-secondary flex min-w-[190px] items-center justify-between gap-3"
        on:click|stopPropagation={() => toggleFilter('weight')}
      >
        <div class="flex flex-col text-left leading-tight">
          <span class="font-semibold">{$_('contest_detail.registrations.filters.weight')}</span>
          <span class="text-text-secondary">{getWeightFilterSummary(selectedWeightFilter)}</span>
        </div>
        <ChevronDown
          class={`h-3.5 w-3.5 transition-transform ${openFilter === 'weight' ? 'rotate-180' : ''}`}
          aria-hidden="true"
        />
      </button>
      {#if openFilter === 'weight'}
        <div class="absolute left-0 top-full z-40 mt-2 w-56 max-h-60 overflow-y-auto rounded border border-border-color bg-element-bg shadow-lg">
          {#each weightFilterOptions as option}
            <button
              type="button"
              class="flex w-full items-center justify-between px-3 py-2 text-xxs text-text-secondary hover:bg-element-bg/80"
              on:click|stopPropagation={() => selectWeightFilter(option.id)}
            >
              <span>{getWeightOptionLabel(option)}</span>
            </button>
          {/each}
        </div>
      {/if}
    </div>

    <div class="relative">
      <button
        type="button"
        class="px-3 py-1 text-xxs btn-secondary flex min-w-[170px] items-center justify-between gap-3"
        on:click|stopPropagation={() => toggleFilter('age')}
      >
        <div class="flex flex-col text-left leading-tight">
          <span class="font-semibold">{$_('contest_detail.registrations.filters.age')}</span>
          <span class="text-text-secondary">{getAgeFilterSummary(selectedAgeFilter)}</span>
        </div>
        <ChevronDown
          class={`h-3.5 w-3.5 transition-transform ${openFilter === 'age' ? 'rotate-180' : ''}`}
          aria-hidden="true"
        />
      </button>
      {#if openFilter === 'age'}
        <div class="absolute left-0 top-full z-40 mt-2 w-52 max-h-60 overflow-y-auto rounded border border-border-color bg-element-bg shadow-lg">
          {#each ageFilterOptions as option}
            <button
              type="button"
              class="flex w-full items-center justify-between px-3 py-2 text-xxs text-text-secondary hover:bg-element-bg/80"
              on:click|stopPropagation={() => selectAgeFilter(option.id)}
            >
              <span>{option.label}</span>
            </button>
          {/each}
        </div>
      {/if}
    </div>

    <div class="relative">
      <button
        type="button"
        class="px-3 py-1 text-xxs btn-secondary flex min-w-[170px] items-center justify-between gap-3"
        on:click|stopPropagation={() => toggleFilter('label')}
      >
        <div class="flex flex-col text-left leading-tight">
          <span class="font-semibold">{$_('contest_detail.registrations.filters.label')}</span>
          <span class="text-text-secondary">{getLabelFilterSummary(selectedLabelFilter)}</span>
        </div>
        <ChevronDown
          class={`h-3.5 w-3.5 transition-transform ${openFilter === 'label' ? 'rotate-180' : ''}`}
          aria-hidden="true"
        />
      </button>
      {#if openFilter === 'label'}
        <div class="absolute left-0 top-full z-40 mt-2 w-52 max-h-60 overflow-y-auto rounded border border-border-color bg-element-bg shadow-lg">
          {#each labelFilterOptions as option}
            <button
              type="button"
              class="flex w-full items-center justify-between px-3 py-2 text-xxs text-text-secondary hover:bg-element-bg/80"
              on:click|stopPropagation={() => selectLabelFilter(option.id)}
            >
              <span>{option.label}</span>
            </button>
          {/each}
        </div>
      {/if}
    </div>
  </div>

  <div class="flex flex-wrap gap-2">
    {#each availableLifts as lift}
      <button
        type="button"
        class={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
          selectedLift === lift
            ? 'bg-primary text-primary-foreground'
            : 'bg-element-bg text-text-secondary hover:bg-element-bg/80'
        }`}
        on:click={() => (selectedLift = lift)}
        disabled={loading}
      >
        {$_(liftLabelKey[lift])}
      </button>
    {/each}
  </div>

  {#if displayedRows.length > 0}
    <p class="text-sm text-text-secondary">
      {translate('public.results.count', {
        count: displayedRows.length,
        view: getLiftLabel(selectedLift),
      })}
    </p>
  {:else if !loading}
    <p class="text-sm text-text-secondary italic">{$_('public.results.no_data')}</p>
  {/if}

  {#if loading}
    <div class="flex items-center justify-center py-12">
      <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      <span class="ml-3 text-text-secondary">{$_('public.results.loading')}</span>
    </div>
  {:else if hasScoreboardData && displayedRows.length > 0}
    <div class="overflow-x-auto">
      <UnifiedContestTable
        rows={displayedRows}
        sortColumn={sortColumn}
        sortDirection={sortDirection}
        readOnly={true}
        activeFlight={contest?.activeFlight ?? null}
        lifts={tableLifts.length > 0 ? tableLifts : availableLifts}
        weightClasses={weightClasses}
        ageCategories={ageCategories}
        showPointsColumn={showPointsColumn}
        showMaxColumn={showMaxColumn}
        showRowNumbers={true}
        showAttemptGrid={true}
        showFlightColumn={true}
        showRackColumn={true}
        showLabelsColumn={true}
        showReshelColumn={true}
        showMcculloughColumn={true}
        attemptNumbers={attemptNumbers}
        onSortChange={handleSortChange}
      />
    </div>
  {:else}
    <div class="text-center py-12">
      <Minus class="h-12 w-12 text-text-secondary mx-auto mb-4" />
      <p class="text-text-secondary">{$_('public.results.no_data')}</p>
    </div>
  {/if}
</div>
