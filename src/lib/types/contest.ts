export interface Contest {
  id: string;
  name: string;
  date: string;
  location: string;
  discipline: string;
  competitionType?: string;
  organizer?: string;
  federationRules?: string;
  notes?: string;
  mensBarWeight?: number;
  womensBarWeight?: number;
}

export interface PlateSet {
  id: string;
  contestId: string;
  plateWeight: number;
  quantity: number;
}