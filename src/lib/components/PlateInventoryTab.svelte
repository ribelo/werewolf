<script lang="ts">
  import { invoke } from '@tauri-apps/api/core';
  import { _ } from 'svelte-i18n';
  import { onMount, onDestroy } from 'svelte';
  import type { Contest, PlateSet } from '../types/contest';
  import { VALIDATION } from '../constants/validation';

  export let contest: Contest;

  let plateSets: PlateSet[] = [];
  let newPlate = {
    weight: '',
    quantity: ''
  };
  let loadingPlates = false;
  let plateError = '';
  let mensBarWeight = 20.0; // Default men's bar weight
  let womensBarWeight = 15.0; // Default women's bar weight
  let barWeightError = ''; // Single error message for bar weight issues

  // Debounce timers
  let quantityUpdateTimer: number | null = null;
  let barWeightSaveTimer: number | null = null;

  onMount(() => {
    loadPlateSets();
    loadBarWeights();
  });

  onDestroy(() => {
    // Clean up any pending timers and save final changes
    if (quantityUpdateTimer) {
      clearTimeout(quantityUpdateTimer);
    }
    if (barWeightSaveTimer) {
      clearTimeout(barWeightSaveTimer);
      // Save any pending bar weight changes synchronously
      invoke('update_contest_bar_weights', {
        contestId: contest.id,
        mensBarWeight: mensBarWeight,
        womensBarWeight: womensBarWeight,
      }).catch(err => {
        console.error('Error saving bar weights on destroy:', err);
      });
    }
  });

  async function loadPlateSets() {
    if (!contest.id) return;
    
    loadingPlates = true;
    plateError = '';
    
    try {
      plateSets = await invoke('plate_set_list', { contestId: contest.id });
      plateSets.sort((a, b) => b.plateWeight - a.plateWeight);
    } catch (err) {
      plateError = $_('plates.load_error');
      console.error('Error loading plate sets:', err);
    } finally {
      loadingPlates = false;
    }
  }

  async function loadBarWeights() {
    if (!contest.id) return;
    
    try {
      const [mensWeight, womensWeight] = await invoke<[number, number]>('get_contest_bar_weights', { contestId: contest.id });
      mensBarWeight = mensWeight;
      womensBarWeight = womensWeight;
    } catch (err) {
      console.error('Error loading bar weights:', err);
      // Keep default values on error
    }
  }

  async function addPlate() {
    // Only check for empty fields
    if (!newPlate.weight || !newPlate.quantity) {
      plateError = $_('plates.invalid_weight');
      return;
    }

    const weight = parseFloat(newPlate.weight);
    const quantity = parseInt(newPlate.quantity);

    // Only check for basic parsing errors
    if (isNaN(weight) || isNaN(quantity)) {
      plateError = $_('plates.invalid_weight');
      return;
    }

    try {
      const plateSet = await invoke<PlateSet>('plate_set_create', {
        plateSet: {
          contestId: contest.id,
          plateWeight: weight,
          quantity: quantity
        }
      });

      plateSets = [...plateSets, plateSet].sort((a, b) => b.plateWeight - a.plateWeight);
      newPlate = { weight: '', quantity: '' };
      plateError = '';
    } catch (err) {
      // Display backend error message directly
      plateError = (err as Error)?.message || $_('plates.add_error');
      console.error('Error adding plate:', err);
    }
  }

  function updatePlateQuantity(plateId: string, newQuantity: number) {
    if (newQuantity <= 0) return;

    // Update UI immediately for responsiveness
    plateSets = plateSets.map(p => 
      p.id === plateId ? { ...p, quantity: newQuantity } : p
    );

    // Clear existing timer
    if (quantityUpdateTimer) {
      clearTimeout(quantityUpdateTimer);
    }

    // Debounce the actual database update
    quantityUpdateTimer = Number(setTimeout(async () => {
      try {
        await invoke('plate_set_update_quantity', {
          id: plateId,
          quantity: newQuantity
        });
      } catch (err) {
        plateError = $_('plates.update_error');
        console.error('Error updating plate quantity:', err);
        // Revert on error
        loadPlateSets();
      }
    }, VALIDATION.QUANTITY_UPDATE_DELAY));
  }

  async function deletePlate(plateId: string) {
    try {
      await invoke('plate_set_delete', { id: plateId });
      plateSets = plateSets.filter(p => p.id !== plateId);
    } catch (err) {
      plateError = $_('plates.delete_error');
      console.error('Error deleting plate:', err);
    }
  }

  async function addDefaultPlates() {
    const defaultPlates = [
      { weight: 25, quantity: 4 },
      { weight: 20, quantity: 2 },
      { weight: 15, quantity: 2 },
      { weight: 10, quantity: 2 },
      { weight: 5, quantity: 2 },
      { weight: 2.5, quantity: 2 },
      { weight: 1.25, quantity: 2 }
    ];

    for (const plate of defaultPlates) {
      // Skip if already exists
      if (plateSets.some(p => p.plateWeight === plate.weight)) continue;

      try {
        const plateSet = await invoke<PlateSet>('plate_set_create', {
          plateSet: {
            contestId: contest.id,
            plateWeight: plate.weight,
            quantity: plate.quantity
          }
        });
        plateSets = [...plateSets, plateSet];
      } catch (err) {
        console.error(`Error adding default plate ${plate.weight}kg:`, err);
      }
    }

    plateSets = plateSets.sort((a, b) => b.plateWeight - a.plateWeight);
  }

  function getMinimumIncrement(): number {
    if (plateSets.length === 0) return 0;
    
    // Only consider plates that actually have quantity > 0
    const availablePlates = plateSets.filter(p => p.quantity > 0);
    if (availablePlates.length === 0) return 0;
    
    const smallestPlate = Math.min(...availablePlates.map(p => p.plateWeight));
    return smallestPlate * 2;
  }

  function getMaximumWeightForGender(gender: 'Male' | 'Female'): number {
    const barWeight = gender === 'Female' ? womensBarWeight : mensBarWeight;
    
    if (plateSets.length === 0) return barWeight;
    
    // Calculate maximum weight per side using all available plates
    const maxSideWeight = plateSets
      .filter(p => p.quantity > 0)
      .reduce((total, plate) => total + (plate.plateWeight * plate.quantity), 0);
    
    // Total = both sides + actual bar weight
    return (maxSideWeight * 2) + barWeight;
  }

  // Debounced bar weight save function - let backend handle validation

  async function saveBarWeights() {
    barWeightError = '';
    
    // Clear existing timer
    if (barWeightSaveTimer) {
      clearTimeout(barWeightSaveTimer);
    }

    // Debounce the save to avoid spamming the backend
    barWeightSaveTimer = Number(setTimeout(async () => {
      try {
        await invoke('update_contest_bar_weights', {
          contestId: contest.id,
          mensBarWeight: mensBarWeight,
          womensBarWeight: womensBarWeight,
        });
        barWeightError = ''; // Clear any previous errors on success
      } catch (err) {
        barWeightError = (err as Error)?.message || $_('plates.bar_weight_save_error');
        console.error('Error saving bar weights:', err);
      }
    }, 500));
  }

  export { plateError };
</script>

<!-- Plates Tab -->
<div class="space-y-4">
  <div class="text-text-secondary mb-4">
    {$_('plates.description')}
  </div>

  <!-- Bar Weight Configuration -->
  <div class="bg-element-bg p-4 rounded border border-border-color">
    <div class="grid grid-cols-2 gap-4">
      <!-- Men's Bar Weight -->
      <div>
        <label class="input-label" for="mens-bar-weight">{$_('plates.mens_bar_weight_label')}</label>
        <input
          id="mens-bar-weight"
          type="number"
          bind:value={mensBarWeight}
          on:input={saveBarWeights}
          class="input-field w-full"
          step={VALIDATION.WEIGHT_INCREMENT.toString()}
          min="0"
          max={VALIDATION.MAX_BAR_WEIGHT.toString()}
        />
        <div class="text-text-secondary text-xs mt-1">{$_('plates.mens_bar_help')}</div>
      </div>

      <!-- Women's Bar Weight -->
      <div>
        <label class="input-label" for="womens-bar-weight">{$_('plates.womens_bar_weight_label')}</label>
        <input
          id="womens-bar-weight"
          type="number"
          bind:value={womensBarWeight}
          on:input={saveBarWeights}
          class="input-field w-full"
          step={VALIDATION.WEIGHT_INCREMENT.toString()}
          min="0"
          max={VALIDATION.MAX_BAR_WEIGHT.toString()}
        />
        <div class="text-text-secondary text-xs mt-1">{$_('plates.womens_bar_help')}</div>
      </div>
    </div>
    {#if barWeightError}
      <div class="text-red-500 text-sm mt-2">{barWeightError}</div>
    {/if}
  </div>

  <!-- Weight Statistics -->
  {#if plateSets.length > 0}
    <div class="grid grid-cols-3 gap-4">
      <!-- Minimum Increment -->
      <div class="bg-element-bg p-3 rounded border border-border-color">
        <div class="text-sm text-text-secondary">{$_('plates.minimum_increment')}</div>
        <div class="text-lg font-bold text-primary-red">{getMinimumIncrement()} kg</div>
        <div class="text-xs text-text-secondary">{$_('plates.based_on_smallest')}</div>
      </div>
      
      <!-- Men's Maximum Weight -->
      <div class="bg-element-bg p-3 rounded border border-border-color">
        <div class="text-sm text-text-secondary">{$_('plates.mens_maximum_weight')}</div>
        <div class="text-lg font-bold text-primary-red">{getMaximumWeightForGender('Male')} kg</div>
        <div class="text-xs text-text-secondary">{$_('plates.with_mens_bar')}</div>
      </div>

      <!-- Women's Maximum Weight -->
      <div class="bg-element-bg p-3 rounded border border-border-color">
        <div class="text-sm text-text-secondary">{$_('plates.womens_maximum_weight')}</div>
        <div class="text-lg font-bold text-primary-red">{getMaximumWeightForGender('Female')} kg</div>
        <div class="text-xs text-text-secondary">{$_('plates.with_womens_bar')}</div>
      </div>
    </div>
  {/if}

  <!-- Add New Plate -->
  <div class="bg-element-bg p-4 rounded border border-border-color">
    <div class="grid grid-cols-3 gap-2">
      <input
        type="number"
        bind:value={newPlate.weight}
        placeholder={$_('plates.weight_label')}
        class="input-field"
        step={VALIDATION.WEIGHT_INCREMENT.toString()}
        min={VALIDATION.WEIGHT_INCREMENT.toString()}
        max={VALIDATION.MAX_PLATE_WEIGHT.toString()}
      />
      <input
        type="number"
        bind:value={newPlate.quantity}
        placeholder={$_('plates.quantity_label')}
        class="input-field"
        min="1"
        max={VALIDATION.MAX_PLATE_QUANTITY.toString()}
      />
      <button
        on:click={addPlate}
        class="btn-primary text-sm"
      >
        {$_('plates.add_plate')}
      </button>
    </div>
    {#if plateError}
      <div class="text-red-500 text-sm mt-2">{plateError}</div>
    {/if}
  </div>

  <!-- Plate List -->
  {#if loadingPlates}
    <div class="text-center text-text-secondary py-8">
      {$_('general.loading')}...
    </div>
  {:else if plateSets.length === 0}
    <div class="text-center py-8">
      <div class="text-text-secondary mb-4">{$_('plates.no_plates')}</div>
      <button
        on:click={addDefaultPlates}
        class="btn-secondary"
      >
        {$_('plates.default_plates')}
      </button>
    </div>
  {:else}
    <div class="space-y-2">
      {#each plateSets as plate (plate.id)}
        <div class="flex items-center justify-between bg-element-bg p-3 rounded border border-border-color">
          <div class="flex items-center space-x-4">
            <span class="font-mono font-bold text-lg text-text-primary">
              {plate.plateWeight} kg
            </span>
            <div class="flex items-center space-x-2">
              <button
                on:click={() => updatePlateQuantity(plate.id, plate.quantity - 1)}
                class="w-8 h-8 bg-card-bg border border-border-color rounded hover:bg-primary-red hover:text-black transition-colors"
                disabled={plate.quantity <= 1}
              >
                -
              </button>
              <span class="font-mono w-12 text-center">{plate.quantity}</span>
              <button
                on:click={() => updatePlateQuantity(plate.id, plate.quantity + 1)}
                class="w-8 h-8 bg-card-bg border border-border-color rounded hover:bg-primary-red hover:text-black transition-colors"
              >
                +
              </button>
              <span class="text-text-secondary text-sm ml-2">{$_('plates.quantity_label')}</span>
            </div>
          </div>
          <button
            on:click={() => deletePlate(plate.id)}
            class="text-red-500 hover:text-red-400 transition-colors"
          >
            {$_('plates.remove_plate')}
          </button>
        </div>
      {/each}
    </div>
  {/if}
</div>