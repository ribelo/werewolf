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
  import { applyRegistrationFilters, type RegistrationFilterState, type WeightFilter, type AgeFilter, type LabelFilter, normaliseLabelKey, isFemaleGender, isMaleGender } from '$lib/filters/registrations';
  import type { DisplayFilterSync } from '@werewolf/domain';
  import { ChevronDown } from 'lucide-svelte';

  type MessageValues = Record<string, string | number | boolean | Date | null | undefined>;
  type ScrollSpeed = 'very_slow' | 'slow' | 'normal' | 'fast';
  type ApiStatus = 'checking' | 'online' | 'degraded' | 'offline';

  const AUTO_SCROLL_STORAGE_KEY = 'displayTable.autoScrollEnabled';
  const AUTO_SCROLL_SPEED_STORAGE_KEY = 'displayTable.autoScrollSpeed';
  const AUTO_SYNC_STORAGE_KEY = 'displayTable.autoSyncEnabled';
  const SPEED_PIXELS_PER_SECOND: Record<ScrollSpeed, number> = {
    very_slow: 20,
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
  let lastUpdateRelative = '—';
  let lastUpdateTimer: ReturnType<typeof setInterval> | null = null;

  let sortColumn = 'order';
  let sortDirection: 'asc' | 'desc' = 'asc';
  let selectedLift: LiftKind | null = null;
  let visibleLifts: LiftKind[] = [...contestLifts];
  let unifiedRows: UnifiedRow[] = [];
  let sortedRows: UnifiedRow[] = [];
  let registrationFilteredRows: UnifiedRow[] = [];
  let filteredRows: UnifiedRow[] = [];
  let syncedFilters: RegistrationFilterState = {
    weight: 'ALL',
    age: 'ALL',
    label: 'ALL',
  };
  let localFilters: RegistrationFilterState = {
    weight: 'ALL',
    age: 'ALL',
    label: 'ALL',
  };
  let autoSyncEnabled = true;
  let lastSynced: DisplayFilterSync | null = null;
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
  let openFilterDropdown: 'lift' | 'weight' | 'age' | 'labels' | null = null;

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
    loadAutoSyncPreferences();
    loadInitialSync();
    preferencesLoaded = true;
    checkApiStatus();
    initializeCompactLayout();
    refreshLastUpdateRelative();
    if (browser) {
      lastUpdateTimer = setInterval(refreshLastUpdateRelative, 1000);
    }
  });

  onDestroy(() => {
    realtimeClient.disconnect();
    unsubscribeEvents();
    stopAutoScroll();
    teardownCompactLayout();
    if (lastUpdateTimer) {
      clearInterval(lastUpdateTimer);
      lastUpdateTimer = null;
    }
  });

  function updateLastUpdateTime() {
    lastUpdateTime = new Date();
    refreshLastUpdateRelative();
  }

  function refreshLastUpdateRelative() {
    if (!lastUpdateTime) {
      lastUpdateRelative = '—';
      return;
    }
    const diffSeconds = Math.max(0, Math.floor((Date.now() - lastUpdateTime.getTime()) / 1000));
    const minutes = Math.floor(diffSeconds / 60);
    const translated = t('display_table.metrics.last_update_relative', { minutes });
    lastUpdateRelative = translated === 'display_table.metrics.last_update_relative' ? '—' : translated;
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
      case 'display.filtersSynced': {
        const payload = event.data as DisplayFilterSync | undefined;
        if (!payload) break;
        lastSynced = payload;
        if (autoSyncEnabled) {
          applySyncedFilters(payload.filters);
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

  function applySyncedFilters(filters: DisplayFilterSync['filters']): void {
    sortColumn = filters.sortColumn || sortColumn;
    sortDirection = filters.sortDirection === 'desc' ? 'desc' : 'asc';

    const newFilters: RegistrationFilterState = {
      weight: filters.weight ?? 'ALL',
      age: filters.age ?? 'ALL',
      label: filters.label ?? 'ALL',
    };

    syncedFilters = newFilters;
    localFilters = newFilters;

    if (filters.lift && contestLifts.includes(filters.lift)) {
      selectedLift = filters.lift;
    } else {
      selectedLift = null;
    }
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
  $: if (selectedLift && !contestLifts.includes(selectedLift)) {
        selectedLift = null;
      }
  $: visibleLifts = selectedLift ? [selectedLift] : [...contestLifts];
  $: registrationFilteredRows = applyRegistrationFilters(sortedRows, localFilters);
  $: filteredRows =
    selectedLift != null
      ? registrationFilteredRows.filter((row) => row.registration.lifts?.includes(selectedLift as LiftKind))
      : registrationFilteredRows;
  $: headerTitleClass = compactLayout
    ? 'font-display text-lg sm:text-xl uppercase tracking-[0.08rem] text-white'
    : 'font-display text-xl sm:text-2xl md:text-3xl uppercase tracking-[0.1rem] sm:tracking-[0.15rem] text-white';
  $: statusRowClass = compactLayout
    ? 'flex items-center justify-center gap-1.5 text-[10px] uppercase tracking-[0.2em] text-text-secondary'
    : 'flex items-center justify-center gap-2 text-xs uppercase tracking-[0.4em] text-text-secondary';
  $: statusDotSizeClass = compactLayout ? 'h-2 w-2' : 'h-2.5 w-2.5';
  $: mainSpacingClass = compactLayout ? 'py-1.5 sm:py-3 gap-1.5 sm:gap-3' : 'py-3 sm:py-4 gap-3 sm:gap-4';
  $: mainPaddingClass = compactLayout ? 'px-4 sm:px-6' : 'container-full';

  // Filter options computation
  $: weightFilterGroups = (() => {
    const female: Array<{ id: WeightFilter; label: string }> = [];
    const male: Array<{ id: WeightFilter; label: string }> = [];
    const femaleSeen = new Set<string>();
    const maleSeen = new Set<string>();

    // Prefer referenceData; if empty, derive from registrations to avoid "only Open" issue
    const hasRefWeights = (referenceData?.weightClasses?.length ?? 0) > 0;
    console.log('[display/table] Building weight filter groups:', {
      from: hasRefWeights ? 'referenceData' : 'registrationsFallback',
      weightClasses: referenceData?.weightClasses,
      count: referenceData?.weightClasses?.length ?? 0,
    });

    type WeightClassLike = { id?: string; code?: string; name?: string; gender?: string };
    const source: WeightClassLike[] = hasRefWeights
      ? referenceData!.weightClasses
      : registrations
          .filter((reg) => reg.weightClassId)
          .map((reg) => ({
            id: reg.weightClassId ?? undefined,
            code: reg.weightClassId ?? undefined,
            name: reg.weightClassName ?? reg.weightClassId ?? undefined,
            gender: reg.gender ?? undefined,
          }));

    source.forEach((wc) => {
      const id = (wc.id ?? wc.code ?? '').toString();
      const label = wc.name ?? wc.code ?? id;
      const gender = (wc.gender ?? '').toString().toLowerCase();

      if (!id) return; // skip incomplete entries

      if (gender.startsWith('f') || gender.startsWith('k')) {
        if (femaleSeen.has(id)) return;
        femaleSeen.add(id);
        female.push({ id: id as WeightFilter, label });
      } else if (gender.startsWith('m')) {
        if (maleSeen.has(id)) return;
        maleSeen.add(id);
        male.push({ id: id as WeightFilter, label });
      }
    });

    const groups = {
      femaleOpen: { id: 'FEMALE_OPEN' as WeightFilter, label: t('contest_detail.registrations.filters.open') },
      maleOpen: { id: 'MALE_OPEN' as WeightFilter, label: t('contest_detail.registrations.filters.open') },
      female,
      male,
    };

    console.log('[display/table] Built weight filter groups:', {
      femaleCount: groups.female.length,
      maleCount: groups.male.length,
      female: groups.female,
      male: groups.male,
    });

    return groups;
  })();

  $: availableWeightFilters = [
    weightFilterGroups.femaleOpen,
    weightFilterGroups.maleOpen,
    ...weightFilterGroups.female,
    ...weightFilterGroups.male,
  ];

  $: availableAgeFilters = (() => {
    const entries: Array<{ id: AgeFilter; label: string }> = [
      { id: 'ALL', label: t('contest_detail.registrations.filters.age_all') },
    ];
    const hasUnassigned = registrations.some((registration) => !registration.ageCategoryId);
    if (hasUnassigned) {
      entries.push({
        id: 'UNASSIGNED',
        label: t('contest_detail.registrations.filters.age_unassigned'),
      });
    }

    const seen = new Set<string>();
    referenceData?.ageCategories
      ?.slice()
      .sort((a, b) => {
        const orderA = a.sortOrder ?? Number.MAX_SAFE_INTEGER;
        const orderB = b.sortOrder ?? Number.MAX_SAFE_INTEGER;
        if (orderA !== orderB) return orderA - orderB;
        const labelA = a.name || (a.code ?? '').toString();
        const labelB = b.name || (b.code ?? '').toString();
        return labelA.localeCompare(labelB, undefined, { sensitivity: 'base' });
      })
      .forEach((category) => {
        const id = (category.id ?? category.code ?? '').toString();
        let label = category.name || id;
        if (label.toLowerCase() === 'senior') {
          label = t('contest_detail.registrations.filters.age_senior');
        }
        if (!id || !label) return;
        if (seen.has(id)) return;
        seen.add(id);
        entries.push({ id: id as AgeFilter, label });
      });

    return entries;
  })();

  $: availableLabelFilters = (() => {
    const base: Array<{ id: LabelFilter; label: string }> = [
      { id: 'ALL', label: t('contest_detail.registrations.filters.labels_all') },
    ];
    let hasUnlabeled = false;
    const labelMap = new Map<string, string>();

    registrations.forEach((registration) => {
      const labels = Array.isArray(registration.labels) ? registration.labels : [];
      if (labels.length === 0) {
        hasUnlabeled = true;
        return;
      }
      labels.forEach((label) => {
        const trimmed = (label ?? '').trim();
        if (!trimmed) return;
        const key = normaliseLabelKey(trimmed);
        if (!labelMap.has(key)) {
          labelMap.set(key, trimmed);
        }
      });
    });

    if (hasUnlabeled) {
      base.push({
        id: 'UNLABELED',
        label: t('contest_detail.registrations.filters.labels_unlabeled'),
      });
    }

    Array.from(labelMap.entries())
      .sort((a, b) => a[1].localeCompare(b[1]))
      .forEach(([key, label]) => {
        base.push({ id: key as LabelFilter, label });
      });

    return base;
  })();

  // Compute filter groups for weight (female/male)
  $: femaleWeightFilters = (() => {
    const hasFemaleData = weightFilterGroups.female.length > 0 || registrations.some((reg) => isFemaleGender(reg.gender));
    if (!hasFemaleData) {
      return [] as Array<{ id: WeightFilter; label: string }>;
    }
    return [weightFilterGroups.femaleOpen, ...weightFilterGroups.female];
  })();

  $: maleWeightFilters = (() => {
    const hasMaleData = weightFilterGroups.male.length > 0 || registrations.some((reg) => isMaleGender(reg.gender));
    if (!hasMaleData) {
      return [] as Array<{ id: WeightFilter; label: string }>;
    }
    return [weightFilterGroups.maleOpen, ...weightFilterGroups.male];
  })();

  // Filter button styling
  function filterButtonClass(active: boolean): string {
    return `px-3 py-1 text-xxs ${active ? 'btn-primary text-black' : 'btn-secondary'}`;
  }

  // Filter selection labels
  $: weightSelectionLabel = (() => {
    if (localFilters.weight === 'ALL') {
      return t('contest_detail.registrations.filters.weight_button_all');
    }
    if (localFilters.weight === 'FEMALE_OPEN') {
      return `${t('contest_detail.registrations.filters.sex_female')} ${t('contest_detail.registrations.filters.open')}`;
    }
    if (localFilters.weight === 'MALE_OPEN') {
      return `${t('contest_detail.registrations.filters.sex_male')} ${t('contest_detail.registrations.filters.open')}`;
    }
    const femaleMatch = femaleWeightFilters.find((option) => option.id === localFilters.weight);
    if (femaleMatch) {
      return `${t('contest_detail.registrations.filters.sex_female')} ${femaleMatch.label}`;
    }
    const maleMatch = maleWeightFilters.find((option) => option.id === localFilters.weight);
    if (maleMatch) {
      return `${t('contest_detail.registrations.filters.sex_male')} ${maleMatch.label}`;
    }
    const fallback = availableWeightFilters.find((option) => option.id === localFilters.weight);
    return fallback?.label ?? t('contest_detail.registrations.filters.weight_button_all');
  })();

  $: ageSelectionLabel = (() => {
    const match = availableAgeFilters.find((option) => option.id === localFilters.age);
    return match?.label ?? t('contest_detail.registrations.filters.age_button_all');
  })();

  $: labelSelectionLabel = (() => {
    const match = availableLabelFilters.find((option) => option.id === localFilters.label);
    return match?.label ?? t('contest_detail.registrations.filters.labels_button_all');
  })();

  $: liftSelectionLabel = (() => {
    if (!selectedLift) {
      return t('contest_detail.registrations.filters.lift_button_all');
    }
    return liftTabLabel(selectedLift);
  })();

  // Dropdown management
  function toggleFilterDropdown(target: 'lift' | 'weight' | 'age' | 'labels') {
    if (autoSyncEnabled) return; // Don't allow opening if auto-sync is enabled
    openFilterDropdown = openFilterDropdown === target ? null : target;
  }

  function closeFilterDropdown() {
    openFilterDropdown = null;
  }

  function selectWeightFilter(id: WeightFilter) {
    localFilters = { ...localFilters, weight: id };
    closeFilterDropdown();
  }

  function selectAgeFilter(id: AgeFilter) {
    localFilters = { ...localFilters, age: id };
    closeFilterDropdown();
  }

  function selectLabelFilter(id: LabelFilter) {
    localFilters = { ...localFilters, label: id };
    closeFilterDropdown();
  }

  function selectLiftFilter(lift: LiftKind | null) {
    selectedLift = lift;
    closeFilterDropdown();
  }

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
      : attempt.competitorName ?? t('display_table.labels.unknown_competitor');

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

  function loadAutoSyncPreferences() {
    if (!browser) return;
    const stored = localStorage.getItem(AUTO_SYNC_STORAGE_KEY);
    if (stored !== null) {
      autoSyncEnabled = stored === 'true';
    }
  }

  async function loadInitialSync() {
    if (!contestId || !browser) return;

    try {
      const response = await apiClient.get<DisplayFilterSync>(`/contests/${contestId}/display/sync`);
      if (response.data && !response.error) {
        lastSynced = response.data;
        if (autoSyncEnabled) {
          applySyncedFilters(response.data.filters);
        }
      }
    } catch (error) {
      console.error('Failed to load initial sync:', error);
    }
  }

  async function forceSyncNow() {
    if (!contestId || !browser) return;

    try {
      const response = await apiClient.get<DisplayFilterSync>(`/contests/${contestId}/display/sync`);
      if (response.data && !response.error) {
        lastSynced = response.data;
        applySyncedFilters(response.data.filters);
      }
    } catch (error) {
      console.error('Failed to force sync:', error);
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
    return normalized === 'very_slow' || normalized === 'slow' || normalized === 'normal' || normalized === 'fast';
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

  function handleAutoSyncToggle(event: Event) {
    const target = event.currentTarget as HTMLInputElement | null;
    const enabled = target?.checked ?? false;
    if (autoSyncEnabled === enabled) return;
    autoSyncEnabled = enabled;

    if (autoSyncEnabled && lastSynced) {
      // Apply the last synced filters immediately when enabling
      applySyncedFilters(lastSynced.filters);
    } else if (autoSyncEnabled && !lastSynced) {
      // Force sync if we don't have any cached data
      forceSyncNow();
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

  $: if (browser && preferencesLoaded) {
    localStorage.setItem(AUTO_SYNC_STORAGE_KEY, autoSyncEnabled ? 'true' : 'false');
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
    return competitor ? `${competitor.lastName} ${competitor.firstName}` : t('display_table.labels.unknown');
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
        <span class="text-text-secondary">{t('display_table.metrics.last_update')}</span>
        <span class="text-text-primary" title={lastUpdateTime ? lastUpdateTime.toLocaleTimeString() : ''}>
          {lastUpdateRelative}
        </span>
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
      <section class={`card flex-1 min-h-0 flex flex-col ${compactLayout ? 'gap-2' : 'gap-3'}`}>
        <!-- Auto-sync and scroll controls -->
        <div class={`flex flex-wrap items-center justify-center ${compactLayout ? 'gap-2' : 'gap-3'} md:justify-end`}>
          <label class="flex items-center gap-2 text-xxs uppercase tracking-[0.2em] text-text-secondary">
            <input
              type="checkbox"
              class={`${compactLayout ? 'h-3.5 w-3.5' : 'h-4 w-4'} accent-primary-red`}
              checked={autoSyncEnabled}
              on:change={handleAutoSyncToggle}
            />
            <span class="text-text-primary">{t('display_table.actions.auto_sync')}</span>
          </label>
          {#if autoSyncEnabled}
            <button
              type="button"
              class={`px-2 py-1 text-xxs btn-secondary ${compactLayout ? 'text-[10px]' : ''}`}
              on:click={forceSyncNow}
            >
              {t('display_table.actions.sync_now')}
            </button>
          {/if}
          <label class="flex items-center gap-2 text-xxs uppercase tracking-[0.2em] text-text-secondary">
            <input
              type="checkbox"
              class={`${compactLayout ? 'h-3.5 w-3.5' : 'h-4 w-4'} accent-primary-red`}
              checked={autoScrollEnabled}
              on:change={handleAutoScrollToggle}
            />
            <span class="text-text-primary">{t('display_table.actions.auto_scroll')}</span>
          </label>
          {#if autoScrollEnabled}
            <label class="flex items-center gap-2 text-xxs uppercase tracking-[0.2em] text-text-secondary">
              <span>{t('display_table.actions.speed')}</span>
              <select
                class={`bg-black border border-white/30 rounded text-text-primary ${compactLayout ? 'px-2 py-0.5 text-[10px]' : 'px-2 py-1 text-xxs'}`}
                value={scrollSpeed}
                on:change={handleSpeedChange}
              >
                <option value="very_slow">{t('display_table.actions.speed_very_slow')}</option>
                <option value="slow">{t('display_table.actions.speed_slow')}</option>
                <option value="normal">{t('display_table.actions.speed_normal')}</option>
                <option value="fast">{t('display_table.actions.speed_fast')}</option>
              </select>
            </label>
          {/if}
        </div>

        <!-- Lift selector and filter controls in one row -->
        <div class={`flex flex-wrap items-center ${compactLayout ? 'gap-1.5' : 'gap-2'}`}>
          <!-- Lift dropdown selector -->
          {#if contestLifts.length > 1}
            <div class="relative" on:click|stopPropagation>
              <button
                type="button"
                class={`${filterButtonClass(selectedLift !== null)} flex min-w-[170px] items-center justify-between gap-3`}
                on:click|stopPropagation={() => toggleFilterDropdown('lift')}
                disabled={autoSyncEnabled}
              >
                <div class="flex flex-col text-left leading-tight">
                  <span class="font-semibold">{t('contest_detail.registrations.filters.lift_button')}</span>
                  <span class="text-text-secondary">{liftSelectionLabel}</span>
                </div>
                <ChevronDown
                  class={`h-3.5 w-3.5 transition-transform ${openFilterDropdown === 'lift' ? 'rotate-180' : ''}`}
                  aria-hidden="true"
                />
              </button>
              {#if openFilterDropdown === 'lift'}
                <div
                  class="absolute left-0 top-full z-40 mt-2 w-60 rounded border border-border-color bg-element-bg px-3 py-3 shadow-lg"
                  on:click|stopPropagation
                >
                  <div class="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      class={`${filterButtonClass(!selectedLift)} w-full`}
                      on:click={() => selectLiftFilter(null)}
                    >
                      {t('contest_detail.registrations.filters.lift_button_all')}
                    </button>
                    {#each contestLifts as lift}
                      <button
                        type="button"
                        class={`${filterButtonClass(selectedLift === lift)} w-full`}
                        on:click={() => selectLiftFilter(lift)}
                      >
                        {liftTabLabel(lift)}
                      </button>
                    {/each}
                  </div>
                </div>
              {/if}
            </div>
          {/if}

          <!-- Weight/Age/Label filter dropdowns -->
          {#if femaleWeightFilters.length > 0 || maleWeightFilters.length > 0}
            <div class="relative" on:click|stopPropagation>
              <button
                type="button"
                class={`${filterButtonClass(localFilters.weight !== 'ALL')} flex min-w-[190px] items-center justify-between gap-3`}
                on:click|stopPropagation={() => toggleFilterDropdown('weight')}
                disabled={autoSyncEnabled}
              >
                <div class="flex flex-col text-left leading-tight">
                  <span class="font-semibold">{t('contest_detail.registrations.filters.weight_button')}</span>
                  <span class="text-text-secondary">{weightSelectionLabel}</span>
                </div>
                <ChevronDown
                  class={`h-3.5 w-3.5 transition-transform ${openFilterDropdown === 'weight' ? 'rotate-180' : ''}`}
                  aria-hidden="true"
                />
              </button>
              {#if openFilterDropdown === 'weight'}
                <div
                  class="absolute left-0 top-full z-40 mt-2 w-72 rounded border border-border-color bg-element-bg px-3 py-3 shadow-lg"
                  on:click|stopPropagation
                >
                  <div class="space-y-4">
                    <button
                      type="button"
                      class={`${filterButtonClass(localFilters.weight === 'ALL')} w-full justify-start`}
                      on:click={() => selectWeightFilter('ALL')}
                    >
                      {t('contest_detail.results.filters.all')}
                    </button>
                    {#if femaleWeightFilters.length > 0}
                      <div>
                        <p class="mb-2 text-xxs uppercase tracking-[0.3em] text-text-secondary">{t('contest_detail.registrations.filters.weights_female')}</p>
                        <div class="grid grid-cols-2 gap-2">
                          {#each femaleWeightFilters as filter}
                            <button
                              type="button"
                              class={`${filterButtonClass(localFilters.weight === filter.id)} w-full`}
                              on:click={() => selectWeightFilter(filter.id)}
                            >
                              {filter.label}
                            </button>
                          {/each}
                        </div>
                      </div>
                    {/if}
                    {#if maleWeightFilters.length > 0}
                      <div>
                        <p class="mb-2 text-xxs uppercase tracking-[0.3em] text-text-secondary">{t('contest_detail.registrations.filters.weights_male')}</p>
                        <div class="grid grid-cols-2 gap-2">
                          {#each maleWeightFilters as filter}
                            <button
                              type="button"
                              class={`${filterButtonClass(localFilters.weight === filter.id)} w-full`}
                              on:click={() => selectWeightFilter(filter.id)}
                            >
                              {filter.label}
                            </button>
                          {/each}
                        </div>
                      </div>
                    {/if}
                  </div>
                </div>
              {/if}
            </div>
          {/if}

          <div class="relative" on:click|stopPropagation>
            <button
              type="button"
              class={`${filterButtonClass(localFilters.age !== 'ALL')} flex min-w-[170px] items-center justify-between gap-3`}
              on:click|stopPropagation={() => toggleFilterDropdown('age')}
              disabled={autoSyncEnabled}
            >
              <div class="flex flex-col text-left leading-tight">
                <span class="font-semibold">{t('contest_detail.registrations.filters.age_button')}</span>
                <span class="text-text-secondary">{ageSelectionLabel}</span>
              </div>
              <ChevronDown
                class={`h-3.5 w-3.5 transition-transform ${openFilterDropdown === 'age' ? 'rotate-180' : ''}`}
                aria-hidden="true"
              />
            </button>
            {#if openFilterDropdown === 'age'}
              <div
                class="absolute left-0 top-full z-40 mt-2 w-60 rounded border border-border-color bg-element-bg px-3 py-3 shadow-lg"
                on:click|stopPropagation
              >
                <div class="grid max-h-52 grid-cols-2 gap-2 overflow-y-auto pr-1">
                  {#each availableAgeFilters as filter}
                    <button
                      type="button"
                      class={`${filterButtonClass(localFilters.age === filter.id)} w-full`}
                      on:click={() => selectAgeFilter(filter.id)}
                    >
                      {filter.label}
                    </button>
                  {/each}
                </div>
              </div>
            {/if}
          </div>

          <div class="relative" on:click|stopPropagation>
            <button
              type="button"
              class={`${filterButtonClass(localFilters.label !== 'ALL')} flex min-w-[170px] items-center justify-between gap-3`}
              on:click|stopPropagation={() => toggleFilterDropdown('labels')}
              disabled={autoSyncEnabled}
            >
              <div class="flex flex-col text-left leading-tight">
                <span class="font-semibold">{t('contest_detail.registrations.filters.labels_button')}</span>
                <span class="text-text-secondary">{labelSelectionLabel}</span>
              </div>
              <ChevronDown
                class={`h-3.5 w-3.5 transition-transform ${openFilterDropdown === 'labels' ? 'rotate-180' : ''}`}
                aria-hidden="true"
              />
            </button>
            {#if openFilterDropdown === 'labels'}
              <div
                class="absolute left-0 top-full z-40 mt-2 w-60 rounded border border-border-color bg-element-bg px-3 py-3 shadow-lg"
                on:click|stopPropagation
              >
                <div class="grid max-h-52 grid-cols-2 gap-2 overflow-y-auto pr-1">
                  {#each availableLabelFilters as filter}
                    <button
                      type="button"
                      class={`${filterButtonClass(localFilters.label === filter.id)} w-full`}
                      on:click={() => selectLabelFilter(filter.id)}
                    >
                      {filter.label}
                    </button>
                  {/each}
                </div>
              </div>
            {/if}
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
