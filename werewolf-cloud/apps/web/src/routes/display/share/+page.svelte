<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { get } from 'svelte/store';
  import { _ } from 'svelte-i18n';
  import type { PageData } from './$types';
  import { realtimeClient } from '$lib/realtime';
  import UnifiedContestTable from '$lib/components/UnifiedContestTable.svelte';
  import { buildUnifiedRows, sortUnifiedRows, deriveContestLifts, type UnifiedRow, type LiftKind } from '$lib/contest-table';
  import type { Attempt, Registration, LiveEvent } from '$lib/types';
  import { ChevronDown } from 'lucide-svelte';

  export let data: PageData;

  type MessageValues = Record<string, string | number | boolean | Date | null | undefined>;
  type WeightFilter = 'ALL' | 'FEMALE_OPEN' | 'MALE_OPEN' | string;
  type AgeFilter = 'ALL' | 'UNASSIGNED' | string;
  type LiftFilter = 'ALL' | LiftKind;
  type WeightFilterOption = { id: WeightFilter; label: string };
  type AgeFilterOption = { id: AgeFilter; label: string };
  type WeightFilterGroup = {
    femaleOpen: WeightFilterOption;
    maleOpen: WeightFilterOption;
    female: WeightFilterOption[];
    male: WeightFilterOption[];
  };

  function t(key: string, values?: MessageValues): string {
    const translate = get(_);
    return translate(key, values ? { values } : undefined);
  }

  let {
    contest,
    registrations,
    attempts,
    referenceData,
    error,
    contestId,
  } = data;

  let liveRegistrations: Registration[] = [...registrations];
  let liveAttempts: Attempt[] = [...attempts];
  let registrationsSource = registrations;
  let attemptsSource = attempts;
  let openFilter: 'weight' | 'age' | 'lift' | null = null;
  let weightFilterGroups: WeightFilterGroup = {
    femaleOpen: { id: 'FEMALE_OPEN', label: '' },
    maleOpen: { id: 'MALE_OPEN', label: '' },
    female: [],
    male: [],
  };
  let femaleWeightFilters: WeightFilterOption[] = [];
  let maleWeightFilters: WeightFilterOption[] = [];

  let contestLifts = deriveContestLifts(contest, liveAttempts);
  let unifiedRows: UnifiedRow[] = [];
  let sortedRows: UnifiedRow[] = [];
  let filteredRows: UnifiedRow[] = [];

  let sortColumn = 'name';
  let sortDirection: 'asc' | 'desc' = 'asc';

  let selectedWeightFilter: WeightFilter = 'ALL';
  let availableWeightFilters: WeightFilterOption[] = [];
  let selectedAgeFilter: AgeFilter = 'ALL';
  let availableAgeFilters: AgeFilterOption[] = [];
  let selectedLiftFilter: LiftFilter = 'ALL';
  let availableLiftFilters: LiftFilter[] = [];
  let weightFilterSummary = '';
  let ageFilterSummary = '';
  let liftFilterSummary = '';

  // Realtime subscription
  const unsubscribeEvents = realtimeClient.events.subscribe((event) => {
    if (!event || event.contestId !== contestId) return;
    handleLiveEvent(event as LiveEvent);
  });

  onMount(() => {
    if (contestId) {
      realtimeClient.connect(contestId);
    }
    if (typeof window !== 'undefined') {
      window.addEventListener('click', handleWindowClick);
      window.addEventListener('keydown', handleWindowKeydown);
    }
  });

  onDestroy(() => {
    realtimeClient.disconnect();
    unsubscribeEvents();
    if (typeof window !== 'undefined') {
      window.removeEventListener('click', handleWindowClick);
      window.removeEventListener('keydown', handleWindowKeydown);
    }
  });

  function isFemaleGender(value: string | null | undefined): boolean {
    const lowered = (value ?? '').trim().toLowerCase();
    return lowered.startsWith('f') || lowered.startsWith('k');
  }

  function isMaleGender(value: string | null | undefined): boolean {
    const lowered = (value ?? '').trim().toLowerCase();
    return lowered.startsWith('m');
  }

  function handleLiveEvent(event: LiveEvent) {
    switch (event.type) {
      case 'attempt.upserted': {
        const payload = event.data as Attempt | undefined;
        if (!payload) break;
        const index = liveAttempts.findIndex((item) => item.id === payload.id);
        if (index >= 0) {
          liveAttempts[index] = payload;
        } else {
          liveAttempts = [...liveAttempts, payload];
        }
        liveAttempts = [...liveAttempts];
        break;
      }
      case 'attempt.resultUpdated': {
        const payload = event.data as Attempt | undefined;
        if (!payload) break;
        const index = liveAttempts.findIndex((item) => item.id === payload.id);
        if (index >= 0) {
          liveAttempts[index] = { ...liveAttempts[index], ...payload };
          liveAttempts = [...liveAttempts];
        }
        break;
      }
      case 'registration.upserted': {
        const payload = event.data as Registration | undefined;
        if (!payload) break;
        const index = liveRegistrations.findIndex((item) => item.id === payload.id);
        if (index >= 0) {
          const next = [...liveRegistrations];
          next[index] = { ...next[index], ...payload };
          liveRegistrations = next;
        } else {
          liveRegistrations = [...liveRegistrations, payload];
        }
        break;
      }
      case 'registration.deleted': {
        const payload = event.data as { registrationId?: string } | undefined;
        const registrationId = payload?.registrationId;
        if (!registrationId) break;
        const before = liveRegistrations.length;
        liveRegistrations = liveRegistrations.filter((entry) => entry.id !== registrationId);
        if (liveRegistrations.length !== before) {
          liveAttempts = liveAttempts.filter((attempt) => attempt.registrationId !== registrationId);
        }
        break;
      }
      default:
        break;
    }
  }

  function toggleFilter(target: 'weight' | 'age' | 'lift') {
    openFilter = openFilter === target ? null : target;
  }

  function closeFilters() {
    openFilter = null;
  }

  function selectWeightFilter(value: WeightFilter) {
    selectedWeightFilter = value;
    closeFilters();
  }

  function selectAgeFilter(value: AgeFilter) {
    selectedAgeFilter = value;
    closeFilters();
  }

  function selectLiftFilter(value: LiftFilter) {
    selectedLiftFilter = value;
    closeFilters();
  }

  function liftFilterLabel(value: LiftFilter): string {
    if (value === 'ALL') {
      return t('contest_detail.registrations.filters.lift_button_all');
    }
    const key = value.toLowerCase();
    const translated = t(`contest_table.lifts.${key}`);
    return translated && translated !== `contest_table.lifts.${key}` ? translated : value;
  }

  function filterTriggerClass(active: boolean): string {
    return `px-3 py-1 text-xxs ${active ? 'btn-primary text-black' : 'btn-secondary'}`;
  }

  function handleWindowClick() {
    closeFilters();
  }

  function handleWindowKeydown(event: KeyboardEvent) {
    if (event.key === 'Escape') {
      closeFilters();
    }
  }

  function handleSortChange(column: string) {
    if (sortColumn === column) {
      sortDirection = sortDirection === 'asc' ? 'desc' : 'asc';
    } else {
      sortColumn = column;
      sortDirection = 'asc';
    }
  }

  function applyFilters(
    rows: UnifiedRow[],
    weightFilter: WeightFilter,
    ageFilter: AgeFilter,
    liftFilter: LiftFilter
  ): UnifiedRow[] {
    return rows.filter((row) => {
      const registration = row.registration;

      // Weight class / gender filters
      let weightMatches = false;
      if (weightFilter === 'ALL') {
        weightMatches = true;
      } else if (weightFilter === 'FEMALE_OPEN') {
        weightMatches = isFemaleGender(registration.gender);
      } else if (weightFilter === 'MALE_OPEN') {
        weightMatches = isMaleGender(registration.gender);
      } else {
        weightMatches = (registration.weightClassId ?? '') === weightFilter;
      }
      if (!weightMatches) return false;

      // Age filters
      const ageId = registration.ageCategoryId ?? '';
      const ageMatches =
        ageFilter === 'ALL' || (ageFilter === 'UNASSIGNED' ? !ageId : ageId === ageFilter);
      if (!ageMatches) return false;

      if (liftFilter !== 'ALL') {
        const lifts = Array.isArray(registration.lifts) && registration.lifts.length > 0
          ? (registration.lifts as LiftKind[])
          : contestLifts;
        if (!lifts || !lifts.includes(liftFilter)) {
          return false;
        }
      }

      return true;
    });
  }

  function computeWeightFilterGroups(): WeightFilterGroup {
    const weightClasses = referenceData?.weightClasses ?? [];
    const female: WeightFilterOption[] = [];
    const male: WeightFilterOption[] = [];
    const femaleSeen = new Set<string>();
    const maleSeen = new Set<string>();

    weightClasses
      .slice()
      .sort((a, b) => {
        const orderA = a.sortOrder ?? Number.MAX_SAFE_INTEGER;
        const orderB = b.sortOrder ?? Number.MAX_SAFE_INTEGER;
        if (orderA !== orderB) return orderA - orderB;
        const labelA = (a.name ?? a.code ?? '').toString();
        const labelB = (b.name ?? b.code ?? '').toString();
        return labelA.localeCompare(labelB, undefined, { sensitivity: 'base' });
      })
      .forEach((entry) => {
        const id = (entry.id ?? entry.code ?? '').toString();
        const label = (entry.name ?? entry.code ?? '').toString();
        if (!id || !label) return;
        const gender = (entry.gender ?? '').toString().toLowerCase();
        if (gender.startsWith('f')) {
          if (!femaleSeen.has(id)) {
          femaleSeen.add(id);
          female.push({ id: id as WeightFilter, label });
        }
      } else if (gender.startsWith('m')) {
        if (!maleSeen.has(id)) {
          maleSeen.add(id);
          male.push({ id: id as WeightFilter, label });
        }
      }
    });

    return {
      femaleOpen: { id: 'FEMALE_OPEN', label: t('contest_detail.registrations.filters.open') },
      maleOpen: { id: 'MALE_OPEN', label: t('contest_detail.registrations.filters.open') },
      female,
      male,
    };
  }

  function computeAgeFilters(): AgeFilterOption[] {
    const ageCategories = referenceData?.ageCategories ?? [];
    const options: AgeFilterOption[] = [
      { id: 'ALL', label: t('contest_detail.registrations.filters.age_all') },
    ];

    const hasUnassigned = liveRegistrations.some((registration) => !registration.ageCategoryId);
    if (hasUnassigned) {
      options.push({
        id: 'UNASSIGNED',
        label: t('contest_detail.registrations.filters.age_unassigned'),
      });
    }

    const seen = new Set<string>();
    ageCategories
      .slice()
      .sort((a, b) => {
        const orderA = a.sortOrder ?? Number.MAX_SAFE_INTEGER;
        const orderB = b.sortOrder ?? Number.MAX_SAFE_INTEGER;
        if (orderA !== orderB) return orderA - orderB;
        const labelA = (a.name ?? a.code ?? '').toString();
        const labelB = (b.name ?? b.code ?? '').toString();
        return labelA.localeCompare(labelB, undefined, { sensitivity: 'base' });
      })
      .forEach((category) => {
        const id = (category.id ?? category.code ?? '').toString();
        let label = (category.name ?? category.code ?? '').toString();
        if (!id || !label) return;
        if (label.toLowerCase() === 'senior') {
          label = t('contest_detail.registrations.filters.age_senior');
        }
        if (seen.has(id)) return;
        seen.add(id);
        options.push({ id: id as AgeFilter, label });
      });

    return options;
  }

  $: contestLifts = deriveContestLifts(contest, liveAttempts);
  $: unifiedRows = buildUnifiedRows({
        registrations: liveRegistrations,
        attempts: liveAttempts,
        contest,
      });
  $: sortedRows = sortUnifiedRows(unifiedRows, sortColumn, sortDirection);
  $: filteredRows = applyFilters(sortedRows, selectedWeightFilter, selectedAgeFilter, selectedLiftFilter);

  $: if (registrations !== registrationsSource) {
        registrationsSource = registrations;
        liveRegistrations = [...registrations];
      }
  $: if (attempts !== attemptsSource) {
        attemptsSource = attempts;
        liveAttempts = [...attempts];
      }

  $: weightFilterGroups = computeWeightFilterGroups();
  $: femaleWeightFilters = (() => {
        const hasFemaleData =
          weightFilterGroups.female.length > 0 || liveRegistrations.some((reg) => isFemaleGender(reg.gender));
        if (!hasFemaleData) {
          return [] as WeightFilterOption[];
        }
        return [weightFilterGroups.femaleOpen, ...weightFilterGroups.female];
      })();
  $: maleWeightFilters = (() => {
        const hasMaleData =
          weightFilterGroups.male.length > 0 || liveRegistrations.some((reg) => isMaleGender(reg.gender));
        if (!hasMaleData) {
          return [] as WeightFilterOption[];
        }
        return [weightFilterGroups.maleOpen, ...weightFilterGroups.male];
      })();
  $: availableWeightFilters = [
        { id: 'ALL', label: t('contest_detail.registrations.filters.weight_button_all') },
        ...femaleWeightFilters,
        ...maleWeightFilters,
      ];
  $: availableAgeFilters = computeAgeFilters();
  $: availableLiftFilters = ['ALL', ...contestLifts] as LiftFilter[];
  $: weightFilterSummary = (() => {
        if (selectedWeightFilter === 'ALL') {
          return t('contest_detail.registrations.filters.weight_button_all');
        }
        if (selectedWeightFilter === 'FEMALE_OPEN') {
          return `${t('contest_detail.registrations.filters.sex_female')} ${t('contest_detail.registrations.filters.open')}`;
        }
        if (selectedWeightFilter === 'MALE_OPEN') {
          return `${t('contest_detail.registrations.filters.sex_male')} ${t('contest_detail.registrations.filters.open')}`;
        }
        const femaleMatch = weightFilterGroups.female.find((option) => option.id === selectedWeightFilter);
        if (femaleMatch) {
          return `${t('contest_detail.registrations.filters.sex_female')} ${femaleMatch.label}`;
        }
        const maleMatch = weightFilterGroups.male.find((option) => option.id === selectedWeightFilter);
        if (maleMatch) {
          return `${t('contest_detail.registrations.filters.sex_male')} ${maleMatch.label}`;
        }
        const fallback = availableWeightFilters.find((option) => option.id === selectedWeightFilter);
        return fallback?.label ?? t('contest_detail.registrations.filters.weight_button_all');
      })();
  $: ageFilterSummary = (() => {
        const match = availableAgeFilters.find((option) => option.id === selectedAgeFilter);
        return match?.label ?? t('contest_detail.registrations.filters.age_button_all');
      })();
  $: liftFilterSummary = liftFilterLabel(selectedLiftFilter);
  $: if (selectedWeightFilter !== 'ALL' && !availableWeightFilters.some((item) => item.id === selectedWeightFilter)) {
        selectedWeightFilter = 'ALL';
      }
  $: if (selectedAgeFilter !== 'ALL' && !availableAgeFilters.some((item) => item.id === selectedAgeFilter)) {
        selectedAgeFilter = 'ALL';
      }
  $: if (selectedLiftFilter !== 'ALL' && !contestLifts.includes(selectedLiftFilter)) {
        selectedLiftFilter = 'ALL';
      }

  const registrationCount = () => liveRegistrations.length;
</script>

<svelte:head>
  <title>{(contest?.name ?? t('display_table.head.default_contest')) + ' • ' + t('display_table.head.subtitle')}</title>
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
</svelte:head>

<div class="min-h-screen bg-main-bg text-text-primary flex flex-col">
  <header class="w-full px-3 sm:px-4 py-4 bg-main-bg border-b border-border-color">
    <div class="flex flex-col items-center gap-2 text-center">
      <h1 class="font-display text-xl sm:text-2xl md:text-3xl uppercase tracking-[0.12rem] text-text-primary">
        {contest?.name ?? t('display_table.head.default_contest')}
      </h1>
      <p class="text-caption text-text-secondary uppercase tracking-[0.3em]">
        {t('contest_detail.registrations.total', { count: registrationCount() })}
      </p>
    </div>
  </header>

  <main class="flex-1 container-full py-4 space-y-4">
    {#if error}
      <div class="card border-primary-red text-center space-y-4">
        <h2 class="text-h2 text-status-error">{t('display_table.errors.load_failed_title')}</h2>
        <p class="text-body text-text-secondary">{error}</p>
      </div>
    {:else}
      <section class="card space-y-3">
        <h2 class="text-label uppercase tracking-[0.3em] text-text-secondary">
          {t('contest_detail.registrations.filters.heading')}
        </h2>
        <div class="flex flex-wrap items-center gap-2">
          {#if femaleWeightFilters.length > 0 || maleWeightFilters.length > 0}
            <div class="relative" on:click|stopPropagation>
              <button
                type="button"
                class={`${filterTriggerClass(selectedWeightFilter !== 'ALL')} flex min-w-[190px] items-center justify-between gap-3`}
                on:click|stopPropagation={() => toggleFilter('weight')}
              >
                <div class="flex flex-col text-left leading-tight">
                  <span class="font-semibold">{t('contest_detail.registrations.filters.weight_button')}</span>
                  <span class="text-text-secondary">{weightFilterSummary}</span>
                </div>
                <ChevronDown
                  class={`h-3.5 w-3.5 transition-transform ${openFilter === 'weight' ? 'rotate-180' : ''}`}
                  aria-hidden="true"
                />
              </button>
              {#if openFilter === 'weight'}
                <div
                  class="absolute left-0 top-full z-40 mt-2 w-72 rounded border border-border-color bg-element-bg px-3 py-3 shadow-lg"
                  on:click|stopPropagation
                >
                  <div class="space-y-4">
                    <button
                      type="button"
                      class={`${filterTriggerClass(selectedWeightFilter === 'ALL')} w-full justify-start`}
                      on:click={() => selectWeightFilter('ALL')}
                    >
                      {t('contest_detail.registrations.filters.weight_button_all')}
                    </button>
                    {#if femaleWeightFilters.length > 0}
                      <div>
                        <p class="mb-2 text-xxs uppercase tracking-[0.3em] text-text-secondary">
                          {t('contest_detail.registrations.filters.weights_female')}
                        </p>
                        <div class="grid grid-cols-2 gap-2">
                          {#each femaleWeightFilters as option}
                            <button
                              type="button"
                              class={`${filterTriggerClass(selectedWeightFilter === option.id)} w-full`}
                              on:click={() => selectWeightFilter(option.id)}
                            >
                              {option.label}
                            </button>
                          {/each}
                        </div>
                      </div>
                    {/if}
                    {#if maleWeightFilters.length > 0}
                      <div>
                        <p class="mb-2 text-xxs uppercase tracking-[0.3em] text-text-secondary">
                          {t('contest_detail.registrations.filters.weights_male')}
                        </p>
                        <div class="grid grid-cols-2 gap-2">
                          {#each maleWeightFilters as option}
                            <button
                              type="button"
                              class={`${filterTriggerClass(selectedWeightFilter === option.id)} w-full`}
                              on:click={() => selectWeightFilter(option.id)}
                            >
                              {option.label}
                            </button>
                          {/each}
                        </div>
                      </div>
                    {/if}
                  </div>
                </div>
              {/if}
            </div>
          {/if}

          <div class="relative" on:click|stopPropagation>
            <button
              type="button"
              class={`${filterTriggerClass(selectedAgeFilter !== 'ALL')} flex min-w-[170px] items-center justify-between gap-3`}
              on:click|stopPropagation={() => toggleFilter('age')}
            >
              <div class="flex flex-col text-left leading-tight">
                <span class="font-semibold">{t('contest_detail.registrations.filters.age_button')}</span>
                <span class="text-text-secondary">{ageFilterSummary}</span>
              </div>
              <ChevronDown
                class={`h-3.5 w-3.5 transition-transform ${openFilter === 'age' ? 'rotate-180' : ''}`}
                aria-hidden="true"
              />
            </button>
            {#if openFilter === 'age'}
              <div
                class="absolute left-0 top-full z-40 mt-2 w-60 rounded border border-border-color bg-element-bg px-3 py-3 shadow-lg"
                on:click|stopPropagation
              >
                <div class="grid max-h-52 grid-cols-2 gap-2 overflow-y-auto pr-1">
                  {#each availableAgeFilters as option}
                    <button
                      type="button"
                      class={`${filterTriggerClass(selectedAgeFilter === option.id)} w-full`}
                      on:click={() => selectAgeFilter(option.id)}
                    >
                      {option.label}
                    </button>
                  {/each}
                </div>
              </div>
            {/if}
          </div>
          {#if availableLiftFilters.length > 1}
            <div class="relative" on:click|stopPropagation>
              <button
                type="button"
                class={`${filterTriggerClass(selectedLiftFilter !== 'ALL')} flex min-w-[170px] items-center justify-between gap-3`}
                on:click|stopPropagation={() => toggleFilter('lift')}
              >
                <div class="flex flex-col text-left leading-tight">
                  <span class="font-semibold">{t('contest_detail.registrations.filters.lift_button')}</span>
                  <span class="text-text-secondary">{liftFilterSummary}</span>
                </div>
                <ChevronDown
                  class={`h-3.5 w-3.5 transition-transform ${openFilter === 'lift' ? 'rotate-180' : ''}`}
                  aria-hidden="true"
                />
              </button>
              {#if openFilter === 'lift'}
                <div
                  class="absolute left-0 top-full z-40 mt-2 w-52 rounded border border-border-color bg-element-bg px-3 py-3 shadow-lg"
                  on:click|stopPropagation
                >
                  <div class="grid gap-2">
                    {#each availableLiftFilters as liftOption}
                      <button
                        type="button"
                        class={`${filterTriggerClass(selectedLiftFilter === liftOption)} w-full`}
                        on:click={() => selectLiftFilter(liftOption)}
                      >
                        {liftFilterLabel(liftOption)}
                      </button>
                    {/each}
                  </div>
                </div>
              {/if}
            </div>
          {/if}
        </div>
      </section>

      <section class="card space-y-3">
        {#if filteredRows.length === 0}
          <p class="text-caption text-text-secondary text-center py-6">
            {t('contest_detail.registrations.empty')}
          </p>
        {:else}
          <div class="overflow-x-auto">
            <UnifiedContestTable
              rows={filteredRows}
              sortColumn={sortColumn}
              sortDirection={sortDirection}
              onSortChange={handleSortChange}
              readOnly={true}
              lifts={selectedLiftFilter === 'ALL' ? contestLifts : [selectedLiftFilter]}
              weightClasses={referenceData?.weightClasses ?? []}
              ageCategories={referenceData?.ageCategories ?? []}
              showRowNumbers={true}
              showAttemptGrid={false}
              showPointsColumn={false}
              showMaxColumn={false}
              showLabelsColumn={false}
              showRackColumn={false}
              showFlightColumn={false}
            />
          </div>
        {/if}
      </section>
    {/if}
  </main>
</div>
