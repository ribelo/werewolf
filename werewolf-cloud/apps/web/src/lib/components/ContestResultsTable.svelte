<script lang="ts">
  import type { ComponentType } from 'svelte';
  import { _ } from 'svelte-i18n';
  import type { ContestRankingEntry } from '$lib/types';

  export let rows: ContestRankingEntry[] = [];
  export let selectedView: 'open' | 'age' | 'weight' | 'tag' = 'open';
  export let hasSquatResults = false;
  export let hasBenchResults = false;
  export let hasDeadliftResults = false;
  export let onSort: (column: string) => void;
  export let getPlace: (entry: ContestRankingEntry) => number | null;
  export let getCategory: (entry: ContestRankingEntry) => string;
  export let formatLift: (value?: number | null) => string;
  export let formatPoints: (value?: number | null) => string;
  export let formatName: (first?: string | null, last?: string | null) => string;
  export let ariaSort: (column: string) => 'none' | 'ascending' | 'descending';
  export let indicator: (column: string) => ComponentType | null;
</script>

<div class="overflow-x-auto">
  <table class="min-w-full text-left text-sm text-text-secondary">
    <thead class="bg-element-bg text-label">
      <tr>
        <th
          class="px-4 py-3 cursor-pointer transition-colors hover:bg-element-bg/80"
          role="columnheader"
          aria-sort={ariaSort('place')}
          on:click={() => onSort('place')}
        >
          <div class="flex items-center gap-1">
            <span>{$_('contest_detail.results.columns.place')}</span>
            <span aria-hidden="true">
              {#if indicator('place')}
                <svelte:component this={indicator('place')} class="h-3.5 w-3.5 opacity-70" />
              {/if}
            </span>
          </div>
        </th>
        <th
          class="px-4 py-3 cursor-pointer transition-colors hover:bg-element-bg/80"
          role="columnheader"
          aria-sort={ariaSort('lifter')}
          on:click={() => onSort('lifter')}
        >
          <div class="flex items-center gap-1">
            <span>{$_('contest_detail.results.columns.lifter')}</span>
            <span aria-hidden="true">
              {#if indicator('lifter')}
                <svelte:component this={indicator('lifter')} class="h-3.5 w-3.5 opacity-70" />
              {/if}
            </span>
          </div>
        </th>
        {#if selectedView !== 'open'}
          <th
            class="px-4 py-3 cursor-pointer transition-colors hover:bg-element-bg/80"
            role="columnheader"
            aria-sort={ariaSort('category')}
            on:click={() => onSort('category')}
          >
            <div class="flex items-center gap-1">
              <span>
                {selectedView === 'age'
                  ? $_('contest_detail.results.columns.age_category')
                  : $_('contest_detail.results.columns.weight_class')}
              </span>
              <span aria-hidden="true">
                {#if indicator('category')}
                  <svelte:component this={indicator('category')} class="h-3.5 w-3.5 opacity-70" />
                {/if}
              </span>
            </div>
          </th>
        {/if}
        {#if hasSquatResults}
          <th
            class="px-4 py-3 cursor-pointer transition-colors hover:bg-element-bg/80"
            role="columnheader"
            aria-sort={ariaSort('bestSquat')}
            on:click={() => onSort('bestSquat')}
          >
            <div class="flex items-center gap-1">
              <span>{$_('contest_detail.results.columns.best_squat')}</span>
              <span aria-hidden="true">
                {#if indicator('bestSquat')}
                  <svelte:component this={indicator('bestSquat')} class="h-3.5 w-3.5 opacity-70" />
                {/if}
              </span>
            </div>
          </th>
        {/if}
        {#if hasBenchResults}
          <th
            class="px-4 py-3 cursor-pointer transition-colors hover:bg-element-bg/80"
            role="columnheader"
            aria-sort={ariaSort('bestBench')}
            on:click={() => onSort('bestBench')}
          >
            <div class="flex items-center gap-1">
              <span>{$_('contest_detail.results.columns.best_bench')}</span>
              <span aria-hidden="true">
                {#if indicator('bestBench')}
                  <svelte:component this={indicator('bestBench')} class="h-3.5 w-3.5 opacity-70" />
                {/if}
              </span>
            </div>
          </th>
        {/if}
        {#if hasDeadliftResults}
          <th
            class="px-4 py-3 cursor-pointer transition-colors hover:bg-element-bg/80"
            role="columnheader"
            aria-sort={ariaSort('bestDeadlift')}
            on:click={() => onSort('bestDeadlift')}
          >
            <div class="flex items-center gap-1">
              <span>{$_('contest_detail.results.columns.best_deadlift')}</span>
              <span aria-hidden="true">
                {#if indicator('bestDeadlift')}
                  <svelte:component this={indicator('bestDeadlift')} class="h-3.5 w-3.5 opacity-70" />
                {/if}
              </span>
            </div>
          </th>
        {/if}
        {#if hasSquatResults}
          <th
            class="px-4 py-3 cursor-pointer transition-colors hover:bg-element-bg/80"
            role="columnheader"
            aria-sort={ariaSort('squatPoints')}
            on:click={() => onSort('squatPoints')}
          >
            <div class="flex items-center gap-1">
              <span>{$_('contest_detail.results.columns.squat_points')}</span>
              <span aria-hidden="true">
                {#if indicator('squatPoints')}
                  <svelte:component this={indicator('squatPoints')} class="h-3.5 w-3.5 opacity-70" />
                {/if}
              </span>
            </div>
          </th>
        {/if}
        {#if hasBenchResults}
          <th
            class="px-4 py-3 cursor-pointer transition-colors hover:bg-element-bg/80"
            role="columnheader"
            aria-sort={ariaSort('benchPoints')}
            on:click={() => onSort('benchPoints')}
          >
            <div class="flex items-center gap-1">
              <span>{$_('contest_detail.results.columns.bench_points')}</span>
              <span aria-hidden="true">
                {#if indicator('benchPoints')}
                  <svelte:component this={indicator('benchPoints')} class="h-3.5 w-3.5 opacity-70" />
                {/if}
              </span>
            </div>
          </th>
        {/if}
        {#if hasDeadliftResults}
          <th
            class="px-4 py-3 cursor-pointer transition-colors hover:bg-element-bg/80"
            role="columnheader"
            aria-sort={ariaSort('deadliftPoints')}
            on:click={() => onSort('deadliftPoints')}
          >
            <div class="flex items-center gap-1">
              <span>{$_('contest_detail.results.columns.deadlift_points')}</span>
              <span aria-hidden="true">
                {#if indicator('deadliftPoints')}
                  <svelte:component this={indicator('deadliftPoints')} class="h-3.5 w-3.5 opacity-70" />
                {/if}
              </span>
            </div>
          </th>
        {/if}
      </tr>
    </thead>
    <tbody>
      {#each rows as result (result.id ?? result.registrationId)}
        <tr class={`border-b border-border-color last:border-b-0 ${result.isDisqualified ? 'bg-status-error/20' : ''}`}>
          <td class="px-4 py-3 font-semibold text-text-primary">
            {#if getPlace(result) !== null}
              {getPlace(result)}
            {:else}
              –
            {/if}
          </td>
          <td class="px-4 py-3 text-text-secondary">{formatName(result.firstName, result.lastName)}</td>
          {#if selectedView !== 'open'}
            <td class="px-4 py-3 text-text-secondary">{getCategory(result)}</td>
          {/if}
          {#if hasSquatResults}
            <td class="px-4 py-3 text-text-secondary">{formatLift(result.bestSquat)}</td>
          {/if}
          {#if hasBenchResults}
            <td class="px-4 py-3 text-text-secondary">{formatLift(result.bestBench)}</td>
          {/if}
          {#if hasDeadliftResults}
            <td class="px-4 py-3 text-text-secondary">{formatLift(result.bestDeadlift)}</td>
          {/if}
          {#if hasSquatResults}
            <td class="px-4 py-3 text-text-secondary">{formatPoints(result.squatPoints)}</td>
          {/if}
          {#if hasBenchResults}
            <td class="px-4 py-3 text-text-secondary">{formatPoints(result.benchPoints)}</td>
          {/if}
          {#if hasDeadliftResults}
            <td class="px-4 py-3 text-text-secondary">{formatPoints(result.deadliftPoints)}</td>
          {/if}
        </tr>
      {/each}
    </tbody>
  </table>
</div>
