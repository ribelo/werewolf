<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { invoke } from '@tauri-apps/api/core';
  import { _ } from 'svelte-i18n';
  import { appView } from '../stores';
  import CompetitorThumbnail from './CompetitorThumbnail.svelte';
  import CompetitorTable from './CompetitorTable.svelte';
  import EditContestModal from './EditContestModal.svelte';
  import EditCompetitorModal from './EditCompetitorModal.svelte';
  import DeleteConfirmationModal from './DeleteConfirmationModal.svelte';
  import PhotoViewerModal from './PhotoViewerModal.svelte';

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
    minAge: number | null;
    maxAge: number | null;
  }

  interface WeightClass {
    id: string;
    name: string;
    minWeight: number | null;
    maxWeight: number | null;
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
    Skipped = 'Skipped',
  }

  interface Attempt {
    id: string;
    registrationId: string;
    liftType: string; // Backend compatibility - comes as string
    attemptNumber: number;
    weight: number;
    status: string; // Backend compatibility - comes as string
    createdAt: string;
    updatedAt: string;
  }

  // Frontend-specific composite model
  interface Lifter {
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
      reshelCoefficient?: number;
      mcculloughCoefficient?: number;
    };
    attempts: {
      [key in LiftType]: Array<{
        id: string;
        registrationId: string;
        liftType: string;
        attemptNumber: number;
        weight: number;
        status: string;
        createdAt: string;
        updatedAt: string;
      }>;
    };
    squatBest: number | null;
    benchBest: number | null;
    deadliftBest: number | null;
    total: number | null;
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
    targetWeight: number;
    barWeight: number;
  }

  // Component State
  let contests: Contest[] = [];
  let contestState: ContestState | null = null;
  let nextUpQueue: Attempt[] = [];
  let selectedContestId: string = '';
  let lifters: Lifter[] = [];
  let enrichedLifters: any[] = [];
  let results: LifterResult[] = [];
  let loading = false;
  let error = '';
  let weightClasses: WeightClass[] = [];
  let ageCategories: AgeCategory[] = [];
  
  // Single Modal State Object - Grug approved simplicity!
  let modalState = {
    // Contest editing
    contestEdit: false,
    selectedContest: null as Contest | null,
    
    // Attempt context menu
    attemptContext: false,
    attemptContextPosition: { x: 0, y: 0 },
    selectedAttempt: null as Attempt | null,
    
    // Competitor modals
    competitorContext: false,
    competitorContextPosition: { x: 0, y: 0 },
    competitorEdit: false,
    competitorDelete: false,
    competitorPhoto: false,
    selectedCompetitor: null as Competitor | null,
    isDeleting: false
  };
  
  // Plate Calculator Popup State
  let showPlatePopup = false;
  let platePopupPosition = { x: 0, y: 0 };
  let plateCalculation: PlateCalculation | null = null;
  let hoverTimeout: number | null = null;
  
  // Interaction state for smart tooltip management
  let interactionState = {
    isHovering: false,
    isDragging: false,
    isScrolling: false,
    lastMouseMove: 0
  };
  
  // Smart tooltip state
  let smartTooltip = {
    show: false,
    text: '',
    position: { x: 0, y: 0 }
  };
  
  // Plate management state
  let plateSets: PlateSet[] = [];
  let weightIncrement: number = 5.0; // Default 5kg (2.5kg smallest plate × 2)

  // Display synchronization state
  let currentDisplayedLifterId: string | null = null;
  let currentDisplayedLift: { liftType: LiftType; attemptNumber: number } | null = null;

  // Table state moved to CompetitorTable component


  onMount(async () => {
    await loadContests();
  });

  // Clean up event listeners on component destroy - Grug approved cleanup!
  onDestroy(() => {
    if (dragState.isDragging) {
      document.removeEventListener('mousemove', handleWeightDragMove);
      document.removeEventListener('mouseup', handleWeightDragEnd);
    }
    
    if (hoverTimeout) {
      clearTimeout(hoverTimeout);
    }
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
    if (!selectedContestId) {
      return;
    }

    try {
      loading = true;
      error = '';
      console.log('📥 Starting data loading process...');
      
      // Load weight classes and age categories first
      weightClasses = await invoke<WeightClass[]>('weight_class_list');
      ageCategories = await invoke<AgeCategory[]>('age_category_list');
      
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
      
      // Synchronize display if this lifter is currently shown
      await updateDisplayIfNeeded(registrationId);

    } catch (err) {
      error = `Failed to update attempt: ${err}`;
      console.error('Error updating attempt:', err);
    }
  }

  // Handle mouse wheel scrolling on attempt weight inputs
  function handleAttemptWheel(event: WheelEvent, registrationId: string, liftType: LiftType, attemptNumber: number, currentWeight: number) {
    event.preventDefault();
    
    // Mark as scrolling and hide all tooltips/popups
    interactionState.isScrolling = true;
    showPlatePopup = false;
    plateCalculation = null;
    smartTooltip.show = false;
    if (hoverTimeout) {
      clearTimeout(hoverTimeout);
      hoverTimeout = null;
    }
    
    const delta = event.deltaY > 0 ? -weightIncrement : weightIncrement; // Reverse direction for intuitive scrolling
    const newWeight = Math.max(0, currentWeight + delta);
    updateAttempt(registrationId, liftType, attemptNumber, newWeight);
    
    // Reset scrolling state after a short delay
    setTimeout(() => {
      interactionState.isScrolling = false;
    }, 300);
  }

  function getAttempt(lifter: Lifter, liftType: LiftType, attemptNumber: number): Attempt | undefined {
    return lifter.attempts[liftType].find(a => a.attemptNumber === attemptNumber);
  }

  async function updateAttemptStatus(attemptId: string, status: AttemptStatus): Promise<void> {
    try {
      // Find which lifter this attempt belongs to before updating
      let lifterId: string | null = null;
      for (const lifter of lifters) {
        for (const liftType of ['Squat', 'Bench', 'Deadlift'] as LiftType[]) {
          const attempt = lifter.attempts[liftType].find(a => a.id === attemptId);
          if (attempt) {
            lifterId = lifter.registrationId;
            break;
          }
        }
        if (lifterId) break;
      }
      
      await invoke('attempt_update_result', {
        update: {
          attemptId,
          status
        }
      });
      await loadContestData();
      
      // Synchronize display if this lifter is currently shown
      if (lifterId) {
        await updateDisplayIfNeeded(lifterId);
      }
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
      case AttemptStatus.Skipped:
        return AttemptStatus.Pending; // If somehow we encounter skipped, go to pending
      default:
        return AttemptStatus.Pending;
    }
  }

  async function handleStatusClick(attempt: Attempt): Promise<void> {
    const currentStatus = attempt.status as AttemptStatus;
    const newStatus = cycleAttemptStatus(currentStatus);
    await updateAttemptStatus(attempt.id, newStatus);
  }

  async function handleCellRightClick(event: MouseEvent, attempt: Attempt): Promise<void> {
    event.preventDefault();
    modalState.selectedAttempt = attempt;
    modalState.attemptContextPosition = { x: event.clientX, y: event.clientY };
    modalState.attemptContext = true;
  }

  function closeContextMenu() {
    modalState.attemptContext = false;
    modalState.selectedAttempt = null;
  }

  async function setAttemptStatus(status: AttemptStatus): Promise<void> {
    if (modalState.selectedAttempt) {
      await updateAttemptStatus(modalState.selectedAttempt.id, status);
      closeContextMenu();
    }
  }

  // Competitor modal functions - Grug approved simplicity!
  function openCompetitorContext(event: MouseEvent, competitor: Competitor) {
    event.preventDefault();
    modalState.selectedCompetitor = competitor;
    modalState.competitorContextPosition = { x: event.clientX, y: event.clientY };
    modalState.competitorContext = true;
  }

  function closeCompetitorContext() {
    modalState.competitorContext = false;
    modalState.selectedCompetitor = null;
  }

  function openCompetitorEdit() {
    modalState.competitorEdit = true;
    modalState.competitorContext = false; // Only close the menu, keep selectedCompetitor
  }

  function closeCompetitorEdit() {
    modalState.competitorEdit = false;
  }

  function openCompetitorDelete() {
    modalState.competitorDelete = true;
    modalState.competitorContext = false; // Only close the menu, keep selectedCompetitor
  }

  function closeCompetitorDelete() {
    modalState.competitorDelete = false;
  }

  function openCompetitorPhoto(competitor: Competitor) {
    modalState.selectedCompetitor = competitor;
    modalState.competitorPhoto = true;
  }

  function closeCompetitorPhoto() {
    modalState.competitorPhoto = false;
    modalState.selectedCompetitor = null;
  }

  async function handleCompetitorUpdate() {
    // Reload contest data to reflect changes
    await loadContestData();
  }

  async function confirmCompetitorDelete() {
    if (!modalState.selectedCompetitor) return;
    
    modalState.isDeleting = true;
    try {
      // Delete the competitor (this will also delete associated registrations)
      await invoke('competitor_delete', { competitorId: modalState.selectedCompetitor.id });
      
      // Reload contest data to reflect changes
      await loadContestData();
      closeCompetitorDelete();
    } catch (err) {
      console.error('Failed to delete competitor:', err);
      error = `${$_('competitor.delete_error')}: ${err}`;
    } finally {
      modalState.isDeleting = false;
    }
  }

  // Reorder function for CompetitorTable - Grug approved!
  async function handleReorderCompetitor(fromIndex: number, toIndex: number): Promise<void> {
    if (fromIndex === toIndex) return;
    
    try {
      const sourceLifter = lifters[fromIndex];
      if (!sourceLifter) {
        console.error('Source lifter not found at index:', fromIndex);
        return;
      }
      const targetOrder = toIndex + 1; // Convert 0-indexed array to 1-indexed database order
      
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
    }
  }

  function getStatusDisplayName(status: AttemptStatus): string {
    switch (status) {
      case AttemptStatus.Pending:
        return $_('attempt.status_pending');
      case AttemptStatus.Successful:
        return $_('attempt.status_successful');
      case AttemptStatus.Failed:
        return $_('attempt.status_failed');
      case AttemptStatus.Skipped:
        return $_('attempt.status_skipped');
      default:
        return $_('attempt.status_pending');
    }
  }

  function getStatusIcon(status: AttemptStatus): string {
    switch (status) {
      case AttemptStatus.Pending:
        return '●';
      case AttemptStatus.Successful:
        return '✓';
      case AttemptStatus.Failed:
        return '✗';
      case AttemptStatus.Skipped:
        return '—';
      default:
        return '●';
    }
  }

  function getStatusColor(status: AttemptStatus): string {
    switch (status) {
      case AttemptStatus.Pending:
        return 'text-gray-400';
      case AttemptStatus.Successful:
        return 'text-green-400';
      case AttemptStatus.Failed:
        return 'text-red-400';
      case AttemptStatus.Skipped:
        return 'text-blue-400';
      default:
        return 'text-gray-400';
    }
  }

  async function handleWeightInputHover(event: MouseEvent, registrationId: string, weight: number): Promise<void> {
    if (!selectedContestId) return;

    interactionState.isHovering = true;
    interactionState.lastMouseMove = Date.now();

    // Clear any existing timeout
    if (hoverTimeout) {
      clearTimeout(hoverTimeout);
    }

    // Show quick help tooltip immediately
    if (!interactionState.isDragging && !interactionState.isScrolling) {
      smartTooltip = {
        show: true,
        text: $_('contest_view.weight_input_help'),
        position: { x: event.clientX, y: event.clientY }
      };
    }

    // Only show plate popup for valid weights if we're in a pure hover state
    if (weight > 0) {
      hoverTimeout = Number(setTimeout(async () => {
        // Check if user is still hovering and not doing other interactions
        const timeSinceLastMove = Date.now() - interactionState.lastMouseMove;
        const isStillHovering = interactionState.isHovering && !interactionState.isDragging && !interactionState.isScrolling && timeSinceLastMove > 200;
        
        if (!isStillHovering) return;

        // Hide smart tooltip and show plate popup
        smartTooltip.show = false;

        const lifter = lifters.find(l => l.registrationId === registrationId);
        if (!lifter) return;

        try {
          const calc = await calculatePlatesForLifter(registrationId, weight);
          if (calc) {
            plateCalculation = calc;
            platePopupPosition = { x: event.clientX, y: event.clientY };
            showPlatePopup = true;
          }
        } catch (err) {
          console.error('Error calculating plates for popup:', err);
        }
      }, 1200)); // Longer delay for plate popup - user must really want to see it
    }
  }

  function handleWeightInputMouseMove(event: MouseEvent): void {
    // Update last mouse move time to detect if user is actively moving vs. settled hover
    interactionState.lastMouseMove = Date.now();
  }

  function handleWeightInputLeave(): void {
    interactionState.isHovering = false;
    
    // Clear timeout and hide all tooltips/popups
    if (hoverTimeout) {
      clearTimeout(hoverTimeout);
      hoverTimeout = null;
    }
    showPlatePopup = false;
    plateCalculation = null;
    smartTooltip.show = false;
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
    liftType: null as LiftType | null,
    attemptNumber: 0
  };

  function handleWeightDragStart(event: MouseEvent, registrationId: string, liftType: LiftType, attemptNumber: number, currentWeight: number) {
    // Update interaction state - dragging takes priority
    interactionState.isDragging = true;
    
    // Hide all tooltips/popups immediately when drag starts
    showPlatePopup = false;
    plateCalculation = null;
    smartTooltip.show = false;
    if (hoverTimeout) {
      clearTimeout(hoverTimeout);
      hoverTimeout = null;
    }
    
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
    if (!dragState.isDragging || !dragState.liftType) return;
    
    const deltaY = dragState.startY - event.clientY; // Inverted so dragging up increases
    const steps = Math.floor(deltaY / 5); // Every 5 pixels = one increment step
    const newValue = Math.max(0, dragState.startValue + (steps * weightIncrement));
    
    updateAttempt(dragState.registrationId, dragState.liftType, dragState.attemptNumber, newValue);
  }

  function handleWeightDragEnd() {
    if (dragState.isDragging) {
      dragState.isDragging = false;
      interactionState.isDragging = false;
      document.removeEventListener('mousemove', handleWeightDragMove);
      document.removeEventListener('mouseup', handleWeightDragEnd);
    }
  }

  function getLifterName(registrationId: string): string {
    const lifter = lifters.find(l => l.registrationId === registrationId);
    return lifter ? `${lifter.competitor.firstName} ${lifter.competitor.lastName}` : $_('general.unknown');
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
      if (attempt.status === 'Successful' && attempt.weight > max) {
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
    
    const squatBest = getBestLift(lifter.attempts.Squat);
    const benchBest = getBestLift(lifter.attempts.Bench);  
    const deadliftBest = getBestLift(lifter.attempts.Deadlift);
    
    return squatBest + benchBest + deadliftBest;
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
      const currentResult = results[i];
      const previousResult = i > 0 ? results[i-1] : null;
      
      if (currentResult?.bombed) {
        currentResult.rank = 0; // Bombed lifters get no rank
      } else if (currentResult) {
        if (previousResult && !previousResult.bombed && currentResult.total === previousResult.total) {
          // Same total as previous, same rank
          currentResult.rank = previousResult.rank;
        } else {
          // Different total or first non-bombed lifter
          currentResult.rank = currentRank;
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

  // Reactive statement to create enriched lifters with calculated properties
  $: enrichedLifters = lifters.map(lifter => {
    // Calculate all best lifts once
    const squatBest = getBestLift(lifter.attempts.Squat);
    const benchBest = getBestLift(lifter.attempts.Bench); 
    const deadliftBest = getBestLift(lifter.attempts.Deadlift);
    const total = squatBest + benchBest + deadliftBest;
    
    // Calculate points using the already computed total
    const reshel = lifter.registration.reshelCoefficient || 1.0;
    const mccullough = lifter.registration.mcculloughCoefficient || 1.0;
    const points = total > 0 ? Math.round(total * reshel * mccullough * 100) / 100 : 0;
    
    return {
      ...lifter,
      squatBest,
      benchBest,
      deadliftBest,
      total,
      points
    };
  });

  // Sorting functions moved to CompetitorTable component

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

  // Sorted lifters now handled by CompetitorTable component

  // Drag & Drop functions moved to CompetitorTable component

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

  // Display window management functions
  
  // Prepare display data for a lifter
  function prepareDisplayData(lifter: Lifter, specificLift?: { liftType: LiftType; attemptNumber: number }): any {
    return {
      competitor: {
        id: lifter.competitor.id,
        first_name: lifter.competitor.firstName,
        last_name: lifter.competitor.lastName,
        gender: lifter.competitor.gender,
        club: lifter.competitor.club,
        photo_base64: lifter.competitor.photoBase64,
      },
      registration: {
        bodyweight: lifter.registration.bodyweight,
        weight_class_id: lifter.registration.weightClassId,
      },
      attempts: {
        squat: lifter.attempts.Squat.map(a => ({
          number: a.attemptNumber,
          weight: a.weight || null,
          status: a.status,
        })),
        bench: lifter.attempts.Bench.map(a => ({
          number: a.attemptNumber,
          weight: a.weight || null,
          status: a.status,
        })),
        deadlift: lifter.attempts.Deadlift.map(a => ({
          number: a.attemptNumber,
          weight: a.weight || null,
          status: a.status,
        })),
      },
      contest: {
        id: selectedContestId,
        name: contests.find(c => c.id === selectedContestId)?.name || 'Contest',
        weight_classes: weightClasses.map(wc => ({
          id: wc.id,
          name: wc.name,
        })),
      },
      current_lift: contestState?.currentLift || 'Squat',
      rack_height_squat: (lifter as any).registration.rackHeightSquat || null,
      rack_height_bench: (lifter as any).registration.rackHeightBench || null,
      specific_lift: specificLift ? {
        lift_type: specificLift.liftType,
        attempt_number: specificLift.attemptNumber
      } : null,
    };
  }

  // Send lifter data to display window
  async function sendLifterToDisplay(lifter: Lifter, specificLift?: { liftType: LiftType; attemptNumber: number }): Promise<void> {
    const displayData = prepareDisplayData(lifter, specificLift);
    await invoke('window_update_display', { lifterData: displayData });
  }

  // Update display if the modified lifter is currently shown
  async function updateDisplayIfNeeded(lifterId: string): Promise<void> {
    if (currentDisplayedLifterId !== lifterId) return;
    
    const lifter = lifters.find(l => l.registrationId === lifterId);
    if (!lifter) return;
    
    try {
      await sendLifterToDisplay(lifter, currentDisplayedLift || undefined);
      console.log('Display synchronized for lifter:', lifterId);
    } catch (err) {
      console.error('Error synchronizing display:', err);
    }
  }


  // Show specific lift on display
  async function handleShowLiftOnDisplay(lifter: Lifter, liftType: LiftType, attemptNumber: number): Promise<void> {
    try {
      // Track which lifter and lift is displayed
      currentDisplayedLifterId = lifter.registrationId;
      currentDisplayedLift = { liftType, attemptNumber };
      
      // First try to update existing window
      try {
        await sendLifterToDisplay(lifter, currentDisplayedLift);
        console.log(`Display window updated with ${liftType} attempt ${attemptNumber}`);
      } catch (err) {
        // If window doesn't exist, open it first then send data
        console.log('Display window not open, opening and sending data...');
        await invoke('window_open_display');
        
        // Give the window a moment to initialize and set up event listeners
        await new Promise(resolve => setTimeout(resolve, 500));
        
        // Now send the data
        await sendLifterToDisplay(lifter, currentDisplayedLift);
        console.log('Display window opened and data sent');
      }
      
    } catch (err) {
      error = `Failed to update display: ${err}`;
      console.error('Error updating display:', err);
      currentDisplayedLifterId = null;
      currentDisplayedLift = null;
    }
  }

  async function openDisplayWindow(): Promise<void> {
    try {
      await invoke('window_open_display');
    } catch (err) {
      error = `Failed to open display window: ${err}`;
      console.error('Error opening display window:', err);
    }
  }

  async function closeDisplayWindow(): Promise<void> {
    try {
      await invoke('window_close_display');
    } catch (err) {
      error = `Failed to close display window: ${err}`;
      console.error('Error closing display window:', err);
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
      <div class="flex-1"></div>
      <div class="text-center">
        <h1 class="text-h2 text-text-primary">{$_('contest_view.title')}</h1>
        <p class="text-caption text-text-secondary mt-1">
          {$_('contest_view.subtitle')}
        </p>
      </div>
      <div class="flex-1 flex justify-end">
        <button 
          class="btn-secondary"
          on:click={goBack}
        >
          ← Back to Menu
        </button>
      </div>
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
                modalState.selectedContest = contests.find(c => c.id === selectedContestId) || null;
                modalState.contestEdit = true;
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
          {#if contestState.status === ContestStatus.InProgress || contestState.status === ContestStatus.Paused}
            <button class="btn-secondary" on:click={openDisplayWindow}>{$_('contest_view.open_display_window')}</button>
            <button class="btn-ghost" on:click={closeDisplayWindow}>{$_('contest_view.close_display_window')}</button>
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
      <!-- Competitor Table - Grug approved extraction! -->
      <CompetitorTable
        lifters={enrichedLifters}
        {weightClasses}
        {ageCategories}
        {weightIncrement}
        onCompetitorContextMenu={openCompetitorContext}
        onCompetitorPhotoClick={openCompetitorPhoto}
        onAttemptClick={handleCellRightClick}
        onReorderCompetitor={handleReorderCompetitor}
        onUpdateAttempt={updateAttempt}
        onIncrementWeight={incrementWeight}
        onDecrementWeight={decrementWeight}
        onStatusClick={handleStatusClick}
        onWeightWheel={handleAttemptWheel}
        onWeightDragStart={handleWeightDragStart}
        onWeightInputHover={handleWeightInputHover}
        onWeightInputMouseMove={handleWeightInputMouseMove}
        onWeightInputLeave={handleWeightInputLeave}
        onShowLiftOnDisplay={handleShowLiftOnDisplay}
        currentDisplayedLift={currentDisplayedLift ? {
          lifterId: currentDisplayedLifterId!,
          liftType: currentDisplayedLift.liftType,
          attemptNumber: currentDisplayedLift.attemptNumber
        } : null}
      />
    {/if}
    
    <!-- Results Summary -->
    {#if results.length > 0 && contestState?.status === ContestStatus.Complete}
      <div class="mt-8 p-6 bg-card-bg border border-border-color rounded-lg">
        <h3 class="text-h3 text-text-primary mb-4">{$_('results.competition_summary')}</h3>
        <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
          <!-- Top 3 Finishers -->
          <div>
            <h4 class="text-h4 text-text-primary mb-3">{$_('results.top_3_finishers')}</h4>
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
            <h4 class="text-h4 text-text-primary mb-3">{$_('results.competition_stats')}</h4>
            <div class="space-y-2">
              <div class="flex justify-between">
                <span>{$_('results.total_competitors')}:</span>
                <span class="font-semibold">{results.length}</span>
              </div>
              <div class="flex justify-between">
                <span>{$_('results.successful_finishers')}:</span>
                <span class="font-semibold">{results.filter(r => !r.bombed).length}</span>
              </div>
              <div class="flex justify-between">
                <span>{$_('results.bombed_out')}:</span>
                <span class="font-semibold text-red-400">{results.filter(r => r.bombed).length}</span>
              </div>
              {#if results.filter(r => !r.bombed).length > 0}
                <div class="flex justify-between">
                  <span>{$_('results.winning_total')}:</span>
                  <span class="font-semibold text-primary-red">{results.find(r => !r.bombed)?.total || 0} kg</span>
                </div>
              {/if}
            </div>
          </div>

          <!-- Best Lifts -->
          <div>
            <h4 class="text-h4 text-text-primary mb-3">{$_('results.best_lifts')}</h4>
            <div class="space-y-2">
              {#if results.length > 0}
                {@const bestSquat = Math.max(...results.map(r => r.squatBest).filter(w => w > 0))}
                {@const bestBench = Math.max(...results.map(r => r.benchBest).filter(w => w > 0))}
                {@const bestDeadlift = Math.max(...results.map(r => r.deadliftBest).filter(w => w > 0))}
                
                <div class="flex justify-between">
                  <span>{$_('results.best_squat')}:</span>
                  <span class="font-semibold">{isFinite(bestSquat) ? bestSquat : 0} kg</span>
                </div>
                <div class="flex justify-between">
                  <span>{$_('results.best_bench')}:</span>
                  <span class="font-semibold">{isFinite(bestBench) ? bestBench : 0} kg</span>
                </div>
                <div class="flex justify-between">
                  <span>{$_('results.best_deadlift')}:</span>
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
{#if modalState.contestEdit && modalState.selectedContest}
  <EditContestModal
    contest={modalState.selectedContest}
    onClose={() => {
      modalState.contestEdit = false;
      modalState.selectedContest = null;
    }}
    onSave={() => {
      loadContestData();
      loadContests();
    }}
  />
{/if}

<!-- Context Menu for Attempt Status -->
{#if modalState.attemptContext}
  <div 
    class="fixed inset-0 z-40" 
    role="presentation"
    tabindex="-1"
    on:click={closeContextMenu}
    on:keydown={(e) => { if (e.key === 'Escape') closeContextMenu(); }}
    on:contextmenu|preventDefault={closeContextMenu}
  ></div>
  <div
    class="fixed z-50 bg-card-bg border border-border-color rounded shadow-lg py-1 min-w-[140px]"
    style="left: {modalState.attemptContextPosition.x}px; top: {modalState.attemptContextPosition.y}px;"
  >
    <button
      class="w-full px-3 py-2 text-left hover:bg-element-bg transition-colors flex items-center gap-2"
      on:click={() => setAttemptStatus(AttemptStatus.Pending)}
    >
      <span class="text-gray-400">{getStatusIcon(AttemptStatus.Pending)}</span>
      {getStatusDisplayName(AttemptStatus.Pending)}
    </button>
    <button
      class="w-full px-3 py-2 text-left hover:bg-element-bg transition-colors flex items-center gap-2"
      on:click={() => setAttemptStatus(AttemptStatus.Successful)}
    >
      <span class="text-green-400">{getStatusIcon(AttemptStatus.Successful)}</span>
      {getStatusDisplayName(AttemptStatus.Successful)}
    </button>
    <button
      class="w-full px-3 py-2 text-left hover:bg-element-bg transition-colors flex items-center gap-2"
      on:click={() => setAttemptStatus(AttemptStatus.Failed)}
    >
      <span class="text-red-400">{getStatusIcon(AttemptStatus.Failed)}</span>
      {getStatusDisplayName(AttemptStatus.Failed)}
    </button>
  </div>
{/if}

<!-- Plate Calculator Popup -->
{#if showPlatePopup && plateCalculation}
  <div
    class="fixed z-50 bg-card-bg border border-border-color rounded-lg shadow-xl p-4 min-w-[300px] max-w-[400px]"
    style="left: {platePopupPosition.x + 10}px; top: {platePopupPosition.y - 100}px;"
  >
    <!-- Weight Info -->
    <div class="text-center mb-4">
      <div class="text-lg font-bold text-primary-red">{plateCalculation.targetWeight} kg</div>
      <div class="text-sm text-text-secondary">
        {$_('plates.bar_weight')}: {plateCalculation.barWeight} kg
      </div>
    </div>

    <!-- Barbell Visualization -->
    <div class="relative flex items-center justify-center mb-4 h-16">
      <!-- Left Plates (reversed order - heaviest closest to bar) -->
      <div class="flex items-center justify-end space-x-0.5">
        {#each plateCalculation.plates.slice().reverse() as [plateWeight, plateCount]}
          {#each Array(plateCount) as _, i}
            <div 
              class="plate plate-{plateWeight.toString().replace('.', '_')}"
              title="{plateWeight}kg × {plateCount}"
              style="width: {Math.max(plateWeight * 0.4 + 4, 6)}px; height: {Math.max(plateWeight * 2 + 20, 24)}px;"
            >
              <div class="plate-label">
                {plateWeight}
              </div>
            </div>
          {/each}
        {/each}
      </div>

      <!-- Barbell -->
      <div class="barbell">
        <div class="barbell-collar-left"></div>
        <div class="barbell-bar"></div>
        <div class="barbell-collar-right"></div>
      </div>

      <!-- Right Plates (mirrored) -->
      <div class="flex items-center justify-start space-x-0.5">
        {#each plateCalculation.plates as [plateWeight, plateCount]}
          {#each Array(plateCount) as _, i}
            <div 
              class="plate plate-{plateWeight.toString().replace('.', '_')}"
              title="{plateWeight}kg × {plateCount}"
              style="width: {Math.max(plateWeight * 0.4 + 4, 6)}px; height: {Math.max(plateWeight * 2 + 20, 24)}px;"
            >
              <div class="plate-label">
                {plateWeight}
              </div>
            </div>
          {/each}
        {/each}
      </div>
    </div>

    <!-- Plate Loading List -->
    <div class="text-xs text-text-secondary">
      <div class="font-semibold mb-1">{$_('plates.per_side')}:</div>
      {#each plateCalculation.plates as [plateWeight, plateCount]}
        <div class="flex justify-between">
          <span>{plateWeight}kg:</span>
          <span>{plateCount} {plateCount === 1 ? $_('plates.plate') : $_('plates.plates')}</span>
        </div>
      {/each}
      {#if plateCalculation.plates.length === 0}
        <div class="text-center italic">{$_('plates.bar_only')}</div>
      {/if}
    </div>
  </div>
{/if}

<!-- Smart Tooltip for Weight Inputs -->
{#if smartTooltip.show}
  <div
    class="fixed z-40 bg-gray-800 text-white text-xs px-2 py-1 rounded shadow-lg pointer-events-none"
    style="left: {smartTooltip.position.x + 10}px; top: {smartTooltip.position.y - 30}px;"
  >
    {smartTooltip.text}
  </div>
{/if}

<!-- Competitor Context Menu -->
{#if modalState.competitorContext}
  <div 
    class="fixed inset-0 z-40" 
    role="presentation"
    tabindex="-1"
    on:click={closeCompetitorContext}
    on:keydown={(e) => { if (e.key === 'Escape') closeCompetitorContext(); }}
    on:contextmenu|preventDefault={closeCompetitorContext}
  ></div>
  <div
    class="fixed z-50 bg-card-bg border border-border-color rounded shadow-lg py-1 min-w-[140px]"
    style="left: {modalState.competitorContextPosition.x}px; top: {modalState.competitorContextPosition.y}px;"
  >
    <button
      class="w-full px-3 py-2 text-left hover:bg-element-bg transition-colors flex items-center gap-2 text-text-primary"
      on:click={openCompetitorEdit}
    >
{$_('competitor.edit')}
    </button>
    <button
      class="w-full px-3 py-2 text-left hover:bg-element-bg transition-colors flex items-center gap-2 text-red-400"
      on:click={openCompetitorDelete}
    >
{$_('competitor.delete')}
    </button>
  </div>
{/if}

<!-- Edit Competitor Modal -->
{#if modalState.competitorEdit && modalState.selectedCompetitor}
  <EditCompetitorModal
    competitor={modalState.selectedCompetitor}
    contestId={selectedContestId}
    onClose={closeCompetitorEdit}
    onSave={() => {
      loadContestData();
      closeCompetitorEdit();
    }}
  />
{/if}

<!-- Delete Confirmation Modal -->
{#if modalState.competitorDelete && modalState.selectedCompetitor}
  <DeleteConfirmationModal
    title={$_('competitor.delete_title')}
    message={$_('competitor.delete_message', { values: { name: `${modalState.selectedCompetitor.firstName} ${modalState.selectedCompetitor.lastName}` } })}
    confirmText={$_('buttons.delete')}
    cancelText={$_('buttons.cancel')}
    onConfirm={confirmCompetitorDelete}
    onCancel={closeCompetitorDelete}
    isDestructive={true}
    isLoading={modalState.isDeleting}
  />
{/if}

<!-- Photo Viewer Modal -->
{#if modalState.competitorPhoto && modalState.selectedCompetitor}
  <PhotoViewerModal
    competitor={modalState.selectedCompetitor}
    onClose={closeCompetitorPhoto}
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

  /* Barbell and Plate Visualization Styles */
  .barbell {
    display: flex;
    align-items: center;
    z-index: 10;
    position: relative;
  }

  .barbell-bar {
    width: 80px;
    height: 8px;
    background: linear-gradient(to bottom, #e5e7eb, #9ca3af, #6b7280);
    border-radius: 4px;
    box-shadow: inset 0 1px 2px rgba(0,0,0,0.3);
  }

  .barbell-collar-left,
  .barbell-collar-right {
    width: 12px;
    height: 16px;
    background: linear-gradient(to bottom, #374151, #1f2937);
    border-radius: 2px;
    box-shadow: 0 1px 2px rgba(0,0,0,0.3);
  }

  .plate {
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 2px;
    box-shadow: 0 2px 4px rgba(0,0,0,0.3), inset 0 1px 2px rgba(255,255,255,0.1);
    position: relative;
    z-index: 5;
    border: 1px solid rgba(0,0,0,0.2);
    margin: 0 1px;
  }

  .plate-label {
    font-size: 7px;
    font-weight: bold;
    color: white;
    text-shadow: 0 1px 2px rgba(0,0,0,0.8);
    pointer-events: none;
    writing-mode: vertical-lr;
    text-orientation: mixed;
    transform: rotate(180deg);
  }

  /* Eleiko standard plate colors */
  .plate-25 { background: linear-gradient(135deg, #dc2626, #b91c1c); } /* Red - 25kg */
  .plate-20 { background: linear-gradient(135deg, #2563eb, #1d4ed8); } /* Blue - 20kg */
  .plate-15 { background: linear-gradient(135deg, #eab308, #ca8a04); } /* Yellow - 15kg */
  .plate-10 { background: linear-gradient(135deg, #16a34a, #15803d); } /* Green - 10kg */
  .plate-5 { background: linear-gradient(135deg, #f8fafc, #e2e8f0); } /* White - 5kg */
  .plate-5 .plate-label { color: #1f2937; text-shadow: none; }
  .plate-2_5 { background: linear-gradient(135deg, #dc2626, #b91c1c); } /* Red - 2.5kg */
  .plate-2 { background: linear-gradient(135deg, #2563eb, #1d4ed8); } /* Blue - 2kg */
  .plate-1_5 { background: linear-gradient(135deg, #eab308, #ca8a04); } /* Yellow - 1.5kg */
  .plate-1_25 { background: linear-gradient(135deg, #16a34a, #15803d); } /* Green - 1.25kg */
  .plate-1 { background: linear-gradient(135deg, #f8fafc, #e2e8f0); } /* White - 1kg */
  .plate-1 .plate-label { color: #1f2937; text-shadow: none; }
  .plate-0_5 { background: linear-gradient(135deg, #a3a3a3, #737373); } /* Gray - 0.5kg */
  
  /* Default for other weights */
  .plate:not([class*="plate-"]) { 
    background: linear-gradient(135deg, #374151, #1f2937); 
  }
</style>
