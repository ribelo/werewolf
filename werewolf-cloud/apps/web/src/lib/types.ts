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
  weightClassId: string;
  ageClassId: string;
  bodyweight: number;
  lotNumber: string | null;
  equipmentM: boolean;
  equipmentSm: boolean;
  equipmentT: boolean;
  rackHeightSquat?: number | null;
  rackHeightBench?: number | null;
  personalRecordAtEntry?: number | null;
  reshelCoefficient?: number | null;
  mcculloughCoefficient?: number | null;
  competitionOrder?: number;
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
  registrations: Registration[];
  updatedAt?: string;
}

export interface UI {
  theme: string;
  showWeights: boolean;
}

export interface Competition {
  defaultBarWeight: number;
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

export interface DatabaseStats {
  contests: number;
  competitors: number;
  registrations: number;
}

export interface DatabaseInfo {
  status: string;
  stats: DatabaseStats;
}

export interface WeightClass {
  id: string;
  name: string;
  gender: string;
  minWeight: number;
  maxWeight: number;
}

export interface AgeCategory {
  id: string;
  name: string;
  minAge: number;
  maxAge: number;
}

export interface Attempt {
  id: string;
  registrationId: string;
  liftType: 'Squat' | 'Bench' | 'Deadlift';
  attemptNumber: 1 | 2 | 3;
  weight: number;
  status: 'Pending' | 'Successful' | 'Failed' | 'Skipped';
  judge1Decision?: boolean;
  judge2Decision?: boolean;
  judge3Decision?: boolean;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CurrentAttempt {
  id: string;
  registrationId: string;
  competitorName: string;
  liftType: 'Squat' | 'Bench' | 'Deadlift';
  attemptNumber: 1 | 2 | 3;
  weight: number;
  status: 'Pending' | 'Successful' | 'Failed' | 'Skipped';
}

export interface ReferenceData {
  weightClasses: WeightClass[];
  ageCategories: AgeCategory[];
}

export class ApiError extends Error {
  constructor(public override message: string, public status: number) {
    super(message);
    this.name = 'ApiError';
  }
}

// Real-time WebSocket types
export interface LiveEvent {
  type: 'attempt.upserted' | 'attempt.resultUpdated' | 'attempt.currentSet' | 'heartbeat';
  contestId: string;
  timestamp: string;
  data: any; // Attempt object or current attempt data
}

export type ConnectionStatus = 'connected' | 'connecting' | 'offline';

export interface RealtimeClient {
  connect(contestId: string): void;
  disconnect(): void;
  connectionStatus: Readable<ConnectionStatus>;
  events: Readable<LiveEvent | null>;
}
