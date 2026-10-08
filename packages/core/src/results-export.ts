import * as Option from 'effect/Option'
import { mcCulloughCoefficient, reshelCoefficient } from './coefficients.ts'
import type { ContestState } from './contest.ts'
import type { Attempt, Entry } from './entry.ts'
import { isDidNotStart } from './contest.ts'
import { ageOnDate } from './lifter.ts'
import {
  entryAgeClass,
  entryWeightClass,
  type IndividualRanking,
  type TeamRanking,
} from './results.ts'
import type { AgeClassId, Rulebook } from './rulebook.ts'

type Locale = 'pl' | 'en'
type Named = { readonly id: string; readonly name: { readonly pl: string; readonly en: string } }
/** A ranking as plain text cells, the common input of the PDF, JPG and on-screen tables. */
export interface TableModel {
  readonly title: string
  readonly columns: ReadonlyArray<string>
  readonly rows: ReadonlyArray<ReadonlyArray<string>>
}
export interface TableLabels {
  readonly place: string
  readonly name: string
  readonly team: string
  readonly ageClass: string
  readonly weightClass: string
  readonly bodyweight: string
  readonly result: string
  readonly points: string
  readonly counted: string
  /** The short text DNS (did not start). */
  readonly didNotStart: string
}

/** Trailing zeros are dropped, as in the 2025 export: 370, 58.5, 145.68. */
export function formatDecimal(value: number, decimals: number): string {
  if (!Number.isFinite(value)) return ''
  return value
    .toFixed(decimals)
    .replace(/\.0+$/, '')
    .replace(/(\.\d*?)0+$/, '$1')
}
const escapeCsv = (value: string): string =>
  /[";\n]/.test(value) ? '"' + value.replaceAll('"', '""') + '"' : value
const nameIn = (list: ReadonlyArray<Named>, id: string, locale: Locale) =>
  list.find((item) => item.id === id)?.name[locale] ?? ''

function liftCode(book: Rulebook, liftId: string): string {
  return book.lifts.find((item) => item.id === liftId)?.code ?? liftId.slice(0, 2).toUpperCase()
}
function attemptsOf(state: ContestState, entry: Entry, liftId: string): ReadonlyArray<Attempt> {
  return state.attempts
    .filter((attempt) => attempt.entryId === entry.id && attempt.liftId === liftId)
    .toSorted((left, right) => left.number - right.number)
}
/** A failed attempt is negative; an attempt without a weight is empty. */
function attemptCell(attempts: ReadonlyArray<Attempt>, index: number): string {
  const attempt = attempts[index]
  if (!attempt || attempt._tag === 'Unannounced') return ''
  const weight = formatDecimal(attempt.weight, 2)
  return attempt._tag === 'Judged' && attempt.verdict === 'noLift' ? '-' + weight : weight
}
function bestGood(state: ContestState, entry: Entry, liftId: string): number {
  return Math.max(
    0,
    ...attemptsOf(state, entry, liftId).map((attempt) =>
      attempt._tag === 'Judged' && attempt.verdict === 'goodLift' ? attempt.weight : 0,
    ),
  )
}
function splitName(full: string): readonly [string, string] {
  const trimmed = full.trim()
  const space = trimmed.indexOf(' ')
  return space < 0 ? [trimmed, ''] : [trimmed.slice(0, space), trimmed.slice(space + 1).trim()]
}
/** Federation files always have a fourth attempt column, empty in this format. */
const columnsFor = (state: ContestState, liftId: string) =>
  Math.max(state.rulebook.lifts.find((item) => item.id === liftId)?.attempts ?? 3, 4)

interface Block {
  readonly sex: 'male' | 'female'
  readonly age: Option.Option<AgeClassId>
  readonly entries: Array<Entry>
}

/**
 * The federation CSV of one classification, in the format sent in 2025: BOM, semicolons, a title row,
 * one block per sex and age class (women first) with a header row, places numbered inside each block,
 * failed attempts negative, and a fourth attempt column. Every entry of the classification is listed,
 * ranked ones first, as the 2025 file did.
 */
export function federationCsv(
  state: ContestState,
  ranking: IndividualRanking,
  locale: Locale,
): string {
  const classification = state.rulebook.classifications.find(
    (item) => item.id === ranking.classificationId,
  )
  const liftIds: ReadonlyArray<string> = classification?.liftIds ?? []
  const codes = liftIds.map((id) => liftCode(state.rulebook, id))
  const first = codes[0] ?? ''
  const single = liftIds.length === 1
  const columns = [
    'Place',
    'Name',
    'Surname',
    'Country',
    'Age',
    'Weight',
    'Age Class',
    'Weight Class',
    'Div',
    ...liftIds.flatMap((id, index) =>
      Array.from({ length: columnsFor(state, id) }, (_, n) => (codes[index] ?? '') + (n + 1)),
    ),
    ...(single
      ? ['Total' + first, 'Reshel' + first, 'McCoulogh' + first]
      : ['Total', 'Reshel', 'McCoulogh']),
  ]
  // A lifter who did not enter any lift of the classification has no place in its file.
  const takesPart = (entry: Entry) => entry.lifts.some((item) => liftIds.includes(item.liftId))
  const ranked = ranking.groups.flatMap((group) => group.rows.map((row) => row.entry))
  const dns = new Set(
    ranking.pending.filter((item) => item.reason === 'didNotStart').map((item) => item.entryId),
  )
  // Lifters who did not start come last; they get the place text DNS and no number.
  const waiting = ranking.pending
    .toSorted((a, b) => Number(dns.has(a.entryId)) - Number(dns.has(b.entryId)))
    .flatMap((item) =>
      state.entries.filter((entry) => entry.id === item.entryId && takesPart(entry)),
    )
  const blocks: Array<Block> = []
  for (const entry of [...ranked, ...waiting]) {
    const age = entryAgeClass(state, entry)
    const key = Option.getOrElse(age, () => '')
    let block = blocks.find(
      (item) => item.sex === entry.lifter.sex && Option.getOrElse(item.age, () => '') === key,
    )
    if (!block) {
      block = { sex: entry.lifter.sex, age, entries: [] }
      blocks.push(block)
    }
    block.entries.push(entry)
  }
  const ageOrder = (block: Block) =>
    Option.match(block.age, {
      onNone: () => Number.MAX_SAFE_INTEGER,
      onSome: (id) => state.rulebook.ageClasses.findIndex((item) => item.id === id),
    })
  blocks.sort((a, b) => (a.sex === b.sex ? ageOrder(a) - ageOrder(b) : a.sex === 'female' ? -1 : 1))
  const title = single
    ? (() => {
        const lift = state.rulebook.lifts.find((item) => item.id === liftIds[0])
        return lift?.exportName ?? lift?.name.en ?? ''
      })()
    : (classification?.name.en ?? '')
  const pad = (text: string) => [escapeCsv(text), ...Array(columns.length - 1).fill('')].join(';')
  const lines: Array<string> = [pad(title.toUpperCase() + ' RESULTS')]
  for (const block of blocks) {
    const ageLabel = Option.match(block.age, {
      onNone: () => 'Unassigned',
      onSome: (id) => nameIn(state.rulebook.ageClasses, id, locale),
    })
    lines.push(
      '',
      pad((block.sex === 'male' ? 'MEN' : 'WOMEN') + ' - ' + ageLabel + ' RAW'),
      columns.join(';'),
    )
    let place = 0
    for (const entry of block.entries) {
      const [given, family] = splitName(entry.lifter.name)
      const best = liftIds.reduce((sum, id) => sum + bestGood(state, entry, id), 0)
      const reshel =
        typeof entry.bodyweight === 'number'
          ? best * reshelCoefficient(entry.bodyweight, entry.lifter.sex)
          : 0
      const cells = [
        dns.has(entry.id) ? 'DNS' : String(++place),
        given,
        family,
        '',
        formatDecimal(ageOnDate(entry.lifter.birthDate, state.date), 0),
        typeof entry.bodyweight === 'number' ? formatDecimal(entry.bodyweight, 2) : '',
        Option.match(entryAgeClass(state, entry), {
          onNone: () => '',
          onSome: (id) => nameIn(state.rulebook.ageClasses, id, locale),
        }),
        Option.match(entryWeightClass(state, entry), {
          onNone: () => '',
          onSome: (id) => nameIn(state.rulebook.weightClasses, id, locale),
        }),
        'RAW',
        ...liftIds.flatMap((id) =>
          Array.from({ length: columnsFor(state, id) }, (_, n) =>
            attemptCell(attemptsOf(state, entry, id), n),
          ),
        ),
        formatDecimal(best, 2),
        formatDecimal(reshel, 4),
        formatDecimal(reshel * mcCulloughCoefficient(entry.lifter.birthDate, state.date), 4),
      ]
      lines.push(cells.map(escapeCsv).join(';'))
    }
  }
  return '\uFEFF' + lines.join('\n')
}

export function individualTable(
  state: ContestState,
  ranking: IndividualRanking,
  locale: Locale,
  labels: TableLabels,
): TableModel {
  const classification = state.rulebook.classifications.find(
    (item) => item.id === ranking.classificationId,
  )
  const liftIds = classification?.liftIds ?? []
  const person = (entry: Entry) => [
    entry.lifter.name,
    state.teams.find((team) => team.id === entry.lifter.teamId)?.name ?? '',
    Option.match(entryAgeClass(state, entry), {
      onNone: () => '',
      onSome: (id) => nameIn(state.rulebook.ageClasses, id, locale),
    }),
    Option.match(entryWeightClass(state, entry), {
      onNone: () => '',
      onSome: (id) => nameIn(state.rulebook.weightClasses, id, locale),
    }),
    typeof entry.bodyweight === 'number' ? formatDecimal(entry.bodyweight, 2) : '',
  ]
  const ranked = ranking.groups.flatMap((group) =>
    group.rows.map((row) => [
      String(row.place),
      ...person(row.entry),
      ...liftIds.map((id) =>
        attemptsOf(state, row.entry, id)
          .map((_, n, all) => attemptCell(all, n) || '—')
          .join(' / '),
      ),
      formatDecimal(row.kilograms, 2),
      formatDecimal(row.points, 3),
    ]),
  )
  // Entries that did not start are listed after the ranked ones with the text DNS instead of a place.
  const notStarted = ranking.pending
    .filter((item) => item.reason === 'didNotStart')
    .flatMap((item) => state.entries.filter((entry) => entry.id === item.entryId))
    .map((entry) => [
      labels.didNotStart,
      ...person(entry),
      ...liftIds.map((id) => (isDidNotStart(state, entry.id, id) ? labels.didNotStart : '—')),
      '',
      '',
    ])
  const rows = [...ranked, ...notStarted]
  return {
    title: classification?.name[locale] ?? ranking.classificationId,
    columns: [
      labels.place,
      labels.name,
      labels.team,
      labels.ageClass,
      labels.weightClass,
      labels.bodyweight,
      ...liftIds.map((id) => nameIn(state.rulebook.lifts, id, locale)),
      labels.result,
      labels.points,
    ],
    rows,
  }
}

export function teamTable(
  state: ContestState,
  ranking: TeamRanking,
  locale: Locale,
  labels: TableLabels,
): TableModel {
  const classification = state.rulebook.classifications.find(
    (item) => item.id === ranking.classificationId,
  )
  return {
    title: classification?.name[locale] ?? ranking.classificationId,
    columns: [labels.place, labels.team, labels.counted, labels.points],
    rows: ranking.rows.map((row) => [
      String(row.place),
      row.team.name,
      row.counted
        .map((item) => item.entry.lifter.name + ' (' + formatDecimal(item.points, 3) + ')')
        .join(', '),
      formatDecimal(row.points, 3),
    ]),
  }
}
