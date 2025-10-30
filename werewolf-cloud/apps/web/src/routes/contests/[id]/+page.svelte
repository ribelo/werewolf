<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import Layout from '$lib/components/Layout.svelte';
  import CompetitorModal from '$lib/components/CompetitorModal.svelte';
  import RegistrationDetailModal from '$lib/components/RegistrationDetailModal.svelte';
  import AttemptEditorModal from '$lib/components/AttemptEditorModal.svelte';
  import ContestCategoryModal from '$lib/components/ContestCategoryModal.svelte';
  import ContestEditorModal from '$lib/components/ContestEditorModal.svelte';
import { getStatusClasses, formatCompetitorName, formatWeight, normaliseAgeCategoryLabel } from '$lib/utils';
import { apiClient, ApiError } from '$lib/api';
import { realtimeClient } from '$lib/realtime';
  import { modalStore } from '$lib/ui/modal';
  import FlightAssignmentModal from '$lib/components/FlightAssignmentModal.svelte';
import { toast } from '$lib/ui/toast';
  import { contestStore, currentAgeCategories, currentWeightClasses } from '$lib/ui/contest-store';
  import { setContestContext } from '$lib/ui/context-helpers';
  import { getAttemptStatusClass, getAttemptStatusLabel } from '$lib/ui/status';
  import { buildRisingBarQueue, type QueuePhase } from '$lib/rising-bar';
  import UnifiedContestTable from '$lib/components/UnifiedContestTable.svelte';
  import { buildUnifiedRows, deriveContestLifts, sortUnifiedRows, LIFTS, type UnifiedRow, type LiftKind } from '$lib/contest-table';
  import type { PageData } from './$types';
import type {
    Registration,
    Attempt,
    CurrentAttempt,
    CurrentAttemptBundle,
    LiveEvent,
    ConnectionStatus,
    AttemptStatus,
    AttemptNumber,
    LiftType,
    ContestDetail,
    ContestRankingEntry,
    ContestPlateSetEntry,
    ContestBarWeights,
    BackupSummary,
    ContestCategories,
    ContestTag,
  } from '$lib/types';
  import { bundleToCurrentAttempt } from '$lib/current-attempt';
  import { _ } from 'svelte-i18n';
  import { get } from 'svelte/store';
  import { ArrowUpDown, ChevronUp, ChevronDown } from 'lucide-svelte';
  import reshelMenData from '@werewolf/domain/data/reshel-men.json';
  import reshelWomenData from '@werewolf/domain/data/reshel-women.json';
  import mccData from '@werewolf/domain/data/mccullough.json';
  import { browser } from '$app/environment';

export let data: PageData;
export let params: Record<string, string> = {};

$: void params;
  let {
    contest,
    registrations,
    attempts,
    currentAttempt,
    referenceData,
    resultsOpen,
    resultsAge,
    resultsWeight,
    plateSets,
    barWeights,
    backupsSummary,
    contestTags,
    error,
    apiBase,
    contestId,
  } = data;

  type MessageValues = Record<string, string | number | boolean | Date | null | undefined>;

  function t(key: string, values?: MessageValues): string {
    const translate = get(_);
    return translate(key, values ? { values } : undefined);
  }

  let weightClasses = referenceData?.weightClasses ?? [];
  let ageCategories = referenceData?.ageCategories ?? [];
  let contestTagPresets: ContestTag[] = [...(contestTags ?? [])];
  $: sortedContestTags = [...contestTagPresets].sort((a, b) => {
    const aTime = Date.parse(a.createdAt);
    const bTime = Date.parse(b.createdAt);
    const aValid = Number.isFinite(aTime);
    const bValid = Number.isFinite(bTime);
    if (aValid && bValid && aTime !== bTime) {
      return aTime - bTime;
    }
    if (aValid && !bValid) return -1;
    if (!aValid && bValid) return 1;
    return a.label.localeCompare(b.label);
  });
  $: if (sortedContestTags.length === 0 && selectedResultView === 'tag') {
    selectedResultView = 'open';
    selectedTagForResults = null;
  }
  $: if (selectedResultView === 'tag') {
    if (!selectedTagForResults || !sortedContestTags.some((tag) => tag.label === selectedTagForResults)) {
      selectedTagForResults = sortedContestTags[0]?.label ?? null;
    }
  }
  $: if (selectedResultView === 'tag' && selectedTagForResults) {
    void ensureTagResults(selectedTagForResults);
  }
  $: weightClasses = ($currentWeightClasses?.length ?? 0) > 0
    ? $currentWeightClasses
    : referenceData?.weightClasses ?? [];
  $: ageCategories = ($currentAgeCategories?.length ?? 0) > 0
    ? $currentAgeCategories
    : referenceData?.ageCategories ?? [];

  const reshelMetadataByGender = {
    male: {
      source: reshelMenData.source as string,
      retrievedAt: reshelMenData.retrievedAt as string,
    },
    female: {
      source: reshelWomenData.source as string,
      retrievedAt: reshelWomenData.retrievedAt as string,
    },
  } as const;

  const mccMetadata = {
    source: mccData.source as string,
    retrievedAt: mccData.retrievedAt as string,
  };

  function formatRetrievedAt(value?: string | null): string | null {
    if (!value) return null;
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return null;
    return parsed.toLocaleDateString();
  }

  type WeightFilter = 'ALL' | 'FEMALE_OPEN' | 'MALE_OPEN' | string;
  type WeightFilterOption = { id: WeightFilter; label: string };
  type AgeFilter = 'ALL' | 'UNASSIGNED' | string;
  type LabelFilter = 'ALL' | 'UNLABELED' | `LABEL:${string}`;
  const LABEL_FILTER_PREFIX = 'LABEL:';

  // Real-time data
  let connectionStatus: ConnectionStatus = 'offline';
  let liveEvent: LiveEvent | null = null;

  // Reactive data that updates with live events
  let liveAttempts = [...attempts];
  let liveCurrentAttempt: CurrentAttempt | null = currentAttempt
    ? normaliseCurrentAttempt(currentAttempt as Attempt | CurrentAttempt | CurrentAttemptBundle)
    : null;
  let contestLifts: LiftKind[] = deriveContestLifts(contest, liveAttempts);
  const FALLBACK_PRIMARY_LIFT: LiftKind = 'Squat';
  const FALLBACK_CONTEST_LIFTS: LiftKind[] = [FALLBACK_PRIMARY_LIFT];
  const FIRST_ATTEMPT_NUMBERS: AttemptNumber[] = [1];
  const LIFT_SINGLETONS: Record<LiftKind, LiftKind[]> = {
    Squat: ['Squat'],
    Bench: ['Bench'],
    Deadlift: ['Deadlift'],
  };

  const DEFAULT_LIFT_ORDER = LIFTS as ReadonlyArray<LiftType>;

  function registrationIncludesLift(registration: Registration, lift: LiftType): boolean {
    const lifts = Array.isArray(registration.lifts) && registration.lifts.length > 0
      ? (registration.lifts as LiftType[])
      : (contestLifts.length > 0 ? (contestLifts as LiftType[]) : (DEFAULT_LIFT_ORDER as LiftType[]));
    return lifts.includes(lift);
  }

  function sortLifts(lifts: readonly LiftType[]): LiftType[] {
    const desired = new Set(lifts);
    return DEFAULT_LIFT_ORDER.filter((lift) => desired.has(lift)) as LiftType[];
  }

  $: activeContestLifts = contestLifts.length > 0 ? [...contestLifts] : [...FALLBACK_CONTEST_LIFTS];
  $: competitionTabs = activeContestLifts
    .map((lift) => LIFT_TAB_MAP[lift])
    .filter((entry): entry is { id: LiftTabId; labelKey: string } => Boolean(entry));
  $: tabs = [
    BASE_TABS[0],
    BASE_TABS[1],
    ...competitionTabs,
    BASE_TABS[2],
    BASE_TABS[3],
  ];
  $: if (!tabs.some((tab) => tab.id === activeTab) && tabs.length > 0) {
    const fallback = tabs.find((tab) => tab.id === 'registrations') ?? tabs[0];
    activeTab = fallback.id;
  }
  $: hasSquatResults = activeContestLifts.includes('Squat');
  $: hasBenchResults = activeContestLifts.includes('Bench');
  $: hasDeadliftResults = activeContestLifts.includes('Deadlift');

  let statusLoading: Record<string, boolean> = {};
  let setCurrentLoading: Record<string, boolean> = {};
  let liftToggleLoading: Record<string, boolean> = {};
  let isClearingCurrent = false;
  let currentAttemptEntity: Attempt | null = null;

  $: currentAttemptEntity = liveCurrentAttempt
    ? liveAttempts.find((attempt) => attempt.id === liveCurrentAttempt.id) ?? null
    : null;
  $: contestLifts = deriveContestLifts(contest, liveAttempts);

  const ATTEMPT_STATUS_SEQUENCE: AttemptStatus[] = ['Pending', 'Successful', 'Failed'];

  function deriveNextAttemptStatus(current: AttemptStatus | null | undefined): AttemptStatus {
    if (!current) {
      return ATTEMPT_STATUS_SEQUENCE[0];
    }

    const normalized = ATTEMPT_STATUS_SEQUENCE.find(
      (status) => status.toLowerCase() === current.toLowerCase()
    );

    if (!normalized) {
      return ATTEMPT_STATUS_SEQUENCE[0];
    }

    const currentIndex = ATTEMPT_STATUS_SEQUENCE.indexOf(normalized);
    const nextIndex = (currentIndex + 1) % ATTEMPT_STATUS_SEQUENCE.length;
    return ATTEMPT_STATUS_SEQUENCE[nextIndex];
  }

  function handleStatusClick(attempt: Attempt) {
    if (!attempt?.id) return;
    if (statusLoading[attempt.id]) return;

    const nextStatus = deriveNextAttemptStatus(attempt.status as AttemptStatus);
    updateAttemptStatusHandler(attempt, nextStatus);
  }

  let sortColumn = 'order';
  let sortDirection: 'asc' | 'desc' = 'asc';
  let resultsSortColumn = 'place';
  let resultsSortDirection: 'asc' | 'desc' = 'asc';
  let selectedWeightFilter: WeightFilter = 'ALL';
  let weightFilterGroups: {
    femaleOpen: WeightFilterOption;
    maleOpen: WeightFilterOption;
    female: WeightFilterOption[];
    male: WeightFilterOption[];
  } = {
    femaleOpen: { id: 'FEMALE_OPEN', label: '' },
    maleOpen: { id: 'MALE_OPEN', label: '' },
    female: [],
    male: [],
  };
  let availableWeightFilters: Array<{ id: WeightFilter; label: string }> = [];
  let femaleWeightFilters: WeightFilterOption[] = [];
  let maleWeightFilters: WeightFilterOption[] = [];
  let selectedAgeFilter: AgeFilter = 'ALL';
  let availableAgeFilters: Array<{ id: AgeFilter; label: string }> = [];
  let selectedLabelFilter: LabelFilter = 'ALL';
  let availableLabelFilters: Array<{ id: LabelFilter; label: string }> = [];


  let unifiedRows: UnifiedRow[] = [];
  let sortedRows: UnifiedRow[] = [];
  let filteredRows: UnifiedRow[] = [];
  let squatRows: UnifiedRow[] = [];
  let benchRows: UnifiedRow[] = [];
  let deadliftRows: UnifiedRow[] = [];
  let tablePrefsLoaded = false;

  $: if (contestId && !tablePrefsLoaded) {
    const prefs = readTablePrefs();
    if (prefs) {
      sortColumn = prefs.sortColumn || sortColumn;
      sortDirection = prefs.sortDirection;
      selectedWeightFilter = prefs.weightFilter ?? selectedWeightFilter;
      selectedAgeFilter = prefs.ageFilter ?? selectedAgeFilter;
      selectedLabelFilter = prefs.labelFilter ?? selectedLabelFilter;
    }
    tablePrefsLoaded = true;
  }

  $: if (tablePrefsLoaded && contestId && browser) {
    persistTablePrefs();
  }

  type ResultView = 'open' | 'age' | 'weight' | 'tag';
  let selectedResultView: ResultView = 'open';
  let openRanking: ContestRankingEntry[] = resultsOpen ?? [];
  let ageRanking: ContestRankingEntry[] = resultsAge ?? [];
  let weightRanking: ContestRankingEntry[] = resultsWeight ?? [];
  let tagRankingCache: Record<string, ContestRankingEntry[]> = {};
  let selectedTagForResults: string | null = null;
  let resultsLoading = false;
  let exportingResults = false;
  let resultsError: string | null = null;
  let resultsRequestToken = 0;
  let activeWeightGender: 'all' | 'female' | 'male' = 'all';
  let selectedWeightClassLabel: string | null = null;
  let selectedAgeCategoryLabel: string | null = null;
  const trimValue = (value?: string | null): string => (value ?? '').trim();

  $: weightClassGenderMap = new Map<string, 'female' | 'male' | 'unknown'>(
    weightClasses
      .map((entry) => {
        const label = trimValue(entry.name ?? entry.code);
        if (!label) return null;
        const genderValue = (entry.gender ?? '').toLowerCase();
        const gender: 'female' | 'male' | 'unknown' = genderValue.startsWith('f')
          ? 'female'
          : genderValue.startsWith('m')
            ? 'male'
            : 'unknown';
        return [label, gender] as const;
      })
      .filter(Boolean) as Array<[string, 'female' | 'male' | 'unknown']>
  );

  $: femaleWeightClassOptions = weightClasses
    .filter((entry) => (entry.gender ?? '').toLowerCase().startsWith('f'))
    .slice()
    .sort((a, b) => (a.sortOrder ?? Number.MAX_SAFE_INTEGER) - (b.sortOrder ?? Number.MAX_SAFE_INTEGER))
    .map((entry) => ({
      value: trimValue(entry.name ?? entry.code),
      label: trimValue(entry.name ?? entry.code),
    }))
    .filter((entry) => entry.value);

  $: maleWeightClassOptions = weightClasses
    .filter((entry) => (entry.gender ?? '').toLowerCase().startsWith('m'))
    .slice()
    .sort((a, b) => (a.sortOrder ?? Number.MAX_SAFE_INTEGER) - (b.sortOrder ?? Number.MAX_SAFE_INTEGER))
    .map((entry) => ({
      value: trimValue(entry.name ?? entry.code),
      label: trimValue(entry.name ?? entry.code),
    }))
    .filter((entry) => entry.value);

  $: allWeightClassLabels = new Set([
    ...femaleWeightClassOptions.map((entry) => entry.value),
    ...maleWeightClassOptions.map((entry) => entry.value),
  ]);

  $: ageCategoryOptions = ageCategories
    .slice()
    .sort((a, b) => (a.sortOrder ?? Number.MAX_SAFE_INTEGER) - (b.sortOrder ?? Number.MAX_SAFE_INTEGER))
    .map((entry) => {
      const label = normaliseAgeCategoryLabel(entry.name, entry.code) ?? entry.name ?? entry.code ?? '';
      return {
        value: trimValue(entry.name ?? entry.code),
        label,
      };
    })
    .filter((entry) => entry.value);

  $: ageCategoryValues = new Set(ageCategoryOptions.map((entry) => entry.value));

  $: if (selectedWeightClassLabel && !allWeightClassLabels.has(selectedWeightClassLabel)) {
    selectedWeightClassLabel = null;
  }
  $: {
    if (activeWeightGender === 'female' && femaleWeightClassOptions.length === 0) {
      activeWeightGender = 'all';
      selectedWeightClassLabel = null;
    } else if (activeWeightGender === 'male' && maleWeightClassOptions.length === 0) {
      activeWeightGender = 'all';
      selectedWeightClassLabel = null;
    }
  }
  $: if (selectedAgeCategoryLabel && !ageCategoryValues.has(selectedAgeCategoryLabel)) {
    selectedAgeCategoryLabel = null;
  }

  function beginResultsRequest(): number {
    resultsRequestToken += 1;
    resultsLoading = true;
    resultsError = null;
    return resultsRequestToken;
  }

  function endResultsRequest(token: number, errorMessage: string | null = null): void {
    if (token !== resultsRequestToken) {
      return;
    }
    resultsError = errorMessage ?? null;
    resultsLoading = false;
  }

let contestPlateSets: ContestPlateSetEntry[] = plateSets ?? [];
let attemptWeightStep: number = deriveAttemptStep(contestPlateSets);
let contestBarWeights: ContestBarWeights | null = barWeights ?? null;
let mensBarWeightSetting: number | null = contestBarWeights?.mensBarWeight ?? contest?.mensBarWeight ?? null;
let womensBarWeightSetting: number | null = contestBarWeights?.womensBarWeight ?? contest?.womensBarWeight ?? null;
let clampWeightSetting: number | null = contestBarWeights?.clampWeight ?? contest?.clampWeight ?? 2.5;
let globalBackups: BackupSummary | null = backupsSummary ?? null;

let previousContestBarWeights: ContestBarWeights | null = contestBarWeights;
let previousContestDetail: ContestDetail | null | undefined = contest;

$: if (contestBarWeights !== previousContestBarWeights || contest !== previousContestDetail) {
  previousContestBarWeights = contestBarWeights;
  previousContestDetail = contest;
  mensBarWeightSetting = contestBarWeights?.mensBarWeight ?? contest?.mensBarWeight ?? null;
  womensBarWeightSetting = contestBarWeights?.womensBarWeight ?? contest?.womensBarWeight ?? null;
  clampWeightSetting = contestBarWeights?.clampWeight ?? contest?.clampWeight ?? 2.5;
}

  // Plates & bar weights editing helpers
  let newPlateWeight: number | null = null;
  let newPlateQuantity: number | null = null;
  let newPlateColor: string | null = null;
  let platesBusy = false;
  let barWeightsBusy = false;

  function displayWeightValue(value: number | null | undefined): string {
    if (value == null || Number.isNaN(value)) return '—';
    return Number.isInteger(value) ? `${Math.trunc(value)}` : value.toFixed(1);
  }

  async function saveBarWeights() {
    if (!contestId) return;
    try {
      barWeightsBusy = true;
      await apiClient.put(`/contests/${contestId}/platesets/barweights`, {
        ...(mensBarWeightSetting != null ? { mensBarWeight: mensBarWeightSetting } : {}),
        ...(womensBarWeightSetting != null ? { womensBarWeight: womensBarWeightSetting } : {}),
        ...(clampWeightSetting != null ? { clampWeight: clampWeightSetting } : {}),
      });
      toast.success(t('settings_page.plates_saved'));
    } catch (err) {
      const message = err instanceof ApiError ? err.message : t('settings_page.plates_error');
      toast.error(message);
    } finally {
      barWeightsBusy = false;
    }
  }

  async function updatePlateQuantity(plateWeight: number, quantity: number) {
    if (!contestId) return;
    try {
      platesBusy = true;
      await apiClient.patch(`/contests/${contestId}/platesets/${plateWeight}`, { quantity });
      contestPlateSets = contestPlateSets.map((p) =>
        (p.plateWeight === plateWeight ? { ...p, quantity } : p)
      );
      toast.success(t('settings_page.plates_saved'));
    } catch (err) {
      const message = err instanceof ApiError ? err.message : t('settings_page.plates_error');
      toast.error(message);
    } finally {
      platesBusy = false;
    }
  }

  async function updatePlateWeight(oldWeight: number, newWeight: number, quantity: number, color: string | undefined | null) {
    if (!contestId) return;
    if (Math.abs(newWeight - oldWeight) < 1e-6) return;
    if (!Number.isFinite(newWeight) || newWeight <= 0) {
      toast.error(t('settings_page.plates_validation_error'));
      return;
    }

    try {
      platesBusy = true;
      await apiClient.delete(`/contests/${contestId}/platesets/${oldWeight}`);
      await apiClient.post(`/contests/${contestId}/platesets`, {
        plateWeight: newWeight,
        quantity,
        ...(color ? { color } : {}),
      });
      contestPlateSets = [
        ...contestPlateSets.filter((p) => p.plateWeight !== oldWeight),
        { plateWeight: newWeight, quantity, color: color ?? '#374151' },
      ].sort((a, b) => (b.plateWeight - a.plateWeight));
    } catch (err) {
      const message = err instanceof ApiError ? err.message : t('settings_page.plates_error');
      toast.error(message);
    } finally {
      platesBusy = false;
    }
  }

  function handlePlateWeightChange(plateWeight: number, quantity: number, color: string | undefined | null, event: Event) {
    const input = event.currentTarget as HTMLInputElement;
    const parsed = parseFloat(input.value);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      input.value = plateWeight.toString();
      toast.error(t('settings_page.plates_validation_error'));
      return;
    }
    updatePlateWeight(plateWeight, Number(parsed.toFixed(2)), quantity, color);
  }

  function handlePlateQuantityChange(plateWeight: number, event: Event) {
    const input = event.currentTarget as HTMLInputElement;
    const parsed = parseInt(input.value, 10);
    if (!Number.isFinite(parsed) || parsed < 0) {
      input.value = '0';
      updatePlateQuantity(plateWeight, 0);
      return;
    }
    updatePlateQuantity(plateWeight, parsed);
  }

  async function deletePlate(plateWeight: number) {
    if (!contestId) return;
    try {
      platesBusy = true;
      await apiClient.delete(`/contests/${contestId}/platesets/${plateWeight}`);
      contestPlateSets = contestPlateSets.filter((p) => p.plateWeight !== plateWeight);
    } catch (err) {
      const message = err instanceof ApiError ? err.message : t('settings_page.plates_error');
      toast.error(message);
    } finally {
      platesBusy = false;
    }
  }

  async function addPlate() {
    if (!contestId) return;
    const weight = Number(newPlateWeight);
    const qty = Number(newPlateQuantity);
    if (!Number.isFinite(weight) || weight <= 0 || !Number.isFinite(qty) || qty < 0) {
      toast.error(t('settings_page.plates_validation_error'));
      return;
    }
    try {
      platesBusy = true;
      await apiClient.post(`/contests/${contestId}/platesets`, {
        plateWeight: weight,
        quantity: qty,
        ...(newPlateColor ? { color: newPlateColor } : {}),
      });
      contestPlateSets = [
        ...contestPlateSets.filter((p) => p.plateWeight !== weight),
        { plateWeight: weight, quantity: qty, color: newPlateColor ?? '#374151' },
      ].sort((a, b) => (b.plateWeight - a.plateWeight));
      newPlateWeight = null;
      newPlateQuantity = null;
      newPlateColor = null;
    } catch (err) {
      const message = err instanceof ApiError ? err.message : t('settings_page.plates_error');
      toast.error(message);
    } finally {
      platesBusy = false;
    }
  }

  type TablePrefs = {
    sortColumn: string;
    sortDirection: 'asc' | 'desc';
    weightFilter: WeightFilter;
    ageFilter: AgeFilter;
    labelFilter: LabelFilter;
  };

  const TABLE_PREFS_NAMESPACE = 'werewolf:contest-table';

  function getTablePrefsKey(id: string): string {
    return `${TABLE_PREFS_NAMESPACE}:${id}`;
  }

  function readTablePrefs(): TablePrefs | null {
    if (!browser || !contestId) return null;
    try {
      const raw = localStorage.getItem(getTablePrefsKey(contestId));
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object') return null;
      const sortColumnPref = typeof parsed.sortColumn === 'string' && parsed.sortColumn.length > 0 ? parsed.sortColumn : 'order';
      const sortDirectionPref: 'asc' | 'desc' = parsed.sortDirection === 'desc' ? 'desc' : 'asc';
      const savedWeightFilter =
        typeof parsed.weightFilter === 'string'
          ? parsed.weightFilter
          : typeof parsed.flightFilter === 'string'
            ? parsed.flightFilter
            : 'ALL';
      let weightPref: WeightFilter = 'ALL';
      if (savedWeightFilter === 'FEMALE_OPEN' || savedWeightFilter === 'MALE_OPEN' || savedWeightFilter === 'ALL') {
        weightPref = savedWeightFilter as WeightFilter;
      } else if (savedWeightFilter && savedWeightFilter.length > 0 && savedWeightFilter !== 'OPEN') {
        weightPref = savedWeightFilter as WeightFilter;
      }
      const savedAgeFilter =
        typeof parsed.ageFilter === 'string' && parsed.ageFilter.length > 0
          ? (parsed.ageFilter as AgeFilter)
          : 'ALL';
      const savedLabelFilter =
        typeof parsed.labelFilter === 'string' && parsed.labelFilter.length > 0
          ? (parsed.labelFilter as LabelFilter)
          : 'ALL';
      return {
        sortColumn: sortColumnPref,
        sortDirection: sortDirectionPref,
        weightFilter: weightPref,
        ageFilter: savedAgeFilter,
        labelFilter: savedLabelFilter,
      };
    } catch (error) {
      console.warn('Failed to read table preferences', error);
      return null;
    }
  }

  function persistTablePrefs(): void {
    if (!browser || !contestId || !tablePrefsLoaded) return;
    try {
      const payload: TablePrefs = {
        sortColumn,
        sortDirection,
        weightFilter: selectedWeightFilter,
        ageFilter: selectedAgeFilter,
        labelFilter: selectedLabelFilter,
      };
      localStorage.setItem(getTablePrefsKey(contestId), JSON.stringify(payload));
    } catch (error) {
      console.warn('Failed to persist table preferences', error);
    }
  }

  function normaliseLabelKey(label: string): string {
    return label.trim().toLowerCase();
  }

  type LiftTabId = 'squat' | 'bench' | 'deadlift';
  type StaticTabId = 'desk' | 'registrations' | 'results' | 'plates';
  type TabId = StaticTabId | LiftTabId;

  const BASE_TABS: ReadonlyArray<{ id: StaticTabId; labelKey: string }> = [
    { id: 'desk', labelKey: 'contest_detail.tabs.desk' },
    { id: 'registrations', labelKey: 'contest_detail.tabs.main_table' },
    { id: 'results', labelKey: 'contest_detail.tabs.results' },
    { id: 'plates', labelKey: 'contest_detail.tabs.plates' }
  ] as const;

  const LIFT_TAB_MAP: Record<LiftKind, { id: LiftTabId; labelKey: string }> = {
    Squat: { id: 'squat', labelKey: 'contest_detail.tabs.squat_table' },
    Bench: { id: 'bench', labelKey: 'contest_detail.tabs.bench_table' },
    Deadlift: { id: 'deadlift', labelKey: 'contest_detail.tabs.deadlift_table' }
  };

  let tabs: Array<{ id: TabId; labelKey: string }> = [];
  let competitionTabs: Array<{ id: LiftTabId; labelKey: string }> = [];

  let activeTab: TabId = 'desk';

  function setStatusLoadingFlag(id: string, value: boolean) {
    statusLoading = { ...statusLoading, [id]: value };
  }

  function setCurrentLoadingFlag(id: string, value: boolean) {
    setCurrentLoading = { ...setCurrentLoading, [id]: value };
  }

  function markCurrentAttempt(status: AttemptStatus) {
    const attemptRecord = currentAttemptEntity;
    if (!attemptRecord) return;
    if (statusLoading[attemptRecord.id]) return;
    if (attemptRecord.status === status) return;
    updateAttemptStatusHandler(attemptRecord, status);
  }

  function getResultPlace(entry: ContestRankingEntry, view: ResultView): number | null {
    if (view === 'age') return entry.placeInAgeClass ?? null;
    if (view === 'weight') return entry.placeInWeightClass ?? null;
    return entry.placeOpen ?? null;
  }

  function getResultCategory(entry: ContestRankingEntry, view: ResultView): string {
    if (view === 'age') {
      const rawLabel = normaliseAgeCategoryLabel(entry.ageCategory ?? null, null);
      if (!rawLabel) return t('contest_detail.results.unknown_category');
      return rawLabel.toLowerCase() === 'senior'
        ? t('contest_detail.registrations.filters.age_senior')
        : rawLabel;
    }
    if (view === 'weight') return entry.weightClass ?? t('contest_detail.results.unknown_category');
    return '';
  }

  function getReshelMetadataForRegistration(registration: Registration) {
    const gender = registration.gender?.toLowerCase() ?? 'male';
    return gender.startsWith('f') ? reshelMetadataByGender.female : reshelMetadataByGender.male;
  }

  function formatPoints(value?: number | null): string {
    if (value === undefined || value === null) return '–';
    return value.toFixed(2);
  }

  function formatLift(value?: number | null): string {
    if (value === undefined || value === null) return '–';
    return formatWeight(Number(value));
  }

  async function reloadResults() {
    const requestId = beginResultsRequest();
    tagRankingCache = {};
    let errorMessage: string | null = null;
    try {
      const [openResp, ageResp, weightResp] = await Promise.all([
        apiClient.get<ContestRankingEntry[]>(`/contests/${contestId}/results/rankings?type=open`),
        apiClient.get<ContestRankingEntry[]>(`/contests/${contestId}/results/rankings?type=age`),
        apiClient.get<ContestRankingEntry[]>(`/contests/${contestId}/results/rankings?type=weight`),
      ]);

      openRanking = openResp.data ?? [];
      ageRanking = ageResp.data ?? [];
      weightRanking = weightResp.data ?? [];

      const respError = openResp.error || ageResp.error || weightResp.error || null;
      if (respError) {
        errorMessage = respError;
      }
    } catch (err) {
      errorMessage = err instanceof Error ? err.message : t('contest_detail.results.reload_failed');
      toast.error(errorMessage);
    } finally {
      endResultsRequest(requestId, errorMessage);
    }
  }

  async function ensureTagResults(tagLabel: string, { force = false }: { force?: boolean } = {}) {
    if (!browser || !contestId || !tagLabel) {
      return;
    }
    if (!force && tagRankingCache[tagLabel]) {
      return;
    }
    const requestId = beginResultsRequest();
    let errorMessage: string | null = null;
    try {
      const response = await apiClient.get<ContestRankingEntry[]>(`/contests/${contestId}/results/rankings?type=tag&tag=${encodeURIComponent(tagLabel)}`);
      if (response.error) {
        errorMessage = response.error;
        tagRankingCache = { ...tagRankingCache, [tagLabel]: [] };
      } else {
        tagRankingCache = {
          ...tagRankingCache,
          [tagLabel]: response.data ?? [],
        };
      }
    } catch (err) {
      errorMessage = err instanceof Error ? err.message : t('contest_detail.results.reload_failed');
      toast.error(errorMessage);
    } finally {
      const shouldDisplayError = selectedResultView === 'tag' && selectedTagForResults === tagLabel;
      endResultsRequest(requestId, shouldDisplayError ? errorMessage : null);
    }
  }

  function downloadFile(blob: Blob, filename: string) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  async function exportResults(format: 'csv' | 'json') {
    exportingResults = true;
    try {
      if (format === 'csv') {
        const response = await fetch(`${apiBase}/contests/${contestId}/results/export`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ format: 'csv' }),
        });
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        const csvText = await response.text();
        downloadFile(new Blob([csvText], { type: 'text/csv;charset=utf-8;' }), `werewolf-results-${contestId}.csv`);
      } else {
        const response = await apiClient.post<ContestRankingEntry[]>(`/contests/${contestId}/results/export`, { format: 'json' });
        if (response.error) {
          throw new Error(response.error);
        }
        const jsonBlob = new Blob([JSON.stringify(response.data ?? [], null, 2)], { type: 'application/json' });
        downloadFile(jsonBlob, `werewolf-results-${contestId}.json`);
      }
      toast.success(t('contest_detail.results.toast_export_success'));
    } catch (err) {
      const message = err instanceof Error ? err.message : t('contest_detail.results.toast_export_error');
      toast.error(message);
    } finally {
      exportingResults = false;
    }
  }

  function formatBackupTimestamp(value: string): string {
    return new Date(value).toLocaleString();
  }

  function formatBackupSize(bytes?: number | null): string {
    if (bytes === undefined || bytes === null) return '–';
    if (bytes >= 1024 * 1024) {
      return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    }
    if (bytes >= 1024) {
      return `${(bytes / 1024).toFixed(1)} KB`;
    }
    return `${bytes} B`;
  }

  function deriveAttemptStep(entries: ContestPlateSetEntry[] = []): number {
    const weights = entries
      .map((entry) => entry.plateWeight ?? entry.weight ?? 0)
      .filter((value) => Number.isFinite(value) && value > 0);

    if (weights.length === 0) {
      return 2.5;
    }

    const smallest = Math.min(...weights);
    return Number((smallest * 2).toFixed(2));
  }

  let registrationMap = new Map<string, Registration>();
  let queueAttempts: Attempt[] = [];
  let queuePhase: QueuePhase = { liftType: 'Squat', attemptNumber: 1 };

  // Summary data
  $: liftersCount = registrations.length;
  $: attemptsQueued = Array.isArray(liveAttempts) ? liveAttempts.filter((a: Attempt) => a.status === 'Pending').length : 0;
  $: lastUpdate = liveEvent?.timestamp ? new Date(liveEvent.timestamp).toLocaleString() :
                  (contest?.updatedAt ? new Date(contest.updatedAt).toLocaleString() :
                  (contest?.date ? new Date(contest.date).toLocaleString() : new Date().toLocaleString()));
  $: registrationMap = new Map(registrations.map((entry) => [entry.id, entry]));
  $: ({ attempts: queueAttempts, phase: queuePhase } = buildRisingBarQueue(liveAttempts, {
        currentAttempt: liveCurrentAttempt,
        registrations,
        limit: 8,
      }));
  $: weightClasses = referenceData?.weightClasses ?? [];
  $: ageCategories = referenceData?.ageCategories ?? [];
  $: registrationsSummary = t('contest_detail.registrations.total', { count: liftersCount });

  function weightFilterLabel(entry: WeightClass): string {
    return (entry.name ?? entry.code ?? '').toString();
  }

  function isFemaleGender(value: string | null | undefined): boolean {
    const lowered = (value ?? '').trim().toLowerCase();
    return lowered.startsWith('f') || lowered.startsWith('k');
  }

  function isMaleGender(value: string | null | undefined): boolean {
    const lowered = (value ?? '').trim().toLowerCase();
    return lowered.startsWith('m');
  }

  $: weightFilterGroups = (() => {
        const female: WeightFilterOption[] = [];
        const male: WeightFilterOption[] = [];
        const femaleSeen = new Set<string>();
        const maleSeen = new Set<string>();

        weightClasses
          .slice()
          .sort((a, b) => {
            const orderA = a.sortOrder ?? Number.MAX_SAFE_INTEGER;
            const orderB = b.sortOrder ?? Number.MAX_SAFE_INTEGER;
            if (orderA !== orderB) return orderA - orderB;
            const nameA = (a.name ?? a.code ?? '').toString();
            const nameB = (b.name ?? b.code ?? '').toString();
            return nameA.localeCompare(nameB, undefined, { sensitivity: 'base' });
          })
          .forEach((entry) => {
            const id = (entry.id ?? entry.code ?? '').toString();
            const label = weightFilterLabel(entry);
            if (!id || !label) return;

            const gender = (entry.gender ?? '').toString().toLowerCase();
            if (gender.startsWith('f')) {
              if (femaleSeen.has(id)) return;
              femaleSeen.add(id);
              female.push({ id: id as WeightFilter, label });
            } else if (gender.startsWith('m')) {
              if (maleSeen.has(id)) return;
              maleSeen.add(id);
              male.push({ id: id as WeightFilter, label });
            }
          });

        return {
          femaleOpen: { id: 'FEMALE_OPEN' as WeightFilter, label: t('contest_detail.registrations.filters.open') },
          maleOpen: { id: 'MALE_OPEN' as WeightFilter, label: t('contest_detail.registrations.filters.open') },
          female,
          male,
        };
      })();

  $: femaleWeightFilters = (() => {
        const hasFemaleData = weightFilterGroups.female.length > 0 || registrations.some((reg) => isFemaleGender(reg.gender));
        if (!hasFemaleData) {
          return [] as WeightFilterOption[];
        }
        return [weightFilterGroups.femaleOpen, ...weightFilterGroups.female];
      })();
  $: maleWeightFilters = (() => {
        const hasMaleData = weightFilterGroups.male.length > 0 || registrations.some((reg) => isMaleGender(reg.gender));
        if (!hasMaleData) {
          return [] as WeightFilterOption[];
        }
        return [weightFilterGroups.maleOpen, ...weightFilterGroups.male];
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
        ageCategories
          .slice()
          .sort((a, b) => {
            const orderA = a.sortOrder ?? Number.MAX_SAFE_INTEGER;
            const orderB = b.sortOrder ?? Number.MAX_SAFE_INTEGER;
            if (orderA !== orderB) return orderA - orderB;
            const labelA = normaliseAgeCategoryLabel(a.name, a.code) || (a.code ?? '').toString();
            const labelB = normaliseAgeCategoryLabel(b.name, b.code) || (b.code ?? '').toString();
            return labelA.localeCompare(labelB, undefined, { sensitivity: 'base' });
          })
          .forEach((category) => {
            const id = (category.id ?? category.code ?? '').toString();
            let label = normaliseAgeCategoryLabel(category.name, category.code) || id;
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

        Array.from(labelMap.values())
          .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }))
          .forEach((label) => {
            base.push({
              id: `${LABEL_FILTER_PREFIX}${label}` as LabelFilter,
              label,
            });
          });

        return base;
      })();
  $: unifiedRows = buildUnifiedRows({
        registrations,
        attempts: liveAttempts,
        contest,
        resultsOpen: openRanking,
        resultsAge: ageRanking,
        resultsWeight: weightRanking,
      });
  $: sortedRows = sortUnifiedRows(unifiedRows, sortColumn, sortDirection);
  $: filteredRows = sortedRows.filter((row) => {
        const registration = row.registration;
        let weightMatch = false;
        if (selectedWeightFilter === 'ALL') {
          weightMatch = true;
        } else if (selectedWeightFilter === 'FEMALE_OPEN') {
          weightMatch = isFemaleGender(registration.gender);
        } else if (selectedWeightFilter === 'MALE_OPEN') {
          weightMatch = isMaleGender(registration.gender);
        } else {
          weightMatch = registration.weightClassId === selectedWeightFilter;
        }
        if (!weightMatch) return false;

        const ageId = registration.ageCategoryId ?? '';
        const ageMatch =
          selectedAgeFilter === 'ALL' ||
          (selectedAgeFilter === 'UNASSIGNED' ? !ageId : ageId === selectedAgeFilter);
        if (!ageMatch) return false;

        const labels = Array.isArray(registration.labels) ? registration.labels : [];
        const hasLabels = labels.length > 0;
        if (selectedLabelFilter === 'ALL') {
          return true;
        }
        if (selectedLabelFilter === 'UNLABELED') {
          return !hasLabels;
        }
        const targetLabel = selectedLabelFilter.startsWith(LABEL_FILTER_PREFIX)
          ? selectedLabelFilter.slice(LABEL_FILTER_PREFIX.length)
          : selectedLabelFilter;
        const targetKey = normaliseLabelKey(targetLabel);
        return labels.some((label) => normaliseLabelKey(label) === targetKey);
      });
  $: squatRows = filteredRows.filter((row) => registrationIncludesLift(row.registration, 'Squat'));
  $: benchRows = filteredRows.filter((row) => registrationIncludesLift(row.registration, 'Bench'));
  $: deadliftRows = filteredRows.filter((row) => registrationIncludesLift(row.registration, 'Deadlift'));
  $: activeFlight = contest?.activeFlight ?? null;
  $: if (selectedWeightFilter !== 'ALL' && !availableWeightFilters.some((item) => item.id === selectedWeightFilter)) {
        selectedWeightFilter = 'ALL';
      }
  $: if (selectedAgeFilter !== 'ALL' && !availableAgeFilters.some((item) => item.id === selectedAgeFilter)) {
        selectedAgeFilter = 'ALL';
      }
  $: if (selectedLabelFilter !== 'ALL' && !availableLabelFilters.some((item) => item.id === selectedLabelFilter)) {
        selectedLabelFilter = 'ALL';
      }
  $: displayedResults = (() => {
        let baseResults: ContestRankingEntry[] = [];
        
        if (selectedResultView === 'open') {
          baseResults = openRanking;
        }
        if (selectedResultView === 'age') {
          if (!selectedAgeCategoryLabel) {
            baseResults = ageRanking;
          } else {
            baseResults = ageRanking.filter(
              (entry) => trimValue(entry.ageCategory) === selectedAgeCategoryLabel
            );
          }
        }
        if (selectedResultView === 'weight') {
          let results = weightRanking;
          if (activeWeightGender !== 'all') {
            results = results.filter((entry) => {
              const className = trimValue(entry.weightClass);
              const gender = weightClassGenderMap.get(className) ?? 'unknown';
              return gender === activeWeightGender;
            });
          }
          if (selectedWeightClassLabel) {
            results = results.filter(
              (entry) => trimValue(entry.weightClass) === selectedWeightClassLabel
            );
          }
          baseResults = results;
        }
        if (selectedResultView === 'tag') {
          baseResults = selectedTagForResults ? (tagRankingCache[selectedTagForResults] ?? []) : [];
        }
        
        return sortResultsData(baseResults, resultsSortColumn, resultsSortDirection);
      })();
  $: resultsSummaryLabel = t('contest_detail.results.entries', { count: displayedResults.length });
  $: hasPlateSets = contestPlateSets.length > 0;
  $: attemptWeightStep = deriveAttemptStep(contestPlateSets);
  $: lastBackupRecord = globalBackups?.backups?.[0];

  function connectionBadge(status: ConnectionStatus): string {
    if (status === 'connected') return 'status-badge status-active';
    if (status === 'connecting') return 'status-badge status-warning';
    return 'status-badge status-error';
  }

  function connectionLabel(status: ConnectionStatus): string {
    if (status === 'connected') return t('contest_detail.connection.live');
    if (status === 'connecting') return t('contest_detail.connection.connecting');
    return t('contest_detail.connection.offline');
  }



  // Helper functions to resolve competitor names
  function getRegistrationCompetitorName(registrationId: string): string {
    const registration = registrations.find((r) => r.id === registrationId);
    if (registration) {
      return formatCompetitorName(registration.firstName, registration.lastName);
    }
    return t('contest_detail.registrations.unknown_competitor');
  }

  function getAttemptCompetitor(attempt: Attempt): string {
    if (attempt.competitorName) return attempt.competitorName;
    if (attempt.firstName || attempt.lastName) {
      return formatCompetitorName(attempt.firstName ?? '', attempt.lastName ?? '');
    }
    return getRegistrationCompetitorName(attempt.registrationId);
  }

  function queueCompetitorName(attempt: Attempt): string {
    const registration = registrationMap.get(attempt.registrationId);
    if (registration) {
      return formatCompetitorName(registration.firstName, registration.lastName);
    }
    return getAttemptCompetitor(attempt);
  }

  function queueOrderLabel(attempt: Attempt): string {
    const registration = registrationMap.get(attempt.registrationId);
    const orderSource = Number.isFinite(attempt.competitionOrder)
      ? attempt.competitionOrder
      : registration?.competitionOrder;
    if (orderSource != null && Number.isFinite(orderSource)) {
      return t('contest_detail.current.queue_order', { order: orderSource });
    }
    return t('contest_detail.current.queue_order_unknown');
  }

  function cloneAttempts(source: Attempt[]): Attempt[] {
    return source.map((attempt) => ({ ...attempt }));
  }

  function applyOptimisticAttempts(attemptsToApply: Attempt[]) {
    attemptsToApply.forEach(attempt => {
      upsertAttemptRecord(attempt);
    });
  }

  function restoreAttemptSnapshot(snapshot: Attempt[]) {
    liveAttempts = cloneAttempts(snapshot);
    contestStore.setAttempts(liveAttempts);
  }

  function currentAttemptSnapshot(): Attempt[] {
    return cloneAttempts(liveAttempts);
  }

  function sameAttempt(existing: Attempt, candidate: Attempt): boolean {
    return (
      existing.registrationId === candidate.registrationId &&
      existing.liftType === candidate.liftType &&
      existing.attemptNumber === candidate.attemptNumber
    );
  }

  function upsertAttemptRecord(attempt: Attempt) {
    if (!attempt?.id) return;

    const indexById = liveAttempts.findIndex((existing) => existing.id === attempt.id);
    const indexByKey = indexById >= 0 ? indexById : liveAttempts.findIndex((existing) => sameAttempt(existing, attempt));

    if (indexByKey >= 0) {
      const merged = { ...liveAttempts[indexByKey], ...attempt };
      liveAttempts = [
        ...liveAttempts.slice(0, indexByKey),
        merged,
        ...liveAttempts.slice(indexByKey + 1),
      ];
    } else {
      liveAttempts = [...liveAttempts, attempt];
    }

    contestStore.updateAttempt(attempt);
  }

  function normaliseCurrentAttempt(input: Attempt | CurrentAttempt | CurrentAttemptBundle): CurrentAttempt {
    if ('attempt' in (input as any)) {
      return bundleToCurrentAttempt(input as CurrentAttemptBundle);
    }

    if ('competitorName' in (input as any) && (input as CurrentAttempt).competitorName) {
      const current = input as CurrentAttempt;
      return {
        id: current.id,
        registrationId: current.registrationId,
        competitorName: current.competitorName,
        liftType: current.liftType,
        attemptNumber: current.attemptNumber,
        weight: current.weight,
        status: current.status,
        competitionOrder: current.competitionOrder ?? null,
        updatedAt: current.updatedAt ?? null,
      };
    }

    const attempt = input as Attempt;
    return {
      id: attempt.id,
      registrationId: attempt.registrationId,
      competitorName: getAttemptCompetitor(attempt),
      liftType: attempt.liftType as LiftType,
      attemptNumber: (attempt.attemptNumber as AttemptNumber) ?? 1,
      weight: attempt.weight,
      status: attempt.status as AttemptStatus,
      competitionOrder: attempt.competitionOrder ?? null,
      updatedAt: attempt.updatedAt ?? null,
    };
  }

  async function refreshAttemptsData() {
    if (!contestId) return;
    try {
      const response = await apiClient.get<Attempt[]>(`/contests/${contestId}/attempts`);
      const refreshed = response.data ?? [];
      statusLoading = {};
      setCurrentLoading = {};
      liveAttempts = [...refreshed];
      contestStore.setAttempts(liveAttempts);
      refreshed.forEach(upsertAttemptRecord);
    } catch (error) {
      console.error('Failed to refresh attempts', error);
    }
  }

  async function refreshContestTags() {
    if (!contestId) return;
    try {
      const response = await apiClient.get<ContestTag[]>(`/contests/${contestId}/tags`);
      if (response.error) {
        throw new Error(response.error);
      }
      contestTagPresets = response.data ?? [];
    } catch (error) {
      console.error('Failed to refresh contest tags', error);
    }
  }

  function selectResultWeight(gender: 'female' | 'male', value: string | null) {
    selectedResultView = 'weight';
    activeWeightGender = gender;
    selectedWeightClassLabel = value;
  }

  function selectAllResultWeights() {
    selectedResultView = 'open';
    activeWeightGender = 'all';
    selectedWeightClassLabel = null;
  }

  function selectResultAge(value: string | null) {
    if (value === null) {
      selectedResultView = 'open';
      selectedAgeCategoryLabel = null;
      return;
    }
    selectedResultView = 'age';
    selectedAgeCategoryLabel = value;
  }

  function selectResultTag(label: string) {
    selectedResultView = 'tag';
    selectedTagForResults = label;
  }

  function selectAllResultTags() {
    selectedTagForResults = null;
    selectedResultView = 'open';
  }

  function resultFilterButtonClass(active: boolean): string {
    return `px-3 py-1 text-xxs ${active ? 'btn-primary text-black' : 'btn-secondary'}`;
  }

  $: registrationWeightSelectionLabel = (() => {
    if (selectedWeightFilter === 'ALL') {
      return t('contest_detail.registrations.filters.weight_button_all');
    }
    if (selectedWeightFilter === 'FEMALE_OPEN') {
      return `${t('contest_detail.registrations.filters.sex_female')} ${t('contest_detail.registrations.filters.open')}`;
    }
    if (selectedWeightFilter === 'MALE_OPEN') {
      return `${t('contest_detail.registrations.filters.sex_male')} ${t('contest_detail.registrations.filters.open')}`;
    }
    const femaleMatch = femaleWeightFilters.find((option) => option.id === selectedWeightFilter);
    if (femaleMatch) {
      return `${t('contest_detail.registrations.filters.sex_female')} ${femaleMatch.label}`;
    }
    const maleMatch = maleWeightFilters.find((option) => option.id === selectedWeightFilter);
    if (maleMatch) {
      return `${t('contest_detail.registrations.filters.sex_male')} ${maleMatch.label}`;
    }
    const fallback = availableWeightFilters.find((option) => option.id === selectedWeightFilter);
    return fallback?.label ?? t('contest_detail.registrations.filters.weight_button_all');
  })();

  $: registrationAgeSelectionLabel = (() => {
    const match = availableAgeFilters.find((option) => option.id === selectedAgeFilter);
    return match?.label ?? t('contest_detail.registrations.filters.age_button_all');
  })();

  $: registrationLabelSelectionLabel = (() => {
    const match = availableLabelFilters.find((option) => option.id === selectedLabelFilter);
    return match?.label ?? t('contest_detail.registrations.filters.labels_button_all');
  })();

  $: hasRegistrationFiltersActive =
    selectedWeightFilter !== 'ALL' || selectedAgeFilter !== 'ALL' || selectedLabelFilter !== 'ALL';

  function clearRegistrationFilters() {
    selectedWeightFilter = 'ALL';
    selectedAgeFilter = 'ALL';
    selectedLabelFilter = 'ALL';
    closeRegistrationFilterPopover();
  }

  let openResultFilter: 'weight' | 'age' | 'tags' | null = null;
  let openRegistrationFilter: 'weight' | 'age' | 'labels' | null = null;

  function toggleResultFilterPopover(target: 'weight' | 'age' | 'tags') {
    openRegistrationFilter = null;
    openResultFilter = openResultFilter === target ? null : target;
  }

  function closeResultFilterPopover() {
    openResultFilter = null;
  }

  function toggleRegistrationFilterPopover(target: 'weight' | 'age' | 'labels') {
    openResultFilter = null;
    openRegistrationFilter = openRegistrationFilter === target ? null : target;
  }

  function closeRegistrationFilterPopover() {
    openRegistrationFilter = null;
  }

  function handleWindowClick() {
    openResultFilter = null;
    openRegistrationFilter = null;
  }

  function handleWindowKeydown(event: KeyboardEvent) {
    if (event.key === 'Escape') {
      openResultFilter = null;
      openRegistrationFilter = null;
    }
  }

  $: weightSelectionLabel = (() => {
    if (selectedResultView !== 'weight') {
      return t('contest_detail.results.filters.weight_button_all');
    }
    if (activeWeightGender === 'all' && !selectedWeightClassLabel) {
      return t('contest_detail.results.filters.weight_button_all');
    }
    const genderLabel =
      activeWeightGender === 'female'
        ? t('contest_detail.registrations.filters.sex_female')
        : t('contest_detail.registrations.filters.sex_male');
    if (!selectedWeightClassLabel) {
      return `${genderLabel} ${t('contest_detail.results.filters.open')}`;
    }
    const options =
      activeWeightGender === 'female' ? femaleWeightClassOptions : maleWeightClassOptions;
    const match = options.find((option) => option.value === selectedWeightClassLabel);
    return `${genderLabel} ${match?.label ?? selectedWeightClassLabel ?? ''}`.trim();
  })();

  $: ageSelectionLabel = (() => {
    if (selectedResultView !== 'age') {
      return t('contest_detail.results.filters.age_button_all');
    }
    if (!selectedAgeCategoryLabel) {
      return t('contest_detail.results.filters.age_button_all');
    }
    const match = ageCategoryOptions.find((option) => option.value === selectedAgeCategoryLabel);
    return match?.label ?? selectedAgeCategoryLabel;
  })();

  $: tagsSelectionLabel = (() => {
    if (selectedResultView !== 'tag') {
      return t('contest_detail.results.filters.tags_button_all');
    }
    return selectedTagForResults ?? t('contest_detail.results.filters.tags_button_all');
  })();

  $: hasActiveResultFilters =
    selectedResultView !== 'open' ||
    (selectedResultView === 'tag' && !!selectedTagForResults);

  function clearAllResultFilters() {
    selectedResultView = 'open';
    activeWeightGender = 'all';
    selectedWeightClassLabel = null;
    selectedAgeCategoryLabel = null;
    selectedTagForResults = null;
    closeResultFilterPopover();
  }

  async function openContestEditor() {
    if (!contest) return;
    try {
      const initial = Array.isArray(activeContestLifts) && activeContestLifts.length > 0
        ? [...activeContestLifts]
        : deriveContestLifts(contest, liveAttempts);
      const result = await modalStore.open<ContestDetail | undefined>({
        title: t('contest_detail.modal.edit_contest_title', { name: contest.name }),
        component: ContestEditorModal,
        size: 'lg',
        showFooter: false,
        data: {
          contest,
          initialEvents: initial,
          contestTags: sortedContestTags,
        },
      });

      await refreshContestTags();

      if (result) {
        const mergedContest: ContestDetail = { ...contest, ...result };
        contest = mergedContest;
        contestStore.setContest(mergedContest, registrations, referenceData);
        setContestContext(mergedContest);
        toast.success(t('contest_edit.toast_saved'));
      }
    } catch (error) {
      if (error instanceof Error && error.message === 'Modal closed by closeAll()') {
        return;
      }
      console.error('Failed to open contest editor modal', error);
      toast.error(t('contest_edit.toast_failed'));
    }
  }

  async function openCategoryManager() {
    if (!contestId) return;
    try {
      const result = (await modalStore.open<ContestCategories>({
        title: t('contest_detail.categories.modal_title'),
        component: ContestCategoryModal,
        size: 'xl',
        showFooter: false,
        data: {
          contestId,
          initialCategories: {
            ageCategories,
            weightClasses,
          },
          hasRegistrations: registrations.length > 0,
        },
      })) as ContestCategories | undefined;

      if (result?.ageCategories && result?.weightClasses) {
        contestStore.setCategories(result);
        weightClasses = [...result.weightClasses];
        ageCategories = [...result.ageCategories];
      }
    } catch (error) {
      // Modal dismissed or rejected; no action required.
    }
  }

  async function openAttemptModal(registrationRecord: Registration) {
    try {
      const result = (await modalStore.open({
        title: t('contest_detail.modal.edit_attempts_title', {
          name: formatCompetitorName(registrationRecord.firstName, registrationRecord.lastName)
        }),
        component: AttemptEditorModal,
        size: 'xl',
        showFooter: false,
        data: {
          contestId,
          registration: registrationRecord,
          attempts: liveAttempts.filter((attempt) => attempt.registrationId === registrationRecord.id),
          onOptimisticUpdate: (optimisticAttempts: Attempt[]) => applyOptimisticAttempts(optimisticAttempts),
          getSnapshot: () => currentAttemptSnapshot(),
          restoreSnapshot: (snapshot: Attempt[]) => restoreAttemptSnapshot(snapshot),
        },
      })) as unknown as boolean | undefined;

      if (result) {
        await refreshAttemptsData();
        toast.success(t('contest_detail.toast.attempts_saved'));
      }
    } catch (error) {
      console.error('Failed to open attempt editor modal', error);
      toast.error(t('contest_detail.toast.attempt_modal_failed'));
    }
  }

  function handleSortChange(column: string) {
    if (sortColumn === column) {
      sortDirection = sortDirection === 'asc' ? 'desc' : 'asc';
    } else {
      sortColumn = column;
      sortDirection = 'asc';
    }
  }

  function handleResultsSortChange(column: string) {
    if (resultsSortColumn === column) {
      resultsSortDirection = resultsSortDirection === 'asc' ? 'desc' : 'asc';
    } else {
      resultsSortColumn = column;
      resultsSortDirection = 'asc';
    }
  }

  function isResultsSorted(column: string): boolean {
    return resultsSortColumn === column;
  }

  function resultsSortIndicatorIcon(column: string): typeof ArrowUpDown | typeof ChevronUp | typeof ChevronDown | null {
    if (!isResultsSorted(column)) return ArrowUpDown;
    return resultsSortDirection === 'asc' ? ChevronUp : ChevronDown;
  }

  function resultsAriaSort(column: string): 'none' | 'ascending' | 'descending' {
    if (!isResultsSorted(column)) return 'none';
    return resultsSortDirection === 'asc' ? 'ascending' : 'descending';
  }

  function sortResultsData(results: ContestRankingEntry[], column: string, direction: 'asc' | 'desc'): ContestRankingEntry[] {
    const sorted = [...results].sort((a, b) => {
      let comparison = 0;
      
      switch (column) {
        case 'place':
          const placeA = getResultPlace(a, selectedResultView) ?? Number.MAX_SAFE_INTEGER;
          const placeB = getResultPlace(b, selectedResultView) ?? Number.MAX_SAFE_INTEGER;
          comparison = placeA - placeB;
          break;
          
        case 'lifter':
          const nameA = `${a.lastName} ${a.firstName}`.toLowerCase();
          const nameB = `${b.lastName} ${b.firstName}`.toLowerCase();
          comparison = nameA.localeCompare(nameB);
          break;
          
        case 'category':
          const categoryA = getResultCategory(a, selectedResultView).toLowerCase();
          const categoryB = getResultCategory(b, selectedResultView).toLowerCase();
          comparison = categoryA.localeCompare(categoryB);
          break;
          
        case 'bestSquat':
          const squatA = a.bestSquat ?? 0;
          const squatB = b.bestSquat ?? 0;
          comparison = squatA - squatB;
          break;
          
        case 'bestBench':
          const benchA = a.bestBench ?? 0;
          const benchB = b.bestBench ?? 0;
          comparison = benchA - benchB;
          break;
          
        case 'bestDeadlift':
          const deadliftA = a.bestDeadlift ?? 0;
          const deadliftB = b.bestDeadlift ?? 0;
          comparison = deadliftA - deadliftB;
          break;
          
        case 'squatPoints':
          const squatPointsA = a.squatPoints ?? 0;
          const squatPointsB = b.squatPoints ?? 0;
          comparison = squatPointsA - squatPointsB;
          break;
          
        case 'benchPoints':
          const benchPointsA = a.benchPoints ?? 0;
          const benchPointsB = b.benchPoints ?? 0;
          comparison = benchPointsA - benchPointsB;
          break;
          
        case 'deadliftPoints':
          const deadliftPointsA = a.deadliftPoints ?? 0;
          const deadliftPointsB = b.deadliftPoints ?? 0;
          comparison = deadliftPointsA - deadliftPointsB;
          break;
          
        default:
          return 0;
      }
      
      return direction === 'desc' ? -comparison : comparison;
    });
    
    return sorted;
  }

  async function handleAttemptWeightChangeInline(payload: {
    registrationId: string;
    liftType: LiftKind;
    attemptNumber: number;
    attemptId?: string;
    weight: number;
  }) {
    if (!contestId) return;

    let weight = Number(payload.weight);
    if (!Number.isFinite(weight) || weight <= 0) {
      toast.error(t('contest_detail.toast.attempt_weight_invalid'));
      return;
    }

    try {
      const reg = registrations.find((r) => r.id === payload.registrationId);
      const isFemale = (reg?.gender ?? '').toLowerCase().startsWith('f');
      const fallbackMens = mensBarWeightSetting ?? contest?.mensBarWeight ?? 20;
      const fallbackWomens = womensBarWeightSetting ?? contest?.womensBarWeight ?? 15;
      const barOverride = isFemale ? fallbackWomens : fallbackMens;

      const planResp = await apiClient.post<{
        plates: Array<{ plateWeight: number; count: number; color: string }>;
        totalLoaded: number;
        exact: boolean;
        increment: number;
        barWeight: number;
        weightToLoad: number;
        targetWeight: number;
        clampWeight: number;
      }>(`/contests/${contestId}/platesets/calculate`, {
        targetWeight: weight,
        ...(Number.isFinite(barOverride) ? { barWeight: barOverride } : {}),
      });

      if (!planResp.error && planResp.data) {
        const plan = planResp.data;
        const defaultMens = mensBarWeightSetting ?? contest?.mensBarWeight ?? 20;
        const defaultWomens = womensBarWeightSetting ?? contest?.womensBarWeight ?? 15;
        const bar = plan.barWeight ?? (isFemale ? defaultWomens : defaultMens);
        if (weight <= bar + 1e-6) {
          // keep bare bar as-is
        } else if (!plan.exact || Math.abs(plan.totalLoaded - weight) > 0.01) {
          weight = Number(plan.totalLoaded.toFixed(2));
        }
      }
    } catch (error) {
      // fall back to user-entered weight if calculation fails
    }

    const snapshot = currentAttemptSnapshot();
    const registrationRecord = registrations.find((reg) => reg.id === payload.registrationId);
    const existing = payload.attemptId
      ? liveAttempts.find((attempt) => attempt.id === payload.attemptId)
      : liveAttempts.find(
          (attempt) =>
            attempt.registrationId === payload.registrationId &&
            attempt.liftType === payload.liftType &&
            attempt.attemptNumber === payload.attemptNumber
        );

    const now = new Date().toISOString();
    const optimistic: Attempt = existing
      ? { ...existing, weight, updatedAt: now }
      : {
          id: payload.attemptId ?? `temp-${payload.registrationId}-${payload.liftType}-${payload.attemptNumber}-${Date.now()}`,
          registrationId: payload.registrationId,
          liftType: payload.liftType as LiftType,
          attemptNumber: payload.attemptNumber as AttemptNumber,
          weight,
          status: 'Pending',
          judge1Decision: null,
          judge2Decision: null,
          judge3Decision: null,
          notes: null,
          timestamp: null,
          createdAt: now,
          updatedAt: now,
          firstName: registrationRecord?.firstName ?? '',
          lastName: registrationRecord?.lastName ?? '',
          competitorName: formatCompetitorName(
            registrationRecord?.firstName ?? '',
            registrationRecord?.lastName ?? ''
          ),
          competitionOrder: registrationRecord?.competitionOrder ?? null,
        };

    applyOptimisticAttempts([optimistic]);

    try {
      const response = await apiClient.post(`/contests/${contestId}/registrations/${payload.registrationId}/attempts`, {
        registrationId: payload.registrationId,
        liftType: payload.liftType,
        attemptNumber: payload.attemptNumber,
        weight,
      });

      if (response.error) {
        throw new Error(response.error);
      }

      await refreshAttemptsData();
      toast.success(t('contest_detail.toast.attempt_updated_short'));
    } catch (error) {
      restoreAttemptSnapshot(snapshot);
      const message = error instanceof ApiError
        ? error.message
        : error instanceof Error
          ? error.message
          : t('contest_detail.toast.attempt_update_failed');
      toast.error(message);
    }
  }

  function liftToggleKey(registrationId: string, lift: LiftType): string {
    return `${registrationId}:${lift}`;
  }

  async function handleRegistrationLiftToggle(registration: Registration, lift: LiftType, nextValue: boolean) {
    if (!contestId) return;

    const isCurrentlyActive = registrationIncludesLift(registration, lift);
    if (isCurrentlyActive === nextValue) {
      return;
    }

    const currentLifts = (Array.isArray(registration.lifts) && registration.lifts.length > 0
      ? (registration.lifts as LiftType[])
      : (contestLifts.length > 0 ? (contestLifts as LiftType[]) : (DEFAULT_LIFT_ORDER as LiftType[]))).slice();

    let nextLifts: LiftType[] = [];

    if (nextValue) {
      const set = new Set(currentLifts);
      set.add(lift);
      nextLifts = sortLifts(Array.from(set));
    } else {
      if (currentLifts.length <= 1) {
        toast.warning(t('contest_detail.registrations.lifts.cannot_remove_last'));
        return;
      }
      const filtered = currentLifts.filter((item) => item !== lift);
      if (filtered.length === 0) {
        toast.warning(t('contest_detail.registrations.lifts.cannot_remove_last'));
        return;
      }
      nextLifts = sortLifts(filtered);
    }

    if (nextLifts.length === 0) {
      toast.warning(t('contest_detail.registrations.lifts.cannot_remove_last'));
      return;
    }

    const key = liftToggleKey(registration.id, lift);
    liftToggleLoading = { ...liftToggleLoading, [key]: true };

    try {
      const response = await apiClient.patch<Registration>(`/registrations/${registration.id}`, {
        lifts: nextLifts,
      });

      if (response.error) {
        throw new Error(response.error);
      }

      const updated = response.data
        ? ({ ...registration, ...response.data } as Registration)
        : ({ ...registration, lifts: nextLifts } as Registration);

      if (!updated.lifts || updated.lifts.length === 0) {
        updated.lifts = nextLifts;
      }

      registrations = registrations.map((entry) => (entry.id === updated.id ? updated : entry));
      contestStore.updateRegistration(updated);

      if (!nextValue) {
        liveAttempts = liveAttempts.filter((attempt) =>
          attempt.registrationId !== registration.id ||
          registrationIncludesLift(updated, attempt.liftType as LiftType)
        );
      }
    } catch (error) {
      console.error('Failed to toggle registration lift', error);
      toast.error(t('contest_detail.registrations.lifts.update_failed'));
    } finally {
      const { [key]: _omit, ...rest } = liftToggleLoading;
      liftToggleLoading = rest;
    }
  }

  function selectWeightFilter(filter: WeightFilter) {
    selectedWeightFilter = selectedWeightFilter === filter ? 'ALL' : filter;
  }

  function selectAgeFilter(filter: AgeFilter) {
    selectedAgeFilter = filter;
  }

  function selectLabelFilter(filter: LabelFilter) {
    selectedLabelFilter = filter;
  }

  function openFlightManager() {
    modalStore.open({
      title: t('contest_detail.registrations.manage_flights_title'),
      size: 'xl',
      component: FlightAssignmentModal,
      data: {
        registrations,
        onSaved: async (updates: any[]) => {
          await handleFlightUpdates(updates);
        }
      }
    });
  }



  async function handleFlightUpdates(updates: any[]) {
    if (!contestId) {
      return;
    }

    const assignments = updates.map((update) => ({
      registrationId: update.id,
      flightCode: update.flightCode,
      flightOrder: update.flightOrder,
    }));

    if (assignments.length === 0) {
      return;
    }

    try {
      const response = await apiClient.post(`/contests/${contestId}/registrations/bulk-flight`, { assignments });
      if (response.error) {
        throw new Error(response.error);
      }

      registrations = registrations.map((reg) => {
        const update = assignments.find((assignment) => assignment.registrationId === reg.id);
        if (!update) return reg;
        const next = {
          ...reg,
          flightCode: update.flightCode,
          flightOrder: update.flightOrder,
        };
        contestStore.updateRegistration(next);
        return next;
      });

      toast.success(t('contest_detail.toast.flights_updated'));
    } catch (error) {
      const message = error instanceof ApiError
        ? error.message
        : error instanceof Error
          ? error.message
          : t('contest_detail.toast.flights_update_failed');
      toast.error(message);
    }
  }

  async function updateAttemptStatusHandler(attempt: Attempt, status: AttemptStatus) {
    if (!contestId || !attempt?.id) return;
    if (attempt.status === status) return;

    setStatusLoadingFlag(attempt.id, true);

    try {
      await apiClient.patch(`/attempts/${attempt.id}/result`, {
        status,
      });

      upsertAttemptRecord({ ...attempt, status, updatedAt: new Date().toISOString() });
      toast.success(t('contest_detail.toast.attempt_updated', {
        status: getAttemptStatusLabel(status)
      }));
    } catch (error) {
      const message = error instanceof ApiError ? error.message : error instanceof Error ? error.message : t('contest_detail.toast.attempt_update_failed');
      toast.error(message);
    } finally {
      setStatusLoadingFlag(attempt.id, false);
    }
  }

  async function setCurrentAttemptHandler(attempt: Attempt) {
    if (!contestId || !attempt?.id) return;
    setCurrentLoadingFlag(attempt.id, true);

    try {
      await apiClient.put(`/contests/${contestId}/attempts/current`, { attemptId: attempt.id });
      liveCurrentAttempt = normaliseCurrentAttempt({ ...attempt, updatedAt: new Date().toISOString() });
      toast.success(t('contest_detail.toast.current_set'));
    } catch (error) {
      const message = error instanceof ApiError ? error.message : error instanceof Error ? error.message : t('contest_detail.toast.current_set_failed');
      toast.error(message);
    } finally {
      setCurrentLoadingFlag(attempt.id, false);
    }
  }

  async function clearCurrentAttemptHandler() {
    if (!contestId) return;
    isClearingCurrent = true;
    try {
      await apiClient.delete(`/contests/${contestId}/attempts/current`);
      liveCurrentAttempt = null;
      toast.info(t('contest_detail.toast.current_cleared'));
    } catch (error) {
      const message = error instanceof ApiError ? error.message : error instanceof Error ? error.message : t('contest_detail.toast.current_cleared_failed');
      toast.error(message);
    } finally {
      isClearingCurrent = false;
    }
  }

  // Get recent attempts (last 5 completed attempts)
  $: recentAttempts = Array.isArray(liveAttempts)
    ? liveAttempts
        .filter((a: Attempt) => a.status !== 'Pending')
        .sort((a: Attempt, b: Attempt) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
        .slice(0, 5)
    : [];

  // Subscribe to real-time updates
  const unsubscribeStatus = realtimeClient.connectionStatus.subscribe(status => {
    connectionStatus = status;
  });

  const unsubscribeEvents = realtimeClient.events.subscribe(event => {
    liveEvent = event;
    if (event && event.contestId === contestId) {
      handleLiveEvent(event);
    }
  });

  function mergeRegistrationPayload(existing: Registration | undefined, incoming: Registration): Registration {
    const merged: Registration = {
      ...(existing ?? incoming),
      ...incoming,
    };

    merged.firstName = incoming.firstName ?? existing?.firstName ?? '';
    merged.lastName = incoming.lastName ?? existing?.lastName ?? '';
    merged.gender = incoming.gender ?? existing?.gender ?? '';
    merged.birthDate = incoming.birthDate ?? existing?.birthDate ?? '';
    merged.club = incoming.club ?? existing?.club;
    merged.city = incoming.city ?? existing?.city;
    merged.labels = Array.isArray(incoming.labels)
      ? [...incoming.labels]
      : Array.isArray(existing?.labels)
        ? [...existing.labels]
        : [];
    merged.lifts = Array.isArray(incoming.lifts) && incoming.lifts.length > 0
      ? [...incoming.lifts]
      : Array.isArray(existing?.lifts) && existing.lifts.length > 0
        ? [...existing.lifts]
        : [];

    return merged;
  }

  function handleLiveEvent(event: LiveEvent) {
    switch (event.type) {
      case 'attempt.upserted':
      case 'attempt.resultUpdated': {
        const attempt = event.data as Attempt | undefined;
        if (attempt) {
          upsertAttemptRecord(attempt);
          if (liveCurrentAttempt?.id === attempt.id) {
            liveCurrentAttempt = normaliseCurrentAttempt({ ...liveCurrentAttempt, ...attempt });
          }
        }
        void reloadResults();
        break;
      }
      case 'attempt.deleted': {
        const payload = event.data as { attemptId?: string } | undefined;
        const attemptId = payload?.attemptId;
        if (!attemptId) break;
        liveAttempts = liveAttempts.filter((attempt) => attempt.id !== attemptId);
        contestStore.setAttempts(liveAttempts);
        if (liveCurrentAttempt?.id === attemptId) {
          liveCurrentAttempt = null;
        }
        void reloadResults();
        break;
      }
      case 'attempt.currentSet': {
        const payload = event.data as CurrentAttemptBundle | Attempt | CurrentAttempt | undefined;
        if (payload) {
          liveCurrentAttempt = normaliseCurrentAttempt(payload);
        }
        break;
      }
      case 'attempt.currentCleared':
        liveCurrentAttempt = null;
        break;
      case 'registration.upserted': {
        const registration = event.data as Registration | undefined;
        if (!registration) break;
        const index = registrations.findIndex((entry) => entry.id === registration.id);
        if (index >= 0) {
          const existing = registrations[index];
          const merged = mergeRegistrationPayload(existing, registration);
          registrations = [
            ...registrations.slice(0, index),
            merged,
            ...registrations.slice(index + 1),
          ];
          contestStore.updateRegistration(merged);
        } else {
          const merged = mergeRegistrationPayload(undefined, registration);
          registrations = [...registrations, merged];
          contestStore.addRegistration(merged);
        }
        void reloadResults();
        break;
      }
      case 'registration.deleted': {
        const payload = event.data as { registrationId?: string } | undefined;
        const registrationId = payload?.registrationId;
        if (!registrationId) break;
        const exists = registrations.some((entry) => entry.id === registrationId);
        if (!exists) break;
        registrations = registrations.filter((entry) => entry.id !== registrationId);
        contestStore.removeRegistration(registrationId);
        liveAttempts = liveAttempts.filter((attempt) => attempt.registrationId !== registrationId);
        contestStore.setAttempts(liveAttempts);
        void reloadResults();
        break;
      }
      case 'heartbeat':
        break;
    }
  }

  // Set contest in store and context when data is available
  $: if (contest) {
    contestStore.setContest(contest, registrations, referenceData);
    setContestContext(contest);
  }

  onMount(() => {
    if (contestId) {
      realtimeClient.connect(contestId);
    }
  });

  onDestroy(() => {
    realtimeClient.disconnect();
    unsubscribeStatus();
    unsubscribeEvents();
  });

  async function openCompetitorModal(registration: Registration) {
    try {
      // Create a competitor summary object from the registration
      const competitorSummary = {
        id: registration.competitorId,
        firstName: registration.firstName,
        lastName: registration.lastName,
        birthDate: registration.birthDate,
        gender: registration.gender,
        club: registration.club,
        city: registration.city,
        competitionOrder: registration.competitionOrder,
      };

      const result = await modalStore.open<{
        registration?: Registration;
        deletedCompetitorId?: string;
        deletedRegistrationId?: string;
      }>({
        title: t('contest_detail.modal.edit_competitor_title', {
          name: formatCompetitorName(registration.firstName, registration.lastName)
        }),
        size: 'xl',
        component: CompetitorModal,
        data: {
          competitor: competitorSummary,
          mode: 'edit' as const,
          registration,
          contestId,
          weightClasses,
          ageCategories,
          contestTags: sortedContestTags,
          lifts: contestLifts,
        },
      });

      if (result?.deletedCompetitorId) {
        const removedRegistrations = registrations.filter(
          (reg) => reg.competitorId === result.deletedCompetitorId
        );
        const removedIds = removedRegistrations.map((reg) => reg.id);
        registrations = registrations.filter((reg) => reg.competitorId !== result.deletedCompetitorId);
        const idsToRemove = removedIds.length > 0 && removedIds[0]
          ? removedIds
          : result.deletedRegistrationId
            ? [result.deletedRegistrationId]
            : [];
        idsToRemove.forEach((id) => contestStore.removeRegistration(id));
        if (idsToRemove.length > 0) {
          liveAttempts = liveAttempts.filter((attempt) => !idsToRemove.includes(attempt.registrationId));
          contestStore.setAttempts(liveAttempts);
        }
        toast.success(t('contest_detail.toast.competitor_deleted'));
        return;
      }

      if (result?.registration) {
        const updated = result.registration;
        registrations = registrations.map((reg) =>
          reg.id === updated.id
            ? {
                ...reg,
                ...updated,
              }
            : reg
        );
        contestStore.updateRegistration(updated);
        toast.success(t('contest_detail.toast.competitor_updated'));
      }
    } catch (error) {
      console.error('Modal error:', error);
      toast.error(t('contest_detail.toast.competitor_update_failed'));
    }
  }

  async function openCreateCompetitorModal() {
    if (!contestId) return;
    try {
      const result = await modalStore.open<{
        registration?: Registration;
        deletedCompetitorId?: string;
        deletedRegistrationId?: string;
      }>({
        title: t('contest_detail.modal.create_competitor_title'),
        size: 'xl',
        component: CompetitorModal,
        data: {
          competitor: null,
          registration: null,
          mode: 'create' as const,
          contestId,
          weightClasses,
          ageCategories,
          contestTags: sortedContestTags,
          lifts: contestLifts,
        },
      });

      if (result?.registration) {
        const created = result.registration;
        registrations = [...registrations, created];
        contestStore.addRegistration(created);
        selectedWeightFilter = isFemaleGender(created.gender) ? 'FEMALE_OPEN' : 'MALE_OPEN';
        toast.success(t('contest_detail.toast.competitor_created'));
      }
    } catch (error) {
      console.error('Create competitor modal error:', error);
      toast.error(t('contest_detail.toast.competitor_create_failed'));
    }
  }

  async function openRegistrationDetailModal(registration: Registration) {
    try {
      const reshelMeta = getReshelMetadataForRegistration(registration);

      await modalStore.open({
        title: t('contest_detail.registration_detail.title', {
          name: formatCompetitorName(registration.firstName, registration.lastName)
        }),
        size: 'lg',
        component: RegistrationDetailModal,
        data: {
          registration,
          weightClasses,
          ageCategories,
          reshelSource: reshelMeta.source,
          reshelRetrievedAt: reshelMeta.retrievedAt,
          mccSource: mccMetadata.source,
          mccRetrievedAt: mccMetadata.retrievedAt,
          onEditCompetitor: (reg: Registration) => openCompetitorModal(reg),
        },
      });
    } catch (error) {
      console.error('Registration detail modal error:', error);
      toast.error(t('contest_detail.toast.registration_detail_failed'));
    }
  }


</script>

<svelte:window on:click={handleWindowClick} on:keydown={handleWindowKeydown} />

<svelte:head>
  <title>{contest?.name ?? t('contest_detail.fallback_title')} • {t('app_name')}</title>
</svelte:head>



<Layout
  title={contest?.name ?? t('contest_detail.fallback_title')}
  subtitle={$_('contest_detail.subtitle')}
  currentPage="contests"
  apiBase={apiBase}
  session={data.session}
>
  {#if error}
    <div class="card border-status-error">
      <h3 class="text-h3 text-status-error">{$_('contest_detail.error.loading_title')}</h3>
      <p class="text-body text-text-secondary mt-2">{error}</p>
    </div>
  {:else if !contest}
    <div class="card">
      <p class="text-body text-text-secondary">{$_('contest_detail.error.not_found')}</p>
    </div>
  {:else}
    <div class="space-y-8">
      <nav class="flex flex-wrap gap-3 border-b-2 border-border-color pb-3">
        {#each tabs as tab}
          <button
            type="button"
            class={`px-4 py-2 font-display text-xs uppercase tracking-[0.4em] border-2 transition ${
              activeTab === tab.id
                ? 'bg-primary-red text-black border-primary-red'
                : 'border-border-color text-text-secondary hover:text-text-primary hover:border-primary-red'
            }`}
            on:click={() => (activeTab = tab.id)}
          >
            {$_(tab.labelKey)}
          </button>
        {/each}
        <button
          type="button"
          class="px-4 py-2 font-display text-xs uppercase tracking-[0.4em] border-2 transition border-border-color text-text-secondary hover:text-text-primary hover:border-primary-red"
          on:click={openContestEditor}
        >
          {$_('contest_detail.actions.edit_contest')}
        </button>
        <button type="button" class="px-4 py-2 font-display text-xs uppercase tracking-[0.4em] border-2 transition border-border-color text-text-secondary hover:text-text-primary hover:border-primary-red" on:click={openCategoryManager}>
          {$_('contest_detail.registrations.manage_categories')}
        </button>
        <button type="button" class="px-4 py-2 font-display text-xs uppercase tracking-[0.4em] border-2 transition border-border-color text-text-secondary hover:text-text-primary hover:border-primary-red" on:click={openFlightManager}>
          {$_('contest_detail.registrations.manage_flights')}
        </button>
      </nav>

      {#if activeTab === 'desk'}
        <section class="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <div class="card">
          <h3 class="text-label text-text-secondary mb-2">{$_('contest_detail.cards.status.title')}</h3>
          <div class="flex items-center justify-between">
            <span class="text-h2 text-text-primary uppercase tracking-[0.3em]">{contest.status}</span>
            <span class={getStatusClasses(contest.status)}>{contest.status}</span>
          </div>
          <p class="text-caption text-text-secondary mt-3">
            {$_('contest_detail.cards.status.meta', {
              values: {
                location: contest.location,
                date: new Date(contest.date).toLocaleDateString()
              }
            })}
          </p>
          </div>
          <div class="card">
          <h3 class="text-label text-text-secondary mb-2">{$_('contest_detail.cards.lifters.title')}</h3>
          <p class="text-h1 text-text-primary">{liftersCount}</p>
          <p class="text-caption text-text-secondary mt-3">{$_('contest_detail.cards.lifters.hint')}</p>
          </div>
          <div class="card">
          <h3 class="text-label text-text-secondary mb-2">{$_('contest_detail.cards.queue.title')}</h3>
          <p class="text-h1 text-text-primary">{attemptsQueued}</p>
          <p class="text-caption text-text-secondary mt-3">{$_('contest_detail.cards.queue.hint')}</p>
        </div>
        <div class="card">
          <h3 class="text-label text-text-secondary mb-2">{$_('contest_detail.cards.last_update.title')}</h3>
          <p class="text-h1 text-text-primary">{lastUpdate}</p>
          <p class="text-caption text-text-secondary mt-3">
            {$_('contest_detail.cards.last_update.connection_prefix')}
            <span class={connectionBadge(connectionStatus)}>{connectionLabel(connectionStatus)}</span>
          </p>
          </div>
        </section>

        <section class="grid gap-4 md:grid-cols-2">
          <a
          class="card transition-transform hover:-translate-y-1 focus:outline-none focus:ring-2 focus:ring-primary-red focus:ring-offset-2 focus:ring-offset-main-bg"
          href={`/display/table?contestId=${contestId}`}
          target="_blank"
          rel="noreferrer"
        >
          <div class="flex items-center justify-between mb-3">
            <h3 class="text-h3 text-text-primary">{$_('contest_detail.links.announcer.title')}</h3>
            <span class="text-h2">📊</span>
          </div>
          <p class="text-body text-text-secondary">{$_('contest_detail.links.announcer.description')}</p>
          </a>
          <a
          class="card transition-transform hover:-translate-y-1 focus:outline-none focus:ring-2 focus:ring-primary-red focus:ring-offset-2 focus:ring-offset-main-bg"
          href={`/display/current?contestId=${contestId}`}
          target="_blank"
          rel="noreferrer"
        >
          <div class="flex items-center justify-between mb-3">
            <h3 class="text-h3 text-text-primary">{$_('contest_detail.links.display.title')}</h3>
            <span class="text-h2">🏋️</span>
          </div>
          <p class="text-body text-text-secondary">{$_('contest_detail.links.display.description')}</p>
          </a>
        </section>

        <section class="grid gap-4 lg:grid-cols-2">
          <div class="card">
          <header class="flex items-center justify-between mb-4">
            <div>
              <h3 class="text-h3 text-text-primary">{$_('contest_detail.current.title')}</h3>
              <p class="text-body text-text-secondary">{$_('contest_detail.current.subtitle')}</p>
            </div>
            <span class={connectionBadge(connectionStatus)}>{connectionLabel(connectionStatus)}</span>
          </header>
          {#if liveCurrentAttempt}
            <div class="grid gap-4 md:grid-cols-2">
              <div>
                <p class="text-label text-text-secondary mb-1">{$_('contest_detail.current.lifter_label')}</p>
                <p class="text-h2 text-text-primary">{liveCurrentAttempt.competitorName}</p>
                <p class="text-body text-text-secondary mt-2">
                  {$_('contest_detail.current.attempt_meta', {
                    values: {
                      number: liveCurrentAttempt.attemptNumber,
                      lift: liveCurrentAttempt.liftType
                    }
                  })}
                </p>
              </div>
              <div class="text-right">
                <p class="text-label text-text-secondary mb-1">{$_('contest_detail.current.weight_label')}</p>
                <p class="weight-large text-text-primary">{formatWeight(liveCurrentAttempt.weight)}</p>
                <p class="text-caption text-text-secondary mt-2">{getAttemptStatusLabel(liveCurrentAttempt.status)}</p>
              </div>
            </div>
            <div class="mt-4 flex flex-wrap items-center justify-between gap-3">
              <div class="flex flex-wrap gap-2">
                <button
                  type="button"
                  class="btn-primary px-4 py-2 text-xxs"
                  on:click={() => markCurrentAttempt('Successful')}
                  disabled={!currentAttemptEntity || statusLoading[currentAttemptEntity.id]}
                >
                  {$_('contest_detail.current.actions.mark_good')}
                </button>
                <button
                  type="button"
                  class="btn-secondary px-4 py-2 text-xxs"
                  on:click={() => markCurrentAttempt('Failed')}
                  disabled={!currentAttemptEntity || statusLoading[currentAttemptEntity.id]}
                >
                  {$_('contest_detail.current.actions.mark_fail')}
                </button>
              </div>
              <button
                type="button"
                class="btn-secondary"
                disabled={isClearingCurrent}
                on:click={clearCurrentAttemptHandler}
              >
                {#if isClearingCurrent}
                  {$_('contest_detail.current.clearing_label')}
                {:else}
                  {$_('contest_detail.current.clear_button')}
                {/if}
              </button>
            </div>
          {:else}
            <div class="text-center py-8 text-text-secondary">
              <p class="text-body">{$_('contest_detail.current.empty_title')}</p>
              <p class="text-caption mt-2">{$_('contest_detail.current.empty_hint')}</p>
            </div>
          {/if}

          <div class="mt-6 border-t border-border-color pt-4">
            <div class="flex items-center justify-between">
              <h4 class="text-label text-text-secondary">
                {t('contest_detail.current.queue_header', {
                  lift: t(`contest_detail.lifts.${queuePhase.liftType.toLowerCase()}`),
                  round: queuePhase.attemptNumber,
                })}
              </h4>
              {#if queueAttempts.length > 0}
                <span class="text-caption text-text-secondary">{queueAttempts.length}</span>
              {/if}
            </div>

            {#if queueAttempts.length > 0}
              <ul class="mt-3 space-y-2">
                {#each queueAttempts as attempt, index}
                  <li class="flex flex-col gap-3 rounded border border-border-color px-3 py-2 md:flex-row md:items-center md:justify-between">
                    <div>
                      <p class="text-body text-text-primary font-semibold">{queueCompetitorName(attempt)}</p>
                      <p class="text-caption text-text-secondary">{queueOrderLabel(attempt)}</p>
                    </div>
                    <div class="flex flex-col items-end gap-2 md:flex-row md:items-center md:gap-4">
                      <div class="text-right">
                        {#if index === 0}
                          <span class="mb-1 inline-flex items-center justify-center rounded bg-status-info/10 px-2 py-0.5 text-xxs font-semibold uppercase tracking-[0.3em] text-status-info">
                            {$_('contest_detail.current.queue_badge_next')}
                          </span>
                        {/if}
                        <p class="text-h4 text-text-primary">{formatWeight(attempt.weight)}</p>
                      </div>
                      <button
                        type="button"
                        class={`${index === 0 ? 'btn-primary' : 'btn-secondary'} px-4 py-1.5 text-xxs`}
                        disabled={Boolean(setCurrentLoading[attempt.id]) || liveCurrentAttempt?.id === attempt.id}
                        on:click={() => setCurrentAttemptHandler(attempt)}
                      >
                        {#if setCurrentLoading[attempt.id]}
                          {$_('contest_detail.current.actions.setting_current')}
                        {:else if liveCurrentAttempt?.id === attempt.id}
                          {$_('contest_detail.current.actions.is_current')}
                        {:else if index === 0}
                          {$_('contest_detail.current.actions.go_live')}
                        {:else}
                          {$_('contest_detail.current.actions.queue_set_current')}
                        {/if}
                      </button>
                    </div>
                  </li>
                {/each}
              </ul>
            {:else}
              <p class="mt-3 text-caption text-text-secondary">{$_('contest_detail.current.queue_empty')}</p>
            {/if}
          </div>
          </div>

          <div class="card">
          <header class="flex items-center justify-between mb-4">
            <h3 class="text-h3 text-text-primary">{$_('contest_detail.recent.title')}</h3>
            <span class="text-caption text-text-secondary uppercase tracking-[0.4em]">{recentAttempts.length}</span>
          </header>
          {#if recentAttempts.length > 0}
            <ul class="space-y-3">
              {#each recentAttempts as attempt (attempt.id)}
                <li class="flex items-center justify-between border-b border-border-color pb-3 last:border-b-0">
                  <div>
                    <p class="text-body text-text-primary font-semibold">{getAttemptCompetitor(attempt)}</p>
                    <p class="text-caption text-text-secondary">
                      {$_('contest_detail.recent.meta', {
                        values: {
                          lift: attempt.liftType,
                          number: attempt.attemptNumber,
                          weight: formatWeight(attempt.weight)
                        }
                      })}
                    </p>
                  </div>
                  <div class="text-right">
                    <span
                      class={`inline-flex items-center justify-center rounded px-2 py-1 text-xxs font-semibold ${getAttemptStatusClass(attempt.status)}`}
                    >
                      {getAttemptStatusLabel(attempt.status)}
                    </span>
                    <p class="text-xxs text-text-secondary mt-1">
                      {$_('contest_detail.recent.time', {
                        values: {
                          time: new Date(attempt.updatedAt).toLocaleTimeString()
                        }
                      })}
                    </p>
                  </div>
                </li>
              {/each}
            </ul>
          {:else}
            <div class="text-center py-8 text-text-secondary">
              <p class="text-body">{$_('contest_detail.attempts.empty')}</p>
            </div>
          {/if}
          </div>
        </section>
      {/if}

      {#if activeTab === 'registrations'}
        <section class="space-y-4">
          <div class="card space-y-6">
            <header class="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div>
                <h3 class="text-h3 text-text-primary">{$_('contest_detail.registrations.title')}</h3>

              </div>
              <div class="flex flex-wrap items-center gap-3">
                <button type="button" class="btn-primary px-3 py-1" on:click={() => void openCreateCompetitorModal()}>
                  {t('contest_detail.registrations.add_competitor')}
                </button>


              </div>
            </header>
            <div class="flex flex-wrap items-center gap-2">
              {#if femaleWeightFilters.length > 0 || maleWeightFilters.length > 0}
                <div class="relative" on:click|stopPropagation>
                  <button
                    type="button"
                    class={`${resultFilterButtonClass(selectedWeightFilter !== 'ALL')} flex min-w-[190px] items-center justify-between gap-3`}
                    on:click|stopPropagation={() => toggleRegistrationFilterPopover('weight')}
                  >
                    <div class="flex flex-col text-left leading-tight">
                      <span class="font-semibold">{$_('contest_detail.registrations.filters.weight_button')}</span>
                      <span class="text-text-secondary">{registrationWeightSelectionLabel}</span>
                    </div>
                    <ChevronDown
                      class={`h-3.5 w-3.5 transition-transform ${openRegistrationFilter === 'weight' ? 'rotate-180' : ''}`}
                      aria-hidden="true"
                    />
                  </button>
                  {#if openRegistrationFilter === 'weight'}
                    <div
                      class="absolute left-0 top-full z-40 mt-2 w-72 rounded border border-border-color bg-element-bg px-3 py-3 shadow-lg"
                      on:click|stopPropagation
                    >
                      <div class="space-y-4">
                        <button
                          type="button"
                          class={`${resultFilterButtonClass(selectedWeightFilter === 'ALL')} w-full justify-start`}
                          on:click={() => {
                            selectWeightFilter('ALL');
                            closeRegistrationFilterPopover();
                          }}
                        >
                          {$_('contest_detail.results.filters.all')}
                        </button>
                        {#if femaleWeightFilters.length > 0}
                          <div>
                            <p class="mb-2 text-xxs uppercase tracking-[0.3em] text-text-secondary">{$_('contest_detail.registrations.filters.weights_female')}</p>
                            <div class="grid grid-cols-2 gap-2">
                              {#each femaleWeightFilters as filter}
                                <button
                                  type="button"
                                  class={`${resultFilterButtonClass(selectedWeightFilter === filter.id)} w-full`}
                                  on:click={() => {
                                    selectWeightFilter(filter.id);
                                    closeRegistrationFilterPopover();
                                  }}
                                >
                                  {filter.label}
                                </button>
                              {/each}
                            </div>
                          </div>
                        {/if}
                        {#if maleWeightFilters.length > 0}
                          <div>
                            <p class="mb-2 text-xxs uppercase tracking-[0.3em] text-text-secondary">{$_('contest_detail.registrations.filters.weights_male')}</p>
                            <div class="grid grid-cols-2 gap-2">
                              {#each maleWeightFilters as filter}
                                <button
                                  type="button"
                                  class={`${resultFilterButtonClass(selectedWeightFilter === filter.id)} w-full`}
                                  on:click={() => {
                                    selectWeightFilter(filter.id);
                                    closeRegistrationFilterPopover();
                                  }}
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
                  class={`${resultFilterButtonClass(selectedAgeFilter !== 'ALL')} flex min-w-[170px] items-center justify-between gap-3`}
                  on:click|stopPropagation={() => toggleRegistrationFilterPopover('age')}
                >
                  <div class="flex flex-col text-left leading-tight">
                    <span class="font-semibold">{$_('contest_detail.registrations.filters.age_button')}</span>
                    <span class="text-text-secondary">{registrationAgeSelectionLabel}</span>
                  </div>
                  <ChevronDown
                    class={`h-3.5 w-3.5 transition-transform ${openRegistrationFilter === 'age' ? 'rotate-180' : ''}`}
                    aria-hidden="true"
                  />
                </button>
                {#if openRegistrationFilter === 'age'}
                  <div
                    class="absolute left-0 top-full z-40 mt-2 w-60 rounded border border-border-color bg-element-bg px-3 py-3 shadow-lg"
                    on:click|stopPropagation
                  >
                    <div class="grid max-h-52 grid-cols-2 gap-2 overflow-y-auto pr-1">
                      {#each availableAgeFilters as filter}
                        <button
                          type="button"
                          class={`${resultFilterButtonClass(selectedAgeFilter === filter.id)} w-full`}
                          on:click={() => {
                            selectAgeFilter(filter.id);
                            closeRegistrationFilterPopover();
                          }}
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
                  class={`${resultFilterButtonClass(selectedLabelFilter !== 'ALL')} flex min-w-[170px] items-center justify-between gap-3`}
                  on:click|stopPropagation={() => toggleRegistrationFilterPopover('labels')}
                >
                  <div class="flex flex-col text-left leading-tight">
                    <span class="font-semibold">{$_('contest_detail.registrations.filters.labels_button')}</span>
                    <span class="text-text-secondary">{registrationLabelSelectionLabel}</span>
                  </div>
                  <ChevronDown
                    class={`h-3.5 w-3.5 transition-transform ${openRegistrationFilter === 'labels' ? 'rotate-180' : ''}`}
                    aria-hidden="true"
                  />
                </button>
                {#if openRegistrationFilter === 'labels'}
                  <div
                    class="absolute left-0 top-full z-40 mt-2 w-60 rounded border border-border-color bg-element-bg px-3 py-3 shadow-lg"
                    on:click|stopPropagation
                  >
                    <div class="grid max-h-52 grid-cols-2 gap-2 overflow-y-auto pr-1">
                      {#each availableLabelFilters as filter}
                        <button
                          type="button"
                          class={`${resultFilterButtonClass(selectedLabelFilter === filter.id)} w-full`}
                          on:click={() => {
                            selectLabelFilter(filter.id);
                            closeRegistrationFilterPopover();
                          }}
                        >
                          {filter.label}
                        </button>
                      {/each}
                    </div>
                  </div>
                {/if}
              </div>

              {#if hasRegistrationFiltersActive}
                <button
                  type="button"
                  class="ml-auto text-xxs text-text-secondary underline decoration-dotted decoration-1 underline-offset-4"
                  on:click={clearRegistrationFilters}
                >
                  {$_('contest_detail.registrations.filters.clear')}
                </button>
              {/if}
            </div>
            {#if registrations.length === 0}
              <div class="text-center py-8 text-text-secondary">{$_('contest_detail.registrations.empty')}</div>
            {:else if filteredRows.length === 0}
              <div class="text-center py-8 text-text-secondary">{$_('contest_detail.registrations.empty_filter')}</div>
            {:else}
              <div class="max-h-[70vh] overflow-x-auto overflow-y-auto">
                <UnifiedContestTable
                  rows={filteredRows}
                  sortColumn={sortColumn}
                  sortDirection={sortDirection}
                  readOnly={false}
                  activeFlight={activeFlight}
                  lifts={contestLifts}
                  attemptNumbers={FIRST_ATTEMPT_NUMBERS}
                  weightClasses={weightClasses}
                  ageCategories={ageCategories}
                  currentAttemptId={liveCurrentAttempt?.id ?? null}
                  currentAttemptLoading={setCurrentLoading}
                  toggleLiftLoading={liftToggleLoading}
                  mode="registration"
                  onSortChange={handleSortChange}
                  onOpenCompetitorModal={openCompetitorModal}
                  onSetCurrentAttempt={setCurrentAttemptHandler}
                  onAttemptStatusCycle={handleStatusClick}
                  onAttemptWeightChange={handleAttemptWeightChangeInline}
                  onToggleLift={handleRegistrationLiftToggle}
                  showPointsColumn={false}
                  showMaxColumn={false}
                />
              </div>
            {/if}
          </div>
        </section>
      {:else if activeTab === 'results'}
        <section class="space-y-4">
          <div class="card space-y-4">
            <header class="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <h3 class="text-h3 text-text-primary">{$_('contest_detail.results.title')}</h3>
                <p class="text-body text-text-secondary">{$_('contest_detail.results.subtitle')}</p>
              </div>
              <div class="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  class="btn-secondary px-3 py-1 text-xxs"
                  on:click={() => exportResults('csv')}
                  disabled={exportingResults}
                >
                  {exportingResults ? $_('contest_detail.results.exporting') : $_('contest_detail.results.export_csv')}
                </button>
                <button
                  type="button"
                  class="btn-secondary px-3 py-1 text-xxs"
                  on:click={() => exportResults('json')}
                  disabled={exportingResults}
                >
                  {exportingResults ? $_('contest_detail.results.exporting') : $_('contest_detail.results.export_json')}
                </button>
              </div>
            </header>

            <div class="flex flex-wrap items-center gap-2">
              {#if weightClasses.length > 0}
                <div class="relative" on:click|stopPropagation>
                  <button
                    type="button"
                    class={`${resultFilterButtonClass(selectedResultView === 'weight')} flex min-w-[190px] items-center justify-between gap-3`}
                    on:click|stopPropagation={() => toggleResultFilterPopover('weight')}
                  >
                    <div class="flex flex-col text-left leading-tight">
                      <span class="font-semibold">{$_('contest_detail.results.filters.weight_button')}</span>
                      <span class="text-text-secondary">{weightSelectionLabel}</span>
                    </div>
                    <ChevronDown
                      class={`h-3.5 w-3.5 transition-transform ${openResultFilter === 'weight' ? 'rotate-180' : ''}`}
                      aria-hidden="true"
                    />
                  </button>
                  {#if openResultFilter === 'weight'}
                    <div
                      class="absolute left-0 top-full z-40 mt-2 w-72 rounded border border-border-color bg-element-bg px-3 py-3 shadow-lg"
                      on:click|stopPropagation
                    >
                      <div class="space-y-4">
                        <div>
                          <p class="mb-2 text-xxs uppercase tracking-[0.3em] text-text-secondary">{$_('contest_detail.results.filters.weights_all')}</p>
                          <button
                            type="button"
                            class={`${resultFilterButtonClass(selectedResultView !== 'weight')} w-full justify-start`}
                            on:click={() => {
                              selectAllResultWeights();
                              closeResultFilterPopover();
                            }}
                          >
                            {$_('contest_detail.results.filters.all')}
                          </button>
                        </div>

                        {#if femaleWeightClassOptions.length > 0}
                          <div>
                            <p class="mb-2 text-xxs uppercase tracking-[0.3em] text-text-secondary">{$_('contest_detail.results.filters.weights_female')}</p>
                            <div class="grid grid-cols-2 gap-2">
                              <button
                                type="button"
                                class={`${resultFilterButtonClass(selectedResultView === 'weight' && activeWeightGender === 'female' && !selectedWeightClassLabel)} w-full`}
                                on:click={() => {
                                  selectResultWeight('female', null);
                                  closeResultFilterPopover();
                                }}
                              >
                                {$_('contest_detail.results.filters.open')}
                              </button>
                              {#each femaleWeightClassOptions as option}
                                <button
                                  type="button"
                                  class={`${resultFilterButtonClass(selectedResultView === 'weight' && activeWeightGender === 'female' && selectedWeightClassLabel === option.value)} w-full`}
                                  on:click={() => {
                                    selectResultWeight('female', option.value);
                                    closeResultFilterPopover();
                                  }}
                                >
                                  {option.label}
                                </button>
                              {/each}
                            </div>
                          </div>
                        {/if}

                        {#if maleWeightClassOptions.length > 0}
                          <div>
                            <p class="mb-2 text-xxs uppercase tracking-[0.3em] text-text-secondary">{$_('contest_detail.results.filters.weights_male')}</p>
                            <div class="grid grid-cols-2 gap-2">
                              <button
                                type="button"
                                class={`${resultFilterButtonClass(selectedResultView === 'weight' && activeWeightGender === 'male' && !selectedWeightClassLabel)} w-full`}
                                on:click={() => {
                                  selectResultWeight('male', null);
                                  closeResultFilterPopover();
                                }}
                              >
                                {$_('contest_detail.results.filters.open')}
                              </button>
                              {#each maleWeightClassOptions as option}
                                <button
                                  type="button"
                                  class={`${resultFilterButtonClass(selectedResultView === 'weight' && activeWeightGender === 'male' && selectedWeightClassLabel === option.value)} w-full`}
                                  on:click={() => {
                                    selectResultWeight('male', option.value);
                                    closeResultFilterPopover();
                                  }}
                                >
                                  {option.label}
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

              {#if ageCategoryOptions.length > 0}
                <div class="relative" on:click|stopPropagation>
                  <button
                    type="button"
                    class={`${resultFilterButtonClass(selectedResultView === 'age')} flex min-w-[170px] items-center justify-between gap-3`}
                    on:click|stopPropagation={() => toggleResultFilterPopover('age')}
                  >
                    <div class="flex flex-col text-left leading-tight">
                      <span class="font-semibold">{$_('contest_detail.results.filters.age_button')}</span>
                      <span class="text-text-secondary">{ageSelectionLabel}</span>
                    </div>
                    <ChevronDown
                      class={`h-3.5 w-3.5 transition-transform ${openResultFilter === 'age' ? 'rotate-180' : ''}`}
                      aria-hidden="true"
                    />
                  </button>
                  {#if openResultFilter === 'age'}
                    <div
                      class="absolute left-0 top-full z-40 mt-2 w-64 rounded border border-border-color bg-element-bg px-3 py-3 shadow-lg"
                      on:click|stopPropagation
                    >
                      <div class="space-y-3">
                        <button
                          type="button"
                          class={`${resultFilterButtonClass(selectedResultView !== 'age')} w-full justify-start`}
                          on:click={() => {
                            selectResultAge(null);
                            closeResultFilterPopover();
                          }}
                        >
                          {$_('contest_detail.results.filters.all')}
                        </button>
                        <div class="grid max-h-52 grid-cols-2 gap-2 overflow-y-auto pr-1">
                          {#each ageCategoryOptions as option}
                            <button
                              type="button"
                              class={`${resultFilterButtonClass(selectedResultView === 'age' && selectedAgeCategoryLabel === option.value)} w-full`}
                              on:click={() => {
                                selectResultAge(option.value);
                                closeResultFilterPopover();
                              }}
                            >
                              {option.label}
                            </button>
                          {/each}
                        </div>
                      </div>
                    </div>
                  {/if}
                </div>
              {/if}

              <div class="relative" on:click|stopPropagation>
                <button
                  type="button"
                  class={`${resultFilterButtonClass(selectedResultView === 'tag')} flex min-w-[170px] items-center justify-between gap-3`}
                  on:click|stopPropagation={() => toggleResultFilterPopover('tags')}
                >
                  <div class="flex flex-col text-left leading-tight">
                    <span class="font-semibold">{$_('contest_detail.results.filters.tags_button')}</span>
                    <span class="text-text-secondary">{tagsSelectionLabel}</span>
                  </div>
                  <ChevronDown
                    class={`h-3.5 w-3.5 transition-transform ${openResultFilter === 'tags' ? 'rotate-180' : ''}`}
                    aria-hidden="true"
                  />
                </button>
                {#if openResultFilter === 'tags'}
                  <div
                    class="absolute left-0 top-full z-40 mt-2 w-60 rounded border border-border-color bg-element-bg px-3 py-3 shadow-lg"
                    on:click|stopPropagation
                  >
                    {#if sortedContestTags.length > 0}
                      <div class="space-y-3">
                        <button
                          type="button"
                          class={`${resultFilterButtonClass(selectedResultView !== 'tag')} w-full justify-start`}
                          on:click={() => {
                            selectAllResultTags();
                            closeResultFilterPopover();
                          }}
                        >
                          {$_('contest_detail.results.filters.all')}
                        </button>
                        <div class="grid max-h-52 grid-cols-2 gap-2 overflow-y-auto pr-1">
                          {#each sortedContestTags as tag}
                            <button
                              type="button"
                              class={`${resultFilterButtonClass(selectedResultView === 'tag' && selectedTagForResults === tag.label)} w-full`}
                              on:click={() => {
                                selectResultTag(tag.label);
                                closeResultFilterPopover();
                              }}
                              disabled={resultsLoading && selectedResultView === 'tag' && selectedTagForResults === tag.label}
                            >
                              {tag.label}
                            </button>
                          {/each}
                        </div>
                      </div>
                    {:else}
                      <p class="text-xxs text-text-secondary">{$_('contest_detail.results.tags.empty')}</p>
                    {/if}
                  </div>
                {/if}
              </div>

              {#if hasActiveResultFilters}
                <button
                  type="button"
                  class="ml-auto text-xxs text-text-secondary underline decoration-dotted decoration-1 underline-offset-4"
                  on:click={clearAllResultFilters}
                >
                  {$_('contest_detail.results.filters.clear')}
                </button>
              {/if}
            </div>
            <div class="flex flex-wrap items-center justify-between gap-3">
              <span class="text-caption uppercase tracking-[0.35em] text-text-secondary">{resultsSummaryLabel}</span>
            </div>

            {#if resultsError}
              <div class="rounded border border-status-error bg-status-error/20 px-3 py-2 text-sm text-status-error">{resultsError}</div>
            {/if}

            {#if resultsLoading && displayedResults.length === 0}
              <p class="text-body text-text-secondary">{$_('contest_detail.results.loading')}</p>
            {:else if displayedResults.length === 0}
              <p class="text-body text-text-secondary">{$_('contest_detail.results.empty')}</p>
            {:else}
              <div class="overflow-x-auto">
                <table class="min-w-full text-left text-sm text-text-secondary">
                  <thead class="bg-element-bg text-label">
                    <tr>
                      <th 
                        class="px-4 py-3 cursor-pointer hover:bg-element-bg/80 transition-colors"
                        role="columnheader"
                        aria-sort={resultsAriaSort('place')}
                        on:click={() => handleResultsSortChange('place')}
                      >
                        <div class="flex items-center gap-1">
                          <span>{$_('contest_detail.results.columns.place')}</span>
                          <span aria-hidden="true">{#if resultsSortIndicatorIcon('place')}<svelte:component this={resultsSortIndicatorIcon('place')} class="h-3.5 w-3.5 opacity-70" />{/if}</span>
                        </div>
                      </th>
                      <th 
                        class="px-4 py-3 cursor-pointer hover:bg-element-bg/80 transition-colors"
                        role="columnheader"
                        aria-sort={resultsAriaSort('lifter')}
                        on:click={() => handleResultsSortChange('lifter')}
                      >
                        <div class="flex items-center gap-1">
                          <span>{$_('contest_detail.results.columns.lifter')}</span>
                          <span aria-hidden="true">{#if resultsSortIndicatorIcon('lifter')}<svelte:component this={resultsSortIndicatorIcon('lifter')} class="h-3.5 w-3.5 opacity-70" />{/if}</span>
                        </div>
                      </th>
                      {#if selectedResultView !== 'open'}
                        <th 
                          class="px-4 py-3 cursor-pointer hover:bg-element-bg/80 transition-colors"
                          role="columnheader"
                          aria-sort={resultsAriaSort('category')}
                          on:click={() => handleResultsSortChange('category')}
                        >
                          <div class="flex items-center gap-1">
                            <span>
                              {selectedResultView === 'age'
                                ? $_('contest_detail.results.columns.age_category')
                                : $_('contest_detail.results.columns.weight_class')}
                            </span>
                            <span aria-hidden="true">{#if resultsSortIndicatorIcon('category')}<svelte:component this={resultsSortIndicatorIcon('category')} class="h-3.5 w-3.5 opacity-70" />{/if}</span>
                          </div>
                        </th>
                      {/if}
                      {#if hasSquatResults}
                        <th 
                          class="px-4 py-3 cursor-pointer hover:bg-element-bg/80 transition-colors"
                          role="columnheader"
                          aria-sort={resultsAriaSort('bestSquat')}
                          on:click={() => handleResultsSortChange('bestSquat')}
                        >
                          <div class="flex items-center gap-1">
                            <span>{$_('contest_detail.results.columns.best_squat')}</span>
                            <span aria-hidden="true">{#if resultsSortIndicatorIcon('bestSquat')}<svelte:component this={resultsSortIndicatorIcon('bestSquat')} class="h-3.5 w-3.5 opacity-70" />{/if}</span>
                          </div>
                        </th>
                      {/if}
                      {#if hasBenchResults}
                        <th 
                          class="px-4 py-3 cursor-pointer hover:bg-element-bg/80 transition-colors"
                          role="columnheader"
                          aria-sort={resultsAriaSort('bestBench')}
                          on:click={() => handleResultsSortChange('bestBench')}
                        >
                          <div class="flex items-center gap-1">
                            <span>{$_('contest_detail.results.columns.best_bench')}</span>
                            <span aria-hidden="true">{#if resultsSortIndicatorIcon('bestBench')}<svelte:component this={resultsSortIndicatorIcon('bestBench')} class="h-3.5 w-3.5 opacity-70" />{/if}</span>
                          </div>
                        </th>
                      {/if}
                      {#if hasDeadliftResults}
                        <th 
                          class="px-4 py-3 cursor-pointer hover:bg-element-bg/80 transition-colors"
                          role="columnheader"
                          aria-sort={resultsAriaSort('bestDeadlift')}
                          on:click={() => handleResultsSortChange('bestDeadlift')}
                        >
                          <div class="flex items-center gap-1">
                            <span>{$_('contest_detail.results.columns.best_deadlift')}</span>
                            <span aria-hidden="true">{#if resultsSortIndicatorIcon('bestDeadlift')}<svelte:component this={resultsSortIndicatorIcon('bestDeadlift')} class="h-3.5 w-3.5 opacity-70" />{/if}</span>
                          </div>
                        </th>
                      {/if}
                      {#if hasSquatResults}
                        <th 
                          class="px-4 py-3 cursor-pointer hover:bg-element-bg/80 transition-colors"
                          role="columnheader"
                          aria-sort={resultsAriaSort('squatPoints')}
                          on:click={() => handleResultsSortChange('squatPoints')}
                        >
                          <div class="flex items-center gap-1">
                            <span>{$_('contest_detail.results.columns.squat_points')}</span>
                            <span aria-hidden="true">{#if resultsSortIndicatorIcon('squatPoints')}<svelte:component this={resultsSortIndicatorIcon('squatPoints')} class="h-3.5 w-3.5 opacity-70" />{/if}</span>
                          </div>
                        </th>
                      {/if}
                      {#if hasBenchResults}
                        <th 
                          class="px-4 py-3 cursor-pointer hover:bg-element-bg/80 transition-colors"
                          role="columnheader"
                          aria-sort={resultsAriaSort('benchPoints')}
                          on:click={() => handleResultsSortChange('benchPoints')}
                        >
                          <div class="flex items-center gap-1">
                            <span>{$_('contest_detail.results.columns.bench_points')}</span>
                            <span aria-hidden="true">{#if resultsSortIndicatorIcon('benchPoints')}<svelte:component this={resultsSortIndicatorIcon('benchPoints')} class="h-3.5 w-3.5 opacity-70" />{/if}</span>
                          </div>
                        </th>
                      {/if}
                      {#if hasDeadliftResults}
                        <th 
                          class="px-4 py-3 cursor-pointer hover:bg-element-bg/80 transition-colors"
                          role="columnheader"
                          aria-sort={resultsAriaSort('deadliftPoints')}
                          on:click={() => handleResultsSortChange('deadliftPoints')}
                        >
                          <div class="flex items-center gap-1">
                            <span>{$_('contest_detail.results.columns.deadlift_points')}</span>
                            <span aria-hidden="true">{#if resultsSortIndicatorIcon('deadliftPoints')}<svelte:component this={resultsSortIndicatorIcon('deadliftPoints')} class="h-3.5 w-3.5 opacity-70" />{/if}</span>
                          </div>
                        </th>
                      {/if}

                    </tr>
                  </thead>
                  <tbody>
                    {#each displayedResults as result (result.id ?? result.registrationId)}
                      <tr class={`border-b border-border-color last:border-b-0 ${result.isDisqualified ? 'bg-status-error/20' : ''}`}>
                        <td class="px-4 py-3 font-semibold text-text-primary">
                          {#if getResultPlace(result, selectedResultView) !== null}
                            {getResultPlace(result, selectedResultView)}
                          {:else}
                            –
                          {/if}
                        </td>
                        <td class="px-4 py-3 text-text-secondary">
                          {formatCompetitorName(result.firstName, result.lastName)}
                        </td>
                        {#if selectedResultView !== 'open'}
                          <td class="px-4 py-3 text-text-secondary">{getResultCategory(result, selectedResultView)}</td>
                        {/if}
                        {#if hasSquatResults}
                          <td class="px-4 py-3 text-text-secondary">{formatLift(result.bestSquat)}</td>
                        {/if}
                        {#if hasBenchResults}
                          <td class="px-4 py-3 text-text-secondary">{formatLift(result.bestBench)}</td>
                        {/if}
                        {#if hasDeadliftResults}
                          <td class="px-4 py-3 text-text-secondary">{formatLift(result.bestDeadlift)}</td>
                        {/if}
                        {#if hasSquatResults}
                          <td class="px-4 py-3 text-text-secondary">{formatPoints(result.squatPoints)}</td>
                        {/if}
                        {#if hasBenchResults}
                          <td class="px-4 py-3 text-text-secondary">{formatPoints(result.benchPoints)}</td>
                        {/if}
                        {#if hasDeadliftResults}
                          <td class="px-4 py-3 text-text-secondary">{formatPoints(result.deadliftPoints)}</td>
                        {/if}

                      </tr>
                    {/each}
                  </tbody>
                </table>
              </div>
            {/if}
          </div>
        </section>
      {:else if activeTab === 'plates'}
        <section class="space-y-4">
          <div class="card space-y-4">
            <header class="space-y-3">
              <div>
                <h3 class="text-h3 text-text-primary">{$_('contest_detail.plates.title')}</h3>
                <p class="text-body text-text-secondary">{$_('contest_detail.plates.subtitle')}</p>
              </div>
              {#if contestBarWeights || contest}
                <div class="grid gap-2 md:grid-cols-2 text-caption text-text-secondary uppercase tracking-[0.35em]">
                  <span>{$_('contest_detail.plates.bar_weight_men', { values: { weight: displayWeightValue(contestBarWeights?.mensBarWeight ?? contest?.mensBarWeight ?? null) } })}</span>
                  <span>{$_('contest_detail.plates.bar_weight_women', { values: { weight: displayWeightValue(contestBarWeights?.womensBarWeight ?? contest?.womensBarWeight ?? null) } })}</span>
                </div>
              {/if}
            </header>

              <div class="space-y-4">
                <div class="grid gap-4 md:grid-cols-3">
                  <div>
                    <label class="input-label" for="mens-bar-weight-setting">
                      {$_('contest_detail.plates.bar_weight_men', { values: { weight: '' } })}
                    </label>
                    <input id="mens-bar-weight-setting" class="input-field" type="number" step="0.25" bind:value={mensBarWeightSetting} />
                  </div>
                  <div>
                    <label class="input-label" for="womens-bar-weight-setting">
                      {$_('contest_detail.plates.bar_weight_women', { values: { weight: '' } })}
                    </label>
                    <input id="womens-bar-weight-setting" class="input-field" type="number" step="0.25" bind:value={womensBarWeightSetting} />
                  </div>
                  <div>
                    <label class="input-label" for="clamp-weight-setting">
                      {$_('contest_detail.plates.clamp_weight_label')}
                    </label>
                    <input id="clamp-weight-setting" class="input-field" type="number" step="0.25" bind:value={clampWeightSetting} />
                    <p class="text-caption text-text-secondary mt-1">{$_('contest_detail.plates.clamp_weight_hint')}</p>
                  </div>
                  <div class="md:col-span-3">
                    <button class="btn-primary px-3 py-1 text-xxs" disabled={barWeightsBusy} on:click|preventDefault={saveBarWeights}>
                      {barWeightsBusy ? $_('buttons.saving') : $_('buttons.save')}
                    </button>
                  </div>
                </div>

                <div class="overflow-x-auto">
                  <table class="min-w-full text-left text-sm text-text-secondary">
                    <thead class="bg-element-bg text-label">
                      <tr>
                        <th class="px-4 py-3">{$_('contest_detail.plates.columns.weight')}</th>
                        <th class="px-4 py-3">{$_('contest_detail.plates.columns.quantity')}</th>
                        <th class="px-4 py-3">{$_('contest_detail.plates.columns.color')}</th>
                        <th class="px-4 py-3 text-right">{$_('contest_table.columns.actions')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {#if contestPlateSets.length === 0}
                        <tr>
                          <td class="px-4 py-3 text-text-secondary" colspan="4">{$_('contest_detail.plates.empty')}</td>
                        </tr>
                      {/if}
                      {#each contestPlateSets as plate, idx (plate.plateWeight ?? plate.weight ?? idx)}
                        <tr class="border-b border-border-color last:border-b-0">
                        <td class="px-4 py-3">
                          <input
                            class="input-field w-28"
                            type="number"
                            min="0.25"
                            step="0.25"
                            value={displayWeightValue(plate.plateWeight ?? plate.weight ?? null)}
                            on:change={(event) => handlePlateWeightChange(plate.plateWeight, plate.quantity, plate.color ?? null, event)}
                          />
                        </td>
                          <td class="px-4 py-3">
                            <input
                              class="input-field w-24"
                              type="number"
                              min="0"
                              step="1"
                              value={plate.quantity}
                              on:change={(event) => handlePlateQuantityChange(plate.plateWeight, event)}
                            />
                          </td>
                          <td class="px-4 py-3">
                            <div class="flex items-center gap-2">
                              <span class="inline-block h-4 w-4 rounded border border-border-color" style={`background:${plate.color}`}></span>
                              <span class="text-text-secondary">{plate.color}</span>
                            </div>
                          </td>
                          <td class="px-4 py-3 text-right">
                            <button class="btn-secondary px-3 py-1 text-xxs" on:click={() => deletePlate(plate.plateWeight)} disabled={platesBusy}>{$_('buttons.delete')}</button>
                          </td>
                        </tr>
                      {/each}
                      <tr>
                        <td class="px-4 py-3">
                          <input class="input-field w-28" type="number" step="0.25" placeholder="np. 25" bind:value={newPlateWeight} />
                        </td>
                        <td class="px-4 py-3">
                          <input class="input-field w-24" type="number" min="0" step="1" placeholder="0" bind:value={newPlateQuantity} />
                        </td>
                        <td class="px-4 py-3">
                          <input class="input-field w-36" type="text" placeholder="#374151" bind:value={newPlateColor} />
                        </td>
                        <td class="px-4 py-3 text-right">
                          <button class="btn-primary px-3 py-1 text-xxs" on:click|preventDefault={addPlate} disabled={platesBusy}>{$_('buttons.add')}</button>
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
      </div>
          </div>
        </section>
      {:else if activeTab === 'squat' && activeContestLifts.includes('Squat')}
        <section class="space-y-4">
          <div class="card space-y-6">
            <header class="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
              <h3 class="text-h3 text-text-primary">{$_('contest_detail.tabs.squat_table')}</h3>
            </header>
            <div class="flex flex-wrap items-center gap-2">
              {#if femaleWeightFilters.length > 0 || maleWeightFilters.length > 0}
                <div class="relative" on:click|stopPropagation>
                  <button
                    type="button"
                    class={`${resultFilterButtonClass(selectedWeightFilter !== 'ALL')} flex min-w-[190px] items-center justify-between gap-3`}
                    on:click|stopPropagation={() => toggleRegistrationFilterPopover('weight')}
                  >
                    <div class="flex flex-col text-left leading-tight">
                      <span class="font-semibold">{$_('contest_detail.registrations.filters.weight_button')}</span>
                      <span class="text-text-secondary">{registrationWeightSelectionLabel}</span>
                    </div>
                    <ChevronDown
                      class={`h-3.5 w-3.5 transition-transform ${openRegistrationFilter === 'weight' ? 'rotate-180' : ''}`}
                      aria-hidden="true"
                    />
                  </button>
                  {#if openRegistrationFilter === 'weight'}
                    <div
                      class="absolute left-0 top-full z-40 mt-2 w-72 rounded border border-border-color bg-element-bg px-3 py-3 shadow-lg"
                      on:click|stopPropagation
                    >
                      <div class="space-y-4">
                        <button
                          type="button"
                          class={`${resultFilterButtonClass(selectedWeightFilter === 'ALL')} w-full justify-start`}
                          on:click={() => {
                            selectWeightFilter('ALL');
                            closeRegistrationFilterPopover();
                          }}
                        >
                          {$_('contest_detail.results.filters.all')}
                        </button>
                        {#if femaleWeightFilters.length > 0}
                          <div>
                            <p class="mb-2 text-xxs uppercase tracking-[0.3em] text-text-secondary">{$_('contest_detail.registrations.filters.weights_female')}</p>
                            <div class="grid grid-cols-2 gap-2">
                              {#each femaleWeightFilters as filter}
                                <button
                                  type="button"
                                  class={`${resultFilterButtonClass(selectedWeightFilter === filter.id)} w-full`}
                                  on:click={() => {
                                    selectWeightFilter(filter.id);
                                    closeRegistrationFilterPopover();
                                  }}
                                >
                                  {filter.label}
                                </button>
                              {/each}
                            </div>
                          </div>
                        {/if}
                        {#if maleWeightFilters.length > 0}
                          <div>
                            <p class="mb-2 text-xxs uppercase tracking-[0.3em] text-text-secondary">{$_('contest_detail.registrations.filters.weights_male')}</p>
                            <div class="grid grid-cols-2 gap-2">
                              {#each maleWeightFilters as filter}
                                <button
                                  type="button"
                                  class={`${resultFilterButtonClass(selectedWeightFilter === filter.id)} w-full`}
                                  on:click={() => {
                                    selectWeightFilter(filter.id);
                                    closeRegistrationFilterPopover();
                                  }}
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
                  class={`${resultFilterButtonClass(selectedAgeFilter !== 'ALL')} flex min-w-[170px] items-center justify-between gap-3`}
                  on:click|stopPropagation={() => toggleRegistrationFilterPopover('age')}
                >
                  <div class="flex flex-col text-left leading-tight">
                    <span class="font-semibold">{$_('contest_detail.registrations.filters.age_button')}</span>
                    <span class="text-text-secondary">{registrationAgeSelectionLabel}</span>
                  </div>
                  <ChevronDown
                    class={`h-3.5 w-3.5 transition-transform ${openRegistrationFilter === 'age' ? 'rotate-180' : ''}`}
                    aria-hidden="true"
                  />
                </button>
                {#if openRegistrationFilter === 'age'}
                  <div
                    class="absolute left-0 top-full z-40 mt-2 w-60 rounded border border-border-color bg-element-bg px-3 py-3 shadow-lg"
                    on:click|stopPropagation
                  >
                    <div class="grid max-h-52 grid-cols-2 gap-2 overflow-y-auto pr-1">
                      {#each availableAgeFilters as filter}
                        <button
                          type="button"
                          class={`${resultFilterButtonClass(selectedAgeFilter === filter.id)} w-full`}
                          on:click={() => {
                            selectAgeFilter(filter.id);
                            closeRegistrationFilterPopover();
                          }}
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
                  class={`${resultFilterButtonClass(selectedLabelFilter !== 'ALL')} flex min-w-[170px] items-center justify-between gap-3`}
                  on:click|stopPropagation={() => toggleRegistrationFilterPopover('labels')}
                >
                  <div class="flex flex-col text-left leading-tight">
                    <span class="font-semibold">{$_('contest_detail.registrations.filters.labels_button')}</span>
                    <span class="text-text-secondary">{registrationLabelSelectionLabel}</span>
                  </div>
                  <ChevronDown
                    class={`h-3.5 w-3.5 transition-transform ${openRegistrationFilter === 'labels' ? 'rotate-180' : ''}`}
                    aria-hidden="true"
                  />
                </button>
                {#if openRegistrationFilter === 'labels'}
                  <div
                    class="absolute left-0 top-full z-40 mt-2 w-60 rounded border border-border-color bg-element-bg px-3 py-3 shadow-lg"
                    on:click|stopPropagation
                  >
                    <div class="grid max-h-52 grid-cols-2 gap-2 overflow-y-auto pr-1">
                      {#each availableLabelFilters as filter}
                        <button
                          type="button"
                          class={`${resultFilterButtonClass(selectedLabelFilter === filter.id)} w-full`}
                          on:click={() => {
                            selectLabelFilter(filter.id);
                            closeRegistrationFilterPopover();
                          }}
                        >
                          {filter.label}
                        </button>
                      {/each}
                    </div>
                  </div>
                {/if}
              </div>

              {#if hasRegistrationFiltersActive}
                <button
                  type="button"
                  class="ml-auto text-xxs text-text-secondary underline decoration-dotted decoration-1 underline-offset-4"
                  on:click={clearRegistrationFilters}
                >
                  {$_('contest_detail.registrations.filters.clear')}
                </button>
              {/if}
            </div>
            {#if registrations.length === 0}
              <div class="text-center py-8 text-text-secondary">{$_('contest_detail.registrations.empty')}</div>
            {:else if squatRows.length === 0}
              <div class="text-center py-8 text-text-secondary">{$_('contest_detail.registrations.empty_filter')}</div>
            {:else}
              <div class="max-h-[70vh] overflow-x-auto overflow-y-auto">
                <UnifiedContestTable
                  rows={squatRows}
                  sortColumn={sortColumn}
                  sortDirection={sortDirection}
                  readOnly={false}
                  activeFlight={activeFlight}
                  lifts={LIFT_SINGLETONS.Squat}
                  weightClasses={weightClasses}
                  ageCategories={ageCategories}
                  currentAttemptId={liveCurrentAttempt?.id ?? null}
                  currentAttemptLoading={setCurrentLoading}
                  onSortChange={handleSortChange}
                  onOpenCompetitorModal={openCompetitorModal}
                  onSetCurrentAttempt={setCurrentAttemptHandler}
                  onAttemptStatusCycle={handleStatusClick}
                  onAttemptWeightChange={handleAttemptWeightChangeInline}
                />
              </div>
            {/if}
          </div>
        </section>
      {:else if activeTab === 'bench' && activeContestLifts.includes('Bench')}
        <section class="space-y-4">
          <div class="card space-y-6">
            <header class="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
              <h3 class="text-h3 text-text-primary">{$_('contest_detail.tabs.bench_table')}</h3>
            </header>
            <div class="flex flex-wrap items-center gap-2">
              {#if femaleWeightFilters.length > 0 || maleWeightFilters.length > 0}
                <div class="relative" on:click|stopPropagation>
                  <button
                    type="button"
                    class={`${resultFilterButtonClass(selectedWeightFilter !== 'ALL')} flex min-w-[190px] items-center justify-between gap-3`}
                    on:click|stopPropagation={() => toggleRegistrationFilterPopover('weight')}
                  >
                    <div class="flex flex-col text-left leading-tight">
                      <span class="font-semibold">{$_('contest_detail.registrations.filters.weight_button')}</span>
                      <span class="text-text-secondary">{registrationWeightSelectionLabel}</span>
                    </div>
                    <ChevronDown
                      class={`h-3.5 w-3.5 transition-transform ${openRegistrationFilter === 'weight' ? 'rotate-180' : ''}`}
                      aria-hidden="true"
                    />
                  </button>
                  {#if openRegistrationFilter === 'weight'}
                    <div
                      class="absolute left-0 top-full z-40 mt-2 w-72 rounded border border-border-color bg-element-bg px-3 py-3 shadow-lg"
                      on:click|stopPropagation
                    >
                      <div class="space-y-4">
                        <button
                          type="button"
                          class={`${resultFilterButtonClass(selectedWeightFilter === 'ALL')} w-full justify-start`}
                          on:click={() => {
                            selectWeightFilter('ALL');
                            closeRegistrationFilterPopover();
                          }}
                        >
                          {$_('contest_detail.results.filters.all')}
                        </button>
                        {#if femaleWeightFilters.length > 0}
                          <div>
                            <p class="mb-2 text-xxs uppercase tracking-[0.3em] text-text-secondary">{$_('contest_detail.registrations.filters.weights_female')}</p>
                            <div class="grid grid-cols-2 gap-2">
                              {#each femaleWeightFilters as filter}
                                <button
                                  type="button"
                                  class={`${resultFilterButtonClass(selectedWeightFilter === filter.id)} w-full`}
                                  on:click={() => {
                                    selectWeightFilter(filter.id);
                                    closeRegistrationFilterPopover();
                                  }}
                                >
                                  {filter.label}
                                </button>
                              {/each}
                            </div>
                          </div>
                        {/if}
                        {#if maleWeightFilters.length > 0}
                          <div>
                            <p class="mb-2 text-xxs uppercase tracking-[0.3em] text-text-secondary">{$_('contest_detail.registrations.filters.weights_male')}</p>
                            <div class="grid grid-cols-2 gap-2">
                              {#each maleWeightFilters as filter}
                                <button
                                  type="button"
                                  class={`${resultFilterButtonClass(selectedWeightFilter === filter.id)} w-full`}
                                  on:click={() => {
                                    selectWeightFilter(filter.id);
                                    closeRegistrationFilterPopover();
                                  }}
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
                  class={`${resultFilterButtonClass(selectedAgeFilter !== 'ALL')} flex min-w-[170px] items-center justify-between gap-3`}
                  on:click|stopPropagation={() => toggleRegistrationFilterPopover('age')}
                >
                  <div class="flex flex-col text-left leading-tight">
                    <span class="font-semibold">{$_('contest_detail.registrations.filters.age_button')}</span>
                    <span class="text-text-secondary">{registrationAgeSelectionLabel}</span>
                  </div>
                  <ChevronDown
                    class={`h-3.5 w-3.5 transition-transform ${openRegistrationFilter === 'age' ? 'rotate-180' : ''}`}
                    aria-hidden="true"
                  />
                </button>
                {#if openRegistrationFilter === 'age'}
                  <div
                    class="absolute left-0 top-full z-40 mt-2 w-60 rounded border border-border-color bg-element-bg px-3 py-3 shadow-lg"
                    on:click|stopPropagation
                  >
                    <div class="grid max-h-52 grid-cols-2 gap-2 overflow-y-auto pr-1">
                      {#each availableAgeFilters as filter}
                        <button
                          type="button"
                          class={`${resultFilterButtonClass(selectedAgeFilter === filter.id)} w-full`}
                          on:click={() => {
                            selectAgeFilter(filter.id);
                            closeRegistrationFilterPopover();
                          }}
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
                  class={`${resultFilterButtonClass(selectedLabelFilter !== 'ALL')} flex min-w-[170px] items-center justify-between gap-3`}
                  on:click|stopPropagation={() => toggleRegistrationFilterPopover('labels')}
                >
                  <div class="flex flex-col text-left leading-tight">
                    <span class="font-semibold">{$_('contest_detail.registrations.filters.labels_button')}</span>
                    <span class="text-text-secondary">{registrationLabelSelectionLabel}</span>
                  </div>
                  <ChevronDown
                    class={`h-3.5 w-3.5 transition-transform ${openRegistrationFilter === 'labels' ? 'rotate-180' : ''}`}
                    aria-hidden="true"
                  />
                </button>
                {#if openRegistrationFilter === 'labels'}
                  <div
                    class="absolute left-0 top-full z-40 mt-2 w-60 rounded border border-border-color bg-element-bg px-3 py-3 shadow-lg"
                    on:click|stopPropagation
                  >
                    <div class="grid max-h-52 grid-cols-2 gap-2 overflow-y-auto pr-1">
                      {#each availableLabelFilters as filter}
                        <button
                          type="button"
                          class={`${resultFilterButtonClass(selectedLabelFilter === filter.id)} w-full`}
                          on:click={() => {
                            selectLabelFilter(filter.id);
                            closeRegistrationFilterPopover();
                          }}
                        >
                          {filter.label}
                        </button>
                      {/each}
                    </div>
                  </div>
                {/if}
              </div>

              {#if hasRegistrationFiltersActive}
                <button
                  type="button"
                  class="ml-auto text-xxs text-text-secondary underline decoration-dotted decoration-1 underline-offset-4"
                  on:click={clearRegistrationFilters}
                >
                  {$_('contest_detail.registrations.filters.clear')}
                </button>
              {/if}
            </div>
            {#if registrations.length === 0}
              <div class="text-center py-8 text-text-secondary">{$_('contest_detail.registrations.empty')}</div>
            {:else if benchRows.length === 0}
              <div class="text-center py-8 text-text-secondary">{$_('contest_detail.registrations.empty_filter')}</div>
            {:else}
              <div class="max-h-[70vh] overflow-x-auto overflow-y-auto">
                <UnifiedContestTable
                  rows={benchRows}
                  sortColumn={sortColumn}
                  sortDirection={sortDirection}
                  readOnly={false}
                  activeFlight={activeFlight}
                  lifts={LIFT_SINGLETONS.Bench}
                  weightClasses={weightClasses}
                  ageCategories={ageCategories}
                  currentAttemptId={liveCurrentAttempt?.id ?? null}
                  currentAttemptLoading={setCurrentLoading}
                  onSortChange={handleSortChange}
                  onOpenCompetitorModal={openCompetitorModal}
                  onSetCurrentAttempt={setCurrentAttemptHandler}
                  onAttemptStatusCycle={handleStatusClick}
                  onAttemptWeightChange={handleAttemptWeightChangeInline}
                />
              </div>
            {/if}
          </div>
        </section>
      {:else if activeTab === 'deadlift' && activeContestLifts.includes('Deadlift')}
        <section class="space-y-4">
          <div class="card space-y-6">
            <header class="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
              <h3 class="text-h3 text-text-primary">{$_('contest_detail.tabs.deadlift_table')}</h3>
            </header>
            <div class="flex flex-wrap items-center gap-2">
              {#if femaleWeightFilters.length > 0 || maleWeightFilters.length > 0}
                <div class="relative" on:click|stopPropagation>
                  <button
                    type="button"
                    class={`${resultFilterButtonClass(selectedWeightFilter !== 'ALL')} flex min-w-[190px] items-center justify-between gap-3`}
                    on:click|stopPropagation={() => toggleRegistrationFilterPopover('weight')}
                  >
                    <div class="flex flex-col text-left leading-tight">
                      <span class="font-semibold">{$_('contest_detail.registrations.filters.weight_button')}</span>
                      <span class="text-text-secondary">{registrationWeightSelectionLabel}</span>
                    </div>
                    <ChevronDown
                      class={`h-3.5 w-3.5 transition-transform ${openRegistrationFilter === 'weight' ? 'rotate-180' : ''}`}
                      aria-hidden="true"
                    />
                  </button>
                  {#if openRegistrationFilter === 'weight'}
                    <div
                      class="absolute left-0 top-full z-40 mt-2 w-72 rounded border border-border-color bg-element-bg px-3 py-3 shadow-lg"
                      on:click|stopPropagation
                    >
                      <div class="space-y-4">
                        <button
                          type="button"
                          class={`${resultFilterButtonClass(selectedWeightFilter === 'ALL')} w-full justify-start`}
                          on:click={() => {
                            selectWeightFilter('ALL');
                            closeRegistrationFilterPopover();
                          }}
                        >
                          {$_('contest_detail.results.filters.all')}
                        </button>
                        {#if femaleWeightFilters.length > 0}
                          <div>
                            <p class="mb-2 text-xxs uppercase tracking-[0.3em] text-text-secondary">{$_('contest_detail.registrations.filters.weights_female')}</p>
                            <div class="grid grid-cols-2 gap-2">
                              {#each femaleWeightFilters as filter}
                                <button
                                  type="button"
                                  class={`${resultFilterButtonClass(selectedWeightFilter === filter.id)} w-full`}
                                  on:click={() => {
                                    selectWeightFilter(filter.id);
                                    closeRegistrationFilterPopover();
                                  }}
                                >
                                  {filter.label}
                                </button>
                              {/each}
                            </div>
                          </div>
                        {/if}
                        {#if maleWeightFilters.length > 0}
                          <div>
                            <p class="mb-2 text-xxs uppercase tracking-[0.3em] text-text-secondary">{$_('contest_detail.registrations.filters.weights_male')}</p>
                            <div class="grid grid-cols-2 gap-2">
                              {#each maleWeightFilters as filter}
                                <button
                                  type="button"
                                  class={`${resultFilterButtonClass(selectedWeightFilter === filter.id)} w-full`}
                                  on:click={() => {
                                    selectWeightFilter(filter.id);
                                    closeRegistrationFilterPopover();
                                  }}
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
                  class={`${resultFilterButtonClass(selectedAgeFilter !== 'ALL')} flex min-w-[170px] items-center justify-between gap-3`}
                  on:click|stopPropagation={() => toggleRegistrationFilterPopover('age')}
                >
                  <div class="flex flex-col text-left leading-tight">
                    <span class="font-semibold">{$_('contest_detail.registrations.filters.age_button')}</span>
                    <span class="text-text-secondary">{registrationAgeSelectionLabel}</span>
                  </div>
                  <ChevronDown
                    class={`h-3.5 w-3.5 transition-transform ${openRegistrationFilter === 'age' ? 'rotate-180' : ''}`}
                    aria-hidden="true"
                  />
                </button>
                {#if openRegistrationFilter === 'age'}
                  <div
                    class="absolute left-0 top-full z-40 mt-2 w-60 rounded border border-border-color bg-element-bg px-3 py-3 shadow-lg"
                    on:click|stopPropagation
                  >
                    <div class="grid max-h-52 grid-cols-2 gap-2 overflow-y-auto pr-1">
                      {#each availableAgeFilters as filter}
                        <button
                          type="button"
                          class={`${resultFilterButtonClass(selectedAgeFilter === filter.id)} w-full`}
                          on:click={() => {
                            selectAgeFilter(filter.id);
                            closeRegistrationFilterPopover();
                          }}
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
                  class={`${resultFilterButtonClass(selectedLabelFilter !== 'ALL')} flex min-w-[170px] items-center justify-between gap-3`}
                  on:click|stopPropagation={() => toggleRegistrationFilterPopover('labels')}
                >
                  <div class="flex flex-col text-left leading-tight">
                    <span class="font-semibold">{$_('contest_detail.registrations.filters.labels_button')}</span>
                    <span class="text-text-secondary">{registrationLabelSelectionLabel}</span>
                  </div>
                  <ChevronDown
                    class={`h-3.5 w-3.5 transition-transform ${openRegistrationFilter === 'labels' ? 'rotate-180' : ''}`}
                    aria-hidden="true"
                  />
                </button>
                {#if openRegistrationFilter === 'labels'}
                  <div
                    class="absolute left-0 top-full z-40 mt-2 w-60 rounded border border-border-color bg-element-bg px-3 py-3 shadow-lg"
                    on:click|stopPropagation
                  >
                    <div class="grid max-h-52 grid-cols-2 gap-2 overflow-y-auto pr-1">
                      {#each availableLabelFilters as filter}
                        <button
                          type="button"
                          class={`${resultFilterButtonClass(selectedLabelFilter === filter.id)} w-full`}
                          on:click={() => {
                            selectLabelFilter(filter.id);
                            closeRegistrationFilterPopover();
                          }}
                        >
                          {filter.label}
                        </button>
                      {/each}
                    </div>
                  </div>
                {/if}
              </div>

              {#if hasRegistrationFiltersActive}
                <button
                  type="button"
                  class="ml-auto text-xxs text-text-secondary underline decoration-dotted decoration-1 underline-offset-4"
                  on:click={clearRegistrationFilters}
                >
                  {$_('contest_detail.registrations.filters.clear')}
                </button>
              {/if}
            </div>
            {#if registrations.length === 0}
              <div class="text-center py-8 text-text-secondary">{$_('contest_detail.registrations.empty')}</div>
            {:else if deadliftRows.length === 0}
              <div class="text-center py-8 text-text-secondary">{$_('contest_detail.registrations.empty_filter')}</div>
            {:else}
              <div class="max-h-[70vh] overflow-x-auto overflow-y-auto">
                <UnifiedContestTable
                  rows={deadliftRows}
                  sortColumn={sortColumn}
                  sortDirection={sortDirection}
                  readOnly={false}
                  activeFlight={activeFlight}
                  lifts={LIFT_SINGLETONS.Deadlift}
                  weightClasses={weightClasses}
                  ageCategories={ageCategories}
                  currentAttemptId={liveCurrentAttempt?.id ?? null}
                  currentAttemptLoading={setCurrentLoading}
                  onSortChange={handleSortChange}
                  onOpenCompetitorModal={openCompetitorModal}
                  onSetCurrentAttempt={setCurrentAttemptHandler}
                  onAttemptStatusCycle={handleStatusClick}
                  onAttemptWeightChange={handleAttemptWeightChangeInline}
                />
              </div>
            {/if}
          </div>
        </section>
      {:else}
        <section class="space-y-4">
          <div class="card space-y-4">
            <header class="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <h3 class="text-h3 text-text-primary">{$_('contest_detail.backups.title')}</h3>
                <p class="text-body text-text-secondary">{$_('contest_detail.backups.subtitle')}</p>
              </div>
              <a class="btn-secondary px-3 py-1 text-xxs" href="/settings">{$_('contest_detail.backups.manage_link')}</a>
            </header>

            {#if globalBackups}
              <div class="grid gap-3 md:grid-cols-3 text-caption text-text-secondary uppercase tracking-[0.35em]">
                <span>{$_('contest_detail.backups.total', { values: { count: globalBackups.total } })}</span>
                <span>{$_('contest_detail.backups.last_run', { values: { timestamp: formatBackupTimestamp(globalBackups.timestamp) } })}</span>
                <span>{$_('contest_detail.backups.last_size', { values: { size: formatBackupSize(lastBackupRecord?.size) } })}</span>
              </div>

              {#if globalBackups.backups && globalBackups.backups.length > 0}
                <div class="overflow-x-auto">
                  <table class="min-w-full text-left text-sm text-text-secondary">
                    <thead class="bg-element-bg text-label">
                      <tr>
                        <th class="px-4 py-3">{$_('contest_detail.backups.columns.timestamp')}</th>
                        <th class="px-4 py-3">{$_('contest_detail.backups.columns.size')}</th>
                        <th class="px-4 py-3">{$_('contest_detail.backups.columns.contests')}</th>
                        <th class="px-4 py-3">{$_('contest_detail.backups.columns.competitors')}</th>
                        <th class="px-4 py-3">{$_('contest_detail.backups.columns.registrations')}</th>
                        <th class="px-4 py-3">{$_('contest_detail.backups.columns.attempts')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {#each globalBackups.backups.slice(0, 5) as backup}
                        <tr class="border-b border-border-color last:border-b-0">
                          <td class="px-4 py-3 text-text-secondary">{formatBackupTimestamp(backup.timestamp)}</td>
                          <td class="px-4 py-3 text-text-secondary">{formatBackupSize(backup.size)}</td>
                          <td class="px-4 py-3 text-text-secondary">{backup.recordCounts?.contests ?? 0}</td>
                          <td class="px-4 py-3 text-text-secondary">{backup.recordCounts?.competitors ?? 0}</td>
                          <td class="px-4 py-3 text-text-secondary">{backup.recordCounts?.registrations ?? 0}</td>
                          <td class="px-4 py-3 text-text-secondary">{backup.recordCounts?.attempts ?? 0}</td>
                        </tr>
                      {/each}
                    </tbody>
                  </table>
                </div>
              {:else}
                <p class="text-body text-text-secondary">{$_('contest_detail.backups.empty')}</p>
              {/if}
            {:else}
              <p class="text-body text-text-secondary">{$_('contest_detail.backups.not_available')}</p>
            {/if}
          </div>
        </section>
      {/if}
    </div>
  {/if}




</Layout>
