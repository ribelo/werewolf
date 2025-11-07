<script lang="ts">
  import type { PlatePlanEntry } from '$lib/types';

  export let plates: PlatePlanEntry[];
  export let heightPx = 120;
  export let minWidthPx = 6;
  export let maxWidthPx = 28;
  export let maxPlateWeight: number | null = null;
  const minHeightRatio = 0.25; // theoretical minimum height (as a fraction of container height)

  // Calculate max weight in the current plan and choose the contest-level reference
  $: maxWeightInPlan = Math.max(...plates.map((p) => p.plateWeight), 1);
  $: referenceMaxWeight =
    maxPlateWeight && maxPlateWeight > 0 ? Math.max(maxPlateWeight, maxWeightInPlan) : maxWeightInPlan;

  function weightRatio(plateWeight: number): number {
    if (!referenceMaxWeight || referenceMaxWeight <= 0) {
      return 1;
    }
    return Math.min(Math.max(plateWeight / referenceMaxWeight, 0), 1);
  }

  function calculateWidth(plateWeight: number): number {
    const normalized = weightRatio(plateWeight);
    const linearWidth = minWidthPx + normalized * (maxWidthPx - minWidthPx);
    return Math.max(minWidthPx, Math.min(maxWidthPx, linearWidth));
  }

  function calculateHeightPercentage(plateWeight: number): number {
    const normalized = weightRatio(plateWeight);
    const eased = Math.sqrt(normalized); // ease-out to avoid tiny plates being too short
    const ratio = minHeightRatio + eased * (1 - minHeightRatio);
    return Math.min(100, Math.max(minHeightRatio * 100, ratio * 100));
  }
</script>

{#if plates.length > 0}
  <div
    class="flex items-center justify-center overflow-hidden"
    style="height: {heightPx}px;"
    role="presentation"
  >
    {#each plates as plate (plate.plateWeight)}
      {#each Array(plate.count) as _, index}
        <div
          class="flex-shrink-0 border-4 border-white/90"
          style="
            background-color: {plate.color};
            width: {calculateWidth(plate.plateWeight)}px;
            height: {calculateHeightPercentage(plate.plateWeight)}%;
          "
          aria-hidden="true"
        />
      {/each}
    {/each}
  </div>
{/if}
