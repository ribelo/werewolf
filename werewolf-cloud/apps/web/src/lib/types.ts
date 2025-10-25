import type { Readable } from 'svelte/store';

export interface ApiResponse<T> {
  data: T;
  error: string | null;
  requestId?: string;
}

export interface ContestSummary {
  id: string;
  name: string;
  date: string;
  location: string;
  discipline: string;
  status: string;
  mensBarWeight: number;
  womensBarWeight: number;
  competitionType?: string | null;
  organizer?: string | null;
  notes?: string | null;
}

export interface CompetitorSummary {
  id: string;
  firstName: string;
  lastName: string;
  birthDate: string;
  gender: string;
  club?: string | null;
  city?: string | null;
  competitionOrder?: number;
}

export interface CompetitorDetail extends CompetitorSummary {
  notes?: string | null;
  photoFormat?: string | null;
  photoMetadata?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CompetitorPhoto {
  data: string;
  format: string | null;
}

export interface Competitor {
  firstName: string;
  lastName: string;
  birthDate: string;
  gender: string;
  club?: string;
  city?: string;
}

export interface Registration {
  id: string;
  competitorId: string;
  firstName: string;
  lastName: string;
  birthDate: string;
  gender: string;
  club?: string;
  city?: string;
  weightClassId: string | null;
  weightClassName?: string | null;
  ageCategoryId: string;
  ageCategoryName?: string | null;
  bodyweight: number | null;
  rackHeightSquat?: number | null;
  rackHeightBench?: number | null;
  reshelCoefficient?: number | null;
  mcculloughCoefficient?: number | null;
  competitionOrder?: number;
  flightCode?: string | null;
  flightOrder?: number | null;
  labels?: string[];
  lifts: LiftType[];
}

export interface RegistrationSummary {
  id: string;
  contestId: string;
  bodyweight: number | null;
  weightClassId: string | null;
  weightClassName?: string | null;
  ageCategoryId?: string | null;
  ageCategoryName?: string | null;
  rackHeightSquat?: number | null;
  rackHeightBench?: number | null;
  competitionOrder?: number | null;
  flightCode?: string | null;
  flightOrder?: number | null;
  labels?: string[];
  lifts: LiftType[];
}

export interface ContestTag {
  id: string;
  contestId: string;
  label: string;
  createdAt: string;
  updatedAt: string;
}

export interface ContestDetail {
  id: string;
  name: string;
  date: string;
  location: string;
  discipline: string;
  status: string;
  mensBarWeight: number;
  womensBarWeight: number;
  clampWeight: number;
  activeFlight?: string | null;
  registrations: Registration[];
  updatedAt?: string;
  competitionType?: string | null;
  organizer?: string | null;
  notes?: string | null;
  federationRules?: string | null;
}

export interface ContestLiveSummary {
  id: string;
  name: string;
  date: string;
  location: string;
  discipline: string;
  status: string;
  mensBarWeight?: number | null;
  womensBarWeight?: number | null;
  clampWeight?: number | null;
  competitionType?: string | null;
}

export interface UI {
  theme: string;
  showWeights: boolean;
}

export interface PlateDefinition {
  weight: number;
  quantity: number;
  color: string;
}

export interface ContestPlateSetEntry {
  contestId?: string;
  plateWeight?: number;
  weight?: number;
  quantity: number;
  color: string;
}

export interface PlatePlanEntry {
  plateWeight: number;
  count: number;
  color: string;
}

export interface PlatePlan {
  plates: PlatePlanEntry[];
  exact: boolean;
  total: number;
  increment: number;
  targetWeight: number;
  barWeight: number;
  weightToLoad: number;
  clampWeight: number;
  clampWeightPerClamp?: number | null;
}

export interface Competition {
  defaultBarWeight: number;
  defaultPlateSet: PlateDefinition[];
}

export interface ContestBarWeights {
  mensBarWeight: number | null;
  womensBarWeight: number | null;
  clampWeight: number | null;
}

export interface Database {
  backupEnabled: boolean;
  autoBackupInterval: number;
}

export interface Settings {
  language: string;
  ui: UI;
  competition: Competition;
  database: Database;
}

export interface SystemHealth {
  status: string;
  timestamp: string;
}

export interface BackupRecord {
  id: string;
  timestamp: string;
  size: number;
  recordCounts: {
    contests: number;
    competitors: number;
    registrations: number;
    attempts: number;
    results: number;
  };
}

export interface BackupSummary {
  backups: BackupRecord[];
  total: number;
  timestamp: string;
}

export interface BackupCreateResult {
  success: boolean;
  backupId: string;
  timestamp: string;
  size: number;
  recordCounts: BackupRecord['recordCounts'];
}

export interface DatabaseStats {
  contests: number;
  competitors: number;
  registrations: number;
}

export interface DatabaseInfo {
  status: string;
  stats: DatabaseStats;
}

export interface ContestRankingEntry {
  id: string;
  registrationId: string;
  contestId: string;
  bestBench?: number | null;
  bestSquat?: number | null;
  bestDeadlift?: number | null;
  totalWeight?: number | null;
  coefficientPoints?: number | null;
  placeOpen?: number | null;
  placeInAgeClass?: number | null;
  placeInWeightClass?: number | null;
  isDisqualified?: boolean | null;
  disqualificationReason?: string | null;
  brokeRecord?: boolean | null;
  recordType?: string | null;
  calculatedAt?: string | null;
  firstName: string;
  lastName: string;
  ageCategory?: string | null;
  weightClass?: string | null;
}

export interface WeightClass {
  id?: string;
  contestId?: string;
  code: string;
  name: string;
  gender: string;
  minWeight: number | null;
  maxWeight: number | null;
  sortOrder?: number | null;
  metadata?: Record<string, unknown> | null;
}

export interface AgeCategory {
  id?: string;
  contestId?: string;
  code: string;
  name: string;
  minAge: number | null;
  maxAge: number | null;
  sortOrder?: number | null;
  metadata?: Record<string, unknown> | null;
}

export type LiftType = 'Squat' | 'Bench' | 'Deadlift';
export type AttemptStatus = 'Pending' | 'Successful' | 'Failed';
export type AttemptNumber = 1 | 2 | 3 | 4;

export interface Attempt {
  id: string;
  registrationId: string;
  liftType: LiftType;
  attemptNumber: AttemptNumber;
  weight: number;
  status: AttemptStatus;
  judge1Decision?: boolean | null;
  judge2Decision?: boolean | null;
  judge3Decision?: boolean | null;
  notes?: string | null;
  timestamp?: string | null;
  createdAt: string;
  updatedAt: string;
  firstName?: string;
  lastName?: string;
  competitorName?: string;
  competitionOrder?: number | null;
}

export interface LiftAttemptSnapshot {
  id: string;
  liftType: LiftType;
  attemptNumber: AttemptNumber;
  weight: number;
  status: AttemptStatus;
  updatedAt?: string | null;
  judge1Decision?: boolean | null;
  judge2Decision?: boolean | null;
  judge3Decision?: boolean | null;
  notes?: string | null;
}

export type AttemptsByLift = Record<LiftType, LiftAttemptSnapshot[]>;

export interface CurrentAttempt {
  id: string;
  registrationId: string;
  competitorName: string;
  liftType: LiftType;
  attemptNumber: AttemptNumber;
  weight: number;
  status: AttemptStatus;
  competitionOrder?: number | null;
  updatedAt?: string | null;
}

export interface CurrentAttemptBundle {
  contest: ContestLiveSummary;
  attempt: Attempt;
  registration: RegistrationSummary;
  competitor: CompetitorSummary;
  attemptsByLift: AttemptsByLift;
  platePlan: PlatePlan;
  highlight: {
    liftType: LiftType;
    attemptNumber: AttemptNumber;
  };
}

export interface ContestCategories {
  weightClasses: WeightClass[];
  ageCategories: AgeCategory[];
}

export type ReferenceData = ContestCategories;

export class ApiError extends Error {
  constructor(public override message: string, public status: number) {
    super(message);
    this.name = 'ApiError';
  }
}

// Real-time WebSocket types
export type LiveEventType =
  | 'attempt.upserted'
  | 'attempt.resultUpdated'
  | 'attempt.currentSet'
  | 'attempt.currentCleared'
  | 'registration.upserted'
  | 'registration.deleted'
  | 'heartbeat';

export interface LiveEvent<T = unknown> {
  type: LiveEventType;
  contestId: string;
  timestamp: string;
  data: T;
  payload?: T;
}

export type ConnectionStatus = 'connected' | 'connecting' | 'offline';

export interface RealtimeClient {
  connect(contestId: string): void;
  disconnect(): void;
  connectionStatus: Readable<ConnectionStatus>;
  events: Readable<LiveEvent | null>;
}
