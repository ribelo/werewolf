<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { realtimeClient } from '$lib/realtime';
  import { bundleToCurrentAttempt } from '$lib/current-attempt';
  import { get } from 'svelte/store';
  import { _ } from 'svelte-i18n';
  import QRCode from 'qrcode';
    import type { PageData } from './$types';
  import type {
    Attempt,
    CurrentAttempt,
    CurrentAttemptBundle,
    LiveEvent,
    Registration,
    AttemptStatus,
  } from '$lib/types';

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

  $: sanitizedName = currentCompetitor
    ? truncate(`${currentCompetitor.firstName} ${currentCompetitor.lastName}`, 28)
    : '';

  $: attemptsByLift = liveCurrentBundle?.attemptsByLift ?? { Squat: [], Bench: [], Deadlift: [] };

  $: highlightedLift = liveCurrentBundle?.highlight?.liftType ?? null;

  $: currentLiftAttempts = highlightedLift ? attemptsByLift[highlightedLift] ?? [] : [];

  $: attemptTiles = currentLiftAttempts.length > 0
    ? [1, 2, 3].map((num) => {
        const match = currentLiftAttempts.find((item) => item.attemptNumber === num);
        const weight = match?.weight ?? null;
        return {
          number: num,
          weight,
          displayWeight: formatWeight(weight),
          status: (match?.status ?? 'Pending') as AttemptStatus,
          isHighlighted: liveCurrentBundle?.highlight?.attemptNumber === num,
        };
      })
    : [1, 2, 3].map((num) => ({
        number: num,
        weight: null,
        displayWeight: '—',
        status: 'Pending' as AttemptStatus,
        isHighlighted: false,
      }));

  $: platePlan = liveCurrentBundle?.platePlan ?? null;

  $: weightClassLabel = currentRegistration?.weightClassName ?? currentRegistration?.weightClassId ?? '—';

  $: shareableUrl = typeof window !== 'undefined' && contestId
    ? `${window.location.origin}${window.location.pathname}?contestId=${contestId}`
    : '';

  let qrDataUrl: string | null = null;
  let lastQrUrl: string | null = null;

  $: currentAttemptMeta = liveCurrentAttempt
    ? `${liftLabel()} • ${t('display_current.tiles.attempt', { number: liveCurrentAttempt.attemptNumber })}`
    : t('display_current.waiting.next_title');

  $: lotBadgeLabel = currentRegistration?.lotNumber
    ? t('display_table.queue.lot', { lot: currentRegistration.lotNumber })
    : null;

  $: competitionOrderLabel = liveCurrentAttempt?.competitionOrder
    ? t('display_current.meta.order_label', { order: liveCurrentAttempt.competitionOrder })
    : null;

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
    return Number.isInteger(value) ? `${Math.trunc(value)}` : value.toFixed(1);
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

  $: currentRackHeight = rackHeight();
</script>

<svelte:head>
  <title>{(contest?.name ?? t('display_current.head.default_contest')) + ' • ' + t('display_current.head.subtitle')}</title>
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
</svelte:head>

<div class="min-h-screen bg-black text-white flex flex-col">
  <header class="w-full bg-black px-10 py-10 text-center">
    <div>
      <h1 class="font-display text-5xl uppercase tracking-[0.2rem] text-white" style="text-shadow: 0 0 24px rgba(220, 20, 60, 0.55), 0 0 48px rgba(220, 20, 60, 0.35);">{contest?.name ?? t('display_current.head.default_contest')}</h1>
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
    <main class="flex-1 container-full py-12 flex">
      <section class="card flex-1 flex flex-col space-y-10">
        <header class="space-y-4">
          <div class="flex flex-col gap-4">
            <div class="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-4">
              <div class="flex flex-col gap-2 w-full">
                <div class="flex flex-wrap items-baseline gap-4 justify-between w-full">
                  <h2 class="text-display text-text-primary uppercase tracking-[0.3em]">{sanitizedName}</h2>
                  <p class="text-h2 font-mono text-text-primary uppercase tracking-[0.2em] text-right ml-auto">{liftLabel()}{#if currentAttemptWeight !== '—'} <span class="text-text-secondary">{currentAttemptWeight} kg</span>{/if}</p>
                </div>
              </div>
            </div>

            <div class="flex flex-wrap items-center gap-4 text-caption uppercase tracking-[0.3em] text-text-secondary">
              <span>{currentCompetitor?.club || t('display_current.hero.club_placeholder')}</span>
              <span>• {t('display_current.info.weight_class')}: <span class="text-text-primary">{weightClassLabel}</span></span>
              {#if bodyweightLabel}
                <span>• {t('display_current.meta.bodyweight')}: <span class="text-text-primary">{bodyweightLabel}{bodyweightLabel !== '—' ? ' kg' : ''}</span></span>
              {/if}
              {#if competitionOrderLabel}
                <span class="uppercase tracking-[0.3em] text-caption text-text-secondary">{competitionOrderLabel}</span>
              {/if}
              {#if lotBadgeLabel}
                <span class="uppercase tracking-[0.3em] text-caption text-text-secondary">{lotBadgeLabel}</span>
              {/if}
            </div>
          </div>
        </header>

        <section class="flex-1 flex flex-col space-y-6">

          <div class="flex flex-col gap-4 lg:flex-row lg:items-stretch flex-1">
            {#each attemptTiles as tile}
              <div class={`flex-1 min-w-[160px] px-6 py-6 flex flex-col tracking-[0.3em] uppercase text-center shadow-inner transition-all duration-300 ${attemptBackgroundClass(tile.status)} ${tile.isHighlighted ? 'border-primary-red shadow-[0_0_25px_rgba(220,20,60,0.35)] bg-primary-red/20 text-text-primary' : ''}`}>
                <p class="text-h3 text-text-secondary">
                  {t('display_current.tiles.attempt', { number: tile.number })}
                </p>
                <div class="flex-1 flex items-center justify-center">
                  <div class="flex items-baseline justify-center gap-4">
                    <span class="text-[6rem] leading-none font-mono text-text-primary">{tile.displayWeight}</span>
                    {#if tile.displayWeight !== '—'}
                      <span class="text-3xl font-mono text-text-secondary uppercase tracking-[0.3em]">kg</span>
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


          <div class="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
            <div class="space-y-3">
              {#if platePlan && platePlan.plates.length > 0}
                <div class="flex flex-wrap items-center gap-8 justify-center lg:justify-start">
                  {#each platePlan.plates as plate, index (plate.plateWeight + '-' + index)}
                    <div class="flex items-center gap-4 text-text-secondary uppercase tracking-[0.2em]">
                      <span class="text-text-primary font-mono text-4xl">{plate.plateWeight} kg</span>
                      <span class="text-text-secondary font-mono text-4xl opacity-70">×{plate.count}</span>
                    </div>
                  {/each}
                </div>
              {:else}
                <p class="text-body text-text-secondary">{t('display_current.sidebar.no_plates')}</p>
              {/if}
            </div>
            {#if qrDataUrl}
              <div class="self-center flex items-center">
                <img src={qrDataUrl} alt={t('display_current.sidebar.share_title')} class="w-24 h-24 border-2 border-primary-red shadow-[0_0_20px_rgba(220,20,60,0.45)]" />
              </div>
            {/if}
          </div>
        </section>
      </section>
    </main>
  {/if}
</div>
