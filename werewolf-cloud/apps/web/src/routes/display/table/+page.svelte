<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { browser } from '$app/environment';
  import { realtimeClient } from '$lib/realtime';
  import { apiClient } from '$lib/api';
  import type { PageData } from './$types';
  import type {
    Attempt,
    LiveEvent,
    Registration,
    CurrentAttempt,
    CurrentAttemptBundle,
    AttemptStatus,
    AttemptNumber,
    SystemHealth,
  } from '$lib/types';
  import { bundleToCurrentAttempt } from '$lib/current-attempt';
  import { get } from 'svelte/store';
  import { _ } from 'svelte-i18n';
  import { getAttemptStatusLabel, getAttemptStatusClass } from '$lib/ui/status';
  import { buildRisingBarQueue } from '$lib/rising-bar';
  import UnifiedContestTable from '$lib/components/UnifiedContestTable.svelte';
  import { buildUnifiedRows, deriveContestLifts, sortUnifiedRows, type UnifiedRow, type LiftKind } from '$lib/contest-table';

  type MessageValues = Record<string, string | number | boolean | Date | null | undefined>;
  type ScrollSpeed = 'slow' | 'normal' | 'fast';
  type ApiStatus = 'checking' | 'online' | 'degraded' | 'offline';

  const AUTO_SCROLL_STORAGE_KEY = 'displayTable.autoScrollEnabled';
  const AUTO_SCROLL_SPEED_STORAGE_KEY = 'displayTable.autoScrollSpeed';
  const SPEED_PIXELS_PER_SECOND: Record<ScrollSpeed, number> = {
    slow: 35,
    normal: 70,
    fast: 110,
  };

  function t(key: string, values?: MessageValues): string {
    const translate = get(_);
    return translate(key, values ? { values } : undefined);
  }

  function formatWeight(value?: number | null): string {
    if (value == null || Number.isNaN(value) || value <= 0) return '—';
    return Number.isInteger(value) ? `${Math.trunc(value)}` : value.toFixed(1);
  }

  export let data: PageData;

  let {
    contest,
    registrations,
    attempts,
    currentAttempt,
    referenceData,
    error,
    contestId,
  } = data;

  // Real-time state
  let liveAttempts: Attempt[] = [...attempts];
  let contestLifts: LiftKind[] = deriveContestLifts(contest, liveAttempts);
  let liveCurrentBundle: CurrentAttemptBundle | null = currentAttempt;
  let liveCurrentAttempt: CurrentAttempt | null = currentAttempt ? bundleToCurrentAttempt(currentAttempt) : null;
  let lastUpdateTime: Date | null = null;

  let sortColumn = 'order';
  let sortDirection: 'asc' | 'desc' = 'asc';
  let selectedLift: LiftKind | null = null;
  let visibleLifts: LiftKind[] = [...contestLifts];
  let unifiedRows: UnifiedRow[] = [];
  let sortedRows: UnifiedRow[] = [];
  let filteredRows: UnifiedRow[] = [];
  let mensBarWeightSetting: number | null = contest?.mensBarWeight ?? null;
  let womensBarWeightSetting: number | null = contest?.womensBarWeight ?? null;
  let clampWeightSetting: number | null = contest?.clampWeight ?? 2.5;
  let autoScrollEnabled = false;
  let scrollSpeed: ScrollSpeed = 'normal';
  let scrollDirection: 1 | -1 = 1;
  let animationFrameId: number | null = null;
  let lastAnimationTimestamp: number | null = null;
  let preferencesLoaded = false;
  let tableScrollContainer: HTMLDivElement | null = null;
  let apiStatus: ApiStatus = 'checking';
  let compactLayout = false;
  let compactMediaQuery: MediaQueryList | null = null;
  let compactMediaListener: ((event: MediaQueryListEvent) => void) | null = null;

  const COMPACT_HEIGHT_QUERY = '(max-height: 820px)';

  // Derived metrics
  $: pendingAttempts = computePendingAttempts();
  $: pendingCount = pendingAttempts.length;
  $: recentAttempts = computeRecentAttempts();

  // Shareable link for QR code
  const unsubscribeEvents = realtimeClient.events.subscribe((event) => {
    if (!event || event.contestId !== contestId) return;
    updateLastUpdateTime();
    handleLiveEvent(event);
  });

  onMount(() => {
    updateLastUpdateTime();
    if (contestId) {
      realtimeClient.connect(contestId);
    }
    loadAutoScrollPreferences();
    preferencesLoaded = true;
    checkApiStatus();
    initializeCompactLayout();
  });

  onDestroy(() => {
    realtimeClient.disconnect();
    unsubscribeEvents();
    stopAutoScroll();
    teardownCompactLayout();
  });

  function updateLastUpdateTime() {
    lastUpdateTime = new Date();
  }

  function handleLiveEvent(event: LiveEvent) {
    switch (event.type) {
      case 'attempt.upserted': {
        const payload = event.data as Attempt | undefined;
        if (!payload) break;
        const index = liveAttempts.findIndex((item) => item.id === payload.id);
        if (index >= 0) {
          liveAttempts[index] = payload;
        } else {
          liveAttempts = [...liveAttempts, payload];
        }
        liveAttempts = [...liveAttempts];
        break;
      }
      case 'attempt.resultUpdated': {
        const payload = event.data as Attempt | undefined;
        if (!payload) break;
        const index = liveAttempts.findIndex((item) => item.id === payload.id);
        if (index >= 0) {
          liveAttempts[index] = { ...liveAttempts[index], ...payload };
          liveAttempts = [...liveAttempts];
        }
        break;
      }
      case 'attempt.currentSet': {
        const payload = event.data as CurrentAttemptBundle | Attempt | CurrentAttempt | undefined;
        if (payload) {
          liveCurrentBundle = 'attempt' in (payload as any) ? (payload as CurrentAttemptBundle) : liveCurrentBundle;
          liveCurrentAttempt = toCurrentAttemptSummary(payload);
        }
        break;
      }
      case 'attempt.currentCleared': {
        liveCurrentAttempt = null;
        liveCurrentBundle = null;
        break;
      }
      case 'registration.upserted': {
        const payload = event.data as Registration | undefined;
        if (!payload) break;
        const index = registrations.findIndex((item) => item.id === payload.id);
        if (index >= 0) {
          const next = [...registrations];
          next[index] = { ...next[index], ...payload };
          registrations = next;
        } else {
          registrations = [...registrations, payload];
        }
        break;
      }
      case 'registration.deleted': {
        const payload = event.data as { registrationId?: string } | undefined;
        const registrationId = payload?.registrationId;
        if (!registrationId) break;
        const before = registrations.length;
        registrations = registrations.filter((entry) => entry.id !== registrationId);
        if (registrations.length !== before) {
          liveAttempts = liveAttempts.filter((attempt) => attempt.registrationId !== registrationId);
        }
        break;
      }
      default:
        break;
    }
  }

  function computePendingAttempts(): Attempt[] {
    return buildRisingBarQueue(liveAttempts, {
      currentAttempt: liveCurrentAttempt,
      registrations,
      limit: 12,
    }).attempts;
  }

  $: unifiedRows = buildUnifiedRows({
        registrations,
        attempts: liveAttempts,
        contest,
      });
  $: contestLifts = deriveContestLifts(contest, liveAttempts);
  $: mensBarWeightSetting = contest?.mensBarWeight ?? null;
  $: womensBarWeightSetting = contest?.womensBarWeight ?? null;
  $: clampWeightSetting = contest?.clampWeight ?? 2.5;
  $: sortedRows = sortUnifiedRows(unifiedRows, sortColumn, sortDirection);
  $: if (!selectedLift || !contestLifts.includes(selectedLift)) {
        selectedLift = contestLifts.length > 0 ? contestLifts[0] : null;
      }
  $: visibleLifts = selectedLift ? [selectedLift] : [...contestLifts];
  $: filteredRows =
    selectedLift != null
      ? sortedRows.filter((row) => row.registration.lifts?.includes(selectedLift as LiftKind))
      : sortedRows;
  $: lifterCount = filteredRows.length;
  $: headerTitleClass = compactLayout
    ? 'font-display text-lg sm:text-xl uppercase tracking-[0.08rem] text-white'
    : 'font-display text-xl sm:text-2xl md:text-3xl uppercase tracking-[0.1rem] sm:tracking-[0.15rem] text-white';
  $: statusRowClass = compactLayout
    ? 'flex items-center justify-center gap-1.5 text-[10px] uppercase tracking-[0.2em] text-text-secondary'
    : 'flex items-center justify-center gap-2 text-xs uppercase tracking-[0.4em] text-text-secondary';
  $: statusDotSizeClass = compactLayout ? 'h-2 w-2' : 'h-2.5 w-2.5';
  $: mainSpacingClass = compactLayout ? 'py-1.5 sm:py-3 gap-1.5 sm:gap-3' : 'py-3 sm:py-4 gap-3 sm:gap-4';
  $: mainPaddingClass = compactLayout ? 'px-4 sm:px-6' : 'container-full';
  $: metricsGridClass = compactLayout ? 'grid gap-2 sm:grid-cols-2' : 'grid gap-3 md:grid-cols-2';
  $: metricLabelClass = compactLayout
    ? 'text-xs text-text-secondary uppercase tracking-[0.25em]'
    : 'text-label text-text-secondary uppercase tracking-[0.4em]';
  $: metricValueClass = compactLayout
    ? 'text-xl font-semibold text-text-primary'
    : 'text-h2 text-text-primary';

  function toCurrentAttemptSummary(input: CurrentAttemptBundle | Attempt | CurrentAttempt): CurrentAttempt {
    if ('attempt' in (input as any)) {
      return bundleToCurrentAttempt(input as CurrentAttemptBundle);
    }

    if ('competitorName' in (input as any) && (input as CurrentAttempt).competitorName) {
      return input as CurrentAttempt;
    }

    const attempt = input as Attempt;
    const registration = registrations.find((entry) => entry.id === attempt.registrationId);
    const competitorName = registration
      ? `${registration.lastName} ${registration.firstName}`
      : attempt.competitorName ?? 'Unknown Competitor';

    return {
      id: attempt.id,
      registrationId: attempt.registrationId,
      competitorName,
      liftType: attempt.liftType,
      attemptNumber: attempt.attemptNumber as AttemptNumber,
      weight: attempt.weight,
      status: attempt.status as AttemptStatus,
      competitionOrder: registration?.competitionOrder ?? null,
      updatedAt: attempt.updatedAt ?? null,
    };
  }

  $: livePlatePlan = liveCurrentBundle?.platePlan ?? null;

  function computeRecentAttempts(): Attempt[] {
    return liveAttempts
      .filter((attempt) => attempt.status !== 'Pending')
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
      .slice(0, 16);
  }

  function handleSortChange(column: string) {
    if (sortColumn === column) {
      sortDirection = sortDirection === 'asc' ? 'desc' : 'asc';
    } else {
      sortColumn = column;
      sortDirection = 'asc';
    }
  }

  function liftLabel(liftType: string): string {
    if (!liftType) return '';
    const key = liftType.toLowerCase();
    const translated = t(`display_current.lifts.${key}`);
    if (translated && translated !== `display_current.lifts.${key}`) {
      return translated;
    }
    return liftType;
  }

  function liftTabLabel(lift: LiftKind): string {
    return liftLabel(lift);
  }

  function selectLift(lift: LiftKind) {
    selectedLift = lift;
  }

  function loadAutoScrollPreferences() {
    if (!browser) return;
    let nextEnabled: boolean | null = null;
    let nextSpeed: ScrollSpeed | null = null;

    const storedEnabled = localStorage.getItem(AUTO_SCROLL_STORAGE_KEY);
    if (storedEnabled !== null) {
      nextEnabled = storedEnabled === 'true';
    }

    const storedSpeed = localStorage.getItem(AUTO_SCROLL_SPEED_STORAGE_KEY);
    if (isScrollSpeed(storedSpeed)) {
      nextSpeed = storedSpeed;
    }

    const params = new URLSearchParams(window.location.search);
    if (params.has('speed')) {
      const speedParam = params.get('speed');
      if (isScrollSpeed(speedParam?.toLowerCase?.())) {
        nextSpeed = speedParam!.toLowerCase() as ScrollSpeed;
      }
    }

    if (params.has('autoscroll')) {
      const flag = params.get('autoscroll');
      nextEnabled = parseAutoScrollFlag(flag);
    }

    if (nextEnabled !== null) {
      autoScrollEnabled = nextEnabled;
      if (autoScrollEnabled) {
        scrollDirection = 1;
      }
    }

    if (nextSpeed !== null) {
      scrollSpeed = nextSpeed;
    }
  }

  function parseAutoScrollFlag(value: string | null): boolean {
    if (value == null) return true;
    const normalized = value.trim().toLowerCase();
    if (normalized === '' || normalized === '1' || normalized === 'true' || normalized === 'yes') {
      return true;
    }
    if (normalized === '0' || normalized === 'false' || normalized === 'no') {
      return false;
    }
    return Boolean(Number.parseInt(normalized, 10)) || normalized === 'on';
  }

  function isScrollSpeed(value: string | null | undefined): value is ScrollSpeed {
    if (!value) return false;
    const normalized = value.toLowerCase();
    return normalized === 'slow' || normalized === 'normal' || normalized === 'fast';
  }

  function handleAutoScrollToggle(event: Event) {
    const target = event.currentTarget as HTMLInputElement | null;
    const enabled = target?.checked ?? false;
    if (autoScrollEnabled === enabled) return;
    autoScrollEnabled = enabled;
    if (autoScrollEnabled) {
      scrollDirection = 1;
    } else {
      stopAutoScroll();
    }
  }

  function startAutoScroll() {
    if (!browser) return;
    if (animationFrameId !== null) return;
    lastAnimationTimestamp = null;
    animationFrameId = requestAnimationFrame(stepAutoScroll);
  }

  function stopAutoScroll() {
    if (!browser) return;
    if (animationFrameId !== null) {
      cancelAnimationFrame(animationFrameId);
      animationFrameId = null;
    }
    lastAnimationTimestamp = null;
  }

  function stepAutoScroll(timestamp: number) {
    if (!browser) {
      stopAutoScroll();
      return;
    }

    if (!autoScrollEnabled) {
      stopAutoScroll();
      return;
    }

    const scrollingElement = tableScrollContainer;
    if (!scrollingElement) {
      animationFrameId = requestAnimationFrame(stepAutoScroll);
      return;
    }

    if (lastAnimationTimestamp === null) {
      lastAnimationTimestamp = timestamp;
    }

    const deltaSeconds = (timestamp - lastAnimationTimestamp) / 1000;
    lastAnimationTimestamp = timestamp;

    const maxScroll = scrollingElement.scrollHeight - scrollingElement.clientHeight;
    if (maxScroll <= 0) {
      animationFrameId = requestAnimationFrame(stepAutoScroll);
      return;
    }

    const speed = SPEED_PIXELS_PER_SECOND[scrollSpeed];
    const delta = speed * deltaSeconds * scrollDirection;

    let nextScrollTop = scrollingElement.scrollTop + delta;

    while (nextScrollTop < 0 || nextScrollTop > maxScroll) {
      if (nextScrollTop < 0) {
        nextScrollTop = -nextScrollTop;
        scrollDirection = 1;
      } else if (nextScrollTop > maxScroll) {
        nextScrollTop = maxScroll - (nextScrollTop - maxScroll);
        scrollDirection = -1;
      }
    }

    scrollingElement.scrollTop = nextScrollTop;
    animationFrameId = requestAnimationFrame(stepAutoScroll);
  }

  function handleSpeedChange(event: Event) {
    const target = event.currentTarget as HTMLSelectElement | null;
    const value = target?.value ?? '';
    if (isScrollSpeed(value)) {
      scrollSpeed = value;
    }
  }

  function initializeCompactLayout() {
    if (!browser) return;
    compactMediaQuery = window.matchMedia(COMPACT_HEIGHT_QUERY);
    compactLayout = compactMediaQuery.matches;
    compactMediaListener = (event: MediaQueryListEvent) => {
      compactLayout = event.matches;
    };
    if ('addEventListener' in compactMediaQuery) {
      compactMediaQuery.addEventListener('change', compactMediaListener);
    } else {
      // Safari < 14
      (compactMediaQuery as MediaQueryList).addListener(compactMediaListener);
    }
  }

  function teardownCompactLayout() {
    if (compactMediaQuery && compactMediaListener) {
      if ('removeEventListener' in compactMediaQuery) {
        compactMediaQuery.removeEventListener('change', compactMediaListener);
      } else {
        (compactMediaQuery as MediaQueryList).removeListener(compactMediaListener);
      }
    }
    compactMediaQuery = null;
    compactMediaListener = null;
  }

  $: if (browser && preferencesLoaded) {
    localStorage.setItem(AUTO_SCROLL_STORAGE_KEY, autoScrollEnabled ? 'true' : 'false');
  }

  $: if (browser && preferencesLoaded) {
    localStorage.setItem(AUTO_SCROLL_SPEED_STORAGE_KEY, scrollSpeed);
  }

  $: if (browser && autoScrollEnabled) {
    startAutoScroll();
  }

  $: if (browser && !autoScrollEnabled) {
    stopAutoScroll();
  }

  const STATUS_LABEL_KEYS: Record<ApiStatus, string> = {
    checking: 'layout.status.checking',
    online: 'layout.status.online',
    degraded: 'layout.status.degraded',
    offline: 'layout.status.offline',
  };

  async function checkApiStatus(): Promise<void> {
    setApiStatus('checking');

    try {
      const response = await apiClient.get<SystemHealth>('/system/health');

      if (response.error) {
        setApiStatus('degraded');
        return;
      }

      const normalized = (response.data?.status ?? '').toLowerCase();

      if (['ok', 'healthy', 'online'].includes(normalized)) {
        setApiStatus('online');
      } else if (normalized === 'unknown' || normalized === '') {
        setApiStatus('degraded');
      } else {
        setApiStatus('degraded');
      }
    } catch {
      setApiStatus('offline');
    }
  }

  function setApiStatus(status: ApiStatus) {
    apiStatus = status;
  }

  function statusDotClass(): string {
    switch (apiStatus) {
      case 'online':
        return 'bg-status-success';
      case 'degraded':
        return 'bg-status-warning';
      case 'checking':
        return 'bg-status-warning animate-pulse-slow';
      default:
        return 'bg-status-error';
    }
  }

  function getCompetitor(registrationId: string): Registration | undefined {
    return registrations.find((entry) => entry.id === registrationId);
  }

  function competitorName(registrationId: string): string {
    const competitor = getCompetitor(registrationId);
    return competitor ? `${competitor.lastName} ${competitor.firstName}` : 'Unknown';
  }

  function queueLabel(attempt: Attempt): string {
    const competitor = getCompetitor(attempt.registrationId);
    const orderSource = null;
    const orderLabel =
      orderSource != null && Number.isFinite(orderSource)
        ? t('display_table.queue.order', { order: orderSource })
        : t('display_table.queue.order_unknown');
    return t('display_table.queue.label', {
      order: orderLabel,
      name: competitorName(attempt.registrationId)
    });
  }

</script>

<svelte:head>
  <title>{(contest?.name ?? t('display_table.head.default_contest')) + ' • ' + t('display_table.head.subtitle')}</title>
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
</svelte:head>

<div class="h-screen overflow-hidden bg-black text-white flex flex-col">
  <header class="w-full bg-black px-3 sm:px-4 py-3 sm:py-4">
    <div class="flex flex-col items-center gap-3 sm:gap-4 text-center">
      <h1 class={headerTitleClass} style="text-shadow: 0 0 16px rgba(220, 20, 60, 0.5), 0 0 32px rgba(220, 20, 60, 0.3);">{contest?.name ?? t('display_table.head.default_contest')}</h1>
      <div class={statusRowClass}>
        <span>{t('layout.api_label')}</span>
        <span
          class={`${statusDotSizeClass} rounded-full ${statusDotClass()}`}
          role="status"
          aria-label={t(STATUS_LABEL_KEYS[apiStatus])}
          title={t(STATUS_LABEL_KEYS[apiStatus])}
        />
      </div>
    </div>
  </header>

  <main class={`flex-1 flex flex-col overflow-hidden ${mainSpacingClass} ${mainPaddingClass}`}>
    {#if error}
      <div class="card border-primary-red text-center space-y-4">
        <h2 class="text-h2 text-status-error">{t('display_table.errors.load_failed_title')}</h2>
        <p class="text-body text-text-secondary">{error}</p>
      </div>
    {:else}
      <section class={metricsGridClass}>
        <div class={`card text-center ${compactLayout ? 'space-y-1.5' : 'space-y-2'}`}>
          <p class={metricLabelClass}>{t('display_table.metrics.lifters')}</p>
          <p class={metricValueClass}>{lifterCount}</p>
        </div>
        <div class={`card text-center ${compactLayout ? 'space-y-1.5' : 'space-y-2'}`}>
          <p class={metricLabelClass}>{t('display_table.metrics.last_update')}</p>
          <p class={metricValueClass}>{lastUpdateTime ? lastUpdateTime.toLocaleTimeString() : '—'}</p>
        </div>
      </section>

      <section class={`card flex-1 min-h-0 flex flex-col ${compactLayout ? 'gap-2' : 'gap-3'}`}>
        <div class={`flex flex-col ${compactLayout ? 'gap-2' : 'gap-3'} md:flex-row md:items-center md:justify-between`}>
          <div class={`flex flex-wrap items-center justify-center ${compactLayout ? 'gap-1.5' : 'gap-2'} md:justify-start`}>
            {#each contestLifts as lift}
              <button
                type="button"
                class={`px-2 py-1 text-xxs ${selectedLift === lift ? 'btn-primary text-black' : 'btn-secondary'}`}
                on:click={() => selectLift(lift)}
              >
                {liftTabLabel(lift)}
              </button>
            {/each}
          </div>
          <div class={`flex flex-wrap items-center justify-center ${compactLayout ? 'gap-2' : 'gap-3'} md:justify-end`}>
            <label class="flex items-center gap-2 text-xxs uppercase tracking-[0.2em] text-text-secondary">
              <input
                type="checkbox"
                class={`${compactLayout ? 'h-3.5 w-3.5' : 'h-4 w-4'} accent-primary-red`}
                checked={autoScrollEnabled}
                on:change={handleAutoScrollToggle}
              />
              <span class="text-text-primary">{t('display_table.actions.auto_scroll')}</span>
            </label>
            <label class="flex items-center gap-2 text-xxs uppercase tracking-[0.2em] text-text-secondary">
              <span>{t('display_table.actions.speed')}</span>
              <select
                class={`bg-black border border-white/30 rounded text-text-primary ${compactLayout ? 'px-2 py-0.5 text-[10px]' : 'px-2 py-1 text-xxs'}`}
                value={scrollSpeed}
                on:change={handleSpeedChange}
              >
                <option value="slow">{t('display_table.actions.speed_slow')}</option>
                <option value="normal">{t('display_table.actions.speed_normal')}</option>
                <option value="fast">{t('display_table.actions.speed_fast')}</option>
              </select>
            </label>
          </div>
        </div>
        {#if filteredRows.length === 0}
          <div class={`flex-1 min-h-0 flex items-center justify-center text-text-secondary ${compactLayout ? 'text-xs' : 'text-caption'}`}>
            {$_('contest_detail.registrations.empty_filter')}
          </div>
        {:else}
          <div class="flex-1 min-h-0 overflow-y-auto overflow-x-auto pr-1" bind:this={tableScrollContainer}>
            <UnifiedContestTable
              rows={filteredRows}
              sortColumn={sortColumn}
              sortDirection={sortDirection}
              readOnly={true}
              activeFlight={contest?.activeFlight ?? null}
              lifts={visibleLifts}
              weightClasses={referenceData?.weightClasses ?? []}
              ageCategories={referenceData?.ageCategories ?? []}
              showRowNumbers={true}
              showFlightColumn={false}
              showLabelsColumn={false}
              showRackColumn={false}
              showReshelColumn={!compactLayout}
              showMcculloughColumn={!compactLayout}
              onSortChange={handleSortChange}
            />
          </div>
        {/if}
      </section>


    {/if}
  </main>
</div>
