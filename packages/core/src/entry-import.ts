import * as Option from 'effect/Option'
import * as Result from 'effect/Result'
import * as Schema from 'effect/Schema'
import { Command, ContestJournal, type ContestState } from './contest.ts'
import { Entry } from './entry.ts'
import { CalendarDate, TeamId, type Sex } from './lifter.ts'
import { DivisionId, LiftId } from './rulebook.ts'

/** Split delimited text into cells. Handles a BOM, quotes, doubled quotes and ; , or tab. */
export function parseDelimited(input: string): ReadonlyArray<ReadonlyArray<string>> {
  const text = input.replace(/^\uFEFF/, '')
  const firstLine = text.split(/\r?\n/, 1)[0] ?? ''
  const delimiter = [';', '\t', ','].reduce((best, candidate) =>
    firstLine.split(candidate).length > firstLine.split(best).length ? candidate : best,
  )
  const rows: Array<Array<string>> = []
  let row: Array<string> = []
  let cell = ''
  let quoted = false
  for (let index = 0; index < text.length; index++) {
    const char = text.charAt(index)
    if (quoted) {
      if (char === '"' && text.charAt(index + 1) === '"') {
        cell += '"'
        index++
      } else if (char === '"') quoted = false
      else cell += char
    } else if (char === '"') quoted = true
    else if (char === delimiter) {
      row.push(cell)
      cell = ''
    } else if (char === '\n' || char === '\r') {
      if (char === '\r' && text.charAt(index + 1) === '\n') index++
      row.push(cell)
      rows.push(row)
      row = []
      cell = ''
    } else cell += char
  }
  if (cell !== '' || row.length > 0) {
    row.push(cell)
    rows.push(row)
  }
  return rows.filter((cells) => cells.some((value) => value.trim() !== ''))
}

export type ImportField =
  | 'name'
  | 'firstName'
  | 'lastName'
  | 'sex'
  | 'birthDate'
  | 'team'
  | 'lifts'
  | 'divisions'
  | 'bodyweight'
  | 'lotNumber'
/** A column index per field; per-lift opening weights have a column per lift. */
export interface ImportMapping {
  readonly fields: Readonly<Partial<Record<ImportField, number>>>
  readonly openings: Readonly<Record<string, number>>
}
const synonyms: ReadonlyArray<readonly [ImportField, ReadonlyArray<string>]> = [
  ['name', ['name', 'imie i nazwisko', 'zawodnik', 'lifter', 'full name']],
  ['firstName', ['imie', 'first name', 'firstname', 'given name']],
  ['lastName', ['nazwisko', 'last name', 'lastname', 'surname', 'family name']],
  ['sex', ['plec', 'sex', 'gender', 'p']],
  [
    'birthDate',
    ['data urodzenia', 'urodzony', 'birth date', 'birthdate', 'date of birth', 'dob', 'ur'],
  ],
  ['team', ['klub', 'druzyna', 'team', 'club']],
  ['lifts', ['konkurencje', 'boje', 'boj', 'lifts', 'events', 'lift']],
  ['divisions', ['dywizje', 'dywizja', 'kategoria', 'divisions', 'division', 'category']],
  ['bodyweight', ['waga', 'masa ciala', 'masa', 'bodyweight', 'weight', 'body weight']],
  ['lotNumber', ['numer losowania', 'los', 'nr losowania', 'lot', 'lot number']],
]
const fold = (value: string) =>
  value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace('ł', 'l')
    .replace('Ł', 'L')
    .toLowerCase()
    .trim()

/** Guess a mapping from header names; the organizer corrects it in the preview. */
export function suggestMapping(
  headers: ReadonlyArray<string>,
  state: Pick<ContestState, 'rulebook'>,
): ImportMapping {
  const folded = headers.map(fold)
  const fields: Partial<Record<ImportField, number>> = {}
  for (const [field, names] of synonyms) {
    const index = folded.findIndex((header) => names.includes(header))
    if (index >= 0) fields[field] = index
  }
  const openings: Record<string, number> = {}
  for (const lift of state.rulebook.lifts) {
    const labels = [lift.id, lift.name.pl, lift.name.en].map(fold)
    // A header may be a short form of the lift name ("Wyciskanie" for "Wyciskanie leżąc").
    const strip = (header: string) =>
      header.replace(/^(otwarcie|opening)\s+|\s+(otwarcie|opening)$/, '')
    const index = folded.findIndex((header) =>
      labels.some((label) => {
        const core = strip(header)
        return core.length >= 4 ? label === core || label.startsWith(core + ' ') : label === core
      }),
    )
    if (index >= 0) openings[lift.id] = index
  }
  return { fields, openings }
}

export type RowProblem =
  | 'nameMissing'
  | 'sexInvalid'
  | 'birthDateInvalid'
  | 'unknownLift'
  | 'unknownDivision'
  | 'liftMissing'
  | 'bodyweightInvalid'
  | 'lotInvalid'
  | 'openingInvalid'
  | 'entryRejected'
export interface RowOutcome {
  /** One-based spreadsheet row number counting the header. */
  readonly row: number
  readonly problems: ReadonlyArray<{ readonly problem: RowProblem; readonly detail: string }>
}
export interface ImportPlan {
  readonly commands: ReadonlyArray<Command>
  readonly rows: ReadonlyArray<RowOutcome>
}
export interface ImportDefaults {
  readonly divisions: ReadonlyArray<string>
  readonly lifts: ReadonlyArray<string>
}
export interface ImportEnvironment {
  readonly newId: () => string
  readonly now: number
  /** A number in [0, 1) used to draw missing lot numbers. */
  readonly random: () => number
}

function parseSex(value: string): Option.Option<Sex> {
  const v = fold(value)
  if (['m', 'male', 'mezczyzna', 'facet', 'k', 'f', 'female', 'kobieta'].includes(v))
    return Option.some(['m', 'male', 'mezczyzna', 'facet'].includes(v) ? 'male' : 'female')
  return Option.none()
}
function parseDate(value: string): Option.Option<CalendarDate> {
  const text = value.trim()
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(text)
  const european = /^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/.exec(text)
  const parts = iso
    ? [iso[1], iso[2], iso[3]]
    : european
      ? [european[3], european[2], european[1]]
      : []
  if (parts.length !== 3) return Option.none()
  const [year, month, day] = parts
  const candidate = `${year}-${(month ?? '').padStart(2, '0')}-${(day ?? '').padStart(2, '0')}`
  return Option.getSuccess(Schema.decodeResult(CalendarDate)(candidate))
}
function list(value: string): ReadonlyArray<string> {
  return value
    .split(/[,;/+|]/)
    .map((part) => part.trim())
    .filter((part) => part !== '')
}
const canonicalTeam = (name: string) => name.trim().normalize('NFC').toLowerCase()

/**
 * Turn spreadsheet rows into commands. A row with a problem produces no command.
 * The core validates each entry in file order, so duplicates inside the file are caught too.
 */
export function planImport(
  state: ContestState,
  journal: ContestJournal,
  rows: ReadonlyArray<ReadonlyArray<string>>,
  mapping: ImportMapping,
  defaults: ImportDefaults,
  env: ImportEnvironment,
): ImportPlan {
  const cell = (row: ReadonlyArray<string>, field: ImportField) => {
    const index = mapping.fields[field]
    return typeof index === 'number' ? (row[index] ?? '').trim() : ''
  }
  const outcomes: Array<RowOutcome> = []
  const commands: Array<Command> = []
  let current = journal
  const usedLots = new Set(state.entries.map((entry) => entry.lotNumber as number))
  const teams = new Map<string, TeamId>(
    state.teams.map((team) => [canonicalTeam(team.name), team.id]),
  )
  const findIn = <
    A extends { readonly id: string; readonly name: { readonly pl: string; readonly en: string } },
  >(
    items: ReadonlyArray<A>,
    label: string,
  ) => {
    const wanted = fold(label)
    return items.find(
      (item) =>
        fold(item.id) === wanted || fold(item.name.pl) === wanted || fold(item.name.en) === wanted,
    )
  }
  for (const [index, row] of rows.entries()) {
    const problems: Array<{ problem: RowProblem; detail: string }> = []
    const problem = (kind: RowProblem, detail = '') => problems.push({ problem: kind, detail })
    const name =
      cell(row, 'name') || [cell(row, 'lastName'), cell(row, 'firstName')].filter(Boolean).join(' ')
    if (name === '') problem('nameMissing')
    const sex = parseSex(cell(row, 'sex'))
    if (Option.isNone(sex)) problem('sexInvalid', cell(row, 'sex'))
    const birthDate = parseDate(cell(row, 'birthDate'))
    if (Option.isNone(birthDate)) problem('birthDateInvalid', cell(row, 'birthDate'))
    const divisionNames = list(cell(row, 'divisions'))
    const divisions: Array<DivisionId> = []
    for (const label of divisionNames.length > 0 ? divisionNames : defaults.divisions) {
      const found = findIn(state.rulebook.divisions, label)
      if (found) divisions.push(found.id)
      else problem('unknownDivision', label)
    }
    const liftNames = list(cell(row, 'lifts'))
    const lifts: Array<LiftId> = []
    for (const label of liftNames) {
      const found = findIn(state.rulebook.lifts, label)
      if (found) lifts.push(found.id)
      else problem('unknownLift', label)
    }
    // Opening weights decide the lifts when the file has no lift column; otherwise the defaults apply.
    const openings = new Map<string, number>()
    for (const [liftId, column] of Object.entries(mapping.openings)) {
      const text = (row[column] ?? '').trim().replace(',', '.')
      if (text === '') continue
      const weight = Number(text)
      if (!Number.isFinite(weight) || weight <= 0) problem('openingInvalid', text)
      else {
        openings.set(liftId, weight)
        const id = Schema.decodeSync(LiftId)(liftId)
        if (liftNames.length === 0 && !lifts.includes(id)) lifts.push(id)
      }
    }
    if (liftNames.length === 0 && openings.size === 0)
      for (const label of defaults.lifts) {
        const found = findIn(state.rulebook.lifts, label)
        if (found) lifts.push(found.id)
        else problem('unknownLift', label)
      }
    if (lifts.length === 0) problem('liftMissing')
    const bodyweightText = cell(row, 'bodyweight').replace(',', '.')
    const bodyweight = bodyweightText === '' ? Number.NaN : Number(bodyweightText)
    if (bodyweightText !== '' && !(bodyweight > 0)) problem('bodyweightInvalid', bodyweightText)
    const lotText = cell(row, 'lotNumber')
    let lot = Number(lotText)
    if (lotText !== '' && !(Number.isInteger(lot) && lot > 0)) problem('lotInvalid', lotText)
    if (problems.length > 0 || Option.isNone(sex) || Option.isNone(birthDate)) {
      outcomes.push({ row: index + 2, problems })
      continue
    }
    if (lotText === '' || usedLots.has(lot)) {
      if (lotText !== '') {
        problem('lotInvalid', lotText)
        outcomes.push({ row: index + 2, problems })
        continue
      }
      // Draw from the numbers still free, so the draw always ends.
      const range = Math.max(200, usedLots.size * 4)
      const free = Array.from({ length: range }, (_, number) => number + 1).filter(
        (number) => !usedLots.has(number),
      )
      lot = free[Math.floor(env.random() * free.length)] ?? range + 1
    }
    const teamName = cell(row, 'team')
    const rowCommands: Array<Command> = []
    let teamId: Option.Option<TeamId> = Option.none()
    if (teamName !== '') {
      const known = teams.get(canonicalTeam(teamName))
      if (known) teamId = Option.some(known)
      else {
        const id = Schema.decodeSync(TeamId)(env.newId())
        rowCommands.push(
          Schema.decodeSync(Command)({
            _tag: 'UpsertTeam',
            id: env.newId(),
            at: env.now,
            team: { id, name: teamName.trim() },
          }),
        )
        teamId = Option.some(id)
      }
    }
    const entry = Schema.decodeUnknownResult(Entry)({
      id: env.newId(),
      lifter: {
        id: env.newId(),
        name,
        sex: sex.value,
        birthDate: birthDate.value,
        ...(Option.isSome(teamId) ? { teamId: teamId.value } : {}),
      },
      lotNumber: lot,
      ...(Number.isFinite(bodyweight) ? { bodyweight } : {}),
      divisions,
      lifts: lifts.map((liftId) => ({
        liftId,
        ...(openings.has(liftId) ? { openingWeight: openings.get(liftId) } : {}),
      })),
    })
    if (Result.isFailure(entry)) {
      outcomes.push({ row: index + 2, problems: [{ problem: 'entryRejected', detail: 'schema' }] })
      continue
    }
    rowCommands.push(
      Schema.decodeSync(Command)({
        _tag: 'AddEntry',
        id: env.newId(),
        at: env.now,
        entry: entry.success,
      }),
    )
    let trial = current
    let failure = ''
    for (const command of rowCommands) {
      const appended = trial.append(command)
      if (Result.isFailure(appended)) {
        failure = 'reason' in appended.failure ? appended.failure.reason : appended.failure._tag
        break
      }
      trial = appended.success
    }
    if (failure !== '') {
      outcomes.push({ row: index + 2, problems: [{ problem: 'entryRejected', detail: failure }] })
      continue
    }
    current = trial
    usedLots.add(lot)
    for (const command of rowCommands) {
      commands.push(command)
      if (command._tag === 'UpsertTeam')
        teams.set(canonicalTeam(command.team.name), command.team.id)
    }
    outcomes.push({ row: index + 2, problems: [] })
  }
  return { commands, rows: outcomes }
}
