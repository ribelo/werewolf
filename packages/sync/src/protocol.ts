import { CalendarDate, Command, CommandId, Rulebook, formatVersion } from '@werewolf/core'
import * as Schema from 'effect/Schema'

export const ContestId = Schema.NonEmptyString.check(Schema.isPattern(/^[A-Za-z0-9_-]+$/)).pipe(
  Schema.brand('ContestId'),
)
export type ContestId = typeof ContestId.Type
export const ContestSummary = Schema.Struct({
  id: ContestId,
  name: Schema.NonEmptyString,
  date: CalendarDate,
})
export type ContestSummary = typeof ContestSummary.Type
export const ContestDefinition = Schema.Struct({ ...ContestSummary.fields, rulebook: Rulebook })
export type ContestDefinition = typeof ContestDefinition.Type
export const Catalog = Schema.Struct({ contests: Schema.Array(ContestSummary) })
export const LoggedCommand = Schema.Struct({
  sequence: Schema.Int.check(Schema.isGreaterThan(0)),
  command: Command,
})
export type LoggedCommand = typeof LoggedCommand.Type
export const Snapshot = Schema.Struct({
  formatVersion: Schema.Literal(formatVersion),
  definition: ContestDefinition,
  commands: Schema.Array(LoggedCommand),
}).check(
  Schema.makeFilter(
    (snapshot) =>
      snapshot.commands.every((item, index) => item.sequence === index + 1) &&
      new Set(snapshot.commands.map((item) => item.command.id)).size === snapshot.commands.length,
  ),
)
export type Snapshot = typeof Snapshot.Type
export const ReadLinks = Schema.Struct({
  stage: Schema.NonEmptyString,
  announcer: Schema.NonEmptyString,
  results: Schema.NonEmptyString,
})
export type ReadLinks = typeof ReadLinks.Type
export const ClientFrame = Schema.TaggedStruct('Submit', { command: Command })
export type ClientFrame = typeof ClientFrame.Type
export const Failure = Schema.TaggedStruct('Failure', {
  code: Schema.Literals([
    'request.invalid',
    'request.failed',
    'request.notFound',
    'auth.required',
    'auth.readOnly',
  ]),
})
export const Accepted = Schema.TaggedStruct('Accepted', LoggedCommand.fields)
export type Accepted = typeof Accepted.Type
export const Rejected = Schema.TaggedStruct('Rejected', {
  commandId: CommandId,
  reason: Schema.NonEmptyString,
})
export const ServerFrame = Schema.Union([
  Schema.TaggedStruct('Snapshot', { snapshot: Snapshot }),
  Accepted,
  Rejected,
  Failure,
])
export type ServerFrame = typeof ServerFrame.Type
