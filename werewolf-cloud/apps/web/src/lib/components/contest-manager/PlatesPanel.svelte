<script lang="ts">
  import { _ } from 'svelte-i18n';
  import type { ContestBarWeights, ContestDetail, ContestPlateSetEntry } from '$lib/types';

  /** Bar weight / clamp settings and plate set editor; rendered on two tabs. */
  export let contest: ContestDetail | null = null;
  export let contestBarWeights: ContestBarWeights | null = null;
  export let contestPlateSets: ContestPlateSetEntry[] = [];
  export let platesBusy = false;
  export let barWeightsBusy = false;
  export let mensBarWeightSetting: number | null = null;
  export let womensBarWeightSetting: number | null = null;
  export let clampWeightSetting: number | null = null;
  export let newPlateWeight: number | null = null;
  export let newPlateQuantity: number | null = null;
  export let newPlateColor: string | null = null;
  export let defaultPlateColor = '#374151';
  export let displayWeightValue: (value: number | null | undefined) => string = () => '';

  export let onSaveBarWeights: () => void = () => {};
  export let onPlateWeightChange: (
    plateWeight: number,
    quantity: number,
    color: string | null,
    event: Event
  ) => void = () => {};
  export let onPlateQuantityChange: (plateWeight: number, event: Event) => void = () => {};
  export let onPlateColorChange: (plateWeight: number, event: Event) => void = () => {};
  export let onDeletePlate: (plateWeight: number) => void = () => {};
  export let onAddPlate: () => void = () => {};
</script>

<section class="space-y-4">
  <div class="card space-y-4">
    <header class="space-y-3">
      <div>
        <h3 class="text-h3 text-text-primary">{$_('contest_detail.plates.title')}</h3>
        <p class="text-body text-text-secondary">{$_('contest_detail.plates.subtitle')}</p>
      </div>
      {#if contestBarWeights || contest}
        <div class="grid gap-2 md:grid-cols-2 text-caption text-text-secondary uppercase tracking-[0.35em]">
          <span>{$_('contest_detail.plates.bar_weight_men', { values: { weight: displayWeightValue(contestBarWeights?.mensBarWeight ?? contest?.mensBarWeight ?? null) } })}</span>
          <span>{$_('contest_detail.plates.bar_weight_women', { values: { weight: displayWeightValue(contestBarWeights?.womensBarWeight ?? contest?.womensBarWeight ?? null) } })}</span>
        </div>
      {/if}
    </header>

    <div class="space-y-4">
      <div class="grid gap-4 md:grid-cols-3">
        <div>
          <label class="input-label" for="mens-bar-weight-setting">
            {$_('contest_detail.plates.bar_weight_men', { values: { weight: '' } })}
          </label>
          <input id="mens-bar-weight-setting" class="input-field" type="number" step="0.25" bind:value={mensBarWeightSetting} />
        </div>
        <div>
          <label class="input-label" for="womens-bar-weight-setting">
            {$_('contest_detail.plates.bar_weight_women', { values: { weight: '' } })}
          </label>
          <input id="womens-bar-weight-setting" class="input-field" type="number" step="0.25" bind:value={womensBarWeightSetting} />
        </div>
        <div>
          <label class="input-label" for="clamp-weight-setting">
            {$_('contest_detail.plates.clamp_weight_label')}
          </label>
          <input id="clamp-weight-setting" class="input-field" type="number" step="0.25" bind:value={clampWeightSetting} />
          <p class="text-caption text-text-secondary mt-1">{$_('contest_detail.plates.clamp_weight_hint')}</p>
        </div>
        <div class="md:col-span-3">
          <button class="btn-primary px-3 py-1 text-xxs" disabled={barWeightsBusy} on:click|preventDefault={onSaveBarWeights}>
            {barWeightsBusy ? $_('buttons.saving') : $_('buttons.save')}
          </button>
        </div>
      </div>

      <div class="overflow-x-auto">
        <table class="min-w-full text-left text-sm text-text-secondary">
          <thead class="bg-element-bg text-label">
            <tr>
              <th class="px-4 py-3">{$_('contest_detail.plates.columns.weight')}</th>
              <th class="px-4 py-3">{$_('contest_detail.plates.columns.quantity')}</th>
              <th class="px-4 py-3">{$_('contest_detail.plates.columns.color')}</th>
              <th class="px-4 py-3 text-right">{$_('contest_table.columns.actions')}</th>
            </tr>
          </thead>
          <tbody>
            {#if contestPlateSets.length === 0}
              <tr>
                <td class="px-4 py-3 text-text-secondary" colspan="4">{$_('contest_detail.plates.empty')}</td>
              </tr>
            {/if}
            {#each contestPlateSets as plate, idx (plate.plateWeight ?? plate.weight ?? idx)}
  {@const plateWeight = plate.plateWeight ?? plate.weight ?? 0}
              <tr class="border-b border-border-color last:border-b-0">
                <td class="px-4 py-3">
                  <input
                    class="input-field w-28"
                    type="number"
                    min="0.25"
                    step="0.25"
                    value={displayWeightValue(plateWeight)}
                    on:change={(event) => onPlateWeightChange(plateWeight, plate.quantity, plate.color ?? null, event)}
                  />
                </td>
                <td class="px-4 py-3">
                  <input
                    class="input-field w-24"
                    type="number"
                    min="0"
                    step="1"
                    value={plate.quantity}
                    on:change={(event) => onPlateQuantityChange(plateWeight, event)}
                  />
                </td>
                <td class="px-4 py-3">
                  <div class="flex flex-wrap items-center gap-2">
                    <input
                      class="h-10 w-10 cursor-pointer rounded border border-border-color bg-transparent p-0"
                      type="color"
                      value={plate.color ?? defaultPlateColor}
                      aria-label={$_('contest_detail.plates.columns.color')}
                      on:change={(event) => onPlateColorChange(plateWeight, event)}
                    />
                    <input
                      class="input-field w-32 font-mono"
                      type="text"
                      value={plate.color ?? defaultPlateColor}
                      placeholder={defaultPlateColor}
                      on:change={(event) => onPlateColorChange(plateWeight, event)}
                    />
                  </div>
                </td>
                <td class="px-4 py-3 text-right">
                  <button class="btn-secondary px-3 py-1 text-xxs" on:click={() => onDeletePlate(plateWeight)} disabled={platesBusy}>{$_('buttons.delete')}</button>
                </td>
              </tr>
            {/each}
            <tr>
              <td class="px-4 py-3">
                <input class="input-field w-28" type="number" step="0.25" placeholder="np. 25" bind:value={newPlateWeight} />
              </td>
              <td class="px-4 py-3">
                <input class="input-field w-24" type="number" min="0" step="1" placeholder="0" bind:value={newPlateQuantity} />
              </td>
              <td class="px-4 py-3">
                <div class="flex flex-wrap items-center gap-2">
                  <input
                    class="h-10 w-10 cursor-pointer rounded border border-border-color bg-transparent p-0"
                    type="color"
                    value={newPlateColor ?? defaultPlateColor}
                    aria-label={$_('contest_detail.plates.columns.color')}
                    on:change={(event) => (newPlateColor = event.currentTarget.value)}
                  />
                  <input
                    class="input-field w-36 font-mono"
                    type="text"
                    placeholder={defaultPlateColor}
                    bind:value={newPlateColor}
                  />
                </div>
              </td>
              <td class="px-4 py-3 text-right">
                <button class="btn-primary px-3 py-1 text-xxs" on:click|preventDefault={onAddPlate} disabled={platesBusy}>{$_('buttons.add')}</button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</section>
