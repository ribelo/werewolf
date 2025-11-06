<script lang="ts">
  import type { PlatePlanEntry } from '$lib/types';

  export let plates: PlatePlanEntry[];
  export let heightPx = 120;
  export let minWidthPx = 6;
  export let maxWidthPx = 28;

  // Calculate max weight in the plan for width scaling (reactive)
  $: maxWeightInPlan = Math.max(...plates.map(p => p.plateWeight), 1);

  function calculateWidth(plateWeight: number): number {
    const linearWidth = minWidthPx + (plateWeight / maxWeightInPlan) * (maxWidthPx - minWidthPx);
    // Clamp to min/max bounds
    return Math.max(minWidthPx, Math.min(maxWidthPx, linearWidth));
  }
</script>

{#if plates.length > 0}
  <div
    class="flex items-center overflow-hidden"
    style="height: {heightPx}px;"
    role="presentation"
  >
    {#each plates as plate (plate.plateWeight)}
      {#each Array(plate.count) as _, index}
        <div
          class="flex-shrink-0"
          style="
            background-color: {plate.color};
            width: {calculateWidth(plate.plateWeight)}px;
            height: 100%;
          "
          aria-hidden="true"
        />
      {/each}
    {/each}
  </div>
{/if}