import type { AttemptNumber, LiftKind, UnifiedRow } from '$lib/contest-table';
import type { TeamResultsTable } from '$lib/types';

/** Tab of the public results page, shareable through the `tab` query parameter. */
export type ResultsTab = 'individual' | 'team';

const RESULTS_TABS: readonly ResultsTab[] = ['individual', 'team'];

/** Unknown or missing `tab` query values fall back to the individual tab. */
export function parseResultsTab(value: string | null | undefined): ResultsTab {
  return RESULTS_TABS.find((tab) => tab === value) ?? 'individual';
}

/** Export request for the scoreboard table of the individual tab. */
export interface ScoreboardExportDetail {
  kind: 'scoreboard';
  format: 'csv' | 'json' | 'pdf' | 'jpg';
  rows: UnifiedRow[];
  lifts: LiftKind[];
  attemptNumbers: AttemptNumber[];
  showPointsColumn: boolean;
  showMaxColumn: boolean;
  showRowNumbers: boolean;
}

/** Export request for the team tab. */
export interface TeamExportDetail {
  kind: 'team';
  format: 'csv' | 'json';
  table: TeamResultsTable;
}

/** Every export request the public results page can receive from its tabs. */
export type ResultsExportDetail = ScoreboardExportDetail | TeamExportDetail;
