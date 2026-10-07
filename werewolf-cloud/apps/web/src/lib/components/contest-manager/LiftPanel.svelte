<script lang="ts">
  import { _ } from 'svelte-i18n';
  import UnifiedContestTable from '$lib/components/UnifiedContestTable.svelte';
  import { ChevronDown } from 'lucide-svelte';
  import type {
    PublicAgeFilterOption,
    PublicLabelFilterOption,
    PublicWeightFilterOption,
  } from '$lib/components/public-results-filters';
  import type { AgeCategory, Attempt, Registration, WeightClass } from '$lib/types';
  import type { LiftKind, UnifiedRow } from '$lib/contest-table';
  import type { ExportMenuId } from './export-mapping';
  import type { AttemptWeightChangePayload, RegistrationFilterTarget } from './lift-panel';

  export let lift: LiftKind;
  export let title: string;
  export let rows: UnifiedRow[];
  export let exportMenuId: ExportMenuId;
  export let syncClass: string;
  export let syncBusy = false;
  export let exportingTable = false;
  export let qrBroadcastBusy: Record<'show' | 'hide', boolean> = { show: false, hide: false };
  export let remoteQrVisible = false;
  export let openExportMenu: ExportMenuId | null = null;

  export let registrationsCount = 0;
  export let weightClasses: WeightClass[] = [];
  export let ageCategories: AgeCategory[] = [];
  export let activeFlight: string | null = null;
  export let sortColumn = 'order';
  export let sortDirection: 'asc' | 'desc' = 'asc';

  export let femaleWeightFilters: PublicWeightFilterOption[] = [];
  export let maleWeightFilters: PublicWeightFilterOption[] = [];
  export let availableAgeFilters: PublicAgeFilterOption[] = [];
  export let availableLabelFilters: PublicLabelFilterOption[] = [];
  export let registrationWeightSelectionLabel = '';
  export let registrationAgeSelectionLabel = '';
  export let registrationLabelSelectionLabel = '';
  export let selectedWeightFilter: PublicWeightFilterOption['id'] = 'ALL';
  export let selectedAgeFilter: PublicAgeFilterOption['id'] = 'ALL';
  export let selectedLabelFilter: PublicLabelFilterOption['id'] = 'ALL';
  export let openRegistrationFilter: RegistrationFilterTarget | null = null;
  export let hasRegistrationFiltersActive = false;

  export let currentAttemptId: string | null = null;
  export let currentAttemptLoading: Record<string, boolean> = {};
  export let statusLoading: Record<string, boolean> = {};
  export let attemptWeightPending: Record<string, boolean> = {};

  export let filterButtonClass: (active: boolean) => string = () => '';

  export let onSync: () => void = () => {};
  export let onBroadcastQr: (action: 'show' | 'hide') => void = () => {};
  export let onToggleExportMenu: () => void = () => {};
  export let onExport: (format: 'csv' | 'pdf' | 'jpg') => void = () => {};
  export let onToggleFilter: (target: RegistrationFilterTarget) => void = () => {};
  export let onCloseFilter: () => void = () => {};
  export let onSelectWeight: (filter: PublicWeightFilterOption['id']) => void = () => {};
  export let onSelectAge: (filter: PublicAgeFilterOption['id']) => void = () => {};
  export let onSelectLabel: (filter: PublicLabelFilterOption['id']) => void = () => {};
  export let onClearFilters: () => void = () => {};
  export let onSortChange: (column: string) => void = () => {};
  export let onOpenCompetitorModal: (registration: Registration) => void = () => {};
  export let onSetCurrentAttempt: (attempt: Attempt) => void = () => {};
  export let onAttemptStatusCycle: (attempt: Attempt) => void = () => {};
  export let onAttemptWeightChange: (payload: AttemptWeightChangePayload) => void = () => {};
</script>

<section class="space-y-4">
  <div class="card space-y-6">
    <header class="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
      <h3 class="text-h3 text-text-primary">{title}</h3>
      <div class="flex items-center gap-2 md:gap-3">
        <button
          type="button"
          class={syncClass}
          disabled={syncBusy || rows.length === 0}
          aria-busy={syncBusy}
          on:click={onSync}
        >
          {$_('contest_detail.sync.button')}
        </button>

        <button
          type="button"
          class="btn-secondary px-3 py-1 text-xxs"
          disabled={qrBroadcastBusy[remoteQrVisible ? 'hide' : 'show']}
          aria-busy={qrBroadcastBusy[remoteQrVisible ? 'hide' : 'show']}
          on:click={() => onBroadcastQr(remoteQrVisible ? 'hide' : 'show')}
        >
          {$_(remoteQrVisible ? 'display_table.actions.hide_qr' : 'display_table.actions.show_qr')}
        </button>

        
        <div class="relative" on:click|stopPropagation>
          <button
            type="button"
            class="btn-secondary px-3 py-1 text-xxs"
            disabled={exportingTable || rows.length === 0}
            on:click={onToggleExportMenu}
          >
            {exportingTable ? $_('contest_detail.export.exporting') : $_('contest_detail.export.menu')}
          </button>
          {#if openExportMenu === exportMenuId}
            <div class="absolute right-0 top-full z-40 mt-2 w-48 rounded border border-border-color bg-element-bg shadow-lg">
              <button
                type="button"
                class="flex w-full items-center justify-between px-3 py-2 text-xxs uppercase tracking-[0.2em] transition hover:bg-element-bg/80 disabled:opacity-50"
                disabled={exportingTable}
                on:click={() => onExport('csv')}
              >
                <span>{$_('contest_detail.export.csv')}</span>
              </button>
              <button
                type="button"
                class="flex w-full items-center justify-between px-3 py-2 text-xxs uppercase tracking-[0.2em] transition hover:bg-element-bg/80 disabled:opacity-50"
                disabled={exportingTable}
                on:click={() => onExport('pdf')}
              >
                <span>{$_('contest_detail.export.pdf')}</span>
              </button>
              <button
                type="button"
                class="flex w-full items-center justify-between px-3 py-2 text-xxs uppercase tracking-[0.2em] transition hover:bg-element-bg/80 disabled:opacity-50"
                disabled={exportingTable}
                on:click={() => onExport('jpg')}
              >
                <span>{$_('contest_detail.export.jpg')}</span>
              </button>
            </div>
          {/if}
        </div>
      </div>
    </header>
    <div class="flex flex-wrap items-center gap-2">
      {#if femaleWeightFilters.length > 0 || maleWeightFilters.length > 0}
        <div class="relative" on:click|stopPropagation>
          <button
            type="button"
            class={`${filterButtonClass(selectedWeightFilter !== 'ALL')} flex min-w-[190px] items-center justify-between gap-3`}
            on:click|stopPropagation={() => onToggleFilter('weight')}
          >
            <div class="flex flex-col text-left leading-tight">
              <span class="font-semibold">{$_('contest_detail.registrations.filters.weight_button')}</span>
              <span class="text-text-secondary">{registrationWeightSelectionLabel}</span>
            </div>
            <ChevronDown
              class={`h-3.5 w-3.5 transition-transform ${openRegistrationFilter === 'weight' ? 'rotate-180' : ''}`}
              aria-hidden="true"
            />
          </button>
          {#if openRegistrationFilter === 'weight'}
            <div
              class="absolute left-0 top-full z-40 mt-2 w-72 rounded border border-border-color bg-element-bg px-3 py-3 shadow-lg"
              on:click|stopPropagation
            >
              <div class="space-y-4">
                <button
                  type="button"
                  class={`${filterButtonClass(selectedWeightFilter === 'ALL')} w-full justify-start`}
                  on:click={() => {
                    onSelectWeight('ALL');
                    onCloseFilter();
                  }}
                >
                  {$_('contest_detail.results.filters.all')}
                </button>
                {#if femaleWeightFilters.length > 0}
                  <div>
                    <p class="mb-2 text-xxs uppercase tracking-[0.3em] text-text-secondary">{$_('contest_detail.registrations.filters.weights_female')}</p>
                    <div class="grid grid-cols-2 gap-2">
                      {#each femaleWeightFilters as filter}
                        <button
                          type="button"
                          class={`${filterButtonClass(selectedWeightFilter === filter.id)} w-full`}
                          on:click={() => {
                            onSelectWeight(filter.id);
                            onCloseFilter();
                          }}
                        >
                          {filter.label}
                        </button>
                      {/each}
                    </div>
                  </div>
                {/if}
                {#if maleWeightFilters.length > 0}
                  <div>
                    <p class="mb-2 text-xxs uppercase tracking-[0.3em] text-text-secondary">{$_('contest_detail.registrations.filters.weights_male')}</p>
                    <div class="grid grid-cols-2 gap-2">
                      {#each maleWeightFilters as filter}
                        <button
                          type="button"
                          class={`${filterButtonClass(selectedWeightFilter === filter.id)} w-full`}
                          on:click={() => {
                            onSelectWeight(filter.id);
                            onCloseFilter();
                          }}
                        >
                          {filter.label}
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
          class={`${filterButtonClass(selectedAgeFilter !== 'ALL')} flex min-w-[170px] items-center justify-between gap-3`}
          on:click|stopPropagation={() => onToggleFilter('age')}
        >
          <div class="flex flex-col text-left leading-tight">
            <span class="font-semibold">{$_('contest_detail.registrations.filters.age_button')}</span>
            <span class="text-text-secondary">{registrationAgeSelectionLabel}</span>
          </div>
          <ChevronDown
            class={`h-3.5 w-3.5 transition-transform ${openRegistrationFilter === 'age' ? 'rotate-180' : ''}`}
            aria-hidden="true"
          />
        </button>
        {#if openRegistrationFilter === 'age'}
          <div
            class="absolute left-0 top-full z-40 mt-2 w-60 rounded border border-border-color bg-element-bg px-3 py-3 shadow-lg"
            on:click|stopPropagation
          >
            <div class="grid max-h-52 grid-cols-2 gap-2 overflow-y-auto pr-1">
              {#each availableAgeFilters as filter}
                <button
                  type="button"
                  class={`${filterButtonClass(selectedAgeFilter === filter.id)} w-full`}
                  on:click={() => {
                    onSelectAge(filter.id);
                    onCloseFilter();
                  }}
                >
                  {filter.label}
                </button>
              {/each}
            </div>
          </div>
        {/if}
      </div>

      <div class="relative" on:click|stopPropagation>
        <button
          type="button"
          class={`${filterButtonClass(selectedLabelFilter !== 'ALL')} flex min-w-[170px] items-center justify-between gap-3`}
          on:click|stopPropagation={() => onToggleFilter('labels')}
        >
          <div class="flex flex-col text-left leading-tight">
            <span class="font-semibold">{$_('contest_detail.registrations.filters.labels_button')}</span>
            <span class="text-text-secondary">{registrationLabelSelectionLabel}</span>
          </div>
          <ChevronDown
            class={`h-3.5 w-3.5 transition-transform ${openRegistrationFilter === 'labels' ? 'rotate-180' : ''}`}
            aria-hidden="true"
          />
        </button>
        {#if openRegistrationFilter === 'labels'}
          <div
            class="absolute left-0 top-full z-40 mt-2 w-60 rounded border border-border-color bg-element-bg px-3 py-3 shadow-lg"
            on:click|stopPropagation
          >
            <div class="grid max-h-52 grid-cols-2 gap-2 overflow-y-auto pr-1">
              {#each availableLabelFilters as filter}
                <button
                  type="button"
                  class={`${filterButtonClass(selectedLabelFilter === filter.id)} w-full`}
                  on:click={() => {
                    onSelectLabel(filter.id);
                    onCloseFilter();
                  }}
                >
                  {filter.label}
                </button>
              {/each}
            </div>
          </div>
        {/if}
      </div>

      {#if hasRegistrationFiltersActive}
        <button
          type="button"
          class="ml-auto text-xxs text-text-secondary underline decoration-dotted decoration-1 underline-offset-4"
          on:click={onClearFilters}
        >
          {$_('contest_detail.registrations.filters.clear')}
        </button>
      {/if}
    </div>
    {#if registrationsCount === 0}
      <div class="text-center py-8 text-text-secondary">{$_('contest_detail.registrations.empty')}</div>
    {:else if rows.length === 0}
      <div class="text-center py-8 text-text-secondary">{$_('contest_detail.registrations.empty_filter')}</div>
    {:else}
      <div class="max-h-[70vh] overflow-x-auto overflow-y-auto">
        <UnifiedContestTable
          rows={rows}
          sortColumn={sortColumn}
          sortDirection={sortDirection}
          readOnly={false}
          activeFlight={activeFlight}
          lifts={[lift]}
          weightClasses={weightClasses}
          ageCategories={ageCategories}
          currentAttemptId={currentAttemptId}
          currentAttemptLoading={currentAttemptLoading}
          statusLoading={statusLoading}
          attemptWeightPending={attemptWeightPending}
          onSortChange={onSortChange}
          onOpenCompetitorModal={onOpenCompetitorModal}
          onSetCurrentAttempt={onSetCurrentAttempt}
          showRowNumbers={true}
          onAttemptStatusCycle={onAttemptStatusCycle}
          onAttemptWeightChange={onAttemptWeightChange}
        />
      </div>
    {/if}
  </div>
</section>
