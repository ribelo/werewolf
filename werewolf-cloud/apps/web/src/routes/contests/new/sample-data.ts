import {
  AVAILABLE_EVENTS,
  DEFAULT_RACK_BENCH,
  DEFAULT_RACK_SQUAT,
  MANDATORY_TAG_KEY,
  disciplineForEvents,
  normaliseTagSelection,
  normalizeAttemptPlanForGender,
  createAttemptPlan,
  type CompetitorDraft,
  type ContestEvent,
  type ContestForm,
  type Gender,
} from './draft';

/** Randomised demo data behind the wizard's "generate sample" button. */

const CONTEST_NAMES = [
  'Werewolf Classic',
  'Northern Lights Open',
  'Iron Den Invitational',
  'Capital City Throwdown',
  'Vistula Strength Meet',
  'Silver Moon Showdown',
] as const;

const VENUES = [
  'Warsaw',
  'Kraków',
  'Gdańsk',
  'Wrocław',
  'Poznań',
  'Łódź',
  'Katowice',
] as const;

const ORGANIZERS = [
  'Werewolf Powerlifting Club',
  'Northern Strength Association',
  'Iron Den Athletics',
  'Polska Liga Siły',
  'Vistula Barbell',
] as const;

const RULESETS = ['IPF', 'WRPF', 'USAPL', 'URP'] as const;

const CLUBS = [
  'Werewolf PL',
  'Barbell Syndicate',
  'Northern Strength',
  'Vistula Barbell',
  'Katowice Ironworks',
  'Łódź Power Crew',
] as const;

const CITIES = [
  'Warszawa',
  'Kraków',
  'Łódź',
  'Gdynia',
  'Szczecin',
  'Białystok',
  'Lublin',
  'Rzeszów',
] as const;

type NameTuple = readonly [string, string];

const FEMALE_NAMES: readonly NameTuple[] = [
  ['Anna', 'Nowak'],
  ['Magda', 'Kowalska'],
  ['Kinga', 'Wiśniewska'],
  ['Natalia', 'Mazur'],
  ['Julia', 'Baran'],
  ['Marta', 'Lis'],
  ['Karolina', 'Jasińska'],
  ['Ewelina', 'Sobczak'],
  ['Zuzanna', 'Kaczmarek'],
] as const;

const MALE_NAMES: readonly NameTuple[] = [
  ['Paweł', 'Zieliński'],
  ['Tomasz', 'Lewandowski'],
  ['Michał', 'Piotrowski'],
  ['Krzysztof', 'Sikora'],
  ['Piotr', 'Bryk'],
  ['Damian', 'Olszewski'],
  ['Łukasz', 'Kubiak'],
  ['Jakub', 'Konarski'],
] as const;

const NAME_SETS: Record<Gender, readonly NameTuple[]> = {
  Male: MALE_NAMES,
  Female: FEMALE_NAMES,
};

export function randomItem<T>(items: readonly T[]): T {
  const index = Math.floor(Math.random() * items.length);
  const item = items[index];
  if (item === undefined) {
    throw new Error('Cannot select a random item from an empty array');
  }
  return item;
}

function randomDateWithin(days: number): string {
  const base = new Date();
  const offset = Math.floor(Math.random() * days);
  base.setDate(base.getDate() + offset);
  return base.toISOString().slice(0, 10);
}

function randomBodyweight(gender: Gender): number {
  const min = gender === 'Male' ? 70 : 55;
  const max = gender === 'Male' ? 125 : 85;
  const value = min + Math.random() * (max - min);
  return Number(value.toFixed(1));
}

function randomBirthDate(): string {
  const today = new Date();
  const minAge = 18;
  const maxAge = 40;
  const age = minAge + Math.floor(Math.random() * (maxAge - minAge + 1));
  const birth = new Date(
    today.getFullYear() - age,
    Math.floor(Math.random() * 12),
    Math.floor(Math.random() * 28) + 1,
  );
  return birth.toISOString().slice(0, 10);
}

function randomEvents(): ContestEvent[] {
  const shuffled = [...AVAILABLE_EVENTS].sort(() => Math.random() - 0.5);
  const count = Math.random() < 0.4 ? 3 : Math.random() < 0.7 ? 2 : 1;
  return shuffled.slice(0, count);
}

export function randomCompetitorCount(): number {
  return 6 + Math.floor(Math.random() * 4);
}

export function generateSampleForm(currentEvents: readonly ContestEvent[], notes: string): ContestForm {
  const hasCustomEventSelection =
    currentEvents.length !== AVAILABLE_EVENTS.length ||
    currentEvents.some((event, index) => event !== AVAILABLE_EVENTS[index]);
  const events = hasCustomEventSelection ? [...currentEvents] : randomEvents();

  return {
    name: randomItem(CONTEST_NAMES),
    date: randomDateWithin(21),
    location: randomItem(VENUES),
    discipline: disciplineForEvents(events),
    events,
    federationRules: Math.random() < 0.7 ? randomItem(RULESETS) : '',
    organizer: randomItem(ORGANIZERS),
    notes,
  };
}

function buildRandomCompetitor(
  id: string,
  gender: Gender,
  usedNames: Set<string>,
  events: readonly ContestEvent[],
  tagOptions: readonly string[],
): CompetitorDraft {
  const baseNames = NAME_SETS[gender];
  const available = baseNames.filter(
    ([firstName, lastName]) => !usedNames.has(`${firstName}|${lastName}`),
  );
  const [firstName, lastName] = available.length > 0 ? randomItem(available) : randomItem(baseNames);
  usedNames.add(`${firstName}|${lastName}`);

  const rackHeightSquat = DEFAULT_RACK_SQUAT + Math.floor(Math.random() * 5) - 2;
  const rackHeightBench = DEFAULT_RACK_BENCH + Math.floor(Math.random() * 3) - 1;
  const bodyweight = randomBodyweight(gender);
  const randomTags = tagOptions.reduce<string[]>((acc, option) => {
    const key = option.toLowerCase();
    if (key === MANDATORY_TAG_KEY) {
      if (!acc.includes(option)) acc.push(option);
      return acc;
    }
    if (Math.random() < 0.35) {
      acc.push(option);
    }
    return acc;
  }, []);
  const tags = normaliseTagSelection(randomTags, tagOptions);

  return {
    id,
    firstName,
    lastName,
    birthDate: randomBirthDate(),
    gender,
    club: randomItem(CLUBS),
    city: randomItem(CITIES),
    bodyweight,
    rackHeightSquat,
    rackHeightBench,
    lifts: [...events],
    attempts: normalizeAttemptPlanForGender(createAttemptPlan(events, bodyweight, true), gender),
    tags,
  };
}

export function generateSampleCompetitorDrafts(
  events: readonly ContestEvent[],
  count: number,
  tagOptions: readonly string[],
  nextId: () => string,
): CompetitorDraft[] {
  const usedNames = new Set<string>();
  return Array.from({ length: count }, (_, index) => {
    const gender: Gender = index % 2 === 0 ? 'Male' : 'Female';
    return buildRandomCompetitor(nextId(), gender, usedNames, events, tagOptions);
  });
}
