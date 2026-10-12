import {
  ageOnDate,
  entryAgeClass,
  entryWeightClass,
  isDidNotStart,
  mcCulloughCoefficient,
  reshelCoefficient,
  type Attempt,
  type ContestState,
  type Entry,
} from '@werewolf/core'
import * as Option from 'effect/Option'

/**
 * The rows of the 2025 contest table (desk, registrations, lift tables, public screens), computed
 * from the replayed contest. Points of a lift are its best good weight × Reshel × McCullough, as in 2025.
 */
export interface TableRow {
  readonly entry: Entry
  readonly age: number
  readonly ageClassId: string
  readonly ageClass: string
  readonly weightClassId: string
  readonly weightClass: string
  /** Known after weigh-in. */
  readonly reshel: Option.Option<number>
  readonly mccullough: number
  readonly team: string
  readonly labels: ReadonlyArray<string>
  readonly attempts: Readonly<Record<string, ReadonlyArray<Attempt>>>
  readonly best: Readonly<Record<string, number>>
  /** None for a lift the entry does not take or before weigh-in. */
  readonly pointsByLift: Readonly<Record<string, Option.Option<number>>>
  readonly points: Option.Option<number>
  readonly maxLift: number
  readonly didNotStart: ReadonlySet<string>
}

export function computePoints(
  best: number,
  reshel: Option.Option<number>,
  mcc: number,
): Option.Option<number> {
  if (best <= 0) return Option.some(0)
  return Option.map(reshel, (value) => best * value * mcc)
}
const pointsOf = (points: Option.Option<number>) =>
  Option.getOrElse(points, () => Number.NEGATIVE_INFINITY)
export const liftPoints = (row: TableRow, liftId: string) =>
  row.pointsByLift[liftId] ?? Option.none<number>()

export function buildRows(state: ContestState, locale: 'pl' | 'en'): ReadonlyArray<TableRow> {
  const teams = new Map(state.teams.map((team) => [team.id, team.name]))
  const divisions = new Map(state.rulebook.divisions.map((item) => [item.id, item.name[locale]]))
  return state.entries.map((entry) => {
    const ageClassId = Option.getOrElse(entryAgeClass(state, entry), () => '')
    const weightClassId = Option.getOrElse(entryWeightClass(state, entry), () => '')
    const reshel = Option.map(Option.fromUndefinedOr(entry.bodyweight), (bodyweight) =>
      reshelCoefficient(bodyweight, entry.lifter.sex),
    )
    const mccullough = mcCulloughCoefficient(entry.lifter.birthDate, state.date)
    const attempts: Record<string, Array<Attempt>> = {}
    const best: Record<string, number> = {}
    const pointsByLift: Record<string, Option.Option<number>> = {}
    const didNotStart = new Set<string>()
    for (const lift of state.rulebook.lifts) {
      const taken = entry.lifts.some((item) => item.liftId === lift.id)
      const own = state.attempts
        .filter((attempt) => attempt.entryId === entry.id && attempt.liftId === lift.id)
        .toSorted((a, b) => a.number - b.number)
      attempts[lift.id] = own
      best[lift.id] = own.reduce(
        (top, attempt) =>
          attempt._tag === 'Judged' && attempt.verdict === 'goodLift' && attempt.weight > top
            ? attempt.weight
            : top,
        0,
      )
      pointsByLift[lift.id] = taken
        ? computePoints(best[lift.id] ?? 0, reshel, mccullough)
        : Option.none()
      if (isDidNotStart(state, entry.id, lift.id)) didNotStart.add(lift.id)
    }
    const taken = entry.lifts.map((item) => item.liftId)
    const points = Option.all(
      taken.map((liftId) => pointsByLift[liftId] ?? Option.none<number>()),
    ).pipe(Option.map((values) => values.reduce((sum, value) => sum + value, 0)))
    return {
      entry,
      age: ageOnDate(entry.lifter.birthDate, state.date),
      ageClassId,
      ageClass:
        state.rulebook.ageClasses.find((item) => item.id === ageClassId)?.name[locale] ?? '',
      weightClassId,
      weightClass:
        state.rulebook.weightClasses.find((item) => item.id === weightClassId)?.name[locale] ?? '',
      reshel,
      mccullough,
      team: entry.lifter.teamId ? (teams.get(entry.lifter.teamId) ?? '') : '',
      labels: entry.divisions.map((id) => divisions.get(id) ?? id),
      attempts,
      best,
      pointsByLift,
      points,
      maxLift: taken.reduce((top, liftId) => Math.max(top, best[liftId] ?? 0), 0),
      didNotStart,
    }
  })
}

export type WeightFilter = string
export interface Filters {
  readonly weight: WeightFilter
  readonly age: string
  readonly label: string
}
export const noFilters: Filters = { weight: 'ALL', age: 'ALL', label: 'ALL' }

export function matches(row: TableRow, filters: Filters): boolean {
  const sex = row.entry.lifter.sex
  const weight =
    filters.weight === 'ALL' ||
    (filters.weight === 'FEMALE_OPEN' && sex === 'female') ||
    (filters.weight === 'MALE_OPEN' && sex === 'male') ||
    row.weightClassId === filters.weight
  const age =
    filters.age === 'ALL' ||
    (filters.age === 'UNASSIGNED' ? row.ageClassId === '' : row.ageClassId === filters.age)
  const label =
    filters.label === 'ALL' ||
    (filters.label === 'UNLABELED'
      ? row.entry.divisions.length === 0
      : row.entry.divisions.some((id) => id === filters.label))
  return weight && age && label
}

export interface FilterOption {
  readonly id: string
  readonly label: string
}
export interface FilterOptions {
  readonly female: ReadonlyArray<FilterOption>
  readonly male: ReadonlyArray<FilterOption>
  readonly age: ReadonlyArray<FilterOption>
  readonly label: ReadonlyArray<FilterOption>
}

export function filterOptions(
  state: ContestState,
  rows: ReadonlyArray<TableRow>,
  locale: 'pl' | 'en',
  lt: (key: string) => string,
): FilterOptions {
  const weight = (sex: 'male' | 'female') =>
    state.rulebook.weightClasses
      .filter((item) => item.sex === sex)
      .map((item) => ({ id: item.id as string, label: item.name[locale] }))
  return {
    female: weight('female'),
    male: weight('male'),
    age: [
      { id: 'ALL', label: lt('contest_detail.registrations.filters.age_all') },
      ...(rows.some((row) => row.ageClassId === '')
        ? [{ id: 'UNASSIGNED', label: lt('contest_detail.registrations.filters.age_unassigned') }]
        : []),
      ...state.rulebook.ageClasses.map((item) => ({
        id: item.id as string,
        label: item.name[locale],
      })),
    ],
    label: [
      { id: 'ALL', label: lt('contest_detail.registrations.filters.labels_all') },
      ...(rows.some((row) => row.entry.divisions.length === 0)
        ? [{ id: 'UNLABELED', label: lt('contest_detail.registrations.filters.labels_unlabeled') }]
        : []),
      ...state.rulebook.divisions.map((item) => ({
        id: item.id as string,
        label: item.name[locale],
      })),
    ],
  }
}

// Sorting follows the 2025 table: the same keys, directions and tie-breaks.
export type SortDirection = 'asc' | 'desc'
const byName = (a: TableRow, b: TableRow) =>
  a.entry.lifter.name.toLowerCase().localeCompare(b.entry.lifter.name.toLowerCase()) ||
  a.entry.id.localeCompare(b.entry.id)
const bodyweightAscending = (a: TableRow, b: TableRow) => {
  const left = a.entry.bodyweight ?? Number.POSITIVE_INFINITY
  const right = b.entry.bodyweight ?? Number.POSITIVE_INFINITY
  return left === right ? 0 : left - right
}
const goodSequence = (row: TableRow, liftId: string) =>
  [0, 1, 2].map((index) => {
    const attempt = row.attempts[liftId]?.[index]
    return attempt && attempt._tag === 'Judged' && attempt.verdict === 'goodLift'
      ? attempt.weight
      : -1
  })
const progression = (a: TableRow, b: TableRow, liftId: string) => {
  const left = goodSequence(a, liftId)
  const right = goodSequence(b, liftId)
  for (let index = 0; index < left.length; index++) {
    const l = left[index] ?? -1
    const r = right[index] ?? -1
    if (l !== r) return r - l
  }
  return 0
}
function liftMaxTieBreak(a: TableRow, b: TableRow, direction: SortDirection, liftId: string) {
  const bodyweight = bodyweightAscending(a, b)
  if (bodyweight !== 0) return bodyweight
  const attempts = progression(a, b, liftId)
  const adjusted = direction === 'asc' ? -attempts : attempts
  if (adjusted !== 0) return adjusted
  const left = pointsOf(liftPoints(a, liftId))
  const right = pointsOf(liftPoints(b, liftId))
  if (left !== right) return direction === 'asc' ? left - right : right - left
  return byName(a, b)
}
function maxLiftOf(row: TableRow): string {
  const taken = row.entry.lifts.map((item) => item.liftId as string)
  return (
    taken.find((liftId) => (row.best[liftId] ?? 0) === row.maxLift && row.maxLift > 0) ??
    taken[0] ??
    ''
  )
}
function maxTieBreak(a: TableRow, b: TableRow, direction: SortDirection) {
  const bodyweight = bodyweightAscending(a, b)
  if (bodyweight !== 0) return bodyweight
  const left = goodSequence(a, maxLiftOf(a))
  const right = goodSequence(b, maxLiftOf(b))
  let attempts = 0
  for (let index = 0; index < left.length && attempts === 0; index++)
    attempts = (right[index] ?? -1) - (left[index] ?? -1)
  const adjusted = direction === 'asc' ? -attempts : attempts
  if (adjusted !== 0) return adjusted
  const pa = pointsOf(a.points)
  const pb = pointsOf(b.points)
  if (pa !== pb) return direction === 'asc' ? pa - pb : pb - pa
  return byName(a, b)
}

export function sortRows(
  rows: ReadonlyArray<TableRow>,
  column: string,
  direction: SortDirection,
  order: ReadonlyMap<string, number>,
): ReadonlyArray<TableRow> {
  const modifier = direction === 'asc' ? 1 : -1
  return rows.toSorted((a, b) => {
    const [kind, liftId = '', number = ''] = column.split(':')
    if (kind === 'max' && liftId) {
      const cmp =
        direction === 'asc'
          ? (a.best[liftId] ?? 0) - (b.best[liftId] ?? 0)
          : (b.best[liftId] ?? 0) - (a.best[liftId] ?? 0)
      return cmp || liftMaxTieBreak(a, b, direction, liftId)
    }
    if (kind === 'points' && liftId) {
      const pa = pointsOf(liftPoints(a, liftId))
      const pb = pointsOf(liftPoints(b, liftId))
      if (pa !== pb) return direction === 'asc' ? pa - pb : pb - pa
      const cmp =
        direction === 'asc'
          ? (a.best[liftId] ?? 0) - (b.best[liftId] ?? 0)
          : (b.best[liftId] ?? 0) - (a.best[liftId] ?? 0)
      return cmp || liftMaxTieBreak(a, b, direction, liftId)
    }
    if (kind === 'attempt' && liftId) {
      const index = Number(number) - 1
      const weight = (row: TableRow) => {
        const attempt = row.attempts[liftId]?.[index]
        return attempt && attempt._tag !== 'Unannounced' ? attempt.weight : Number.NEGATIVE_INFINITY
      }
      const cmp = (weight(a) - weight(b)) * modifier
      if (cmp !== 0 && Number.isFinite(cmp)) return cmp
      if (weight(a) !== weight(b))
        return weight(a) === Number.NEGATIVE_INFINITY ? -modifier : modifier
      return liftMaxTieBreak(a, b, direction, liftId)
    }
    switch (column) {
      case 'name':
        return byName(a, b) * modifier
      case 'gender':
        return (a.entry.lifter.sex.localeCompare(b.entry.lifter.sex) || byName(a, b)) * modifier
      case 'age':
        return (a.age - b.age) * modifier
      case 'bodyweight':
        return (
          ((a.entry.bodyweight ?? Number.POSITIVE_INFINITY) -
            (b.entry.bodyweight ?? Number.POSITIVE_INFINITY) || 0) * modifier
        )
      case 'weightClass':
        return a.weightClass.localeCompare(b.weightClass) * modifier
      case 'ageClass':
        return a.ageClass.localeCompare(b.ageClass) * modifier
      case 'reshel':
        return (pointsOf(a.reshel) - pointsOf(b.reshel) || 0) * modifier
      case 'mccullough':
        return (a.mccullough - b.mccullough) * modifier
      case 'points': {
        const pa = pointsOf(a.points)
        const pb = pointsOf(b.points)
        if (pa !== pb) return direction === 'asc' ? pa - pb : pb - pa
        const max = direction === 'asc' ? a.maxLift - b.maxLift : b.maxLift - a.maxLift
        return max || maxTieBreak(a, b, direction)
      }
      case 'max': {
        const max = direction === 'asc' ? a.maxLift - b.maxLift : b.maxLift - a.maxLift
        return max || maxTieBreak(a, b, direction)
      }
      default: {
        const left = order.get(a.entry.id) ?? Number.POSITIVE_INFINITY
        const right = order.get(b.entry.id) ?? Number.POSITIVE_INFINITY
        if (left === right) return byName(a, b) * modifier
        return (left - right) * modifier
      }
    }
  })
}

/** Weight as the 2025 tables wrote it: 92.5kg, or a dash. */
export const formatWeight = (weight: Option.Option<number> | number) =>
  Option.match(typeof weight === 'number' ? Option.some(weight) : weight, {
    onNone: () => '—',
    onSome: (value) => value + 'kg',
  })
export const formatCoefficient = (value: Option.Option<number> | number) =>
  Option.match(typeof value === 'number' ? Option.some(value) : value, {
    onNone: () => '—',
    onSome: (number) => number.toFixed(3),
  })
