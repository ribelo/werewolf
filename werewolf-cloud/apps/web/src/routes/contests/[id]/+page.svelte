<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import Layout from '$lib/components/Layout.svelte';
  import CompetitorModal from '$lib/components/CompetitorModal.svelte';
  import RegistrationDetailModal from '$lib/components/RegistrationDetailModal.svelte';
  import AttemptEditorModal from '$lib/components/AttemptEditorModal.svelte';
  import ContestCategoryModal from '$lib/components/ContestCategoryModal.svelte';
import { getStatusClasses, formatCompetitorName, formatWeight } from '$lib/utils';
import { apiClient, ApiError } from '$lib/api';
import { realtimeClient } from '$lib/realtime';
import { modalStore } from '$lib/ui/modal';
import { toast } from '$lib/ui/toast';
  import { contestStore, currentAgeCategories, currentWeightClasses } from '$lib/ui/contest-store';
  import { setContestContext } from '$lib/ui/context-helpers';
  import { getAttemptStatusClass, getAttemptStatusLabel } from '$lib/ui/status';
  import { buildRisingBarQueue, type QueuePhase } from '$lib/rising-bar';
  import UnifiedContestTable from '$lib/components/UnifiedContestTable.svelte';
  import { buildUnifiedRows, deriveContestLifts, sortUnifiedRows, type UnifiedRow, type LiftKind } from '$lib/contest-table';
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
    ContestRankingEntry,
    ContestPlateSetEntry,
    ContestBarWeights,
    BackupSummary,
    ContestCategories,
  } from '$lib/types';
  import { bundleToCurrentAttempt } from '$lib/current-attempt';
  import { _ } from 'svelte-i18n';
  import { get } from 'svelte/store';
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

  type WeightFilter = 'OPEN' | string;
  type SexFilter = 'ALL' | 'FEMALE' | 'MALE';
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

  let statusLoading: Record<string, boolean> = {};
  let setCurrentLoading: Record<string, boolean> = {};
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
  let selectedWeightFilter: WeightFilter = 'OPEN';
  let availableWeightFilters: Array<{ id: WeightFilter; label: string }> = [];
  let selectedSexFilter: SexFilter = 'ALL';
  let availableSexFilters: Array<{ id: SexFilter; label: string }> = [];
  let selectedAgeFilter: AgeFilter = 'ALL';
  let availableAgeFilters: Array<{ id: AgeFilter; label: string }> = [];
  let selectedLabelFilter: LabelFilter = 'ALL';
  let availableLabelFilters: Array<{ id: LabelFilter; label: string }> = [];
  let showFlightModal = false;
  const FLIGHT_CODES = Array.from({ length: 26 }, (_, index) => String.fromCharCode(65 + index));
  const FLIGHT_CODE_REGEX = /^[A-Z]$/;
  const DEFAULT_FLIGHT_CODE = 'A';
  let autoFlightSize = 10;
  let flightDrafts: Record<string, { flightCode: string; flightOrder: number | null }> = {};
  let unifiedRows: UnifiedRow[] = [];
  let sortedRows: UnifiedRow[] = [];
  let filteredRows: UnifiedRow[] = [];
  let tablePrefsLoaded = false;

  $: if (contestId && !tablePrefsLoaded) {
    const prefs = readTablePrefs();
    if (prefs) {
      sortColumn = prefs.sortColumn || sortColumn;
      sortDirection = prefs.sortDirection;
      selectedWeightFilter = prefs.weightFilter ?? selectedWeightFilter;
      selectedSexFilter = prefs.sexFilter ?? selectedSexFilter;
      selectedAgeFilter = prefs.ageFilter ?? selectedAgeFilter;
      selectedLabelFilter = prefs.labelFilter ?? selectedLabelFilter;
    }
    tablePrefsLoaded = true;
  }

  $: if (tablePrefsLoaded && contestId && browser) {
    persistTablePrefs();
  }

  type ResultView = 'open' | 'age' | 'weight';
  const RESULT_VIEWS: Array<{ id: ResultView; labelKey: string }> = [
    { id: 'open', labelKey: 'contest_detail.results.views.open' },
    { id: 'age', labelKey: 'contest_detail.results.views.age' },
    { id: 'weight', labelKey: 'contest_detail.results.views.weight' },
  ];
  let selectedResultView: ResultView = 'open';
  let openRanking: ContestRankingEntry[] = resultsOpen ?? [];
  let ageRanking: ContestRankingEntry[] = resultsAge ?? [];
  let weightRanking: ContestRankingEntry[] = resultsWeight ?? [];
  let resultsLoading = false;
  let exportingResults = false;
  let resultsError: string | null = null;

  let contestPlateSets: ContestPlateSetEntry[] = plateSets ?? [];
  let attemptWeightStep: number = deriveAttemptStep(contestPlateSets);
  let contestBarWeights: ContestBarWeights | null = barWeights ?? null;
  let mensBarWeightSetting: number | null = contestBarWeights?.mensBarWeight ?? contest?.mensBarWeight ?? null;
  let womensBarWeightSetting: number | null = contestBarWeights?.womensBarWeight ?? contest?.womensBarWeight ?? null;
  let defaultBarWeightSetting: number | null = contestBarWeights?.barWeight ?? contest?.mensBarWeight ?? null;
  let clampWeightSetting: number | null = contestBarWeights?.clampWeight ?? contest?.clampWeight ?? 2.5;
  let globalBackups: BackupSummary | null = backupsSummary ?? null;

  type TablePrefs = {
    sortColumn: string;
    sortDirection: 'asc' | 'desc';
    weightFilter: WeightFilter;
    sexFilter: SexFilter;
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
            : 'OPEN';
      const weightPref: WeightFilter =
        savedWeightFilter && savedWeightFilter.length > 0 ? savedWeightFilter : 'OPEN';
      const savedSexFilter =
        typeof parsed.sexFilter === 'string' && (parsed.sexFilter === 'FEMALE' || parsed.sexFilter === 'MALE')
          ? (parsed.sexFilter as SexFilter)
          : 'ALL';
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
        sexFilter: savedSexFilter,
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
        sexFilter: selectedSexFilter,
        ageFilter: selectedAgeFilter,
        labelFilter: selectedLabelFilter,
      };
      localStorage.setItem(getTablePrefsKey(contestId), JSON.stringify(payload));
    } catch (error) {
      console.warn('Failed to persist table preferences', error);
    }
  }

  function resolveSexFilterId(value: string | null | undefined): SexFilter | null {
    const raw = (value ?? '').trim();
    if (!raw) return null;
    const lowered = raw.toLowerCase();
    if (lowered.startsWith('f') || lowered.startsWith('k')) {
      return 'FEMALE';
    }
    if (lowered.startsWith('m')) {
      return 'MALE';
    }
    return null;
  }

  function sexSortOrder(id: SexFilter): number {
    switch (id) {
      case 'FEMALE':
        return 0;
      case 'MALE':
        return 1;
      default:
        return 10;
    }
  }

  function sexFilterLabel(id: SexFilter): string {
    switch (id) {
      case 'FEMALE':
        return t('contest_detail.registrations.filters.sex_female');
      case 'MALE':
        return t('contest_detail.registrations.filters.sex_male');
      default:
        return t('contest_detail.registrations.filters.sex_all');
    }
  }

  function normaliseLabelKey(label: string): string {
    return label.trim().toLowerCase();
  }

  const TABS = [
    { id: 'desk', labelKey: 'contest_detail.tabs.desk' },
    { id: 'registrations', labelKey: 'contest_detail.tabs.main_table' },
    { id: 'results', labelKey: 'contest_detail.tabs.results' },
    { id: 'plates', labelKey: 'contest_detail.tabs.plates' },
    { id: 'backups', labelKey: 'contest_detail.tabs.backups' }
  ] as const;

  type TabId = typeof TABS[number]['id'];
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
    if (view === 'age') return entry.ageCategory ?? t('contest_detail.results.unknown_category');
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

  function displayWeightValue(value?: number | null): string {
    if (value === undefined || value === null) return '–';
    return formatWeight(Number(value));
  }

  async function reloadResults() {
    resultsLoading = true;
    resultsError = null;
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
        resultsError = respError;
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : t('contest_detail.results.reload_failed');
      resultsError = message;
      toast.error(message);
    } finally {
      resultsLoading = false;
    }
  }

  async function recalcResults() {
    resultsLoading = true;
    try {
      const response = await apiClient.post(`/contests/${contestId}/results/recalculate`);
      if (response.error) {
        throw new Error(response.error);
      }
      toast.success(t('contest_detail.results.toast_recalc_success'));
    } catch (err) {
      const message = err instanceof Error ? err.message : t('contest_detail.results.toast_recalc_error');
      toast.error(message);
    } finally {
      await reloadResults();
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
  $: availableWeightFilters = (() => {
        const seen = new Set<string>();
        const entries: Array<{ id: string; label: string }> = [];
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
            const label = (entry.name ?? entry.code ?? '').toString();
            if (!id || !label) return;
            if (seen.has(id)) return;
            seen.add(id);
            entries.push({ id, label });
          });

        return [
          { id: 'OPEN' as WeightFilter, label: t('contest_detail.registrations.filters.open') },
          ...entries.map((entry) => ({ id: entry.id as WeightFilter, label: entry.label })),
        ];
      })();
  $: availableSexFilters = (() => {
        const seen = new Set<SexFilter>();
        registrations.forEach((registration) => {
          const resolved = resolveSexFilterId(registration.gender);
          if (resolved) {
            seen.add(resolved);
          }
        });
        const ordered = Array.from(seen).sort((a, b) => sexSortOrder(a) - sexSortOrder(b));
        return [
          { id: 'ALL' as SexFilter, label: t('contest_detail.registrations.filters.sex_all') },
          ...ordered.map((id) => ({ id, label: sexFilterLabel(id) })),
        ];
      })();
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
            const labelA = (a.name ?? a.code ?? '').toString();
            const labelB = (b.name ?? b.code ?? '').toString();
            return labelA.localeCompare(labelB, undefined, { sensitivity: 'base' });
          })
          .forEach((category) => {
            const id = (category.id ?? category.code ?? '').toString();
            const label = (category.name ?? category.code ?? '').toString();
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
  $: mensBarWeightSetting = contestBarWeights?.mensBarWeight ?? contest?.mensBarWeight ?? null;
  $: womensBarWeightSetting = contestBarWeights?.womensBarWeight ?? contest?.womensBarWeight ?? null;
  $: defaultBarWeightSetting = contestBarWeights?.barWeight ?? contest?.mensBarWeight ?? null;
  $: clampWeightSetting = contestBarWeights?.clampWeight ?? contest?.clampWeight ?? 2.5;
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
        const weightMatch =
          selectedWeightFilter === 'OPEN' || registration.weightClassId === selectedWeightFilter;
        if (!weightMatch) return false;

        const resolvedSex = resolveSexFilterId(registration.gender);
        const sexMatch =
          selectedSexFilter === 'ALL' ||
          (resolvedSex !== null && resolvedSex === selectedSexFilter);
        if (!sexMatch) return false;

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
  $: activeFlight = contest?.activeFlight ?? null;
  $: if (selectedWeightFilter !== 'OPEN' && !availableWeightFilters.some((item) => item.id === selectedWeightFilter)) {
        selectedWeightFilter = 'OPEN';
      }
  $: if (selectedSexFilter !== 'ALL' && !availableSexFilters.some((item) => item.id === selectedSexFilter)) {
        selectedSexFilter = 'ALL';
      }
  $: if (selectedAgeFilter !== 'ALL' && !availableAgeFilters.some((item) => item.id === selectedAgeFilter)) {
        selectedAgeFilter = 'ALL';
      }
  $: if (selectedLabelFilter !== 'ALL' && !availableLabelFilters.some((item) => item.id === selectedLabelFilter)) {
        selectedLabelFilter = 'ALL';
      }
  $: displayedResults = selectedResultView === 'open'
    ? openRanking
    : selectedResultView === 'age'
      ? ageRanking
      : weightRanking;
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

  function queueLotLabel(attempt: Attempt): string {
    const registration = registrationMap.get(attempt.registrationId);
    const rawLot = (attempt.lotNumber ?? registration?.lotNumber ?? '').trim();
    if (rawLot) {
      return t('contest_detail.current.queue_lot', { lot: rawLot });
    }
    return t('contest_detail.current.queue_lot_unknown');
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
        lotNumber: current.lotNumber ?? null,
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
      lotNumber: attempt.lotNumber ?? null,
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
      const barOverride = isFemale
        ? (womensBarWeightSetting ?? defaultBarWeightSetting ?? null)
        : (mensBarWeightSetting ?? defaultBarWeightSetting ?? null);

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
        ...(barOverride ? { barWeight: barOverride } : {}),
      });

      if (!planResp.error && planResp.data) {
        const plan = planResp.data;
        const bar = plan.barWeight ?? (isFemale ? 15 : 20);
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
          lotNumber: registrationRecord?.lotNumber ?? null,
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

  function selectWeightFilter(filter: WeightFilter) {
    selectedWeightFilter = filter;
  }

  function selectSexFilter(filter: SexFilter) {
    selectedSexFilter = filter;
  }

  function selectAgeFilter(filter: AgeFilter) {
    selectedAgeFilter = filter;
  }

  function selectLabelFilter(filter: LabelFilter) {
    selectedLabelFilter = filter;
  }

  function sanitizeFlightCode(value: string | null | undefined): string {
    if (!value) return DEFAULT_FLIGHT_CODE;
    const trimmed = value.trim().toUpperCase();
    return FLIGHT_CODE_REGEX.test(trimmed) ? trimmed : DEFAULT_FLIGHT_CODE;
  }

  function normalizeFlightOrder(value: number | null | undefined): number | null {
    if (value === null || value === undefined) {
      return null;
    }
    const integer = Math.trunc(value);
    return Number.isNaN(integer) ? null : integer;
  }

  function openFlightManager() {
    const drafts: Record<string, { flightCode: string; flightOrder: number | null }> = {};
    registrations.forEach((reg) => {
      drafts[reg.id] = {
        flightCode: sanitizeFlightCode(reg.flightCode),
        flightOrder: normalizeFlightOrder(reg.flightOrder),
      };
    });
    flightDrafts = drafts;
    showFlightModal = true;
  }

  function closeFlightManager() {
    showFlightModal = false;
  }

  function updateFlightDraft(
    registrationId: string,
    partial: { flightCode?: string | null; flightOrder?: number | null }
  ) {
    const current = flightDrafts[registrationId] ?? {
      flightCode: DEFAULT_FLIGHT_CODE,
      flightOrder: null,
    };

    const nextFlightCode =
      partial.flightCode !== undefined
        ? sanitizeFlightCode(partial.flightCode)
        : current.flightCode;
    const nextFlightOrder =
      partial.flightOrder !== undefined
        ? normalizeFlightOrder(partial.flightOrder)
        : current.flightOrder;

    flightDrafts = {
      ...flightDrafts,
      [registrationId]: {
        flightCode: nextFlightCode,
        flightOrder: nextFlightOrder,
      },
    };
  }

  function flightSortWeight(registration: Registration): number {
    const row = unifiedRows.find((entry) => entry.registration.id === registration.id);
    if (row) {
      return row.maxLift > 0 ? row.maxLift : row.total;
    }
    return registration.bodyweight ?? 0;
  }

  function autoAssignFlights(): void {
    const size = Math.max(1, Math.floor(Number(autoFlightSize) || 0));
    const sorted = [...registrations].sort((a, b) => {
      const weightDiff = flightSortWeight(a) - flightSortWeight(b);
      if (weightDiff !== 0) return weightDiff;
      const bodyDiff = (a.bodyweight ?? 0) - (b.bodyweight ?? 0);
      if (bodyDiff !== 0) return bodyDiff;
      return `${a.lastName} ${a.firstName}`.localeCompare(
        `${b.lastName} ${b.firstName}`,
        undefined,
        { sensitivity: 'base' }
      );
    });

    const nextDrafts: Record<string, { flightCode: string; flightOrder: number | null }> = {};
    const flightCounts: Record<string, number> = {};

    sorted.forEach((reg, index) => {
      const flightIndex = Math.min(Math.floor(index / size), FLIGHT_CODES.length - 1);
      const flightCode = FLIGHT_CODES[flightIndex] ?? FLIGHT_CODES[FLIGHT_CODES.length - 1];
      const order = (flightCounts[flightCode] ?? 0) + 1;
      flightCounts[flightCode] = order;
      nextDrafts[reg.id] = {
        flightCode,
        flightOrder: order,
      };
    });

    flightDrafts = nextDrafts;
  }

  function resetAllFlights(): void {
    const drafts: Record<string, { flightCode: string; flightOrder: number | null }> = {};
    registrations.forEach((reg) => {
      drafts[reg.id] = {
        flightCode: DEFAULT_FLIGHT_CODE,
        flightOrder: null,
      };
    });
    flightDrafts = drafts;
  }

  async function saveFlightAssignments() {
    if (!contestId) {
      showFlightModal = false;
      return;
    }

    const assignments = registrations
      .map((reg) => {
        const draft = flightDrafts[reg.id] ?? {
          flightCode: DEFAULT_FLIGHT_CODE,
          flightOrder: null,
        };

        const normalizedCode = sanitizeFlightCode(draft.flightCode);
        const normalizedOrder = normalizeFlightOrder(draft.flightOrder);

        const currentCodeRaw = reg.flightCode ? reg.flightCode.trim().toUpperCase() : null;
        const currentOrder = reg.flightOrder ?? null;

        const codeChanged =
          currentCodeRaw === null ? true : currentCodeRaw !== normalizedCode;
        const orderChanged = normalizedOrder !== currentOrder;

        if (!codeChanged && !orderChanged) {
          return null;
        }

        return {
          registrationId: reg.id,
          flightCode: normalizedCode,
          flightOrder: normalizedOrder,
        };
      })
      .filter(
        (
          assignment
        ): assignment is {
          registrationId: string;
          flightCode: string;
          flightOrder: number | null;
        } => Boolean(assignment)
      );

    if (assignments.length === 0) {
      showFlightModal = false;
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
      showFlightModal = false;
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
        },
      });

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
      } else if (result) {
        toast.success(t('contest_detail.toast.competitor_updated'));
      }
    } catch (error) {
      console.error('Modal error:', error);
      toast.error(t('contest_detail.toast.competitor_update_failed'));
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

<svelte:head>
  <title>{contest?.name ?? t('contest_detail.fallback_title')} • Werewolf Powerlifting</title>
</svelte:head>



<Layout
  title={contest?.name ?? t('contest_detail.fallback_title')}
  subtitle={$_('contest_detail.subtitle')}
  currentPage="contests"
  apiBase={apiBase}
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
        {#each TABS as tab}
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
                      <p class="text-caption text-text-secondary">{queueLotLabel(attempt)}</p>
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
                <p class="text-body text-text-secondary">{$_('contest_detail.registrations.subtitle')}</p>
                <p class="text-caption text-text-secondary mt-1">{$_('contest_detail.registrations.coefficient_notice')}</p>
              </div>
              <div class="flex flex-wrap items-center gap-3">
                <button type="button" class="btn-secondary px-3 py-1" on:click={openCategoryManager}>
                  {$_('contest_detail.registrations.manage_categories')}
                </button>
                <button type="button" class="btn-secondary px-3 py-1" on:click={openFlightManager}>
                  {$_('contest_detail.registrations.manage_flights')}
                </button>
                <span class="text-caption text-text-secondary uppercase tracking-[0.4em]">{registrationsSummary}</span>
              </div>
            </header>
            <div class="space-y-2">
              <div class="flex flex-wrap items-center gap-2 rounded border border-border-color bg-element-bg/40 px-3 py-2" role="group" aria-label={$_('contest_detail.registrations.filters.weights')}>
                <span class="text-xxs uppercase tracking-[0.3em] text-text-secondary">{$_('contest_detail.registrations.filters.weights')}</span>
                {#each availableWeightFilters as filter}
                  <button
                    type="button"
                    class={`px-3 py-1 text-xxs ${selectedWeightFilter === filter.id ? 'btn-primary text-black' : 'btn-secondary'}`}
                    on:click={() => selectWeightFilter(filter.id)}
                  >
                    {filter.label}
                  </button>
                {/each}
              </div>
              <div class="flex flex-wrap items-center gap-2 rounded border border-border-color bg-element-bg/40 px-3 py-2" role="group" aria-label={$_('contest_detail.registrations.filters.sex')}>
                <span class="text-xxs uppercase tracking-[0.3em] text-text-secondary">{$_('contest_detail.registrations.filters.sex')}</span>
                {#each availableSexFilters as filter}
                  <button
                    type="button"
                    class={`px-3 py-1 text-xxs ${selectedSexFilter === filter.id ? 'btn-primary text-black' : 'btn-secondary'}`}
                    on:click={() => selectSexFilter(filter.id)}
                  >
                    {filter.label}
                  </button>
                {/each}
              </div>
              <div class="flex flex-wrap items-center gap-2 rounded border border-border-color bg-element-bg/40 px-3 py-2" role="group" aria-label={$_('contest_detail.registrations.filters.age')}>
                <span class="text-xxs uppercase tracking-[0.3em] text-text-secondary">{$_('contest_detail.registrations.filters.age')}</span>
                {#each availableAgeFilters as filter}
                  <button
                    type="button"
                    class={`px-3 py-1 text-xxs ${selectedAgeFilter === filter.id ? 'btn-primary text-black' : 'btn-secondary'}`}
                    on:click={() => selectAgeFilter(filter.id)}
                  >
                    {filter.label}
                  </button>
                {/each}
              </div>
              <div class="flex flex-wrap items-center gap-2 rounded border border-border-color bg-element-bg/40 px-3 py-2" role="group" aria-label={$_('contest_detail.registrations.filters.labels')}>
                <span class="text-xxs uppercase tracking-[0.3em] text-text-secondary">{$_('contest_detail.registrations.filters.labels')}</span>
                {#each availableLabelFilters as filter}
                  <button
                    type="button"
                    class={`px-3 py-1 text-xxs ${selectedLabelFilter === filter.id ? 'btn-primary text-black' : 'btn-secondary'}`}
                    on:click={() => selectLabelFilter(filter.id)}
                  >
                    {filter.label}
                  </button>
                {/each}
              </div>
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
                  weightClasses={weightClasses}
                  ageCategories={ageCategories}
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
      {:else if activeTab === 'results'}
        <section class="space-y-4">
          <div class="card space-y-4">
            <header class="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <h3 class="text-h3 text-text-primary">{$_('contest_detail.results.title')}</h3>
                <p class="text-body text-text-secondary">{$_('contest_detail.results.subtitle')}</p>
              </div>
              <div class="flex flex-wrap items-center gap-2">
                {#each RESULT_VIEWS as option}
                  <button
                    type="button"
                    class={`px-3 py-1 text-xxs uppercase tracking-[0.35em] border-2 transition ${
                      selectedResultView === option.id
                        ? 'bg-primary-red text-black border-primary-red'
                        : 'border-border-color text-text-secondary hover:border-primary-red hover:text-text-primary'
                    }`}
                    on:click={() => (selectedResultView = option.id)}
                    disabled={resultsLoading && selectedResultView === option.id}
                  >
                    {$_(option.labelKey)}
                  </button>
                {/each}
              </div>
            </header>

            <div class="flex flex-wrap items-center justify-between gap-3">
              <span class="text-caption uppercase tracking-[0.35em] text-text-secondary">{resultsSummaryLabel}</span>
              <div class="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  class="btn-secondary px-3 py-1 text-xxs"
                  on:click={recalcResults}
                  disabled={resultsLoading}
                >
                  {resultsLoading ? $_('contest_detail.results.recalculating') : $_('contest_detail.results.recalculate')}
                </button>
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
                      <th class="px-4 py-3">{$_('contest_detail.results.columns.place')}</th>
                      <th class="px-4 py-3">{$_('contest_detail.results.columns.lifter')}</th>
                      {#if selectedResultView !== 'open'}
                        <th class="px-4 py-3">
                          {selectedResultView === 'age'
                            ? $_('contest_detail.results.columns.age_category')
                            : $_('contest_detail.results.columns.weight_class')}
                        </th>
                      {/if}
                      <th class="px-4 py-3">{$_('contest_detail.results.columns.best_squat')}</th>
                      <th class="px-4 py-3">{$_('contest_detail.results.columns.best_bench')}</th>
                      <th class="px-4 py-3">{$_('contest_detail.results.columns.best_deadlift')}</th>
                      <th class="px-4 py-3">{$_('contest_detail.results.columns.total')}</th>
                      <th class="px-4 py-3">{$_('contest_detail.results.columns.points')}</th>
                      <th class="px-4 py-3 text-right">{$_('contest_detail.results.columns.status')}</th>
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
                          {#if result.lotNumber}
                            <span class="block text-xxs text-text-tertiary">{$_('contest_detail.results.lot_number', { values: { lot: result.lotNumber } })}</span>
                          {/if}
                        </td>
                        {#if selectedResultView !== 'open'}
                          <td class="px-4 py-3 text-text-secondary">{getResultCategory(result, selectedResultView)}</td>
                        {/if}
                        <td class="px-4 py-3 text-text-secondary">{formatLift(result.bestSquat)}</td>
                        <td class="px-4 py-3 text-text-secondary">{formatLift(result.bestBench)}</td>
                        <td class="px-4 py-3 text-text-secondary">{formatLift(result.bestDeadlift)}</td>
                        <td class="px-4 py-3 text-text-secondary">{formatLift(result.totalWeight)}</td>
                        <td class="px-4 py-3 text-text-secondary">{formatPoints(result.coefficientPoints)}</td>
                        <td class="px-4 py-3 text-right">
                          {#if result.isDisqualified}
                            <span class="inline-flex items-center rounded bg-status-error px-2 py-1 text-xxs font-semibold text-black">
                              {$_('contest_detail.results.disqualified')}
                            </span>
                          {:else if result.brokeRecord}
                            <span class="inline-flex items-center rounded bg-primary-red px-2 py-1 text-xxs font-semibold text-black">
                              {$_('contest_detail.results.record')}
                            </span>
                          {:else}
                            <span class="text-xxs uppercase tracking-[0.3em] text-text-secondary">{$_('contest_detail.results.status_ok')}</span>
                          {/if}
                        </td>
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
                <div class="grid gap-2 md:grid-cols-3 text-caption text-text-secondary uppercase tracking-[0.35em]">
                  <span>{$_('contest_detail.plates.bar_weight_men', { values: { weight: displayWeightValue(contestBarWeights?.mensBarWeight ?? contest?.mensBarWeight ?? null) } })}</span>
                  <span>{$_('contest_detail.plates.bar_weight_women', { values: { weight: displayWeightValue(contestBarWeights?.womensBarWeight ?? contest?.womensBarWeight ?? null) } })}</span>
                  <span>{$_('contest_detail.plates.bar_weight_default', { values: { weight: displayWeightValue(contestBarWeights?.barWeight ?? contest?.mensBarWeight ?? null) } })}</span>
                </div>
              {/if}
            </header>

            {#if hasPlateSets}
              <div class="overflow-x-auto">
                <table class="min-w-full text-left text-sm text-text-secondary">
                  <thead class="bg-element-bg text-label">
                    <tr>
                      <th class="px-4 py-3">{$_('contest_detail.plates.columns.weight')}</th>
                      <th class="px-4 py-3">{$_('contest_detail.plates.columns.quantity')}</th>
                      <th class="px-4 py-3">{$_('contest_detail.plates.columns.color')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {#each contestPlateSets as plate, idx (plate.plateWeight ?? plate.weight ?? idx)}
                      <tr class="border-b border-border-color last:border-b-0">
                        <td class="px-4 py-3 text-text-primary font-semibold">{displayWeightValue(plate.plateWeight ?? plate.weight ?? null)}</td>
                        <td class="px-4 py-3 text-text-secondary">{plate.quantity}</td>
                        <td class="px-4 py-3 text-text-secondary">
                          <div class="flex items-center gap-2">
                            <span class="inline-block h-4 w-4 rounded border border-border-color" style={`background:${plate.color}`}></span>
                            <span>{plate.color}</span>
                          </div>
                        </td>
                      </tr>
                    {/each}
                  </tbody>
                </table>
              </div>
            {:else}
              <div class="space-y-2 text-body text-text-secondary">
                <p>{$_('contest_detail.plates.empty')}</p>
                <a class="btn-secondary inline-flex items-center px-3 py-1 text-xxs" href="/settings">
                  {$_('contest_detail.plates.manage_link')}
                </a>
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


  {#if showFlightModal}
    <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
      <div class="w-full max-w-3xl rounded-lg border border-border-color bg-main-bg shadow-lg">
        <header class="flex items-center justify-between border-b border-border-color px-4 py-3">
          <h3 class="text-h3 text-text-primary">{$_('contest_detail.registrations.manage_flights_title')}</h3>
          <button class="btn-ghost px-2 py-1 text-xxs" on:click={closeFlightManager}>{$_('buttons.close')}</button>
        </header>
        <div class="px-4 py-3 space-y-3">
          <div class="flex flex-wrap items-center justify-between gap-3">
            <div class="flex items-center gap-2">
              <label class="text-xxs uppercase tracking-[0.2em] text-text-secondary" for="auto-flight-size">
                {$_('contest_detail.registrations.auto_assign_size_label')}
              </label>
              <input
                class="input w-24 text-sm"
                type="number"
                min="1"
                id="auto-flight-size"
                bind:value={autoFlightSize}
              />
            </div>
            <div class="flex flex-wrap items-center gap-2">
              <button
                type="button"
                class="btn-secondary px-3 py-2 text-xxs"
                on:click={autoAssignFlights}
              >
                {$_('contest_detail.registrations.auto_assign_action')}
              </button>
              <button
                type="button"
                class="btn-ghost px-3 py-2 text-xxs"
                on:click={resetAllFlights}
              >
                {$_('contest_detail.registrations.reset_flights')}
              </button>
            </div>
          </div>
          <div class="max-h-[60vh] overflow-auto">
            <table class="w-full border-collapse text-sm">
              <thead class="bg-element-bg text-label">
                <tr>
                  <th class="px-3 py-2 text-left">{$_('contest_detail.registrations.columns.lifter')}</th>
                  <th class="px-3 py-2 text-left">{$_('contest_detail.registrations.columns.flight')}</th>
                  <th class="px-3 py-2 text-left">{$_('contest_detail.registrations.columns.flight_order')}</th>
                </tr>
              </thead>
              <tbody>
                {#each registrations as reg (reg.id)}
                  {@const draft = flightDrafts[reg.id] ?? { flightCode: DEFAULT_FLIGHT_CODE, flightOrder: null }}
                  <tr class="border-b border-border-color">
                    <td class="px-3 py-2">
                      <div class="flex flex-col">
                        <span class="font-semibold text-text-primary">{reg.firstName} {reg.lastName}</span>
                        <span class="text-caption text-text-secondary">{reg.club ?? '—'}</span>
                      </div>
                    </td>
                    <td class="px-3 py-2">
                      <select
                        class="input w-full text-sm"
                        value={draft.flightCode}
                        on:change={(event) => {
                          const target = event.currentTarget;
                          if (!(target instanceof HTMLSelectElement)) {
                            return;
                          }
                          updateFlightDraft(reg.id, { flightCode: target.value });
                        }}
                      >
                        {#each FLIGHT_CODES as code}
                          <option value={code}>{code}</option>
                        {/each}
                      </select>
                    </td>
                    <td class="px-3 py-2">
                      <input
                        class="input w-24 text-sm"
                        type="text"
                        inputmode="numeric"
                        pattern="[0-9]*"
                        value={draft.flightOrder ?? ''}
                        on:input={(event) => {
                          const target = event.currentTarget;
                          if (!(target instanceof HTMLInputElement)) {
                            return;
                          }
                          const raw = target.value.trim();
                          const numeric = raw === '' ? null : Number(raw);
                          updateFlightDraft(reg.id, {
                            flightOrder: Number.isFinite(numeric) ? numeric : null
                          });
                        }}
                        placeholder="—"
                      />
                    </td>
                  </tr>
                {/each}
              </tbody>
            </table>
          </div>
        </div>
        <div class="flex items-center justify-end gap-2 border-t border-border-color px-4 py-3">
          <button class="btn-secondary px-3 py-2 text-xxs" on:click={closeFlightManager}>{$_('buttons.cancel')}</button>
          <button class="btn-primary px-3 py-2 text-xxs" on:click={saveFlightAssignments}>{$_('buttons.save')}</button>
        </div>
      </div>
    </div>
  {/if}

</Layout>
