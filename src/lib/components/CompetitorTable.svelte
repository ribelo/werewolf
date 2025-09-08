<script lang="ts">
  import { _ } from 'svelte-i18n';
  import { Hash, X, Cast } from 'lucide-svelte';
  import CompetitorThumbnail from './CompetitorThumbnail.svelte';

  // Props
  export let lifters: Array<{
    registrationId: string;
    competitor: {
      id: string;
      firstName: string;
      lastName: string;
      birthDate: string;
      gender: string;
      club?: string;
      city?: string;
      notes?: string;
      photoBase64?: string;
      competitionOrder: number;
    };
    registration: {
      bodyweight: number;
      weightClassId: string;
      ageCategoryId: string;
    };
    attempts: {
      Squat: Array<{
        id: string;
        registrationId: string;
        liftType: string;
        attemptNumber: number;
        weight: number;
        status: string;
      }>;
      Bench: Array<{
        id: string;
        registrationId: string;
        liftType: string;
        attemptNumber: number;
        weight: number;
        status: string;
      }>;
      Deadlift: Array<{
        id: string;
        registrationId: string;
        liftType: string;
        attemptNumber: number;
        weight: number;
        status: string;
      }>;
    };
    squatBest: number | null;
    benchBest: number | null;
    deadliftBest: number | null;
    total: number | null;
    points: number | null;
  }> = [];

  export let weightClasses: Array<{ id: string; name: string; minWeight: number | null; maxWeight: number | null; }> = [];
  export let ageCategories: Array<{ id: string; name: string; minAge: number | null; maxAge: number | null; }> = [];
  export let onCompetitorContextMenu: (event: MouseEvent, competitor: any) => void = () => {};
  export let onCompetitorPhotoClick: (competitor: any) => void = () => {};
  export let onAttemptClick: (event: MouseEvent, attempt: any) => void = () => {};
  export let onReorderCompetitor: (fromIndex: number, toIndex: number) => Promise<void> = async () => {};
  
  // Interactive weight editing functions
  // LiftType enum - must match ContestView
  enum LiftType {
    Squat = 'Squat',
    Bench = 'Bench',
    Deadlift = 'Deadlift',
  }

  export let onUpdateAttempt: (registrationId: string, liftType: LiftType, attemptNumber: number, weight: number) => Promise<void> = async () => {};
  export let onIncrementWeight: (registrationId: string, liftType: LiftType, attemptNumber: number, currentWeight: number) => void = () => {};
  export let onDecrementWeight: (registrationId: string, liftType: LiftType, attemptNumber: number, currentWeight: number) => void = () => {};
  export let onStatusClick: (attempt: any) => Promise<void> = async () => {};
  export let onWeightWheel: (event: WheelEvent, registrationId: string, liftType: LiftType, attemptNumber: number, currentWeight: number) => void = () => {};
  export let onWeightDragStart: (event: MouseEvent, registrationId: string, liftType: LiftType, attemptNumber: number, currentWeight: number) => void = () => {};
  export let onWeightInputHover: (event: MouseEvent, registrationId: string, weight: number) => Promise<void> = async () => {};
  export let onWeightInputLeave: () => void = () => {};
  export let onWeightInputMouseMove: (event: MouseEvent) => void = () => {};
  export let onShowLiftOnDisplay: (lifter: any, liftType: LiftType, attemptNumber: number) => void = () => {};
  export let currentDisplayedLift: { lifterId: string; liftType: LiftType; attemptNumber: number } | null = null;
  export let weightIncrement: number = 2.5;

  // Sorting state
  type SortBy = 'order' | 'name' | 'age' | 'weight' | 'class' | 'squat_best' | 'bench_best' | 'deadlift_best' | 'total';
  let sortBy: SortBy = 'order';
  let sortDirection: 'asc' | 'desc' = 'asc';

  // Drag state
  let draggedIndex: number = -1;
  let dragOverIndex: number = -1;

  // Weight edit modal state
  let weightEditModal = {
    show: false,
    lifter: null as any,
    liftType: null as string | null,
    attemptNumber: 0,
    currentWeight: 0,
    newWeight: 0
  };

  // Helper functions
  function getAge(lifter: any): number {
    const birthDate = new Date(lifter.competitor.birthDate);
    const today = new Date();
    let age = today.getFullYear() - birthDate.getFullYear();
    const monthDiff = today.getMonth() - birthDate.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
      age--;
    }
    return age;
  }

  function getWeightClassName(weightClassId: string): string {
    const weightClass = weightClasses.find(wc => wc.id === weightClassId);
    return weightClass?.name || $_('general.unknown');
  }

  function getAgeCategoryName(ageCategoryId: string): string {
    const ageCategory = ageCategories.find(ac => ac.id === ageCategoryId);
    return ageCategory?.name || $_('general.unknown');
  }

  function getBestAttempt(attemptsObj: any, lift: string): number | null {
    const liftAttempts = attemptsObj[lift] || [];
    const successfulAttempts = liftAttempts.filter((a: any) => a.status === 'Successful');
    if (successfulAttempts.length === 0) return null;
    return Math.max(...successfulAttempts.map((a: any) => a.weight));
  }

  function getAttemptsByLift(attemptsObj: any, lift: string): any[] {
    // Attempts are structured as { Squat: Attempt[], Bench: Attempt[], Deadlift: Attempt[] }
    return attemptsObj[lift] || [];
  }

  function getAttempt(lifter: any, liftType: string, attemptNumber: number): any | undefined {
    return lifter.attempts[liftType].find((a: any) => a.attemptNumber === attemptNumber);
  }

  function getAttemptDisplayText(attempt: any): string {
    if (!attempt || attempt.weight === null) return '-';
    return attempt.weight.toFixed(1);
  }

  function getAttemptStatusClass(attempt: any): string {
    if (!attempt || attempt.status === 'Pending') return 'text-gray-400';
    if (attempt.status === 'Successful') return 'text-green-400';
    if (attempt.status === 'Failed') return 'text-red-400';
    return 'text-gray-400';
  }

  // Sorting logic
  function handleSort(column: SortBy) {
    if (sortBy === column) {
      sortDirection = sortDirection === 'asc' ? 'desc' : 'asc';
    } else {
      sortBy = column;
      sortDirection = 'asc';
    }
  }

  // Computed sorted lifters
  $: sortedLifters = (() => {
    const sorted = [...lifters].sort((a, b) => {
      let aValue: any, bValue: any;

      switch (sortBy) {
        case 'order':
          aValue = a.competitor.competitionOrder;
          bValue = b.competitor.competitionOrder;
          break;
        case 'name':
          aValue = `${a.competitor.lastName} ${a.competitor.firstName}`;
          bValue = `${b.competitor.lastName} ${b.competitor.firstName}`;
          break;
        case 'age':
          aValue = getAge(a);
          bValue = getAge(b);
          break;
        case 'weight':
          aValue = a.registration.bodyweight;
          bValue = b.registration.bodyweight;
          break;
        case 'class':
          aValue = getWeightClassName(a.registration.weightClassId);
          bValue = getWeightClassName(b.registration.weightClassId);
          break;
        case 'squat_best':
          aValue = a.squatBest || 0;
          bValue = b.squatBest || 0;
          break;
        case 'bench_best':
          aValue = a.benchBest || 0;
          bValue = b.benchBest || 0;
          break;
        case 'deadlift_best':
          aValue = a.deadliftBest || 0;
          bValue = b.deadliftBest || 0;
          break;
        case 'total':
          aValue = a.total || 0;
          bValue = b.total || 0;
          break;
        default:
          return 0;
      }

      if (typeof aValue === 'string') {
        aValue = aValue.toLowerCase();
        bValue = bValue.toLowerCase();
      }

      const comparison = aValue < bValue ? -1 : aValue > bValue ? 1 : 0;
      return sortDirection === 'asc' ? comparison : -comparison;
    });

    return sorted;
  })();

  // Drag and drop handlers
  function handleDragStart(event: DragEvent, index: number) {
    if (sortBy !== 'order') return;
    if (!event.dataTransfer) return;

    draggedIndex = index;
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/html', '');
  }

  function handleDragOver(event: DragEvent, index: number) {
    if (sortBy !== 'order' || draggedIndex === -1) return;
    
    event.preventDefault();
    event.dataTransfer!.dropEffect = 'move';
    dragOverIndex = index;
  }

  function handleDragLeave() {
    dragOverIndex = -1;
  }

  function handleDragEnd() {
    draggedIndex = -1;
    dragOverIndex = -1;
  }

  async function handleDrop(event: DragEvent, toIndex: number) {
    if (sortBy !== 'order' || draggedIndex === -1) return;
    
    event.preventDefault();
    
    const fromIndex = draggedIndex;
    if (fromIndex === toIndex) return;

    try {
      await onReorderCompetitor(fromIndex, toIndex);
    } finally {
      draggedIndex = -1;
      dragOverIndex = -1;
    }
  }

  // Weight edit modal functions
  function openWeightEditModal(lifter: any, liftType: string, attemptNumber: number, currentWeight: number) {
    weightEditModal = {
      show: true,
      lifter,
      liftType,
      attemptNumber,
      currentWeight,
      newWeight: currentWeight
    };
  }

  function closeWeightEditModal() {
    weightEditModal.show = false;
  }

  async function saveWeightFromModal() {
    if (weightEditModal.lifter && weightEditModal.liftType) {
      await onUpdateAttempt(
        weightEditModal.lifter.registrationId,
        weightEditModal.liftType,
        weightEditModal.attemptNumber,
        weightEditModal.newWeight
      );
    }
    closeWeightEditModal();
  }

  function adjustWeight(delta: number) {
    weightEditModal.newWeight = Math.max(0, weightEditModal.newWeight + delta);
  }

  function handleModalKeydown(event: KeyboardEvent) {
    if (event.key === 'Escape') {
      closeWeightEditModal();
    } else if (event.key === 'Enter') {
      saveWeightFromModal();
    }
  }
</script>

<div class="overflow-x-auto">
  <table class="min-w-full border-collapse bg-card-bg text-xs lg:text-sm">
    <thead class="bg-element-bg text-text-primary">
      <tr>
        <!-- Order Column - Sortable -->
        <th 
          rowspan="2" 
          class="py-1 px-1 border border-border-color text-center w-12 cursor-pointer hover:bg-slate-600 {sortBy === 'order' ? 'bg-slate-700' : ''}"
          on:click={() => handleSort('order')}
        >
          <div class="flex items-center justify-center gap-1">
            <Hash size={14} />
            {#if sortBy === 'order'}
              <span class="text-xs">{sortDirection === 'asc' ? '▲' : '▼'}</span>
            {/if}
          </div>
        </th>
        <!-- Lifter Column - Sortable -->
        <th 
          rowspan="2" 
          class="py-1 px-1 border border-border-color text-left cursor-pointer hover:bg-slate-600 {sortBy === 'name' ? 'bg-slate-700' : ''}"
          on:click={() => handleSort('name')}
        >
          <div class="flex items-center gap-1">
            {$_('contest_view.lifter')}
            {#if sortBy === 'name'}
              <span class="text-xs">{sortDirection === 'asc' ? '▲' : '▼'}</span>
            {/if}
          </div>
        </th>
        <!-- Age Column - Sortable -->
        <th 
          rowspan="2" 
          class="py-1 px-1 border border-border-color text-center w-12 cursor-pointer hover:bg-slate-600 {sortBy === 'age' ? 'bg-slate-700' : ''}"
          on:click={() => handleSort('age')}
        >
          <div class="flex items-center justify-center gap-1">
            Wiek
            {#if sortBy === 'age'}
              <span class="text-xs">{sortDirection === 'asc' ? '▲' : '▼'}</span>
            {/if}
          </div>
        </th>
        <!-- Weight Column - Sortable -->
        <th 
          rowspan="2" 
          class="py-1 px-1 border border-border-color text-center w-16 cursor-pointer hover:bg-slate-600 {sortBy === 'weight' ? 'bg-slate-700' : ''}"
          on:click={() => handleSort('weight')}
        >
          <div class="flex items-center justify-center gap-1">
            {$_('contest_view.body_weight')}
            {#if sortBy === 'weight'}
              <span class="text-xs">{sortDirection === 'asc' ? '▲' : '▼'}</span>
            {/if}
          </div>
        </th>
        <!-- Category Column - Sortable -->
        <th 
          rowspan="2" 
          class="py-1 px-1 border border-border-color text-center w-20 cursor-pointer hover:bg-slate-600 {sortBy === 'class' ? 'bg-slate-700' : ''}"
          on:click={() => handleSort('class')}
        >
          <div class="flex items-center justify-center gap-1">
            Kategoria
            {#if sortBy === 'class'}
              <span class="text-xs">{sortDirection === 'asc' ? '▲' : '▼'}</span>
            {/if}
          </div>
        </th>
        <!-- Squat Column - Sortable -->
        <th 
          colspan="3" 
          class="py-1 px-1 border border-border-color text-center cursor-pointer hover:bg-slate-600 {sortBy === 'squat_best' ? 'bg-slate-700' : ''}"
          on:click={() => handleSort('squat_best')}
        >
          <div class="flex items-center justify-center gap-1">
            {$_('contest_view.squat')}
            {#if sortBy === 'squat_best'}
              <span class="text-xs">{sortDirection === 'asc' ? '▲' : '▼'}</span>
            {/if}
          </div>
        </th>
        <!-- Bench Column - Sortable -->
        <th 
          colspan="3" 
          class="py-1 px-1 border border-border-color text-center cursor-pointer hover:bg-slate-600 {sortBy === 'bench_best' ? 'bg-slate-700' : ''}"
          on:click={() => handleSort('bench_best')}
        >
          <div class="flex items-center justify-center gap-1">
            {$_('contest_view.bench')}
            {#if sortBy === 'bench_best'}
              <span class="text-xs">{sortDirection === 'asc' ? '▲' : '▼'}</span>
            {/if}
          </div>
        </th>
        <!-- Deadlift Column - Sortable -->
        <th 
          colspan="3" 
          class="py-1 px-1 border border-border-color text-center cursor-pointer hover:bg-slate-600 {sortBy === 'deadlift_best' ? 'bg-slate-700' : ''}"
          on:click={() => handleSort('deadlift_best')}
        >
          <div class="flex items-center justify-center gap-1">
            {$_('contest_view.deadlift')}
            {#if sortBy === 'deadlift_best'}
              <span class="text-xs">{sortDirection === 'asc' ? '▲' : '▼'}</span>
            {/if}
          </div>
        </th>
        <!-- Total Column - Sortable -->
        <th 
          rowspan="2" 
          class="py-1 px-1 border border-border-color text-center cursor-pointer hover:bg-slate-600 {sortBy === 'total' ? 'bg-slate-700' : ''}"
          on:click={() => handleSort('total')}
        >
          <div class="flex items-center justify-center gap-1">
            {$_('contest_view.total')}
            {#if sortBy === 'total'}
              <span class="text-xs">{sortDirection === 'asc' ? '▲' : '▼'}</span>
            {/if}
          </div>
        </th>
        <!-- Points -->
        <th rowspan="2" class="py-1 px-1 border border-border-color text-center w-12">Pkt</th>
      </tr>
      <tr>
        <!-- Attempt headers -->
        {#each [1, 2, 3] as i}
          <th class="py-1 px-1 border border-border-color text-center text-sm min-w-[60px]">{$_('contest_view.attempt_ordinal_' + i)}</th>
        {/each}
        {#each [1, 2, 3] as i}
          <th class="py-1 px-1 border border-border-color text-center text-sm min-w-[60px]">{$_('contest_view.attempt_ordinal_' + i)}</th>
        {/each}
         {#each [1, 2, 3] as i}
          <th class="py-1 px-1 border border-border-color text-center text-sm min-w-[60px]">{$_('contest_view.attempt_ordinal_' + i)}</th>
        {/each}
      </tr>
    </thead>
    <tbody>
      {#each sortedLifters as lifter, index (lifter.registrationId)}
        <tr 
          class="hover:bg-element-bg transition-colors {
            draggedIndex === index ? 'opacity-50' : ''
          } {
            dragOverIndex === index ? 'bg-blue-100 dark:bg-blue-900' : ''
          }"
          on:contextmenu={(e) => onCompetitorContextMenu(e, lifter.competitor)}
          on:dragover={(e) => handleDragOver(e, index)}
          on:dragleave={handleDragLeave}
          on:drop={(e) => handleDrop(e, index)}
        >
          <!-- Order Column -->
          <td class="py-1 px-1 border border-border-color text-center font-bold">
            <div 
              class="flex items-center justify-center gap-2 {sortBy === 'order' ? 'cursor-move' : ''}"
              draggable={sortBy === 'order'}
              role={sortBy === 'order' ? 'button' : undefined}
              on:dragstart={(e) => handleDragStart(e, index)}
              on:dragend={handleDragEnd}
            >
              <span class="text-text-primary">{lifter.competitor.competitionOrder}</span>
            </div>
          </td>
          
          <!-- Lifter Info -->
          <td class="py-1 px-1 border border-border-color text-text-primary font-semibold">
            <div class="flex items-center space-x-3">
              <CompetitorThumbnail 
                competitor={lifter.competitor} 
                size="small" 
                onClick={() => onCompetitorPhotoClick(lifter.competitor)}
              />
              <div class="flex flex-col">
                <span class="font-semibold">
                  {lifter.competitor.firstName} {lifter.competitor.lastName}
                </span>
                {#if lifter.competitor.club}
                  <span class="text-xs text-text-secondary">{lifter.competitor.club}</span>
                {/if}
              </div>
            </div>
          </td>

          <!-- Age -->
          <td class="py-1 px-1 border border-border-color text-center text-text-primary">
            {getAge(lifter)}
          </td>

          <!-- Body Weight -->
          <td class="py-1 px-1 border border-border-color text-center text-text-primary">
            {lifter.registration.bodyweight} kg
          </td>

          <!-- Category -->
          <td class="py-1 px-1 border border-border-color text-center text-text-primary">
            <div class="flex flex-col text-xs">
              <span>{getWeightClassName(lifter.registration.weightClassId)}</span>
              <span class="text-text-secondary">{getAgeCategoryName(lifter.registration.ageCategoryId)}</span>
            </div>
          </td>


          <!-- Interactive Attempts - Restored full functionality! -->
          {#each [LiftType.Squat, LiftType.Bench, LiftType.Deadlift] as liftType}
            {#each [1, 2, 3] as attemptNumber}
              {@const attempt = getAttempt(lifter, liftType, attemptNumber)}
              <td 
                class="py-1 px-1 border border-border-color text-center min-w-[60px] relative {
                  currentDisplayedLift?.lifterId === lifter.registrationId && 
                  currentDisplayedLift?.liftType === liftType && 
                  currentDisplayedLift?.attemptNumber === attemptNumber 
                    ? 'ring-2 ring-blue-500 ring-inset' : ''
                }"
                on:contextmenu={(e) => {
                  if (attempt) {
                    e.stopPropagation();
                    onAttemptClick(e, attempt);
                  }
                }}
              >
                <div class="flex items-center justify-center">
                  {#if attempt}
                    <button
                      on:click={() => onStatusClick(attempt)}
                      class="mr-1 text-lg hover:scale-110 transition-transform cursor-pointer {attempt.status === 'Successful' ? 'text-green-400' : attempt.status === 'Failed' ? 'text-red-400' : 'text-gray-400'}"
                      title="Click to cycle status (Pending → Success → Failed → Pending)"
                    >
                      {attempt.status === 'Successful' ? '✓' : attempt.status === 'Failed' ? '✗' : '●'}
                    </button>
                  {/if}
                  <input
                    type="number"
                    value={attempt?.weight ? attempt.weight.toFixed(1) : ''}
                    on:change={(e) => onUpdateAttempt(lifter.registrationId, liftType, attemptNumber, parseFloat(e.currentTarget.value) || 0)}
                    on:dblclick={() => openWeightEditModal(lifter, liftType, attemptNumber, attempt?.weight || 0)}
                    on:wheel={(e) => onWeightWheel(e, lifter.registrationId, liftType, attemptNumber, attempt?.weight || 0)}
                    on:mousedown={(e) => onWeightDragStart(e, lifter.registrationId, liftType, attemptNumber, attempt?.weight || 0)}
                    on:mouseenter={(e) => onWeightInputHover(e, lifter.registrationId, attempt?.weight || 0)}
                    on:mousemove={onWeightInputMouseMove}
                    on:mouseleave={onWeightInputLeave}
                    class="w-16 table-input-field text-center font-mono cursor-ns-resize select-none"
                    min="0"
                    step={weightIncrement}
                    placeholder="-"
                    title="Double-click to open weight editor"
                  />
                  {#if attempt?.weight > 0}
                    <button
                      on:click={(e) => {
                        e.stopPropagation();
                        onShowLiftOnDisplay(lifter, liftType, attemptNumber);
                      }}
                      class="ml-1 text-gray-400 hover:text-blue-400 transition-colors opacity-40 hover:opacity-100"
                      title={$_('contest_view.show_on_display')}
                    >
                      <Cast size={14} />
                    </button>
                  {/if}
                </div>
              </td>
            {/each}
          {/each}

          <!-- Total -->
          <td class="py-1 px-1 border border-border-color text-center font-bold text-text-primary">
            {lifter.total ? lifter.total.toFixed(1) : '-'}
          </td>

          <!-- Points -->
          <td class="py-1 px-1 border border-border-color text-center text-text-primary">
            {lifter.points ? lifter.points.toFixed(2) : '-'}
          </td>

        </tr>
      {/each}
    </tbody>
  </table>
</div>

<!-- Weight Edit Modal -->
{#if weightEditModal.show}
  <div class="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50" on:click={closeWeightEditModal} role="presentation">
    <div 
      class="bg-card-bg border-2 border-border-color rounded-lg p-6 w-96" 
      on:click|stopPropagation 
      role="dialog" 
      aria-modal="true"
      on:keydown={handleModalKeydown}
    >
      <!-- Header -->
      <div class="flex items-center justify-between mb-4">
        <h3 class="text-lg font-bold text-text-primary">{$_('contest_view.edit_weight')}</h3>
        <button 
          on:click={closeWeightEditModal}
          class="text-text-secondary hover:text-text-primary transition-colors"
          aria-label="Close"
        >
          <X size={20} />
        </button>
      </div>

      <!-- Lifter Info -->
      <div class="mb-4 text-sm text-text-secondary">
        {weightEditModal.lifter?.competitor?.firstName} {weightEditModal.lifter?.competitor?.lastName} - 
        {$_(`contest_view.${weightEditModal.liftType?.toLowerCase()}`)} {$_('contest_view.attempt')} {weightEditModal.attemptNumber}
      </div>

      <!-- Weight Input -->
      <div class="mb-6">
        <input 
          bind:value={weightEditModal.newWeight}
          type="number" 
          step="2.5" 
          min="0"
          class="w-full text-3xl text-center font-mono bg-element-bg border-2 border-border-color rounded-lg py-4 px-6 text-text-primary focus:border-primary-red focus:outline-none"
          placeholder="0.0"
        />
      </div>

      <!-- Quick Adjustments -->
      <div class="grid grid-cols-6 gap-2 mb-6">
        <button on:click={() => adjustWeight(-10)} class="btn-secondary text-sm py-2">-10</button>
        <button on:click={() => adjustWeight(-5)} class="btn-secondary text-sm py-2">-5</button>
        <button on:click={() => adjustWeight(-2.5)} class="btn-secondary text-sm py-2">-2.5</button>
        <button on:click={() => adjustWeight(2.5)} class="btn-secondary text-sm py-2">+2.5</button>
        <button on:click={() => adjustWeight(5)} class="btn-secondary text-sm py-2">+5</button>
        <button on:click={() => adjustWeight(10)} class="btn-secondary text-sm py-2">+10</button>
      </div>

      <!-- Actions -->
      <div class="flex justify-end gap-3">
        <button on:click={closeWeightEditModal} class="btn-secondary">
          {$_('general.cancel')}
        </button>
        <button on:click={saveWeightFromModal} class="btn-primary">
          {$_('general.save')}
        </button>
      </div>
    </div>
  </div>
{/if}