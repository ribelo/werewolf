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
  /** Town of the contest, shown on the contest list and the desk as in 2025. */
  location: Schema.optionalKey(Schema.String),
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
/** A backup kept in R2: written automatically during the meet or on demand from the desk. */
export const StoredBackup = Schema.Struct({
  name: Schema.NonEmptyString,
  /** Commands in the log when the backup was written. */
  commands: Schema.Int,
  savedAt: Schema.String,
})
export type StoredBackup = typeof StoredBackup.Type
export const StoredBackups = Schema.Struct({ backups: Schema.Array(StoredBackup) })
/** Read-only links; the big screen (telebim) shares the stage token, so old contests need no new token. */
export const ReadLinks = Schema.Struct({
  telebim: Schema.NonEmptyString,
  stage: Schema.NonEmptyString,
  announcer: Schema.NonEmptyString,
  scoreboard: Schema.NonEmptyString,
  results: Schema.NonEmptyString,
})
export type ReadLinks = typeof ReadLinks.Type
/** A device names itself once per tab. Peers address each other by this name. */
export const DeviceId = Schema.NonEmptyString.check(Schema.isPattern(/^[A-Za-z0-9_-]{8,64}$/)).pipe(
  Schema.brand('DeviceId'),
)
export type DeviceId = typeof DeviceId.Type
export const PeerRole = Schema.Literals(['editor', 'viewer'])
export type PeerRole = typeof PeerRole.Type
export const ClientFrame = Schema.Union([
  Schema.TaggedStruct('Submit', { command: Command }),
  /** Opaque WebRTC negotiation text for one other device of the same contest. */
  Schema.TaggedStruct('Signal', { to: DeviceId, payload: Schema.NonEmptyString }),
])
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
/** The Durable Object states the sender's role; a peer cannot claim a role itself. */
export const SignalFrame = Schema.TaggedStruct('Signal', {
  from: DeviceId,
  role: PeerRole,
  payload: Schema.NonEmptyString,
})
export const PresenceFrame = Schema.TaggedStruct('Presence', {
  devices: Schema.Array(Schema.Struct({ device: DeviceId, role: PeerRole })),
})
export const ServerFrame = Schema.Union([
  SignalFrame,
  PresenceFrame,
  Schema.TaggedStruct('Snapshot', { snapshot: Snapshot }),
  Accepted,
  Rejected,
  Failure,
])
export type ServerFrame = typeof ServerFrame.Type
