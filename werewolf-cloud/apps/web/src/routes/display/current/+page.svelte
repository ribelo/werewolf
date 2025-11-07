<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { realtimeClient } from '$lib/realtime';
  import { bundleToCurrentAttempt } from '$lib/current-attempt';
  import { get } from 'svelte/store';
  import { _ } from 'svelte-i18n';
  import QRCode from 'qrcode';
  import FullScreenQR from '$lib/components/FullScreenQR.svelte';
  import PlateBar from '$lib/components/PlateBar.svelte';
  import type { PageData } from './$types';
  import type { DisplayQrVisibility } from '@werewolf/domain';
  import type {
    Attempt,
    CurrentAttempt,
    CurrentAttemptBundle,
    LiveEvent,
    Registration,
    AttemptStatus,
  } from '$lib/types';
  import { formatAge } from '$lib/utils';

  export let data: PageData;

  type MessageValues = Record<string, string | number | boolean | Date | null | undefined>;

  function t(key: string, values?: MessageValues): string {
    const translate = get(_);
    return translate(key, values ? { values } : undefined);
  }

  let {
    contest,
    registrations,
    attempts,
    currentAttempt,
    referenceData,
    plateSets,
    error,
    contestId,
    isOffline,
    cacheAge,
  } = data;

  let liveAttempts: Attempt[] = [...attempts];
  let liveCurrentBundle: CurrentAttemptBundle | null = currentAttempt;
  let liveCurrentAttempt: CurrentAttempt | null = currentAttempt ? bundleToCurrentAttempt(currentAttempt) : null;

  // Derived competitor data
  $: hasCompletedAttempts = liveAttempts.some((attempt) =>
    (attempt.status ?? 'Pending').toLowerCase() !== 'pending'
  );
  $: currentRegistration = liveCurrentBundle?.registration ?? null;

  $: currentCompetitor = liveCurrentBundle?.competitor ?? null;

  let previousCompetitorName: string = '';
  let competitorNameChanged = false;
  let decipherText: string = '';
  
  let previousLiftLabel: string = '';
  let liftLabelChanged = false;
  let decipherLiftLabel: string = '';
  
  let previousCompetitorInfo: string = '';
  let competitorInfoChanged = false;
  let decipherCompetitorInfo: string = '';
  
  let previousAttemptWeights: string = '';
  let attemptWeightsChanged = false;
  let decipherAttemptWeights: string = '';
  
  let previousBarWeight: string = '';
  let previousCollarWeight: string = '';
  let barWeightChanged = false;
  let collarWeightChanged = false;
  let decipherBarWeight: string = '';
  let decipherCollarWeight: string = '';
  
  let previousPlates: string = '';
  let platesChanged = false;
  let decipherPlates: string = '';
  
  $: sanitizedName = currentCompetitor
    ? truncate(`${currentCompetitor.lastName} ${currentCompetitor.firstName}`, 28)
    : '';
  
  $: currentLiftLabelStr = liftLabel();
  
  $: competitorInfoStr = `${currentCompetitor?.club || ''}•${currentCity || ''}•${currentAge || ''}•${bodyweightLabel || ''}•${ageCategoryLabel || ''}•${weightClassLabel}`;
  
  $: attemptWeightsStr = attemptTiles.map(tile => tile.displayWeight).join('•');
  
  $: platesStr = platePlan && platePlan.plates.length > 0 
    ? platePlan.plates.map(p => `${p.plateWeight} kg`).join('•')
    : '';
  
  $: contestPlateSets = plateSets ?? [];
  $: contestMaxPlateWeight = contestPlateSets.length > 0
    ? Math.max(...contestPlateSets.map((plate) => plate.plateWeight ?? plate.weight ?? 0), 0)
    : null;

  $: barWeightStr = platePlan ? formatWeight(platePlan.barWeight) : '';
  $: collarWeightStr = platePlan && platePlan.clampWeight > 0 ? formatWeight(platePlan.clampWeight) : '';
  
  // Generic decipher animation function
  function createDecipherAnimation(
    targetText: string,
    previousText: string,
    onChanged: (changed: boolean) => void,
    onDecipherChange: (text: string) => void,
    onComplete: () => void
  ) {
    if (targetText !== previousText) {
      onChanged(true);
      let decipherText = previousText || '';
      const targetLength = targetText.length;
      let currentStep = 0;
      
      const decipherInterval = setInterval(() => {
        if (currentStep >= targetLength + 3) {
          onDecipherChange(targetText);
          clearInterval(decipherInterval);
          setTimeout(() => {
            onChanged(false);
            onComplete();
          }, 500);
          return;
        }
        
        decipherText = targetText.split('').map((char, index) => {
          if (index < currentStep) {
            return char;
          } else if (char === ' ' || char === '•' || char === ':' || char === '.' || char === ',') {
            return char;
          } else {
            const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*()';
            return chars[Math.floor(Math.random() * chars.length)];
          }
        }).join('');
        
        onDecipherChange(decipherText);
        currentStep++;
      }, 30);
      
      return decipherText;
    }
    return targetText;
  }
  
  // Competitor name decipher
  $: if (sanitizedName && sanitizedName !== previousCompetitorName) {
    decipherText = createDecipherAnimation(
      sanitizedName,
      previousCompetitorName,
      (changed) => competitorNameChanged = changed,
      (text) => decipherText = text,
      () => previousCompetitorName = sanitizedName
    );
  }
  
  // Lift label decipher
  $: if (currentLiftLabelStr && currentLiftLabelStr !== previousLiftLabel) {
    decipherLiftLabel = createDecipherAnimation(
      currentLiftLabelStr,
      previousLiftLabel,
      (changed) => liftLabelChanged = changed,
      (text) => decipherLiftLabel = text,
      () => previousLiftLabel = currentLiftLabelStr
    );
  }
  
  // Competitor info decipher
  $: if (competitorInfoStr && competitorInfoStr !== previousCompetitorInfo) {
    decipherCompetitorInfo = createDecipherAnimation(
      competitorInfoStr,
      previousCompetitorInfo,
      (changed) => competitorInfoChanged = changed,
      (text) => decipherCompetitorInfo = text,
      () => previousCompetitorInfo = competitorInfoStr
    );
  }
  
  // Attempt weights decipher (unified string)
  $: if (attemptWeightsStr && attemptWeightsStr !== previousAttemptWeights) {
    decipherAttemptWeights = createDecipherAnimation(
      attemptWeightsStr,
      previousAttemptWeights,
      (changed) => attemptWeightsChanged = changed,
      (text) => decipherAttemptWeights = text,
      () => previousAttemptWeights = attemptWeightsStr
    );
  }
  
  // Bar weight decipher
  $: if (barWeightStr && barWeightStr !== previousBarWeight) {
    decipherBarWeight = createDecipherAnimation(
      barWeightStr,
      previousBarWeight,
      (changed) => barWeightChanged = changed,
      (text) => decipherBarWeight = text,
      () => previousBarWeight = barWeightStr
    );
  }
  
  // Collar weight decipher
  $: if (collarWeightStr && collarWeightStr !== previousCollarWeight) {
    decipherCollarWeight = createDecipherAnimation(
      collarWeightStr,
      previousCollarWeight,
      (changed) => collarWeightChanged = changed,
      (text) => decipherCollarWeight = text,
      () => previousCollarWeight = collarWeightStr
    );
  }
  
  // Plates decipher (unified string)
  $: if (platesStr && platesStr !== previousPlates) {
    decipherPlates = createDecipherAnimation(
      platesStr,
      previousPlates,
      (changed) => platesChanged = changed,
      (text) => decipherPlates = text,
      () => previousPlates = platesStr
    );
  }

  $: attemptsByLift = liveCurrentBundle?.attemptsByLift ?? { Squat: [], Bench: [], Deadlift: [] };

  $: highlightedLift = liveCurrentBundle?.highlight?.liftType ?? null;

  $: currentLiftAttempts = highlightedLift ? attemptsByLift[highlightedLift] ?? [] : [];

  let previousAttemptStatuses: Record<number, string> = {};
  
  $: attemptTiles = currentLiftAttempts.length > 0
    ? [1, 2, 3].map((num) => {
        const match = currentLiftAttempts.find((item) => item.attemptNumber === num);
        const weight = match?.weight ?? null;
        const status = (match?.status ?? 'Pending') as AttemptStatus;
        const previousStatus = previousAttemptStatuses[num];
        const statusChanged = previousStatus && previousStatus !== status;
        
        // Update previous status
        previousAttemptStatuses[num] = status;
        
        return {
          number: num,
          weight,
          displayWeight: formatWeight(weight),
          status,
          isHighlighted: liveCurrentBundle?.highlight?.attemptNumber === num,
          statusChanged,
        };
      })
    : [1, 2, 3].map((num) => {
        const status = 'Pending' as AttemptStatus;
        const previousStatus = previousAttemptStatuses[num];
        const statusChanged = previousStatus && previousStatus !== status;
        
        // Update previous status
        previousAttemptStatuses[num] = status;
        
        return {
          number: num,
          weight: null,
          displayWeight: '—',
          status,
          isHighlighted: false,
          statusChanged,
        };
      });

  $: platePlan = liveCurrentBundle?.platePlan ?? null;
  $: clampWeightPerClamp = platePlan
    ? platePlan.clampWeightPerClamp ?? (platePlan.clampWeight && platePlan.clampWeight > 0 ? platePlan.clampWeight / 2 : null)
    : null;

  $: weightClassLabel = currentRegistration?.weightClassName ?? currentRegistration?.weightClassId ?? '—';
  $: ageCategoryLabel = currentRegistration?.ageCategoryName ?? null;
  $: currentAge = currentCompetitor?.birthDate ? formatAge(currentCompetitor.birthDate) : null;
  $: currentCity = currentCompetitor?.city && currentCompetitor.city.trim().length > 0 ? currentCompetitor.city.trim() : null;

  $: shareableUrl = typeof window !== 'undefined' && contestId
    ? `${window.location.origin}${window.location.pathname}?contestId=${contestId}`
    : '';

  let qrDataUrl: string | null = null;
  let qrOpen = false;
  let lastQrUrl: string | null = null;

  $: currentAttemptMeta = liveCurrentAttempt
    ? `${liftLabel()} • ${t('display_current.tiles.attempt', { number: liveCurrentAttempt.attemptNumber })}`
    : t('display_current.waiting.next_title');

  // competition order removed
  $: competitionOrderLabel = null;

  $: bodyweightLabel = currentRegistration?.bodyweight
    ? formatWeight(currentRegistration.bodyweight)
    : null;

  $: currentAttemptWeight = liveCurrentAttempt ? formatWeight(liveCurrentAttempt.weight) : '—';

  async function buildQr(url: string) {
    try {
      qrDataUrl = await QRCode.toDataURL(url, {
        width: 96,
        margin: 1,
        color: {
          dark: '#FFFFFFFF',
          light: '#000000FF',
        },
      });
    } catch (error) {
      console.error('Failed to generate QR code', error);
      qrDataUrl = null;
    }
  }

  $: if (shareableUrl && shareableUrl !== lastQrUrl) {
    lastQrUrl = shareableUrl;
    buildQr(shareableUrl);
  }

  const unsubscribeEvents = realtimeClient.events.subscribe((event) => {
    if (!event || event.contestId !== contestId) return;
    handleLiveEvent(event);
  });

  onMount(() => {
    if (contestId) {
      realtimeClient.connect(contestId);
    }
  });

  onDestroy(() => {
    realtimeClient.disconnect();
    unsubscribeEvents();
  });

  function handleLiveEvent(event: LiveEvent) {
    switch (event.type) {
      case 'attempt.upserted': {
        const payload = event.data as Attempt;
        if (!payload) break;
        const index = liveAttempts.findIndex((item) => item.id === payload.id);
        if (index >= 0) {
          liveAttempts[index] = payload;
        } else {
          liveAttempts = [...liveAttempts, payload];
        }
        liveAttempts = [...liveAttempts];
        
        // Update current bundle if this attempt belongs to current lifter
        if (liveCurrentBundle && payload.registrationId === liveCurrentBundle.registration?.id) {
          const liftType = payload.liftType as keyof typeof liveCurrentBundle.attemptsByLift;
          if (liveCurrentBundle.attemptsByLift[liftType]) {
            const attemptIndex = liveCurrentBundle.attemptsByLift[liftType].findIndex(
              a => a.attemptNumber === payload.attemptNumber
            );
            if (attemptIndex >= 0) {
              // Update specific fields of existing attempt
              const existingAttempt = liveCurrentBundle.attemptsByLift[liftType][attemptIndex];
              liveCurrentBundle.attemptsByLift[liftType][attemptIndex] = {
                ...existingAttempt,
                weight: payload.weight,
                status: payload.status,
                updatedAt: payload.updatedAt,
                id: payload.id,
                liftType: payload.liftType,
                attemptNumber: payload.attemptNumber
              };
              // Trigger reactive update
              liveCurrentBundle = {...liveCurrentBundle};
              liveCurrentAttempt = bundleToCurrentAttempt(liveCurrentBundle);
            }
          }
        }
        break;
      }
      case 'attempt.resultUpdated': {
        const payload = event.data as Attempt;
        if (!payload) break;
        const index = liveAttempts.findIndex((item) => item.id === payload.id);
        if (index >= 0) {
          liveAttempts[index] = { ...liveAttempts[index], ...payload };
          liveAttempts = [...liveAttempts];
        }
        if (liveCurrentBundle && payload.registrationId === liveCurrentBundle.registration?.id) {
          const liftType = payload.liftType as keyof typeof liveCurrentBundle.attemptsByLift;
          const attemptsForLift = liveCurrentBundle.attemptsByLift[liftType];
          if (attemptsForLift) {
            const attemptIndex = attemptsForLift.findIndex(
              (attempt) => attempt.attemptNumber === payload.attemptNumber
            );
            if (attemptIndex >= 0) {
              const existing = attemptsForLift[attemptIndex];
              if (!existing) break;
              attemptsForLift[attemptIndex] = {
                ...existing,
                status: payload.status,
                weight: payload.weight,
                updatedAt: payload.updatedAt ?? existing.updatedAt,
              };
              liveCurrentBundle = { ...liveCurrentBundle };
              liveCurrentAttempt = bundleToCurrentAttempt(liveCurrentBundle);
            }
          }
        }
        break;
      }
      case 'attempt.currentSet': {
        const bundle = event.data as CurrentAttemptBundle | null;
        if (bundle) {
          liveCurrentBundle = bundle;
          liveCurrentAttempt = bundleToCurrentAttempt(bundle);
        }
        break;
      }
      case 'attempt.currentCleared': {
        liveCurrentBundle = null;
        liveCurrentAttempt = null;
        break;
      }
      case 'display.qrVisibility': {
        const payload = event.data as DisplayQrVisibility | undefined;
        if (!payload || (payload.target !== 'current' && payload.target !== 'all')) break;
        qrOpen = payload.action === 'show';
        break;
      }
      default:
        break;
    }
  }

  function truncate(value: string, length: number): string {
    if (value.length <= length) return value;
    return `${value.slice(0, length - 3)}...`;
  }

  function rackHeight(): string | null {
    if (!currentRegistration) return null;
    const lift = highlightedLift ?? liveCurrentAttempt?.liftType ?? null;
    if (lift === 'Squat' && currentRegistration.rackHeightSquat) {
      return `${currentRegistration.rackHeightSquat} cm`;
    }
    if (lift === 'Bench' && currentRegistration.rackHeightBench) {
      return `${currentRegistration.rackHeightBench} cm`;
    }
    return null;
  }

  function liftLabel(): string {
    const lift = (highlightedLift ?? liveCurrentAttempt?.liftType ?? '').toString();
    if (!lift) return '';
    const key = lift.toLowerCase();
    const translated = t(`display_current.lifts.${key}`);
    if (translated && translated !== `display_current.lifts.${key}`) {
      return translated;
    }
    return lift.toUpperCase();
  }

  function formatWeight(value?: number | null): string {
    if (value == null || Number.isNaN(value) || value <= 0) return '—';
    return (Math.round(value * 100) / 100).toFixed(2);
  }

  function attemptBackgroundClass(status: string): string {
    const normalized = status?.toLowerCase() ?? '';
    if (normalized === 'successful') {
      return 'bg-green-900/40 border border-green-600 text-green-100';
    }
    if (normalized === 'failed') {
      return 'bg-red-900/40 border border-red-700 text-red-100';
    }
    return 'bg-element-bg border border-border-color text-text-secondary';
  }

  function statusIndicatorClass(status: string): string {
    const normalized = status?.toLowerCase() ?? '';
    if (normalized === 'successful') return 'bg-green-500';
    if (normalized === 'failed') return 'bg-red-600';
    return 'bg-gray-500';
  }

  function glowClass(status: string): string {
    const normalized = status?.toLowerCase() ?? '';
    if (normalized === 'successful') {
      return 'shadow-[0_0_90px_rgba(255,255,255,0.55),0_0_65px_rgba(34,197,94,0.65)] animate-pulse-glow-success';
    }
    if (normalized === 'failed') {
      return 'shadow-[0_0_90px_rgba(255,255,255,0.55),0_0_65px_rgba(220,20,60,0.65)] animate-pulse-glow-failed';
    }
    return 'shadow-[0_0_90px_rgba(255,255,255,0.55)] animate-pulse-glow-pending';
  }

  $: currentRackHeight = rackHeight();
</script>

<style>
  @keyframes pulse-glow-pending {
    0%, 100% {
      box-shadow: 0 0 90px rgba(255,255,255,0.55);
    }
    50% {
      box-shadow: 0 0 120px rgba(255,255,255,0.75);
    }
  }
  
  @keyframes pulse-glow-success {
    0%, 100% {
      box-shadow: 0 0 90px rgba(255,255,255,0.55), 0 0 65px rgba(34,197,94,0.65);
    }
    50% {
      box-shadow: 0 0 120px rgba(255,255,255,0.75), 0 0 85px rgba(34,197,94,0.85);
    }
  }
  
  @keyframes pulse-glow-failed {
    0%, 100% {
      box-shadow: 0 0 90px rgba(255,255,255,0.55), 0 0 65px rgba(220,20,60,0.65);
    }
    50% {
      box-shadow: 0 0 120px rgba(255,255,255,0.75), 0 0 85px rgba(220,20,60,0.85);
    }
  }

  @keyframes status-change-success {
    0% {
      background-color: rgba(34, 197, 94, 0);
      border-color: rgba(34, 197, 94, 0);
    }
    50% {
      background-color: rgba(34, 197, 94, 0.3);
      border-color: rgba(34, 197, 94, 0.8);
    }
    100% {
      background-color: rgba(34, 197, 94, 0);
      border-color: rgba(34, 197, 94, 0);
    }
  }

  @keyframes status-change-failed {
    0% {
      background-color: rgba(220, 20, 60, 0);
      border-color: rgba(220, 20, 60, 0);
    }
    50% {
      background-color: rgba(220, 20, 60, 0.3);
      border-color: rgba(220, 20, 60, 0.8);
    }
    100% {
      background-color: rgba(220, 20, 60, 0);
      border-color: rgba(220, 20, 60, 0);
    }
  }
  
  .animate-pulse-glow-pending {
    animation: pulse-glow-pending 2s ease-in-out infinite;
  }
  
  .animate-pulse-glow-success {
    animation: pulse-glow-success 2s ease-in-out infinite;
  }
  
  .animate-pulse-glow-failed {
    animation: pulse-glow-failed 2s ease-in-out infinite;
  }

  .animate-status-success {
    animation: status-change-success 0.8s ease-out;
  }

  .animate-status-failed {
    animation: status-change-failed 0.8s ease-out;
  }

  /* Smooth transitions for all interactive states */
  .attempt-tile {
    transition: all 0.5s cubic-bezier(0.4, 0, 0.2, 1);
  }




</style>

<svelte:head>
  <title>{(contest?.name ?? t('display_current.head.default_contest')) + ' • ' + t('display_current.head.subtitle')}</title>
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
</svelte:head>

<div class="min-h-screen bg-black text-white flex flex-col">
  <header class="w-full bg-black px-4 sm:px-6 md:px-8 lg:px-10 py-6 sm:py-8 md:py-10 text-center">
    <div>
      <h1 class="font-display text-2xl sm:text-3xl md:text-4xl lg:text-5xl uppercase tracking-[0.1rem] sm:tracking-[0.15rem] md:tracking-[0.2rem] text-white" style="text-shadow: 0 0 16px rgba(220, 20, 60, 0.55), 0 0 32px rgba(220, 20, 60, 0.35);">{contest?.name ?? t('display_current.head.default_contest')}</h1>
    </div>
  </header>

  {#if error}
    <main class="flex-1 flex items-center justify-center px-6 py-12">
      <div class="card max-w-2xl text-center">
        <h2 class="text-h2 text-status-error mb-4">{t('display_current.errors.load_failed_title')}</h2>
        <p class="text-body text-text-secondary">{error}</p>
      </div>
    </main>
  {:else if !contest}
    <main class="flex-1 flex items-center justify-center px-6 py-12">
      <div class="card max-w-xl text-center">
        <h2 class="text-h2 text-text-primary mb-4">{t('display_current.errors.not_found_title')}</h2>
        <p class="text-body text-text-secondary">{t('display_current.errors.not_found_hint')}</p>
      </div>
    </main>
  {:else if !liveCurrentAttempt}
    <main class="flex-1 flex items-center justify-center px-6 py-12">
      <div class="card max-w-3xl text-center space-y-4">
        <h2 class="text-display text-text-primary">
          {hasCompletedAttempts ? t('display_current.waiting.next_title') : t('display_current.waiting.first_title')}
        </h2>
        <p class="text-body text-text-secondary">
          {hasCompletedAttempts
            ? t('display_current.waiting.next_hint')
            : t('display_current.waiting.first_hint')}
        </p>
      </div>
    </main>
  {:else}
    <main class="flex-1 container-full py-6 sm:py-8 md:py-10 lg:py-12 flex">
      <section class="card flex-1 flex flex-col space-y-10">
        <header class="space-y-4">
          <div class="flex flex-col gap-4">
            <div class="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-4">
              <div class="flex flex-col gap-2 w-full">
                <div class="flex flex-wrap items-baseline gap-4 justify-between w-full">
                  <h2 class="text-display text-text-primary uppercase tracking-[0.3em] font-mono">{competitorNameChanged ? decipherText : sanitizedName}</h2>
                  <h3 class="text-display text-text-secondary uppercase tracking-[0.3em] font-mono">{liftLabelChanged ? decipherLiftLabel : currentLiftLabelStr}</h3>
                </div>
              </div>
            </div>

            <div class="flex flex-wrap items-center gap-4 text-caption uppercase tracking-[0.3em] text-text-secondary">
              <span class="font-mono">{competitorInfoChanged ? decipherCompetitorInfo.split('•')[0] || t('display_current.hero.club_placeholder') : (currentCompetitor?.club || t('display_current.hero.club_placeholder'))}</span>
              {#if currentCity}
                <span class="font-mono">• {t('display_current.info.city')}: <span class="text-text-primary">{competitorInfoChanged ? decipherCompetitorInfo.split('•')[1] || currentCity : currentCity}</span></span>
              {/if}
              {#if currentAge !== null}
                <span class="font-mono">• {t('display_current.meta.age')}: <span class="text-text-primary">{competitorInfoChanged ? decipherCompetitorInfo.split('•')[2] || currentAge : currentAge}</span></span>
              {/if}
              {#if bodyweightLabel}
                <span class="font-mono">• {t('display_current.meta.bodyweight')}: <span class="text-text-primary">{competitorInfoChanged ? decipherCompetitorInfo.split('•')[3] || (bodyweightLabel + (bodyweightLabel !== '—' ? ' kg' : '')) : (bodyweightLabel + (bodyweightLabel !== '—' ? ' kg' : ''))}</span></span>
              {/if}
              {#if ageCategoryLabel}
                <span class="font-mono">• {t('display_current.info.age_category')}: <span class="text-text-primary">{competitorInfoChanged ? decipherCompetitorInfo.split('•')[4] || ageCategoryLabel : ageCategoryLabel}</span></span>
              {/if}
              <span class="font-mono">• {t('display_current.info.weight_class')}: <span class="text-text-primary">{competitorInfoChanged ? decipherCompetitorInfo.split('•')[5] || weightClassLabel : weightClassLabel}</span></span>
            
            </div>
          </div>
        </header>

        <section class="flex-1 flex flex-col space-y-6">

          <div class="flex flex-col gap-4 lg:flex-row lg:items-stretch flex-1">
            {#each attemptTiles as tile}
              <div class={`attempt-tile flex-1 min-w-[120px] sm:min-w-[140px] md:min-w-[160px] px-3 sm:px-4 md:px-6 py-4 sm:py-5 md:py-6 flex flex-col tracking-[0.2em] sm:tracking-[0.3em] uppercase text-center shadow-inner transform ${attemptBackgroundClass(tile.status)} ${tile.isHighlighted ? `border-2 border-white ${glowClass(tile.status)} scale-105` : 'hover:scale-102'}`} class:animate-status-success={tile.statusChanged && tile.status === 'successful'} class:animate-status-failed={tile.statusChanged && tile.status === 'failed'}>
                <p class="text-h3 text-text-secondary">
                  {t('display_current.tiles.attempt', { number: tile.number })}
                </p>
                <div class="flex-1 flex items-center justify-center">
                  <div class="flex items-baseline justify-center gap-2 md:gap-4">
                     <span class="text-4xl sm:text-5xl md:text-6xl lg:text-[6rem] leading-none font-mono text-text-primary">{attemptWeightsChanged ? decipherAttemptWeights.split('•')[tile.number - 1] || tile.displayWeight : tile.displayWeight}</span>
                    {#if tile.displayWeight !== '—'}
                      <span class="text-lg sm:text-xl md:text-2xl lg:text-3xl font-mono text-text-secondary uppercase tracking-[0.3em]">kg</span>
                    {/if}
                  </div>
                </div>
              </div>
            {/each}
          </div>
          {#if currentRackHeight}
            <div class="inline-flex items-center gap-3 text-label text-text-secondary uppercase tracking-[0.3em]">
              <span>{t('display_current.footer.rack_height')}</span>
              <span class="text-h3 font-mono text-text-primary">{currentRackHeight}</span>
            </div>
          {/if}

          <div class="flex flex-col gap-6 lg:flex-row lg:items-center lg:gap-8">
            <!-- Visual plate bar representation -->
            {#if platePlan && platePlan.plates.length > 0}
              <div class="w-full lg:w-auto flex justify-center lg:justify-start">
                <PlateBar
                  plates={platePlan.plates}
                  heightPx={200}
                  minWidthPx={8}
                  maxWidthPx={40}
                  maxPlateWeight={contestMaxPlateWeight}
                />
              </div>
            {/if}
            <div class="space-y-3 self-center lg:self-center">
              {#if platePlan && platePlan.plates.length > 0}
                <div class="flex flex-col gap-4">
                  <div class="flex flex-wrap items-center gap-8 justify-center lg:justify-start">
                    {#each platePlan.plates as plate, index (plate.plateWeight + '-' + index)}
                      <div class="flex items-center gap-4 text-text-secondary uppercase tracking-[0.2em]">
                         <span class="text-text-primary font-mono text-4xl">{platesChanged ? decipherPlates.split('•')[index] || `${plate.plateWeight} kg` : `${plate.plateWeight} kg`}</span>
                        <span class="text-text-secondary font-mono text-2xl opacity-70">{t('display_current.sidebar.plates_per_side', { count: plate.count })}</span>
                      </div>
                    {/each}
                  </div>
                  <div class="flex flex-wrap items-center justify-center gap-6 text-text-secondary uppercase tracking-[0.2em] text-2xl">
                     <span class="font-mono">{t('display_current.sidebar.bar_weight', { weight: formatWeight(platePlan.barWeight) })}</span>
                    {#if platePlan.clampWeight > 0}
                       <span class="font-mono">{t('display_current.sidebar.collar_weight', {
                         total: formatWeight(platePlan.clampWeight),
                         perClamp: clampWeightPerClamp ? formatWeight(clampWeightPerClamp) : formatWeight(platePlan.clampWeight / 2)
                       })}</span>
                    {/if}
                    {#if !platePlan.exact}
                      <span class="text-status-warning">{t('display_current.sidebar.target_weight', { target: formatWeight(platePlan.targetWeight) })}</span>
                    {/if}
                  </div>
                </div>
              {:else}
                <p class="text-body text-text-secondary">{t('display_current.sidebar.no_plates')}</p>
              {/if}
            </div>
            {#if qrDataUrl}
              <div class="self-center lg:ml-auto flex items-center">
                <button type="button" class="p-0 bg-transparent" on:click={() => (qrOpen = true)} aria-label={t('display_current.sidebar.share_title')}>
                  <img src={qrDataUrl} alt={t('display_current.sidebar.share_title')} class="w-24 h-24 border-2 border-primary-red shadow-[0_0_20px_rgba(220,20,60,0.45)]" />
                </button>
              </div>
              {#if qrOpen}
                <FullScreenQR url={shareableUrl} on:close={() => (qrOpen = false)} />
              {/if}
            {/if}
          </div>
        </section>
      </section>
    </main>
  {/if}
</div>
