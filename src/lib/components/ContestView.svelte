<script lang="ts">
  import { onMount } from 'svelte';
  import { invoke } from '@tauri-apps/api/core';
  import { _ } from 'svelte-i18n';
  import { appView } from '../stores';
  import CompetitorThumbnail from './CompetitorThumbnail.svelte';
  import EditContestModal from './EditContestModal.svelte';

  // Backend Models
  interface Contest {
    id: string;
    name: string;
    date: string;
    location: string;
    discipline: string;
  }

  interface Competitor {
    id: string;
    firstName: string;
    lastName: string;
    birthDate: string;
    gender: string;
    club?: string;
    city?: string;
    notes?: string;
    competitionOrder: number;
    photoBase64?: string; // Base64 encoded photo data from backend
    createdAt: string;
    updatedAt: string;
  }

  interface AgeCategory {
    id: string;
    name: string;
    minAge?: number;
    maxAge?: number;
  }

  interface WeightClass {
    id: string;
    gender: string;
    name: string;
    weightMin?: number;
    weightMax?: number;
  }

  interface Registration {
    id: string;
    contestId: string;
    competitorId: string;
    ageCategoryId: string;
    weightClassId: string;
    // Equipment flags
    equipmentM: boolean;
    equipmentSm: boolean;
    equipmentT: boolean;
    // Day-of data
    bodyweight: number;
    lotNumber?: string;
    personalRecordAtEntry?: number;
    // Calculated coefficients
    reshelCoefficient?: number;
    mcculloughCoefficient?: number;
    // Rack heights
    rackHeightSquat?: number;
    rackHeightBench?: number;
    createdAt: string;
  }

  enum LiftType {
    Squat = 'Squat',
    Bench = 'Bench',
    Deadlift = 'Deadlift',
  }

  enum AttemptStatus {
    Pending = 'Pending',
    Successful = 'Successful',
    Failed = 'Failed',
  }

  interface Attempt {
    id: string;
    registrationId: string;
    liftType: LiftType;
    attemptNumber: number;
    weight: number;
    status: AttemptStatus;
  }

  // Frontend-specific composite model
  interface Lifter {
    registrationId: string;
    competitor: Competitor;
    registration: Registration; // Include full registration data
    attempts: {
      [key in LiftType]: Attempt[];
    };
  }

  enum ContestStatus {
    Setup = 'Setup',
    Registration = 'Registration',
    InProgress = 'InProgress',
    Paused = 'Paused',
    Complete = 'Complete',
  }

  interface ContestState {
    contestId: string;
    status: ContestStatus;
    currentLift: LiftType | null;
    currentRound: number;
  }

  interface PlateSet {
    id: string;
    contestId: string;
    plateWeight: number;
    quantity: number;
    createdAt: string;
    updatedAt: string;
  }

  interface CreatePlateSet {
    contestId: string;
    plateWeight: number;
    quantity: number;
  }

  interface PlateCalculation {
    plates: Array<[number, number]>; // [weight, count] pairs
    exact: boolean;
    total: number;
    increment: number;
  }

  // Component State
  let contests: Contest[] = [];
  let contestState: ContestState | null = null;
  let nextUpQueue: Attempt[] = [];
  let selectedContestId: string = '';
  let lifters: Lifter[] = [];
  let results: LifterResult[] = [];
  let loading = false;
  let error = '';
  
  // Edit Modal State
  let showEditModal = false;
  let selectedContest: Contest | null = null;
  
  // Plate management state
  let plateSets: PlateSet[] = [];
  let weightIncrement: number = 5.0; // Default 5kg (2.5kg smallest plate × 2)

  // Sorting and Drag & Drop State
  type SortBy = 'order' | 'name' | 'age' | 'weight' | 'category' | 'points' | 'squat_best' | 'bench_best' | 'deadlift_best' | 'total';
  type SortDirection = 'asc' | 'desc';
  
  let sortBy: SortBy = 'order';
  let sortDirection: SortDirection = 'asc';
  let draggedIndex: number = -1;
  let dragOverIndex: number = -1;


  onMount(async () => {
    await loadContests();
  });

  async function loadContests(): Promise<void> {
    try {
      loading = true;
      error = '';
      contests = await invoke<Contest[]>('contest_list');
      
      if (contests.length > 0) {
        selectedContestId = contests[0]?.id || '';
        await loadContestData();
      }
    } catch (err) {
      error = `Failed to load contests: ${err}`;
      console.error('Error loading contests:', err);
    } finally {
      loading = false;
    }
  }

  async function loadNextUpQueue(): Promise<void> {
    if (!selectedContestId) return;
    try {
      nextUpQueue = await invoke<Attempt[]>('attempt_get_next_in_queue', { contestId: selectedContestId });
    } catch (err) {
      error = `Failed to load next up queue: ${err}`;
      console.error('Error loading next up queue:', err);
    }
  }

  async function loadContestData(): Promise<void> {
    console.log('🚀 loadContestData called with selectedContestId:', selectedContestId);
    if (!selectedContestId) {
      console.log('❌ No selectedContestId, returning early');
      return;
    }

    try {
      loading = true;
      error = '';
      console.log('📥 Starting data loading process...');
      
      // Load lifters
      const registrations = await invoke<Registration[]>('registration_list', { contestId: selectedContestId });
      const allAttempts = await invoke<Attempt[]>('attempt_list_for_contest', { contestId: selectedContestId });

      console.log('🔍 Registrations found:', registrations.length, registrations);
      
      const lifterPromises = registrations.map(async (reg) => {
        try {
          const competitor = await invoke<Competitor>('competitor_get', { competitorId: reg.competitorId });
          console.log('👤 Raw competitor data:', competitor);
          
          console.log('📄 Processing attempts for registration:', reg.id);
          const lifterAttempts = allAttempts.filter(a => a.registrationId === reg.id);
          console.log('🎯 Found', lifterAttempts.length, 'attempts for this registration');
          
          const attemptsByType = {
            [LiftType.Squat]: lifterAttempts.filter(a => a.liftType === LiftType.Squat).sort((a,b) => a.attemptNumber - b.attemptNumber),
            [LiftType.Bench]: lifterAttempts.filter(a => a.liftType === LiftType.Bench).sort((a,b) => a.attemptNumber - b.attemptNumber),
            [LiftType.Deadlift]: lifterAttempts.filter(a => a.liftType === LiftType.Deadlift).sort((a,b) => a.attemptNumber - b.attemptNumber),
          };
          
          console.log('🔢 Attempts by type:', {
            squat: attemptsByType[LiftType.Squat].length,
            bench: attemptsByType[LiftType.Bench].length,
            deadlift: attemptsByType[LiftType.Deadlift].length
          });
          
          const lifter = {
            registrationId: reg.id,
            competitor,
            registration: reg,
            attempts: attemptsByType,
          };
          
          console.log('🏋️‍♂️ Created lifter:', lifter);
          return lifter;
        } catch (mapError) {
          console.error('💥 Error processing registration:', reg.id, mapError);
          throw mapError;
        }
      });
      
      console.log('⏳ About to resolve', lifterPromises.length, 'promises');
      const resolvedLifters = await Promise.all(lifterPromises);
      console.log('✅ Resolved lifters:', resolvedLifters.length, resolvedLifters);
      
      lifters = resolvedLifters;
      console.log('🎯 Assigned to lifters variable:', lifters.length, lifters);
      
      // Load contest state
      contestState = await invoke<ContestState | null>('contest_state_get', { contestId: selectedContestId });

      // Load plate sets and get weight increment from calculation
      plateSets = await invoke<PlateSet[]>('plate_set_list', { contestId: selectedContestId });
      
      // Get weight increment by calculating plates for any weight (e.g., 100kg)
      const plateCalc = await invoke<PlateCalculation>('calculate_plates', { 
        contestId: selectedContestId, 
        targetWeight: 100,
        gender: null // Use default (men's bar) for increment calculation
      });
      weightIncrement = plateCalc.increment;
      
      console.log('🏋️‍♀️ Loaded', plateSets.length, 'plate sets, increment:', weightIncrement);

      // Load next up queue if contest is in progress
      if (contestState?.status === ContestStatus.InProgress) {
        await loadNextUpQueue();
      } else {
        nextUpQueue = [];
      }

    } catch (err) {
      error = `Failed to load contest data: ${err}`;
      console.error('💥 Error loading contest data:', err);
      console.error('💥 Error details:', JSON.stringify(err, null, 2));
    } finally {
      loading = false;
      console.log('🏁 loadContestData finished, loading =', loading);
    }
  }


  async function updateAttempt(registrationId: string, liftType: LiftType, attemptNumber: number, weight: number): Promise<void> {
    try {
      await invoke('attempt_upsert_weight', {
        attempt: {
          registrationId,
          liftType,
          attemptNumber,
          weight
        }
      });

      // For now, just reload all lifters to see the change.
      // A more optimized approach would be to update the local state directly.
      await loadContestData();

    } catch (err) {
      error = `Failed to update attempt: ${err}`;
      console.error('Error updating attempt:', err);
    }
  }

  // Handle mouse wheel scrolling on attempt weight inputs
  function handleAttemptWheel(event: WheelEvent, registrationId: string, liftType: LiftType, attemptNumber: number, currentWeight: number) {
    event.preventDefault();
    const delta = event.deltaY > 0 ? -weightIncrement : weightIncrement; // Reverse direction for intuitive scrolling
    const newWeight = Math.max(0, currentWeight + delta);
    updateAttempt(registrationId, liftType, attemptNumber, newWeight);
  }

  function getAttempt(lifter: Lifter, liftType: LiftType, attemptNumber: number): Attempt | undefined {
    return lifter.attempts[liftType].find(a => a.attemptNumber === attemptNumber);
  }

  async function updateAttemptStatus(attemptId: string, status: AttemptStatus): Promise<void> {
    try {
      await invoke('attempt_update_result', {
        update: {
          attemptId,
          status
        }
      });
      await loadContestData();
    } catch (error) {
      console.error('Failed to update attempt status:', error);
    }
  }

  function cycleAttemptStatus(currentStatus: AttemptStatus): AttemptStatus {
    switch (currentStatus) {
      case AttemptStatus.Pending:
        return AttemptStatus.Successful;
      case AttemptStatus.Successful:
        return AttemptStatus.Failed;
      case AttemptStatus.Failed:
        return AttemptStatus.Pending;
      default:
        return AttemptStatus.Pending;
    }
  }

  async function handleStatusClick(attempt: Attempt): Promise<void> {
    const newStatus = cycleAttemptStatus(attempt.status);
    await updateAttemptStatus(attempt.id, newStatus);
  }

  async function handleCellRightClick(event: MouseEvent, attempt: Attempt): Promise<void> {
    event.preventDefault();
    await updateAttemptStatus(attempt.id, AttemptStatus.Successful);
  }

  function incrementWeight(registrationId: string, liftType: LiftType, attemptNumber: number, currentWeight: number) {
    const newWeight = currentWeight + weightIncrement;
    updateAttempt(registrationId, liftType, attemptNumber, newWeight);
  }

  function decrementWeight(registrationId: string, liftType: LiftType, attemptNumber: number, currentWeight: number) {
    const newWeight = Math.max(0, currentWeight - weightIncrement);
    updateAttempt(registrationId, liftType, attemptNumber, newWeight);
  }

  let dragState = {
    isDragging: false,
    startY: 0,
    startValue: 0,
    registrationId: '',
    liftType: null,
    attemptNumber: 0
  };

  function handleWeightDragStart(event: MouseEvent, registrationId: string, liftType: LiftType, attemptNumber: number, currentWeight: number) {
    dragState = {
      isDragging: true,
      startY: event.clientY,
      startValue: currentWeight,
      registrationId,
      liftType,
      attemptNumber
    };
    document.addEventListener('mousemove', handleWeightDragMove);
    document.addEventListener('mouseup', handleWeightDragEnd);
    event.preventDefault();
  }

  function handleWeightDragMove(event: MouseEvent) {
    if (!dragState.isDragging) return;
    
    const deltaY = dragState.startY - event.clientY; // Inverted so dragging up increases
    const steps = Math.floor(deltaY / 5); // Every 5 pixels = one increment step
    const newValue = Math.max(0, dragState.startValue + (steps * weightIncrement));
    
    updateAttempt(dragState.registrationId, dragState.liftType, dragState.attemptNumber, newValue);
  }

  function handleWeightDragEnd() {
    dragState.isDragging = false;
    document.removeEventListener('mousemove', handleWeightDragMove);
    document.removeEventListener('mouseup', handleWeightDragEnd);
  }

  function getLifterName(registrationId: string): string {
    const lifter = lifters.find(l => l.registrationId === registrationId);
    return lifter ? `${lifter.competitor.firstName} ${lifter.competitor.lastName}` : 'Unknown';
  }

  // Function to calculate plates for a specific competitor's attempt
  async function calculatePlatesForLifter(registrationId: string, targetWeight: number): Promise<PlateCalculation | null> {
    const lifter = lifters.find(l => l.registrationId === registrationId);
    if (!lifter || !selectedContestId) return null;

    try {
      return await invoke<PlateCalculation>('calculate_plates', {
        contestId: selectedContestId,
        targetWeight,
        gender: lifter.competitor.gender // Use the competitor's actual gender
      });
    } catch (err) {
      console.error('Error calculating plates for lifter:', err);
      return null;
    }
  }

  async function callNextLifter(attemptId: string): Promise<void> {
    if (!selectedContestId) return;
    try {
      await invoke('attempt_set_current', { contestId: selectedContestId, attemptId });
      // Reload data to reflect the change in the queue and current lifter
      await loadContestData();
    } catch (err) {
      error = `Failed to call next lifter: ${err}`;
      console.error('Error calling next lifter:', err);
    }
  }

  function getBestLift(attempts: Attempt[]): number {
    if (!attempts || attempts.length === 0) {
      return 0;
    }
    return attempts.reduce((max, attempt) => {
      if (attempt.status === AttemptStatus.Successful && attempt.weight > max) {
        return attempt.weight;
      }
      return max;
    }, 0);
  }

  function getSubtotal(lifter: Lifter): number {
    if (!lifter || !lifter.attempts) return 0;
    return getBestLift(lifter.attempts.Squat) + getBestLift(lifter.attempts.Bench);
  }

  function getTotal(lifter: Lifter): number {
    if (!lifter || !lifter.attempts) return 0;
    return getBestLift(lifter.attempts.Squat) + getBestLift(lifter.attempts.Bench) + getBestLift(lifter.attempts.Deadlift);
  }

  // Results calculation and ranking functions
  interface LifterResult {
    lifter: Lifter;
    total: number;
    subtotal: number;
    squatBest: number;
    benchBest: number;
    deadliftBest: number;
    rank: number;
    bombed: boolean; // Failed all attempts in any lift
  }

  function calculateResults(): LifterResult[] {
    console.log('🧮 calculateResults called with lifters:', lifters.length);
    if (!lifters || lifters.length === 0) {
      console.log('❌ No lifters to calculate results for');
      return [];
    }

    // Calculate results for each lifter
    const results = lifters.map((lifter): LifterResult => {
      const squatBest = getBestLift(lifter.attempts.Squat);
      const benchBest = getBestLift(lifter.attempts.Bench);
      const deadliftBest = getBestLift(lifter.attempts.Deadlift);
      
      const total = squatBest + benchBest + deadliftBest;
      const subtotal = squatBest + benchBest;
      
      // Check if bombed (zero in any lift means bombed)
      const bombed = squatBest === 0 || benchBest === 0 || deadliftBest === 0;
      
      return {
        lifter,
        total,
        subtotal,
        squatBest,
        benchBest,
        deadliftBest,
        rank: 0, // Will be calculated below
        bombed
      };
    });

    // Sort by total (descending), bombed lifters go to bottom
    results.sort((a, b) => {
      if (a.bombed && !b.bombed) return 1;
      if (!a.bombed && b.bombed) return -1;
      if (a.bombed && b.bombed) return 0; // Both bombed, keep original order
      
      return b.total - a.total; // Higher total wins
    });

    // Assign ranks (handle ties)
    let currentRank = 1;
    for (let i = 0; i < results.length; i++) {
      if (results[i].bombed) {
        results[i].rank = 0; // Bombed lifters get no rank
      } else {
        if (i > 0 && !results[i-1].bombed && results[i].total === results[i-1].total) {
          // Same total as previous, same rank
          results[i].rank = results[i-1].rank;
        } else {
          // Different total or first non-bombed lifter
          results[i].rank = currentRank;
        }
        currentRank++;
      }
    }

    console.log('📊 Calculated results:', results.length, 'results');
    return results;
  }

  // Reactive statement to calculate results
  $: {
    console.log('⚡ Reactive statement triggered, lifters.length =', lifters.length);
    results = calculateResults();
    console.log('🎯 Results updated:', results.length);
  }

  // Sorting functions
  function sortLifters(liftersToSort: Lifter[]): Lifter[] {
    const sorted = [...liftersToSort];
    
    sorted.sort((a, b) => {
      let valueA: any, valueB: any;
      
      switch (sortBy) {
        case 'order':
          // Ensure numeric comparison
          valueA = Number(a.competitor.competitionOrder);
          valueB = Number(b.competitor.competitionOrder);
          break;
          
        case 'name':
          valueA = `${a.competitor.lastName} ${a.competitor.firstName}`.toLowerCase();
          valueB = `${b.competitor.lastName} ${b.competitor.firstName}`.toLowerCase();
          break;
          
        case 'age':
          valueA = getAge(a);
          valueB = getAge(b);
          break;
          
        case 'weight':
          valueA = Number(a.registration.bodyweight);
          valueB = Number(b.registration.bodyweight);
          break;
          
        case 'category':
          valueA = getWeightClassName(a.registration.weightClassId);
          valueB = getWeightClassName(b.registration.weightClassId);
          break;
          
        case 'points':
          valueA = calculatePoints(a);
          valueB = calculatePoints(b);
          break;
          
        case 'squat_best':
          valueA = getBestLift(a.attempts.Squat);
          valueB = getBestLift(b.attempts.Squat);
          break;
          
        case 'bench_best':
          valueA = getBestLift(a.attempts.Bench);
          valueB = getBestLift(b.attempts.Bench);
          break;
          
        case 'deadlift_best':
          valueA = getBestLift(a.attempts.Deadlift);
          valueB = getBestLift(b.attempts.Deadlift);
          break;
          
        case 'total':
          valueA = getTotal(a);
          valueB = getTotal(b);
          break;
          
        default:
          return 0;
      }
      
      // Handle different data types
      if (typeof valueA === 'string' && typeof valueB === 'string') {
        // String comparison
        const comparison = valueA.localeCompare(valueB);
        return sortDirection === 'asc' ? comparison : -comparison;
      } else {
        // Numeric comparison
        const numA = Number(valueA) || 0;
        const numB = Number(valueB) || 0;
        return sortDirection === 'asc' ? numA - numB : numB - numA;
      }
    });
    
    return sorted;
  }

  function handleSort(column: SortBy) {
    if (sortBy === column) {
      sortDirection = sortDirection === 'asc' ? 'desc' : 'asc';
    } else {
      sortBy = column;
      sortDirection = 'asc';
    }
  }

  // Helper functions for display
  function getAge(lifter: Lifter): number {
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
    // Convert weight class ID to display name
    // e.g. "M_82_5" -> "82.5 KG", "M_140_PLUS" -> "+140 KG"
    if (weightClassId.endsWith('_PLUS')) {
      const weight = weightClassId.split('_')[1];
      return `+${weight} KG`;
    } else {
      const parts = weightClassId.split('_');
      if (parts.length >= 3) {
        return `${parts[1]}.${parts[2]} KG`;
      } else {
        return `${parts[1]} KG`;
      }
    }
  }

  function getAgeCategoryName(ageCategoryId: string): string {
    // Convert age category ID to display name
    // e.g. "SENIOR" -> "Senior", "JUNIOR23" -> "Junior 23"
    const categoryMap: {[key: string]: string} = {
      'JUNIOR13': 'Junior 13',
      'JUNIOR16': 'Junior 16', 
      'JUNIOR19': 'Junior 19',
      'JUNIOR23': 'Junior 23',
      'SENIOR': 'Senior',
      'VETERAN40': 'Veteran 40',
      'VETERAN50': 'Veteran 50',
      'VETERAN60': 'Veteran 60',
      'VETERAN70': 'Veteran 70',
    };
    return categoryMap[ageCategoryId] || ageCategoryId;
  }

  function calculatePoints(lifter: Lifter): number {
    const total = getTotal(lifter);
    const reshel = lifter.registration.reshelCoefficient || 1.0;
    const mccullough = lifter.registration.mcculloughCoefficient || 1.0;
    
    return total > 0 ? Math.round(total * reshel * mccullough * 100) / 100 : 0;
  }

  // Get sorted lifters for display
  $: sortedLifters = sortLifters(lifters);

  // Drag & Drop functions
  function handleDragStart(event: DragEvent, index: number) {
    if (sortBy !== 'order') return; // Only allow reordering when sorted by order
    
    draggedIndex = index;
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/html', '');
    }
  }

  function handleDragOver(event: DragEvent, index: number) {
    event.preventDefault();
    if (draggedIndex === -1 || sortBy !== 'order') return;
    
    dragOverIndex = index;
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = 'move';
    }
  }

  function handleDragLeave() {
    dragOverIndex = -1;
  }

  async function handleDrop(event: DragEvent, dropIndex: number) {
    event.preventDefault();
    
    if (draggedIndex === -1 || draggedIndex === dropIndex || sortBy !== 'order') {
      resetDragState();
      return;
    }

    try {
      const sourceLifter = sortedLifters[draggedIndex];
      const targetOrder = dropIndex + 1; // Convert 0-indexed array to 1-indexed database order
      
      // Move the competitor to the new order
      await invoke('competitor_move_order', {
        competitorId: sourceLifter.competitor.id,
        newOrder: targetOrder
      });
      
      // Reload contest data to reflect the new order
      await loadContestData();
      
    } catch (err) {
      error = `Failed to reorder competitor: ${err}`;
      console.error('Error reordering competitor:', err);
    } finally {
      resetDragState();
    }
  }

  function handleDragEnd() {
    resetDragState();
  }

  function resetDragState() {
    draggedIndex = -1;
    dragOverIndex = -1;
  }

  async function updateContestStatus(newStatus: ContestStatus): Promise<void> {
    if (!contestState) return;

    try {
      loading = true;
      error = '';

      const newState: ContestState = { ...contestState, status: newStatus };

      // When starting contest, set lift to Squat
      if (newStatus === ContestStatus.InProgress && contestState.status !== ContestStatus.InProgress) {
        newState.currentLift = LiftType.Squat;
        newState.currentRound = 1;
      }

      await invoke('contest_state_update', { contestState: newState });
      await loadContestData();

    } catch (err) {
      error = `Failed to update contest status: ${err}`;
      console.error('Error updating contest status:', err);
    } finally {
      loading = false;
    }
  }

  function goBack(): void {
    appView.set('mainMenu');
  }

  let lastLoadedContestId: string = '';
  
  $: if (selectedContestId && selectedContestId !== lastLoadedContestId) {
    lastLoadedContestId = selectedContestId;
    loadContestData();
  }
</script>

<div class="min-h-screen bg-main-bg">
  <!-- Header -->
  <header class="container-full py-6 border-b border-border-color">
    <div class="flex items-center justify-between">
      <div>
        <h1 class="text-h2 text-text-primary">{$_('contest_view.title')}</h1>
        <p class="text-caption text-text-secondary mt-1">
          {$_('contest_view.subtitle')}
        </p>
      </div>
      <button 
        class="btn-secondary"
        on:click={goBack}
      >
        ← Back to Menu
      </button>
    </div>
  </header>

  <main class="container-full py-8">
    <!-- Contest Selection -->
    {#if contests.length > 0}
      <div class="mb-8 flex items-center justify-between">
        <div class="flex items-end gap-3">
          <div>
            <label for="contest-select" class="input-label">{$_('contest_view.select_contest')}</label>
            <select
              id="contest-select"
              bind:value={selectedContestId}
              class="input-field max-w-md"
            >
              {#each contests as contest}
                <option value={contest.id}>
                  {contest.name} - {contest.date} ({contest.location})
                </option>
              {/each}
            </select>
          </div>
          {#if selectedContestId}
            <button
              on:click={() => {
                selectedContest = contests.find(c => c.id === selectedContestId) || null;
                showEditModal = true;
              }}
              class="btn-secondary flex items-center gap-2"
              title={$_('contest.edit_button')}
            >
              <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                <path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z" />
              </svg>
              {$_('contest.edit_button')}
            </button>
          {/if}
        </div>
      </div>
    {/if}

    <!-- Contest State Management -->
    {#if contestState}
      <div class="mb-8 p-6 bg-card-bg border border-border-color">
        <h3 class="text-h3 text-text-primary mb-4">{$_('contest_view.contest_status')} {contestState.status}</h3>
        <div class="flex space-x-4">
          {#if contestState.status === ContestStatus.Setup}
            <button class="btn-primary" on:click={() => updateContestStatus(ContestStatus.Registration)}>{$_('contest_view.open_registration')}</button>
          {/if}
          {#if contestState.status === ContestStatus.Registration}
            <button class="btn-primary" on:click={() => updateContestStatus(ContestStatus.InProgress)}>{$_('contest_view.start_contest')}</button>
          {/if}
          {#if contestState.status === ContestStatus.InProgress}
            <button class="btn-secondary" on:click={() => updateContestStatus(ContestStatus.Paused)}>{$_('contest_view.pause_contest')}</button>
            <button class="btn-danger" on:click={() => updateContestStatus(ContestStatus.Complete)}>{$_('contest_view.finish_contest')}</button>
          {/if}
          {#if contestState.status === ContestStatus.Paused}
            <button class="btn-primary" on:click={() => updateContestStatus(ContestStatus.InProgress)}>{$_('contest_view.resume_contest')}</button>
          {/if}
        </div>
        {#if contestState.status === ContestStatus.InProgress}
          <div class="mt-4">
            <p>{$_('contest_view.current_lift')} {contestState.currentLift || $_('contest_view.na')}</p>
            <p>{$_('contest_view.current_round')} {contestState.currentRound}</p>
          </div>
        {/if}
      </div>
    {/if}

    <!-- Next Up Queue -->
    {#if contestState?.status === ContestStatus.InProgress && nextUpQueue.length > 0}
      <div class="mb-8 p-6 bg-card-bg border border-border-color">
        <h3 class="text-h3 text-text-primary mb-4">{$_('contest_view.next_up')}</h3>
        <ul>
          {#each nextUpQueue as attempt}
            <li class="flex items-center justify-between py-2 border-b border-border-color">
              <span>
                Lifter: {getLifterName(attempt.registrationId)} - Attempt {attempt.attemptNumber} - {attempt.weight} kg
              </span>
              <button class="btn-secondary" on:click={() => callNextLifter(attempt.id)}>{$_('contest_view.call_lifter')}</button>
            </li>
          {/each}
        </ul>
      </div>
    {/if}


    <!-- Error Display -->
    {#if error}
      <div class="mb-6 p-4 bg-status-error text-red-100 border border-red-600">
        {error}
      </div>
    {/if}

    <!-- Loading State -->
    {#if loading && lifters.length === 0}
      <div class="text-center py-8">
        <div class="text-text-secondary">{$_('contest_view.loading_contest_data')}</div>
      </div>
    {:else if contests.length === 0 && !error}
      <!-- No Contests -->
      <div class="text-center py-8">
        <div class="text-text-secondary mb-4">{$_('contest_view.no_contests_found')}</div>
        <p class="text-text-secondary">{$_('contest_view.create_contest_first')}</p>
        <button 
          class="btn-primary mt-4"
          on:click={() => appView.set('contestWizard')}
        >
{$_('buttons.create_contest')}
        </button>
      </div>
    {:else if lifters.length === 0 && selectedContestId && !loading}
      <!-- No Lifters -->
      <div class="text-center py-8">
        <div class="text-text-secondary mb-4">{$_('contest_view.no_lifters_registered')}</div>
      </div>
    {:else if lifters.length > 0}
      <!-- Lifters Table -->
      <div class="overflow-x-auto">
        <table class="min-w-full border-collapse bg-card-bg text-xs lg:text-sm">
          <thead class="bg-element-bg text-text-primary">
            <tr>
              <!-- Order Column - Sortable -->
              <th 
                rowspan="2" 
                class="py-1 px-2 border border-border-color text-center w-16 cursor-pointer hover:bg-slate-600 {sortBy === 'order' ? 'bg-slate-700' : ''}"
                on:click={() => handleSort('order')}
              >
                <div class="flex items-center justify-center gap-1">
                  Order
                  {#if sortBy === 'order'}
                    <span class="text-xs">{sortDirection === 'asc' ? '▲' : '▼'}</span>
                  {/if}
                </div>
              </th>
              <!-- Lifter Column - Sortable -->
              <th 
                rowspan="2" 
                class="py-1 px-2 border border-border-color text-left min-w-[200px] cursor-pointer hover:bg-slate-600 {sortBy === 'name' ? 'bg-slate-700' : ''}"
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
                class="py-1 px-2 border border-border-color text-center w-16 cursor-pointer hover:bg-slate-600 {sortBy === 'age' ? 'bg-slate-700' : ''}"
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
                class="py-1 px-2 border border-border-color text-center w-20 cursor-pointer hover:bg-slate-600 {sortBy === 'weight' ? 'bg-slate-700' : ''}"
                on:click={() => handleSort('weight')}
              >
                <div class="flex items-center justify-center gap-1">
                  Waga
                  {#if sortBy === 'weight'}
                    <span class="text-xs">{sortDirection === 'asc' ? '▲' : '▼'}</span>
                  {/if}
                </div>
              </th>
              <!-- Category Column - Sortable -->
              <th 
                rowspan="2" 
                class="py-1 px-2 border border-border-color text-center min-w-[120px] cursor-pointer hover:bg-slate-600 {sortBy === 'category' ? 'bg-slate-700' : ''}"
                on:click={() => handleSort('category')}
              >
                <div class="flex items-center justify-center gap-1">
                  Kategoria
                  {#if sortBy === 'category'}
                    <span class="text-xs">{sortDirection === 'asc' ? '▲' : '▼'}</span>
                  {/if}
                </div>
              </th>
              <!-- Points Column - Sortable -->
              <th 
                rowspan="2" 
                class="py-1 px-2 border border-border-color text-center w-24 cursor-pointer hover:bg-slate-600 {sortBy === 'points' ? 'bg-slate-700' : ''}"
                on:click={() => handleSort('points')}
              >
                <div class="flex items-center justify-center gap-1">
                  Punkty
                  {#if sortBy === 'points'}
                    <span class="text-xs">{sortDirection === 'asc' ? '▲' : '▼'}</span>
                  {/if}
                </div>
              </th>
              <!-- Squat Header - Sortable by best squat -->
              <th 
                colspan="3" 
                class="py-1 px-2 border border-border-color text-center cursor-pointer hover:bg-slate-600 {sortBy === 'squat_best' ? 'bg-slate-700' : ''}"
                on:click={() => handleSort('squat_best')}
              >
                <div class="flex items-center justify-center gap-1">
                  {$_('contest_view.squat')}
                  {#if sortBy === 'squat_best'}
                    <span class="text-xs">{sortDirection === 'asc' ? '▲' : '▼'}</span>
                  {/if}
                </div>
              </th>
              <!-- Bench Header - Sortable by best bench -->
              <th 
                colspan="3" 
                class="py-1 px-2 border border-border-color text-center cursor-pointer hover:bg-slate-600 {sortBy === 'bench_best' ? 'bg-slate-700' : ''}"
                on:click={() => handleSort('bench_best')}
              >
                <div class="flex items-center justify-center gap-1">
                  {$_('contest_view.bench')}
                  {#if sortBy === 'bench_best'}
                    <span class="text-xs">{sortDirection === 'asc' ? '▲' : '▼'}</span>
                  {/if}
                </div>
              </th>
              <!-- Deadlift Header - Sortable by best deadlift -->
              <th 
                colspan="3" 
                class="py-1 px-2 border border-border-color text-center cursor-pointer hover:bg-slate-600 {sortBy === 'deadlift_best' ? 'bg-slate-700' : ''}"
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
                class="py-1 px-2 border border-border-color text-center cursor-pointer hover:bg-slate-600 {sortBy === 'total' ? 'bg-slate-700' : ''}"
                on:click={() => handleSort('total')}
              >
                <div class="flex items-center justify-center gap-1">
                  {$_('contest_view.total')}
                  {#if sortBy === 'total'}
                    <span class="text-xs">{sortDirection === 'asc' ? '▲' : '▼'}</span>
                  {/if}
                </div>
              </th>
            </tr>
            <tr>
              <!-- Attempt headers -->
              {#each [1, 2, 3] as i}
                <th class="py-1 px-2 border border-border-color text-center text-sm">{$_('contest_view.attempt_ordinal_' + i)}</th>
              {/each}
              {#each [1, 2, 3] as i}
                <th class="py-1 px-2 border border-border-color text-center text-sm">{$_('contest_view.attempt_ordinal_' + i)}</th>
              {/each}
               {#each [1, 2, 3] as i}
                <th class="py-1 px-2 border border-border-color text-center text-sm">{$_('contest_view.attempt_ordinal_' + i)}</th>
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
                on:dragover={(e) => handleDragOver(e, index)}
                on:dragleave={handleDragLeave}
                on:drop={(e) => handleDrop(e, index)}
              >
                <!-- Order Column -->
                <td class="py-1 px-2 border border-border-color text-center font-bold">
                  <div 
                    class="flex items-center justify-center gap-2 {sortBy === 'order' ? 'cursor-move' : ''}"
                    draggable={sortBy === 'order'}
                    on:dragstart={(e) => handleDragStart(e, index)}
                    on:dragend={handleDragEnd}
                  >
                    <span class="text-text-primary">{lifter.competitor.competitionOrder}</span>
                  </div>
                </td>
                
                <!-- Lifter Info -->
                <td class="py-1 px-2 border border-border-color text-text-primary font-semibold">
                  <div 
                    class="flex items-center space-x-3 {sortBy === 'order' ? 'cursor-move' : ''}" 
                    draggable={sortBy === 'order'}
                    on:dragstart={(e) => handleDragStart(e, index)}
                    on:dragend={handleDragEnd}
                  >
                    <CompetitorThumbnail competitor={lifter.competitor} size="small" />
                    <div class="flex flex-col">
                      <span class="font-semibold">{lifter.competitor.firstName} {lifter.competitor.lastName}</span>
                      {#if lifter.competitor.club}
                        <span class="text-xs text-text-secondary">{lifter.competitor.club}</span>
                      {/if}
                    </div>
                  </div>
                </td>

                <!-- Age -->
                <td class="py-1 px-2 border border-border-color text-center text-text-primary">
                  {getAge(lifter)}
                </td>

                <!-- Body Weight -->
                <td class="py-1 px-2 border border-border-color text-center text-text-primary">
                  {lifter.registration.bodyweight} kg
                </td>

                <!-- Category -->
                <td class="py-1 px-2 border border-border-color text-center text-text-primary">
                  <div class="flex flex-col text-xs">
                    <span>{getWeightClassName(lifter.registration.weightClassId)}</span>
                    <span class="text-text-secondary">{getAgeCategoryName(lifter.registration.ageCategoryId)}</span>
                  </div>
                </td>

                <!-- Points -->
                <td class="py-1 px-2 border border-border-color text-center text-text-primary font-bold">
                  {calculatePoints(lifter).toFixed(2)}
                </td>

                <!-- Attempts -->
                {#each [LiftType.Squat, LiftType.Bench, LiftType.Deadlift] as liftType}
                  {#each [1, 2, 3] as attemptNumber}
                    {@const attempt = getAttempt(lifter, liftType, attemptNumber)}
                    <td 
                      class="py-1 px-2 border border-border-color text-center"
                      on:contextmenu={(e) => attempt && handleCellRightClick(e, attempt)}
                    >
                      <div class="flex items-center justify-center">
                        <button
                          on:click={() => decrementWeight(lifter.registrationId, liftType, attemptNumber, attempt?.weight || 0)}
                          class="w-4 h-4 flex items-center justify-center text-xs text-gray-400 hover:text-text-primary transition-colors"
                          title={`Decrease weight by ${weightIncrement}kg`}
                        >
                          −
                        </button>
                        <input
                          type="number"
                          value={attempt?.weight || ''}
                          on:change={(e) => updateAttempt(lifter.registrationId, liftType, attemptNumber, parseFloat(e.currentTarget.value) || 0)}
                          on:wheel={(e) => handleAttemptWheel(e, lifter.registrationId, liftType, attemptNumber, attempt?.weight || 0)}
                          on:mousedown={(e) => handleWeightDragStart(e, lifter.registrationId, liftType, attemptNumber, attempt?.weight || 0)}
                          class="w-8 table-input-field text-center font-mono cursor-ns-resize select-none"
                          min="0"
                          step={weightIncrement}
                          placeholder="-"
                          title="Drag up/down to change weight or scroll with mouse wheel"
                        />
                        <button
                          on:click={() => incrementWeight(lifter.registrationId, liftType, attemptNumber, attempt?.weight || 0)}
                          class="w-4 h-4 flex items-center justify-center text-xs text-gray-400 hover:text-text-primary transition-colors"
                          title={`Increase weight by ${weightIncrement}kg`}
                        >
                          +
                        </button>
                        {#if attempt}
                          <button
                            on:click={() => handleStatusClick(attempt)}
                            class="ml-2 text-lg hover:scale-110 transition-transform cursor-pointer {attempt.status === AttemptStatus.Successful ? 'text-green-400' : attempt.status === AttemptStatus.Failed ? 'text-red-400' : 'text-gray-400'}"
                            title="Click to cycle status (Pending → Success → Failed → Pending)"
                          >
                            ●
                          </button>
                        {/if}
                      </div>
                    </td>
                  {/each}
                {/each}

                <!-- Total -->
                <td class="py-1 px-2 border border-border-color text-center font-bold text-lg text-primary-red weight-cell-fixed whitespace-nowrap">
                  {getTotal(lifter)} kg
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    {/if}
    <!-- Results Summary -->
    {#if results.length > 0 && contestState?.status === ContestStatus.Complete}
      <div class="mt-8 p-6 bg-card-bg border border-border-color rounded-lg">
        <h3 class="text-h3 text-text-primary mb-4">Competition Results Summary</h3>
        <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
          <!-- Top 3 Finishers -->
          <div>
            <h4 class="text-h4 text-text-primary mb-3">Top 3 Finishers</h4>
            {#each results.slice(0, 3).filter(r => !r.bombed) as result, i}
              <div class="flex items-center justify-between py-2 border-b border-border-color">
                <div class="flex items-center space-x-2">
                  <span class="text-lg">
                    {result.rank === 1 ? '🥇' : result.rank === 2 ? '🥈' : '🥉'}
                  </span>
                  <span class="font-semibold">
                    {result.lifter.competitor.firstName} {result.lifter.competitor.lastName}
                  </span>
                </div>
                <span class="font-bold text-primary-red">{result.total} kg</span>
              </div>
            {/each}
          </div>

          <!-- Competition Stats -->
          <div>
            <h4 class="text-h4 text-text-primary mb-3">Competition Stats</h4>
            <div class="space-y-2">
              <div class="flex justify-between">
                <span>Total Competitors:</span>
                <span class="font-semibold">{results.length}</span>
              </div>
              <div class="flex justify-between">
                <span>Successful Finishers:</span>
                <span class="font-semibold">{results.filter(r => !r.bombed).length}</span>
              </div>
              <div class="flex justify-between">
                <span>Bombed Out:</span>
                <span class="font-semibold text-red-400">{results.filter(r => r.bombed).length}</span>
              </div>
              {#if results.filter(r => !r.bombed).length > 0}
                <div class="flex justify-between">
                  <span>Winning Total:</span>
                  <span class="font-semibold text-primary-red">{results.find(r => !r.bombed)?.total || 0} kg</span>
                </div>
              {/if}
            </div>
          </div>

          <!-- Best Lifts -->
          <div>
            <h4 class="text-h4 text-text-primary mb-3">Best Lifts</h4>
            <div class="space-y-2">
              {#if results.length > 0}
                {@const bestSquat = Math.max(...results.map(r => r.squatBest).filter(w => w > 0))}
                {@const bestBench = Math.max(...results.map(r => r.benchBest).filter(w => w > 0))}
                {@const bestDeadlift = Math.max(...results.map(r => r.deadliftBest).filter(w => w > 0))}
                
                <div class="flex justify-between">
                  <span>Best Squat:</span>
                  <span class="font-semibold">{isFinite(bestSquat) ? bestSquat : 0} kg</span>
                </div>
                <div class="flex justify-between">
                  <span>Best Bench:</span>
                  <span class="font-semibold">{isFinite(bestBench) ? bestBench : 0} kg</span>
                </div>
                <div class="flex justify-between">
                  <span>Best Deadlift:</span>
                  <span class="font-semibold">{isFinite(bestDeadlift) ? bestDeadlift : 0} kg</span>
                </div>
              {/if}
            </div>
          </div>
        </div>
      </div>
    {/if}
  </main>
</div>

<!-- Edit Contest Modal -->
{#if showEditModal && selectedContest}
  <EditContestModal
    contest={selectedContest}
    onClose={() => {
      showEditModal = false;
      selectedContest = null;
    }}
    onSave={() => {
      loadContestData();
      loadContests();
    }}
  />
{/if}

<style>
  .bombed {
    background-color: rgba(220, 38, 38, 0.1);
    opacity: 0.7;
  }
  
  .bombed:hover {
    background-color: rgba(220, 38, 38, 0.15);
  }
</style>
