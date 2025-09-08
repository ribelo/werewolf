<script lang="ts">
  import { _ } from 'svelte-i18n';
  import { onMount, onDestroy } from 'svelte';
  import { invoke } from '@tauri-apps/api/core';
  import { listen } from '@tauri-apps/api/event';
  import { getCurrentWindow } from '@tauri-apps/api/window';
  import { User, X } from 'lucide-svelte';
  import { fade, fly, scale, blur } from 'svelte/transition';
  import { quintOut, backOut, elasticOut } from 'svelte/easing';

  // PlateCalculation interface for barbell visualization
  interface PlateCalculation {
    plates: Array<[number, number]>; // [weight, count] pairs
    exact: boolean;
    total: number;
    increment: number;
    targetWeight: number;
    barWeight: number;
  }

  // Props for current display data - will be populated from contest management
  export let currentLifterData: any = null;
  export let contestData: any = null;

  // Internal reactive state
  let lifter: any = null;
  let contest: any = null;
  let currentLift = '';
  let attempts: any[] = [];
  let plateCalculation: PlateCalculation | null = null;
  let isHovered = false;
  let isButtonHovered = false;

  // Reactive logging for currentLift changes
  $: {
    console.log('currentLift changed to:', currentLift, 'formatted:', formatLiftName(currentLift));
  }

  // Reactive logging for hover state changes
  $: {
    console.log('🔴 REACTIVE: isHovered changed to:', isHovered);
  }

  // Show button if either banner or button is hovered
  $: showButton = isHovered || isButtonHovered;
  $: {
    console.log('🔴 REACTIVE: showButton changed to:', showButton, '(banner:', isHovered, ', button:', isButtonHovered, ')');
  }

  // Load contest and current lifter data
  async function loadDisplayData() {
    try {
      if (currentLifterData && contestData) {
        lifter = currentLifterData.competitor;
        contest = contestData;
        
        // Determine current lift type based on contest state
        const liftOrder = ['Squat', 'Bench', 'Deadlift'];
        currentLift = liftOrder[contestData.currentLiftIndex] || 'Squat';
        
        // Get attempts for current lift
        attempts = currentLifterData.attempts[currentLift] || [];
        
        // Ensure we have 3 attempts
        while (attempts.length < 3) {
          attempts.push({
            number: attempts.length + 1,
            weight: 0,
            status: 'Pending'
          });
        }
      }
    } catch (error) {
      console.error('Failed to load display data:', error);
    }
  }

  // Reactive updates when props change
  $: if (currentLifterData || contestData) {
    loadDisplayData();
  }

  // Get current/active attempt
  $: currentAttempt = attempts.find(a => a.status === 'Pending') || attempts[attempts.length - 1];
  
  // Format lift name for display
  function formatLiftName(liftType: string): string {
    const liftTranslations: Record<string, string> = {
      'Squat': 'PRZYSIAD',
      'Bench': 'WYCISKANIE',
      'Deadlift': 'MARTWY CIĄG'
    };
    return liftTranslations[liftType] || liftType.toUpperCase();
  }

  // Format weight class for display  
  function formatWeightClass(weightClassId: string, weightClasses: any[]): string {
    const weightClass = weightClasses?.find(wc => wc.id === weightClassId);
    return weightClass?.name || 'N/A';
  }

  // Get attempt status styling
  function getAttemptStatusClass(attempt: any): string {
    if (attempt.status === 'Successful') return 'successful';
    if (attempt.status === 'Failed') return 'failed'; 
    return 'pending';
  }

  function getAttemptWeightClass(attempt: any): string {
    return 'text-text-primary';
  }

  function getAttemptTitleClass(attempt: any): string {
    return 'text-text-secondary';
  }

  let unlisten: (() => void) | null = null;

  onMount(async () => {
    // Listen for display updates from the main window
    try {
      unlisten = await listen('display-update', (event) => {
        console.log('Received display-update event:', event.payload);
        const lifterData = event.payload as any;
        
        // Update the display with new lifter data
        updateDisplayWithLifterData(lifterData);
      });
    } catch (err) {
      console.error('Failed to set up display-update listener:', err);
    }
  });
  
  onDestroy(() => {
    if (unlisten) unlisten();
  });

  async function updateDisplayWithLifterData(data: any) {
    try {
      // Update lifter info
      lifter = {
        id: data.competitor.id,
        firstName: data.competitor.first_name,
        lastName: data.competitor.last_name,
        gender: data.competitor.gender || 'Male',
        club: data.competitor.club,
        photoBase64: data.competitor.photo_base64,
      };
      
      // Update contest info
      contest = {
        name: data.contest.name,
        weightClasses: data.contest.weight_classes,
      };
      
      // Check if specific lift is requested
      const specificLift = data.specific_lift;
      console.log('Received display data:', { specificLift, currentLiftFromData: data.current_lift });
      
      if (specificLift) {
        // Show specific lift and attempt
        currentLift = specificLift.lift_type;
        console.log('Setting currentLift to specific lift:', currentLift);
        const liftAttempts = data.attempts[currentLift.toLowerCase()] || [];
        
        // Show only the specific attempt, but dim others for context
        attempts = [];
        for (let i = 1; i <= 3; i++) {
          const attempt = liftAttempts.find((a: any) => a.number === i);
          attempts.push({
            number: i,
            weight: attempt?.weight || 0,
            status: attempt?.status || 'Pending',
            isHighlighted: i === specificLift.attempt_number
          });
        }
      } else {
        // Default behavior - show current lift from contest state
        currentLift = data.current_lift;
        console.log('Setting currentLift to contest state:', currentLift);
        
        // Transform attempts data to match expected format
        const liftAttempts = data.attempts[currentLift.toLowerCase()] || [];
        attempts = [];
        
        // Ensure we have 3 attempts
        for (let i = 1; i <= 3; i++) {
          const attempt = liftAttempts.find((a: any) => a.number === i);
          attempts.push({
            number: i,
            weight: attempt?.weight || 0,
            status: attempt?.status || 'Pending',
            isHighlighted: false
          });
        }
      }
      
      // Update registration data for weight class display
      currentLifterData = {
        registration: {
          weightClassId: data.registration.weight_class_id,
        },
        rackHeightSquat: data.rack_height_squat,
        rackHeightBench: data.rack_height_bench,
      };
      
      // Calculate plates for the relevant attempt
      let targetAttempt;
      if (specificLift) {
        // Use the specific highlighted attempt
        targetAttempt = attempts.find(a => a.isHighlighted);
      } else {
        // Use the first pending attempt
        targetAttempt = attempts.find(a => a.status === 'Pending');
      }
      
      if (targetAttempt && targetAttempt.weight > 0 && data.contest?.id) {
        await calculatePlatesForDisplay(data.contest.id, targetAttempt.weight);
      } else {
        plateCalculation = null;
      }
      
      console.log('Display updated with lifter data:', {
        lifter: lifter,
        contest: contest,
        currentLift: currentLift,
        formattedLiftName: formatLiftName(currentLift),
        attempts: attempts,
        specificLiftReceived: !!specificLift
      });
      
    } catch (err) {
      console.error('Error updating display with lifter data:', err);
    }
  }

  // Calculate plates for display visualization
  async function calculatePlatesForDisplay(contestId: string, targetWeight: number): Promise<void> {
    try {
      console.log('Calculating plates for display:', { contestId, targetWeight });
      const calc = await invoke<PlateCalculation>('calculate_plates', {
        contestId,
        targetWeight
      });
      plateCalculation = calc;
      console.log('Plate calculation result:', plateCalculation);
    } catch (err) {
      console.error('Error calculating plates for display:', err);
      plateCalculation = null;
    }
  }

  // Default values when no data is provided
  $: displayContest = contest?.name || 'ZAWODY POWERLIFTING';
  $: displayLifter = lifter ? `${lifter.firstName?.toUpperCase()} ${lifter.lastName?.toUpperCase()}` : 'ZAWODNIK';
  $: displayClub = lifter?.club?.toUpperCase() || 'KLUB SPORTOWY';
  $: displayWeightClass = currentLifterData?.registration ? 
    formatWeightClass(currentLifterData.registration.weightClassId, contest?.weightClasses) : 'N/A';
  $: displayRackHeight = (() => {
    if (!currentLifterData) return 4;
    
    // Show rack height based on current lift type
    if (currentLift === 'Squat') {
      return currentLifterData.rackHeightSquat || 12;
    } else if (currentLift === 'Bench') {
      return currentLifterData.rackHeightBench || 5;
    } else {
      // Deadlift - no rack height needed, but show some default
      return '-';
    }
  })();

  // Close the display window
  async function closeDisplayWindow() {
    try {
      const currentWindow = getCurrentWindow();
      await currentWindow.close();
    } catch (err) {
      console.error('Error closing display window:', err);
    }
  }

  // Banner hover handlers
  function handleMouseEnter() {
    console.log('🔴 Banner: mouse ENTER - showing button');
    isHovered = true;
    console.log('🔴 Banner: isHovered =', isHovered);
  }

  function handleMouseLeave() {
    console.log('🔴 Banner: mouse LEAVE - hiding button');
    isHovered = false;
    console.log('🔴 Banner: isHovered =', isHovered);
  }

  // Button hover handlers
  function handleButtonEnter() {
    console.log('🔴 Button: mouse ENTER - keeping button visible');
    isButtonHovered = true;
    console.log('🔴 Button: isButtonHovered =', isButtonHovered);
  }

  function handleButtonLeave() {
    console.log('🔴 Button: mouse LEAVE - allowing button to hide');
    isButtonHovered = false;
    console.log('🔴 Button: isButtonHovered =', isButtonHovered);
  }
</script>

<div class="display-screen" role="presentation">
  
  <!-- Always-present close button with CSS visibility -->
  <button 
    class="close-button {showButton ? 'visible' : 'hidden'}"
    on:click={closeDisplayWindow}
    on:mouseenter={handleButtonEnter}
    on:mouseleave={handleButtonLeave}
    aria-label="Close display window"
  >
    <X size={20} strokeWidth={2} />
  </button>

  <!-- Top Banner with hover detection -->
  <header class="banner"
          on:mouseenter={handleMouseEnter}
          on:mouseleave={handleMouseLeave}>
    <h1 class="contest-title">{displayContest}</h1>
  </header>

  <!-- Loading State -->
  {#if !lifter}
    <main class="loading-container">
      <div class="loading-content">
        <div class="loading-spinner"></div>
        <h2 class="loading-title">Waiting for competitor selection...</h2>
        <p class="loading-subtitle">Select a competitor from the organizer window to display their information</p>
      </div>
    </main>
  {:else}
    <!-- Main Content Card -->
    <main class="main-card">
    
    <!-- Header Section -->
    <section class="lifter-header">
      <!-- Athlete Info -->
      <div class="lifter-info">
        {#key displayLifter}
          <h2 class="lifter-name" in:fly={{ x: -50, duration: 500, easing: quintOut }} out:fly={{ x: 50, duration: 250 }}>
            {displayLifter}
          </h2>
        {/key}
        {#key displayClub}
          <p class="club-name" in:fly={{ x: -30, duration: 400, delay: 100, easing: quintOut }} out:fly={{ x: 30, duration: 200 }}>
            {displayClub}
          </p>
        {/key}
      </div>

      <!-- Competition Info Cards -->
      <div class="info-cards">
        <div class="info-card">
          <p class="info-label">{$_('display.lift')}</p>
          <div class="info-value-wrapper">
            {#key currentLift}
              <p class="info-value info-value-absolute" in:blur={{ amount: 10, duration: 300, easing: quintOut }} out:blur={{ amount: 10, duration: 150 }}>
                {formatLiftName(currentLift)}
              </p>
            {/key}
          </div>
        </div>
        <div class="info-card">
          <p class="info-label">{$_('display.weight_class')}</p>
          <p class="info-value mono">{displayWeightClass}</p>
        </div>
      </div>
    </section>

    <!-- Main Attempts Section -->
    <section class="attempts-section">
      <!-- Photo -->
      <div class="photo-container">
        {#key lifter?.id}
          {#if lifter?.photoBase64}
            <img 
              src="data:image/webp;base64,{lifter.photoBase64}" 
              alt="{displayLifter}"
              class="lifter-photo"
              in:scale={{ start: 0.8, duration: 500, easing: backOut }}
              out:scale={{ start: 1, duration: 250 }}
            />
          {:else if lifter}
            <div class="photo-placeholder" in:fade={{ duration: 400 }} out:fade={{ duration: 200 }}>
              <User size={80} strokeWidth={1.5} class="text-text-secondary" />
              <div class="gender-indicator">
                {lifter.gender === 'Male' ? 'M' : 'F'}
              </div>
            </div>
          {:else}
            <div class="photo-placeholder" in:fade={{ duration: 300 }} out:fade={{ duration: 150 }}>
              <!-- Empty placeholder when no lifter -->
            </div>
          {/if}
        {/key}
      </div>

      <!-- Attempts -->
      <div class="attempts-container">
        <div class="attempts-row">
          {#each attempts as attempt, i (attempt.number)}
            <div 
              class="attempt-card {attempt.isHighlighted ? 'highlighted' : ''} {getAttemptStatusClass(attempt)} {attempt.isHighlighted ? '' : 'dimmed'}"
              in:fly={{ y: 30, duration: 400, delay: i * 100, easing: backOut }}
              out:fly={{ y: -30, duration: 200, delay: (2-i) * 50 }}
            >
              <p class="attempt-label {attempt.isHighlighted ? 'active-label' : ''}">
                {$_('display.attempt')} {attempt.number}
              </p>
              <div class="attempt-weight-wrapper">
                {#key attempt.weight + attempt.status}
                  <p class="attempt-weight attempt-weight-absolute {attempt.isHighlighted ? 'active-weight' : ''}">
                    {attempt.weight ? attempt.weight.toFixed(1) : '-'}
                  </p>
                {/key}
              </div>
            </div>
          {/each}
        </div>
      </div>
    </section>

    <!-- Footer Section -->
    <footer class="display-footer">
      <!-- Left: Rack Height and Plate Visualization -->
      <div class="stats-section">
        <!-- Rack Height -->
        <div class="rack-height">
          <p class="rack-label">{$_('display.rack_height')}</p>
          {#key displayRackHeight}
            <p 
              class="rack-value mono"
              in:fly={{ y: -15, duration: 350, easing: backOut }}
              out:fly={{ y: 15, duration: 200 }}
            >
              {displayRackHeight}
            </p>
          {/key}
        </div>
        
        <!-- Plate Visualization -->
        {#key plateCalculation?.targetWeight}
          {#if plateCalculation && plateCalculation.plates.length > 0}
            <div 
              class="plate-visualization"
              in:fly={{ x: -20, duration: 500, easing: backOut }}
              out:fly={{ x: 20, duration: 250 }}
            >
              <div class="half-barbell">
                <!-- Right Side Plates (from biggest to smallest) -->
                <div class="plates-container">
                  {#each plateCalculation.plates as [plateWeight, plateCount], plateIndex}
                    {#each Array(plateCount) as _, i}
                      <div 
                        class="plate plate-{plateWeight.toString().replace('.', '_')}"
                        style="width: {Math.max(plateWeight * 0.4 + 4, 6)}px; height: {Math.max(plateWeight * 2 + 20, 24)}px;"
                        in:scale={{ start: 0.3, duration: 300, delay: plateIndex * 100 + i * 50, easing: backOut }}
                        out:scale={{ start: 1, duration: 150, delay: (plateCalculation.plates.length - plateIndex - 1) * 50 }}
                      >
                        <div class="plate-label">
                          {plateWeight}
                        </div>
                      </div>
                    {/each}
                  {/each}
                </div>
                <!-- Half Barbell -->
                <div class="barbell-collar" in:fade={{ duration: 200, delay: 300 }}></div>
                <div class="barbell-half-bar" in:fade={{ duration: 200, delay: 350 }}></div>
              </div>
            </div>
          {/if}
        {/key}
      </div>

      <!-- Right: Logos -->
      <div class="logos-section">
        <div class="logo">
          <span>WUAP</span>
        </div>
        <div class="logo">
          <span>WILKOŁAK</span>
        </div>
        <p class="more-logos">+ {$_('display.others')}</p>
      </div>
    </footer>

  </main>
  {/if}
</div>

<style>
  .display-screen {
    font-family: 'Inter', sans-serif;
    background-color: #000000;
    margin: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    min-height: 100vh;
    color: #FFFFFF;
    overflow: hidden;
  }

  /* Top Banner */
  .banner {
    width: 100%;
    background-color: #1A1A1A;
    padding: 20px 0;
    text-align: center;
    margin-bottom: 40px;
    box-sizing: border-box;
  }

  .contest-title {
    font-family: 'Bebas Neue', sans-serif;
    margin: 0;
    font-size: 3rem;
    letter-spacing: 0.125rem;
    font-weight: normal;
    color: #FFFFFF;
  }

  /* Loading State */
  .loading-container {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    text-align: center;
  }

  .loading-content {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 30px;
  }

  .loading-spinner {
    width: 60px;
    height: 60px;
    border: 4px solid #404040;
    border-top: 4px solid #DC143C;
    border-radius: 50%;
    animation: spin 1s linear infinite;
  }

  .loading-title {
    font-size: 2.5rem;
    font-weight: 300;
    color: #FFFFFF;
    margin: 0;
  }

  .loading-subtitle {
    font-size: 1.2rem;
    color: #B0B0B0;
    margin: 0;
    max-width: 600px;
  }

  @keyframes spin {
    0% { transform: rotate(0deg); }
    100% { transform: rotate(360deg); }
  }

  /* Main Card */
  .main-card {
    width: 100%;
    max-width: 1280px;
    background-color: #1A1A1A;
    padding: 40px;
    box-sizing: border-box;
    display: flex;
    flex-direction: column;
    gap: 50px;
  }

  /* Header Section */
  .lifter-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    width: 100%;
    padding-bottom: 30px;
  }

  .lifter-name {
    font-family: 'Bebas Neue', sans-serif;
    margin: 0;
    font-size: 3.75rem;
    letter-spacing: 0.125rem;
    color: #FFFFFF;
  }

  .club-name {
    font-family: 'Inter', sans-serif;
    margin: 5px 0 0 0;
    color: #B0B0B0;
    font-size: 1rem;
    text-transform: uppercase;
    letter-spacing: 0.1em;
  }

  .info-cards {
    display: flex;
    gap: 20px;
    text-align: center;
  }

  .info-card {
    padding: 15px 25px;
  }

  .info-label {
    font-family: 'Inter', sans-serif;
    margin: 0;
    font-size: 0.75rem;
    color: #B0B0B0;
    text-transform: uppercase;
    letter-spacing: 0.2em;
  }

  .info-value {
    font-family: 'Bebas Neue', sans-serif;
    margin: 5px 0 0 0;
    font-size: 2.25rem;
    letter-spacing: 0.1em;
    color: #FFFFFF;
  }

  .info-value-wrapper {
    position: relative;
    height: 2.8rem; /* Fixed height to maintain layout */
  }

  .info-value-absolute {
    position: absolute;
    top: 10px; /* Match exact position of normal .info-value */
    left: 0;
    right: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    margin: 0;
    font-size: 2.25rem;
    letter-spacing: 0.1em;
  }

  .info-value.mono {
    font-family: 'JetBrains Mono', monospace;
    font-weight: bold;
  }

  /* Attempts Section */
  .attempts-section {
    display: flex;
    justify-content: center;
    align-items: stretch;
    gap: 40px;
    width: 100%;
  }

  .photo-container {
    width: 250px;
    height: 333px;
    flex-shrink: 0;
  }

  .lifter-photo {
    width: 100%;
    height: 100%;
    object-fit: cover;
    border: 2px solid #404040;
  }

  .photo-placeholder {
    width: 100%;
    height: 100%;
    border: 2px solid #404040;
    background-color: #2C2C2C;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 10px;
    border-radius: 8px;
  }

  .gender-indicator {
    font-size: 1.2rem;
    font-weight: bold;
    color: #B0B0B0;
    text-align: center;
  }

  .attempts-container {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 20px;
    width: 100%;
  }

  .attempts-row {
    display: flex;
    gap: 20px;
    width: 100%;
    height: 333px;
  }

  .attempt-card {
    flex: 1;
    min-width: 0;
    background-color: #1A1A1A;
    border: 2px solid #404040;
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: center;
    gap: 10px;
    box-shadow: 0 4px 24px rgba(0, 0, 0, 0.5);
    position: relative;
    transition: all 0.3s ease-in-out;
    cursor: pointer;
    -webkit-user-select: none;
    -moz-user-select: none;
    -ms-user-select: none;
    user-select: none;
  }

  .attempt-card::before {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    height: 4px;
    background: linear-gradient(to right, transparent, #6b7280, transparent);
  }

  .attempt-card.pending {
    border-color: #6b7280;
  }

  .attempt-card.pending::before {
    background: linear-gradient(to right, transparent, #6b7280, transparent);
  }

  .attempt-card.successful {
    border-color: #059669;
  }

  .attempt-card.successful::before {
    background: linear-gradient(to right, transparent, #059669, transparent);
  }

  .attempt-card.failed {
    border-color: #dc2626;
  }

  .attempt-card.failed::before {
    background: linear-gradient(to right, transparent, #dc2626, transparent);
  }

  .attempt-card.active {
    border-color: #DC143C !important;
    box-shadow: 0 8px 32px rgba(220, 20, 60, 0.3);
  }

  .attempt-card.active::before {
    background: linear-gradient(to right, transparent, #DC143C, transparent) !important;
  }

  .attempt-label.active-label {
    color: #FFFFFF;
  }

  .attempt-weight.active-weight {
    color: #DC143C;
  }

  .attempt-label {
    font-family: 'Inter', sans-serif;
    margin: 0;
    font-size: 1rem;
    text-transform: uppercase;
    letter-spacing: 0.1em;
  }

  .attempt-weight {
    font-family: 'JetBrains Mono', monospace;
    margin: 0;
    font-size: 5rem;
    font-weight: bold;
  }

  .attempt-weight-wrapper {
    position: relative;
    height: 6rem; /* Fixed height to maintain layout - slightly larger than font size */
    display: flex;
    align-items: center;
    justify-content: center;
    flex: 1;
  }

  .attempt-weight-absolute {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    margin: 0;
  }

  .mono {
    font-family: 'JetBrains Mono', monospace;
  }

  /* Footer */
  .display-footer {
    display: flex;
    justify-content: space-between;
    align-items: center;
    width: 100%;
    padding-top: 30px;
  }

  .stats-section {
    display: flex;
    align-items: center;
    gap: 30px;
  }

  .rack-height {
    text-align: center;
  }

  .rack-label {
    font-family: 'Inter', sans-serif;
    margin: 0;
    font-size: 0.75rem;
    color: #B0B0B0;
    text-transform: uppercase;
    letter-spacing: 0.2em;
  }

  .rack-value {
    font-family: 'JetBrains Mono', monospace;
    margin: 5px 0 0 0;
    font-weight: bold;
    font-size: 2.25rem;
    color: #FFFFFF;
  }

  .logos-section {
    display: flex;
    align-items: center;
    gap: 20px;
  }

  .logo {
    width: 80px;
    height: 80px;
    border: 2px solid #404040;
    background-color: #2C2C2C;
    display: flex;
    justify-content: center;
    align-items: center;
    font-family: 'Bebas Neue', sans-serif;
    font-size: 1.25rem;
  }

  .more-logos {
    font-family: 'Bebas Neue', sans-serif;
    color: #B0B0B0;
    margin: 0;
  }

  /* Plate Visualization */
  .plate-visualization {
    display: flex;
    align-items: center;
    gap: 10px;
    padding-left: 30px;
    border-left: 2px solid #404040;
    margin-left: 30px;
  }

  .half-barbell {
    display: flex;
    align-items: center;
    height: 40px;
    position: relative;
  }

  .plates-container {
    display: flex;
    align-items: center;
    gap: 1px;
    margin-right: 2px;
  }

  .barbell-collar {
    width: 8px;
    height: 30px;
    background: linear-gradient(to bottom, #6b7280, #4b5563);
    border: 1px solid #374151;
    z-index: 10;
  }

  .barbell-half-bar {
    width: 40px;
    height: 8px;
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

  /* Specific lift highlighting */
  .attempt-card.highlighted {
    border: 3px solid #FFFFFF !important;
    transform: scale(1.05);
    box-shadow: 
      0 0 30px rgba(255, 255, 255, 0.6),
      0 0 60px rgba(255, 255, 255, 0.3),
      inset 0 0 20px rgba(255, 255, 255, 0.1) !important;
    z-index: 10;
    animation: pulse-glow-white 2s ease-in-out infinite;
  }

  .attempt-card.dimmed {
    opacity: 0.4;
    transform: scale(0.95);
  }

  .attempt-card.highlighted .attempt-label,
  .attempt-card.highlighted .attempt-weight {
    color: #FFFFFF !important;
    font-weight: bold;
    text-shadow: 0 0 10px rgba(255, 255, 255, 0.8) !important;
  }

  /* White pulse animation for active lift */
  @keyframes pulse-glow-white {
    0%, 100% {
      box-shadow: 
        0 0 30px rgba(255, 255, 255, 0.6),
        0 0 60px rgba(255, 255, 255, 0.3),
        inset 0 0 20px rgba(255, 255, 255, 0.1);
    }
    50% {
      box-shadow: 
        0 0 40px rgba(255, 255, 255, 0.8),
        0 0 80px rgba(255, 255, 255, 0.5),
        inset 0 0 30px rgba(255, 255, 255, 0.2);
    }
  }

  /* Enhanced Blood Theme effects */
  .contest-title {
    text-shadow: 
      0 0 20px rgba(220, 20, 60, 0.5),
      0 0 40px rgba(220, 20, 60, 0.3);
  }

  .lifter-name {
    text-shadow: 
      0 0 15px rgba(255, 255, 255, 0.5),
      0 0 30px rgba(255, 255, 255, 0.2);
  }

  .info-card {
    box-shadow: 
      0 4px 24px rgba(0, 0, 0, 0.5),
      0 0 20px rgba(220, 20, 60, 0.1);
    transition: all 0.3s ease;
  }

  .info-card:hover {
    box-shadow: 
      0 8px 32px rgba(0, 0, 0, 0.6),
      0 0 30px rgba(220, 20, 60, 0.2);
  }

  /* Enhanced attempt cards */
  .attempt-card {
    box-shadow: 
      0 4px 24px rgba(0, 0, 0, 0.7),
      0 2px 8px rgba(0, 0, 0, 0.5),
      inset 0 1px 0 rgba(255, 255, 255, 0.05);
  }

  .attempt-card:hover:not(.highlighted) {
    box-shadow: 
      0 6px 32px rgba(0, 0, 0, 0.8),
      0 2px 8px rgba(0, 0, 0, 0.5),
      inset 0 1px 0 rgba(255, 255, 255, 0.1);
    transform: translateY(-2px);
  }

  /* Plate visualization glow when active */
  .plate-visualization {
    transition: all 0.3s ease;
  }

  .plate-visualization:not(:empty) {
    filter: drop-shadow(0 0 15px rgba(255, 255, 255, 0.2));
  }

  /* Responsive adjustments */
  @media (max-width: 1024px) {
    .contest-title {
      font-size: 2rem;
    }
    
    .lifter-name {
      font-size: 2.5rem;
    }
    
    .attempt-weight {
      font-size: 3rem;
    }
    
    .main-card {
      padding: 20px;
      gap: 30px;
    }
  }

  /* Close button */
  .close-button {
    position: fixed;
    top: 20px;
    right: 20px;
    width: 40px;
    height: 40px;
    background: none;
    border: none;
    color: #FFFFFF;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
    transition: all 0.3s ease;
    border-radius: 50%;
    backdrop-filter: blur(10px);
  }

  .close-button.hidden {
    opacity: 0;
    pointer-events: none;
    transform: scale(0.8);
  }

  .close-button.visible {
    opacity: 1;
    pointer-events: all;
    transform: scale(1);
  }

  .close-button.visible:hover {
    background-color: rgba(220, 20, 60, 0.8);
    color: #FFFFFF;
    transform: scale(1.1);
    box-shadow: 0 0 20px rgba(220, 20, 60, 0.4);
  }

  .close-button.visible:active {
    transform: scale(0.9);
  }
</style>