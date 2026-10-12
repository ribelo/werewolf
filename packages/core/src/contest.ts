import * as Arr from 'effect/Array'
import * as Data from 'effect/Data'
import * as Option from 'effect/Option'
import * as Result from 'effect/Result'
import * as Schema from 'effect/Schema'
import { Kilograms, loadBarbell } from './barbell.ts'
import {
  AttemptNumber,
  AttemptRef,
  Entry,
  EntryId,
  LotNumber,
  RackHeight,
  Team,
  Timestamp,
  Verdict,
  type Attempt,
} from './entry.ts'
import { ageOnDate, Sex, type CalendarDate, type TeamId } from './lifter.ts'
import {
  AgeClassId,
  DivisionId,
  LiftId,
  Rulebook,
  WeightClassId,
  type Division,
} from './rulebook.ts'

export const CommandId = Schema.NonEmptyString.pipe(Schema.brand('CommandId'))
export type CommandId = typeof CommandId.Type
/** Commands edit one field at a time. Their identifiers support transport deduplication. */
const commandMetadata = { id: CommandId, at: Timestamp }
export const ScoreboardFilter = Schema.Struct({
  divisionId: Schema.optionalKey(DivisionId),
  liftId: Schema.optionalKey(LiftId),
  sex: Schema.optionalKey(Sex),
  ageClassId: Schema.optionalKey(AgeClassId),
  weightClassId: Schema.optionalKey(WeightClassId),
})
export type ScoreboardFilter = typeof ScoreboardFilter.Type
export interface ScoreboardView {
  readonly filter: ScoreboardFilter
  readonly qrUrl: Option.Option<string>
}
export const Command = Schema.Union([
  Schema.TaggedStruct('AddEntry', { ...commandMetadata, entry: Entry }),
  Schema.TaggedStruct('SetBodyweight', {
    ...commandMetadata,

    entryId: EntryId,
    bodyweight: Kilograms.check(Schema.isGreaterThan(0)),
  }),
  Schema.TaggedStruct('SetLotNumber', {
    ...commandMetadata,

    entryId: EntryId,
    lotNumber: LotNumber,
  }),
  Schema.TaggedStruct('SetDivisions', {
    ...commandMetadata,

    entryId: EntryId,
    divisions: Schema.Array(DivisionId),
  }),
  /** Contest settings edited after creation. Lifts in use must keep their attempts. */
  Schema.TaggedStruct('SetRulebook', { ...commandMetadata, rulebook: Rulebook }),
  /** The desk starts the attempt clock by hand; screens count down from the command time. */
  Schema.TaggedStruct('StartClock', {
    ...commandMetadata,
    seconds: Schema.Int.check(Schema.isGreaterThan(0)),
  }),
  Schema.TaggedStruct('StopClock', commandMetadata),
  /** Absent team clears the team. */
  Schema.TaggedStruct('SetEntryTeam', {
    ...commandMetadata,
    entryId: EntryId,
    teamId: Schema.optionalKey(Team.fields.id),
  }),
  Schema.TaggedStruct('SetRackHeight', {
    ...commandMetadata,

    entryId: EntryId,
    liftId: LiftId,
    rackHeight: RackHeight,
  }),
  Schema.TaggedStruct('SetWeight', {
    ...commandMetadata,

    attempt: AttemptRef,
    weight: Kilograms,
  }),
  Schema.TaggedStruct('SetVerdict', {
    ...commandMetadata,

    attempt: AttemptRef,
    verdict: Verdict,
  }),
  /** Takes a verdict back: the attempt is declared again with the same weight. */
  Schema.TaggedStruct('ClearVerdict', { ...commandMetadata, attempt: AttemptRef }),
  Schema.TaggedStruct('SetCurrent', { ...commandMetadata, attempt: AttemptRef }),
  Schema.TaggedStruct('MoveAttempt', {
    ...commandMetadata,

    attempt: AttemptRef,
    position: Schema.Union([
      Schema.TaggedStruct('Before', { attempt: AttemptRef }),
      Schema.TaggedStruct('Last', {}),
    ]),
  }),
  Schema.TaggedStruct('ResetOrder', commandMetadata),
  /** The entry did not start in this lift. false takes the mark back. */
  Schema.TaggedStruct('SetDidNotStart', {
    ...commandMetadata,
    entryId: EntryId,
    liftId: LiftId,
    value: Schema.Boolean,
  }),
  Schema.TaggedStruct('UpsertTeam', { ...commandMetadata, team: Team }),
  Schema.TaggedStruct('MergeTeams', {
    ...commandMetadata,

    from: Team.fields.id,
    into: Team.fields.id,
  }),
  /** What the TV shows. The last change wins, and a late screen replays it from the log. */
  Schema.TaggedStruct('SetScoreboard', {
    ...commandMetadata,
    filter: ScoreboardFilter,
    qrUrl: Schema.optionalKey(Schema.NonEmptyString),
  }),
  Schema.TaggedStruct('Undo', {
    ...commandMetadata,

    target: CommandId,
  }),
])
export type Command = typeof Command.Type
type Mutation = Exclude<Command, { readonly _tag: 'Undo' }>
export class InvalidCommand extends Data.TaggedError('InvalidCommand')<{
  readonly detail: string
}> {}
export class EntryRejected extends Data.TaggedError('EntryRejected')<{
  readonly entryId: EntryId
  readonly reason:
    | 'duplicateEntry'
    | 'duplicateLotNumber'
    | 'duplicateLifter'
    | 'birthDateAfterContest'
    | 'unknownTeam'
    | 'duplicateDivision'
    | 'unknownDivision'
    | 'divisionCondition'
    | 'unknownLift'
    | 'rackHeightNotUsed'
    | 'unknownEntry'
}> {}
export class AttemptUnavailable extends Data.TaggedError('AttemptUnavailable')<{
  readonly attempt: AttemptRef
  readonly reason:
    | 'unknownAttempt'
    | 'weightNotDeclared'
    | 'notPending'
    | 'invalidOrderTarget'
    | 'alreadyJudged'
}> {}
export class UnloadableWeight extends Data.TaggedError('UnloadableWeight')<{
  readonly requested: Kilograms
  readonly nearest: Kilograms
}> {}
export class TeamConflict extends Data.TaggedError('TeamConflict')<{
  readonly teamId: TeamId
  readonly reason: 'duplicateName' | 'invalidMerge'
}> {}
export class NothingToUndo extends Data.TaggedError('NothingToUndo')<{}> {}
export class UndoConflict extends Data.TaggedError('UndoConflict')<{ readonly detail: string }> {}
export type ContestFailure =
  | InvalidCommand
  | EntryRejected
  | AttemptUnavailable
  | UnloadableWeight
  | TeamConflict
  | NothingToUndo
  | UndoConflict
export interface EntryWarning {
  readonly entryId: EntryId
  readonly divisionId: DivisionId
  readonly reason: 'sex' | 'age' | 'bodyweight' | 'bodyweightMissing' | 'lifts'
}
type OrderOverride = Pick<
  Extract<Command, { readonly _tag: 'MoveAttempt' }>,
  'attempt' | 'position'
>
/** A derived state has no clock, storage handle or network dependency. Replay owns its values. */
export interface ContestState {
  readonly rulebook: Rulebook
  readonly date: CalendarDate
  readonly entries: ReadonlyArray<Entry>
  readonly teams: ReadonlyArray<Team>
  readonly attempts: ReadonlyArray<Attempt>
  readonly selected: Option.Option<AttemptRef>
  readonly orderOverrides: ReadonlyArray<OrderOverride>
  /** Entries that did not start in a lift (DNS). They have no place in the order and no result. */
  readonly didNotStart: ReadonlyArray<{ readonly entryId: EntryId; readonly liftId: LiftId }>
  readonly warnings: ReadonlyArray<EntryWarning>
  readonly scoreboard: ScoreboardView
  /** A running attempt clock: it ends seconds after startedAt. */
  readonly clock: Option.Option<{ readonly startedAt: Timestamp; readonly seconds: number }>
}

/** Parse an external command without exceptions for malformed payloads. */
export function parseCommand(input: unknown): Result.Result<Command, InvalidCommand> {
  return Schema.decodeUnknownResult(Command)(input).pipe(
    Result.mapError((error) => new InvalidCommand({ detail: error.message })),
  )
}
function sameAttempt(left: AttemptRef, right: AttemptRef): boolean {
  return (
    left.entryId === right.entryId && left.liftId === right.liftId && left.number === right.number
  )
}
function divisionWarnings(
  entry: Entry,
  division: Division,
  date: CalendarDate,
): ReadonlyArray<EntryWarning> {
  const { conditions } = division
  const reasons: Array<EntryWarning['reason']> = []
  const age = ageOnDate(entry.lifter.birthDate, date)
  if (conditions.sex && conditions.sex !== entry.lifter.sex) reasons.push('sex')
  if (age < (conditions.minAge ?? 0) || age > (conditions.maxAge ?? Number.POSITIVE_INFINITY))
    reasons.push('age')
  if ('minBodyweight' in conditions || 'maxBodyweight' in conditions) {
    if (typeof entry.bodyweight !== 'number') reasons.push('bodyweightMissing')
    else if (
      entry.bodyweight < (conditions.minBodyweight ?? 0) ||
      entry.bodyweight > (conditions.maxBodyweight ?? Number.POSITIVE_INFINITY)
    )
      reasons.push('bodyweight')
  }
  if (
    conditions.allowedLifts &&
    entry.lifts.some((lift) => !conditions.allowedLifts?.includes(lift.liftId))
  )
    reasons.push('lifts')
  return reasons.map((reason) => ({ entryId: entry.id, divisionId: division.id, reason }))
}
function validateEntries(
  state: ContestState,
  entries: ReadonlyArray<Entry>,
): Result.Result<ReadonlyArray<EntryWarning>, EntryRejected | UnloadableWeight> {
  const warnings: Array<EntryWarning> = []
  const lots = new Set<LotNumber>()
  const people = new Set<string>()
  for (const entry of entries) {
    const reject = (
      reason: EntryRejected['reason'],
    ): Result.Result<ReadonlyArray<EntryWarning>, EntryRejected> =>
      Result.fail(new EntryRejected({ entryId: entry.id, reason }))
    if (lots.has(entry.lotNumber)) return reject('duplicateLotNumber')
    if (people.has(entry.lifter.id)) return reject('duplicateLifter')
    lots.add(entry.lotNumber)
    people.add(entry.lifter.id)
    if (entry.lifter.birthDate > state.date) return reject('birthDateAfterContest')
    if (entry.lifter.teamId && !state.teams.some((team) => team.id === entry.lifter.teamId))
      return reject('unknownTeam')
    if (new Set(entry.divisions).size !== entry.divisions.length) return reject('duplicateDivision')
    for (const membership of entry.divisions) {
      const division = state.rulebook.divisions.find((item) => item.id === membership)
      if (!division) return reject('unknownDivision')
      const unmet = divisionWarnings(entry, division, state.date)
      if (division.policy === 'reject' && unmet.length > 0) return reject('divisionCondition')
      warnings.push(...unmet)
    }
    for (const selected of entry.lifts) {
      const lift = state.rulebook.lifts.find((item) => item.id === selected.liftId)
      if (!lift) return reject('unknownLift')
      if ('rackHeight' in selected && !lift.rackHeight) return reject('rackHeightNotUsed')
      if (typeof selected.openingWeight === 'number') {
        const load = loadBarbell(state.rulebook.barbell, entry.lifter.sex, selected.openingWeight)
        if (load._tag === 'Unloadable')
          return Result.fail(
            new UnloadableWeight({ requested: load.requested, nearest: load.nearest }),
          )
      }
    }
  }
  return Result.succeed(warnings)
}
function replaceEntries(
  state: ContestState,
  entries: ReadonlyArray<Entry>,
): Result.Result<ContestState, EntryRejected | UnloadableWeight> {
  return validateEntries(state, entries).pipe(
    Result.map((warnings) => ({ ...state, entries, warnings })),
  )
}
function editEntry(
  state: ContestState,
  id: EntryId,
  update: (entry: Entry) => Entry,
): Result.Result<ContestState, EntryRejected | UnloadableWeight> {
  if (!state.entries.some((entry) => entry.id === id))
    return Result.fail(new EntryRejected({ entryId: id, reason: 'unknownEntry' }))
  return replaceEntries(
    state,
    state.entries.map((entry) => (entry.id === id ? update(entry) : entry)),
  )
}
function entryAttempts(book: Rulebook, entry: Entry): ReadonlyArray<Attempt> {
  return book.lifts.flatMap((lift) => {
    const selected = entry.lifts.find((item) => item.liftId === lift.id)
    if (!selected) return []
    return Array.from({ length: lift.attempts }, (_, index): Attempt => {
      const reference: AttemptRef = {
        entryId: entry.id,
        liftId: lift.id,
        number: Schema.decodeSync(AttemptNumber)(index + 1),
      }
      return index === 0 && typeof selected.openingWeight === 'number'
        ? { ...reference, _tag: 'Declared', weight: selected.openingWeight }
        : { ...reference, _tag: 'Unannounced' }
    })
  })
}

/** True when the entry is marked as not started in the lift. */
export function isDidNotStart(state: ContestState, entryId: EntryId, liftId: LiftId): boolean {
  return state.didNotStart.some((item) => item.entryId === entryId && item.liftId === liftId)
}

/** Pending declared attempts sort by configured lift, round, weight and lot. Overrides move only their target. */
export function liftingOrder(
  state: ContestState,
): ReadonlyArray<Attempt & { readonly _tag: 'Declared' }> {
  const liftOrder = new Map(state.rulebook.lifts.map((lift, index) => [lift.id, index]))
  const lots = new Map(state.entries.map((entry) => [entry.id, entry.lotNumber]))
  const order = state.attempts
    .filter(
      (attempt): attempt is Attempt & { readonly _tag: 'Declared' } =>
        attempt._tag === 'Declared' && !isDidNotStart(state, attempt.entryId, attempt.liftId),
    )
    .toSorted(
      (left, right) =>
        (liftOrder.get(left.liftId) ?? 0) - (liftOrder.get(right.liftId) ?? 0) ||
        left.number - right.number ||
        left.weight - right.weight ||
        (lots.get(left.entryId) ?? 0) - (lots.get(right.entryId) ?? 0),
    )
  for (const override of state.orderOverrides) {
    const index = order.findIndex((attempt) => sameAttempt(attempt, override.attempt))
    if (index < 0) continue
    const target = order[index]
    if (!target) continue
    switch (override.position._tag) {
      case 'Before': {
        const before = override.position.attempt
        if (
          sameAttempt(override.attempt, before) ||
          !order.some((attempt) => sameAttempt(attempt, before))
        )
          continue
        order.splice(index, 1)
        order.splice(
          order.findIndex((attempt) => sameAttempt(attempt, before)),
          0,
          target,
        )
        break
      }
      case 'Last':
        order.splice(index, 1)
        order.push(target)
        break
    }
  }
  return order
}

/** Explicit selection wins until it receives a verdict; otherwise the first ordered attempt is current. */
export function currentAttempt(
  state: ContestState,
): Option.Option<Attempt & { readonly _tag: 'Declared' }> {
  const order = liftingOrder(state)
  if (Option.isSome(state.selected)) {
    const selected = state.selected.value
    const attempt = order.find((item) => sameAttempt(item, selected))
    if (attempt) return Option.some(attempt)
  }
  const next = order[0]
  return next ? Option.some(next) : Option.none()
}

function applyMutation(
  state: ContestState,
  command: Mutation,
  sequence: number,
): Result.Result<ContestState, ContestFailure> {
  switch (command._tag) {
    case 'AddEntry': {
      if (state.entries.some((entry) => entry.id === command.entry.id))
        return Result.fail(
          new EntryRejected({ entryId: command.entry.id, reason: 'duplicateEntry' }),
        )
      return replaceEntries(state, [...state.entries, command.entry]).pipe(
        Result.map((next) => ({
          ...next,
          attempts: [...state.attempts, ...entryAttempts(state.rulebook, command.entry)],
        })),
      )
    }
    case 'SetBodyweight':
      return editEntry(state, command.entryId, (entry) => ({
        ...entry,
        bodyweight: command.bodyweight,
      }))
    case 'SetLotNumber':
      return editEntry(state, command.entryId, (entry) => ({
        ...entry,
        lotNumber: command.lotNumber,
      }))
    case 'SetDivisions':
      return editEntry(state, command.entryId, (entry) => ({
        ...entry,
        divisions: command.divisions,
      }))
    case 'SetRulebook': {
      const next = command.rulebook
      const compatible = state.entries.every((entry) =>
        entry.lifts.every((selected) => {
          const before = state.rulebook.lifts.find((lift) => lift.id === selected.liftId)
          const after = next.lifts.find((lift) => lift.id === selected.liftId)
          return !!after && after.attempts === before?.attempts
        }),
      )
      if (!compatible) return Result.fail(new InvalidCommand({ detail: 'rulebookIncompatible' }))
      const scoreboard = state.scoreboard.filter
      const known =
        (!scoreboard.divisionId ||
          next.divisions.some((item) => item.id === scoreboard.divisionId)) &&
        (!scoreboard.liftId || next.lifts.some((item) => item.id === scoreboard.liftId)) &&
        (!scoreboard.ageClassId ||
          next.ageClasses.some((item) => item.id === scoreboard.ageClassId)) &&
        (!scoreboard.weightClassId ||
          next.weightClasses.some((item) => item.id === scoreboard.weightClassId))
      return replaceEntries(
        {
          ...state,
          rulebook: next,
          scoreboard: known ? state.scoreboard : { ...state.scoreboard, filter: {} },
        },
        state.entries,
      )
    }
    case 'StartClock':
      return Result.succeed({
        ...state,
        clock: Option.some({ startedAt: command.at, seconds: command.seconds }),
      })
    case 'StopClock':
      return Result.succeed({ ...state, clock: Option.none() })
    case 'SetEntryTeam':
      return editEntry(state, command.entryId, (entry) => {
        const { teamId: _previous, ...lifter } = entry.lifter
        return {
          ...entry,
          lifter: command.teamId ? { ...lifter, teamId: command.teamId } : lifter,
        }
      })
    case 'SetRackHeight': {
      const lift = state.rulebook.lifts.find((item) => item.id === command.liftId)
      const entry = state.entries.find((item) => item.id === command.entryId)
      if (!lift?.rackHeight || !entry?.lifts.some((item) => item.liftId === command.liftId))
        return Result.fail(
          new EntryRejected({ entryId: command.entryId, reason: 'rackHeightNotUsed' }),
        )
      return editEntry(state, command.entryId, (item) => ({
        ...item,
        lifts: Arr.map(item.lifts, (selected) =>
          selected.liftId === command.liftId
            ? { ...selected, rackHeight: command.rackHeight }
            : selected,
        ),
      }))
    }
    case 'SetWeight': {
      const attempt = state.attempts.find((item) => sameAttempt(item, command.attempt))
      const entry = state.entries.find((item) => item.id === command.attempt.entryId)
      if (!attempt || !entry)
        return Result.fail(
          new AttemptUnavailable({ attempt: command.attempt, reason: 'unknownAttempt' }),
        )
      const load = loadBarbell(state.rulebook.barbell, entry.lifter.sex, command.weight)
      if (load._tag === 'Unloadable')
        return Result.fail(
          new UnloadableWeight({ requested: load.requested, nearest: load.nearest }),
        )
      const updated: Attempt =
        attempt._tag === 'Judged'
          ? { ...attempt, weight: command.weight }
          : { ...command.attempt, _tag: 'Declared', weight: command.weight }
      return Result.succeed({
        ...state,
        attempts: state.attempts.map((item) =>
          sameAttempt(item, command.attempt) ? updated : item,
        ),
      })
    }
    case 'SetVerdict': {
      if (isDidNotStart(state, command.attempt.entryId, command.attempt.liftId))
        return Result.fail(
          new AttemptUnavailable({ attempt: command.attempt, reason: 'notPending' }),
        )
      const attempt = state.attempts.find((item) => sameAttempt(item, command.attempt))
      if (!attempt || attempt._tag === 'Unannounced')
        return Result.fail(
          new AttemptUnavailable({ attempt: command.attempt, reason: 'weightNotDeclared' }),
        )
      const updated: Attempt = {
        ...command.attempt,
        _tag: 'Judged',
        weight: attempt.weight,
        verdict: command.verdict,
        sequence: attempt._tag === 'Judged' ? attempt.sequence : sequence,
        achievedAt: attempt._tag === 'Judged' ? attempt.achievedAt : command.at,
      }
      const selected =
        Option.isSome(state.selected) && sameAttempt(state.selected.value, command.attempt)
          ? Option.none<AttemptRef>()
          : state.selected
      return Result.succeed({
        ...state,
        selected,
        clock: Option.none(),
        attempts: state.attempts.map((item) =>
          sameAttempt(item, command.attempt) ? updated : item,
        ),
      })
    }
    case 'ClearVerdict': {
      const attempt = state.attempts.find((item) => sameAttempt(item, command.attempt))
      if (!attempt || attempt._tag !== 'Judged')
        return Result.fail(
          new AttemptUnavailable({ attempt: command.attempt, reason: 'notPending' }),
        )
      const declared: Attempt = { ...command.attempt, _tag: 'Declared', weight: attempt.weight }
      return Result.succeed({
        ...state,
        attempts: state.attempts.map((item) =>
          sameAttempt(item, command.attempt) ? declared : item,
        ),
      })
    }
    case 'SetCurrent': {
      if (!liftingOrder(state).some((attempt) => sameAttempt(attempt, command.attempt)))
        return Result.fail(
          new AttemptUnavailable({ attempt: command.attempt, reason: 'notPending' }),
        )
      return Result.succeed({ ...state, selected: Option.some(command.attempt) })
    }
    case 'MoveAttempt': {
      const order = liftingOrder(state)
      if (!order.some((attempt) => sameAttempt(attempt, command.attempt)))
        return Result.fail(
          new AttemptUnavailable({ attempt: command.attempt, reason: 'notPending' }),
        )
      if (command.position._tag === 'Before') {
        const before = command.position.attempt
        if (
          !order.some((attempt) => sameAttempt(attempt, before)) ||
          sameAttempt(command.attempt, before)
        )
          return Result.fail(
            new AttemptUnavailable({ attempt: before, reason: 'invalidOrderTarget' }),
          )
      }
      const override: OrderOverride = { attempt: command.attempt, position: command.position }
      return Result.succeed({
        ...state,
        orderOverrides: [
          ...state.orderOverrides.filter((item) => !sameAttempt(item.attempt, command.attempt)),
          override,
        ],
      })
    }
    case 'ResetOrder':
      return Result.succeed({ ...state, orderOverrides: [] })
    case 'SetDidNotStart': {
      const entry = state.entries.find((item) => item.id === command.entryId)
      if (!entry)
        return Result.fail(new EntryRejected({ entryId: command.entryId, reason: 'unknownEntry' }))
      if (!entry.lifts.some((item) => item.liftId === command.liftId))
        return Result.fail(new EntryRejected({ entryId: command.entryId, reason: 'unknownLift' }))
      const others = state.didNotStart.filter(
        (item) => !(item.entryId === command.entryId && item.liftId === command.liftId),
      )
      if (!command.value) return Result.succeed({ ...state, didNotStart: others })
      // A lifter who has been judged in this lift did start.
      const judged = state.attempts.find(
        (item) =>
          item._tag === 'Judged' &&
          item.entryId === command.entryId &&
          item.liftId === command.liftId,
      )
      if (judged)
        return Result.fail(new AttemptUnavailable({ attempt: judged, reason: 'alreadyJudged' }))
      return Result.succeed({
        ...state,
        didNotStart: [...others, { entryId: command.entryId, liftId: command.liftId }],
      })
    }
    case 'SetScoreboard': {
      const book = state.rulebook
      const { filter } = command
      const known =
        (!filter.divisionId || book.divisions.some((item) => item.id === filter.divisionId)) &&
        (!filter.liftId || book.lifts.some((item) => item.id === filter.liftId)) &&
        (!filter.ageClassId || book.ageClasses.some((item) => item.id === filter.ageClassId)) &&
        (!filter.weightClassId ||
          book.weightClasses.some((item) => item.id === filter.weightClassId))
      if (!known) return Result.fail(new InvalidCommand({ detail: 'unknownScoreboardFilter' }))
      return Result.succeed({
        ...state,
        scoreboard: { filter, qrUrl: Option.fromUndefinedOr(command.qrUrl) },
      })
    }
    case 'UpsertTeam': {
      const canonical = command.team.name.trim().normalize('NFC').toLowerCase()
      if (
        state.teams.some(
          (team) =>
            team.id !== command.team.id &&
            team.name.trim().normalize('NFC').toLowerCase() === canonical,
        )
      )
        return Result.fail(new TeamConflict({ teamId: command.team.id, reason: 'duplicateName' }))
      const teams = state.teams.some((team) => team.id === command.team.id)
        ? state.teams.map((team) => (team.id === command.team.id ? command.team : team))
        : [...state.teams, command.team]
      return Result.succeed({ ...state, teams })
    }
    case 'MergeTeams': {
      if (
        command.from === command.into ||
        !state.teams.some((team) => team.id === command.from) ||
        !state.teams.some((team) => team.id === command.into)
      )
        return Result.fail(new TeamConflict({ teamId: command.from, reason: 'invalidMerge' }))
      const entries = state.entries.map((entry) =>
        entry.lifter.teamId === command.from
          ? { ...entry, lifter: { ...entry.lifter, teamId: command.into } }
          : entry,
      )
      return replaceEntries(
        { ...state, teams: state.teams.filter((team) => team.id !== command.from) },
        entries,
      )
    }
  }
}

/** Replay supplied order. Undo cancels exactly its named mutation and retains independent later fields. */
export function replay(
  rulebook: Rulebook,
  date: CalendarDate,
  commands: ReadonlyArray<Command>,
): Result.Result<ContestState, ContestFailure> {
  const initial: ContestState = {
    rulebook,
    date,
    entries: [],
    teams: [],
    attempts: [],
    selected: Option.none(),
    orderOverrides: [],
    didNotStart: [],
    warnings: [],
    scoreboard: { filter: {}, qrUrl: Option.none() },
    clock: Option.none(),
  }
  let state = initial
  let active: ReadonlyArray<{ readonly command: Mutation; readonly sequence: number }> = []
  const identifiers = new Set<CommandId>()
  for (const [index, command] of commands.entries()) {
    if (identifiers.has(command.id))
      return Result.fail(new InvalidCommand({ detail: 'Command identifiers must be unique' }))
    identifiers.add(command.id)
    if (command._tag === 'Undo') {
      const target = command.target
      if (!active.some((item) => item.command.id === target))
        return Result.fail(new NothingToUndo())
      const remaining = active.filter((item) => item.command.id !== target)
      let restored = initial
      for (const item of remaining) {
        const next = applyMutation(restored, item.command, item.sequence)
        if (Result.isFailure(next))
          return Result.fail(new UndoConflict({ detail: next.failure._tag }))
        restored = next.success
      }
      state = restored
      active = remaining
    } else {
      const next = applyMutation(state, command, index + 1)
      if (Result.isFailure(next)) return next
      state = next.success
      active = [...active, { command, sequence: index + 1 }]
    }
  }
  return Result.succeed(state)
}

/** Incremental replay with the same command and targeted Undo semantics as restore. */
export class ContestJournal {
  readonly state: ContestState
  readonly commands: ReadonlyArray<Command>
  private constructor(state: ContestState, commands: ReadonlyArray<Command>) {
    this.state = state
    this.commands = commands
  }
  static restore(
    rulebook: Rulebook,
    date: CalendarDate,
    commands: ReadonlyArray<Command>,
  ): Result.Result<ContestJournal, ContestFailure> {
    return Result.map(
      replay(rulebook, date, commands),
      (state) => new ContestJournal(state, commands),
    )
  }
  append(command: Command): Result.Result<ContestJournal, ContestFailure> {
    if (this.commands.some((past) => past.id === command.id)) return Result.succeed(this)
    const commands = [...this.commands, command]
    if (command._tag === 'Undo')
      return ContestJournal.restore(this.state.rulebook, this.state.date, commands)
    return Result.map(
      applyMutation(this.state, command, commands.length),
      (state) => new ContestJournal(state, commands),
    )
  }
}
