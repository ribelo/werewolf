import { Command, ContestJournal, type ContestFailure } from '@werewolf/core'
import * as Data from 'effect/Data'
import * as Result from 'effect/Result'
import * as Schema from 'effect/Schema'
import { Snapshot, type ServerFrame } from './protocol.ts'

const RejectedCommand = Schema.Struct({ command: Command, reason: Schema.NonEmptyString })
export const ReplicaState = Schema.Struct({
  snapshot: Snapshot,
  pending: Schema.Array(Command),
  /** Commands heard from editing peers that the server has not accepted yet. */
  heard: Schema.Array(Command),
  rejected: Schema.Array(RejectedCommand),
}).check(
  Schema.makeFilter(
    (state) =>
      new Set([...state.pending, ...state.heard].map((command) => command.id)).size ===
      state.pending.length + state.heard.length,
  ),
)
export type ReplicaState = typeof ReplicaState.Type
export class ReplicaConflict extends Data.TaggedError('ReplicaConflict')<{
  readonly reason: 'wrongContest' | 'sequenceGap' | 'sequenceConflict'
}> {}

function rejectionReason(failure: ContestFailure): string {
  return 'reason' in failure ? failure.reason : failure._tag
}

/** Server order owns accepted state; pending commands retain their original IDs and timestamps. */
export class ContestReplica {
  readonly state: ReplicaState
  private readonly accepted: ContestJournal
  readonly journal: ContestJournal
  readonly conflicts: ReadonlyArray<typeof RejectedCommand.Type>
  private constructor(
    state: ReplicaState,
    accepted: ContestJournal,
    journal: ContestJournal,
    conflicts: ReadonlyArray<typeof RejectedCommand.Type>,
  ) {
    this.state = state
    this.accepted = accepted
    this.journal = journal
    this.conflicts = conflicts
  }

  /** Restore the accepted log once, then project the retained queue over it. */
  static restore(state: ReplicaState): Result.Result<ContestReplica, ContestFailure> {
    const { definition, commands } = state.snapshot
    return Result.map(
      ContestJournal.restore(
        definition.rulebook,
        definition.date,
        commands.map((item) => item.command),
      ),
      (accepted) => ContestReplica.project(state, accepted),
    )
  }

  private static project(state: ReplicaState, accepted: ContestJournal): ContestReplica {
    const known = new Set(state.snapshot.commands.map((item) => item.command.id))
    const pending = state.pending.filter((command) => !known.has(command.id))
    const heard = state.heard.filter((command) => !known.has(command.id))
    let journal = accepted
    const conflicts: Array<typeof RejectedCommand.Type> = []
    // Peer commands come first: they were made by other devices and carry no local intent.
    for (const command of [...heard, ...pending]) {
      const appended = journal.append(command)
      if (Result.isFailure(appended))
        conflicts.push({ command, reason: rejectionReason(appended.failure) })
      else journal = appended.success
    }
    return new ContestReplica({ ...state, pending, heard }, accepted, journal, conflicts)
  }

  /** A locally invalid command is not queued. Rebase conflicts stay queued until server judgment. */
  enqueue(command: Command): Result.Result<ContestReplica, ContestFailure> {
    if (
      this.state.pending.some((item) => item.id === command.id) ||
      this.state.snapshot.commands.some((item) => item.command.id === command.id)
    )
      return Result.succeed(this)
    return Result.map(
      this.journal.append(command),
      (journal) =>
        new ContestReplica(
          { ...this.state, pending: [...this.state.pending, command] },
          this.accepted,
          journal,
          this.conflicts,
        ),
    )
  }

  /** Commands this device may offer to a peer or to the server, oldest decision first. */
  get outbox(): ReadonlyArray<Command> {
    return [...this.state.heard, ...this.state.pending]
  }

  /**
   * Take commands from an editing peer. Known or unusable commands change nothing.
   * The server order replaces this guess as soon as the commands reach the Durable Object.
   */
  hear(commands: ReadonlyArray<Command>) {
    return ContestReplica.adopt(this, commands)
  }

  private static adopt(
    start: ContestReplica,
    commands: ReadonlyArray<Command>,
  ): { readonly replica: ContestReplica; readonly fresh: ReadonlyArray<Command> } {
    let replica = start
    const fresh: Array<Command> = []
    for (const command of commands) {
      const present = (item: Command) => item.id === command.id
      if (
        replica.state.snapshot.commands.some((item) => present(item.command)) ||
        replica.state.pending.some(present) ||
        replica.state.heard.some(present)
      )
        continue
      const trial = replica.journal.append(command)
      if (Result.isFailure(trial)) continue
      replica = new ContestReplica(
        { ...replica.state, heard: [...replica.state.heard, command] },
        replica.accepted,
        trial.success,
        replica.conflicts,
      )
      fresh.push(command)
    }
    return { replica, fresh }
  }

  /** Duplicate acknowledgments are harmless. A gap requires a new authoritative snapshot. */
  receive(
    frame: Exclude<ServerFrame, { readonly _tag: 'Failure' | 'Signal' | 'Presence' }>,
  ): Result.Result<ContestReplica, ContestFailure | ReplicaConflict> {
    switch (frame._tag) {
      case 'Snapshot':
        if (frame.snapshot.definition.id !== this.state.snapshot.definition.id)
          return Result.fail(new ReplicaConflict({ reason: 'wrongContest' }))
        return ContestReplica.restore({ ...this.state, snapshot: frame.snapshot })
      case 'Rejected': {
        const heard = this.state.heard.find((item) => item.id === frame.commandId)
        if (heard)
          return Result.succeed(
            ContestReplica.project(
              {
                ...this.state,
                heard: this.state.heard.filter((item) => item.id !== frame.commandId),
              },
              this.accepted,
            ),
          )
        const command = this.state.pending.find((item) => item.id === frame.commandId)
        if (!command) return Result.succeed(this)
        return Result.succeed(
          ContestReplica.project(
            {
              ...this.state,
              pending: this.state.pending.filter((item) => item.id !== frame.commandId),
              rejected: [
                ...this.state.rejected.filter((item) => item.command.id !== frame.commandId),
                { command, reason: frame.reason },
              ],
            },
            this.accepted,
          ),
        )
      }
      case 'Accepted': {
        const sequence = this.state.snapshot.commands.length
        if (frame.sequence <= sequence) {
          return this.state.snapshot.commands[frame.sequence - 1]?.command.id === frame.command.id
            ? Result.succeed(this)
            : Result.fail(new ReplicaConflict({ reason: 'sequenceConflict' }))
        }
        if (frame.sequence !== sequence + 1)
          return Result.fail(new ReplicaConflict({ reason: 'sequenceGap' }))
        return Result.map(this.accepted.append(frame.command), (accepted) =>
          ContestReplica.project(
            {
              ...this.state,
              snapshot: {
                ...this.state.snapshot,
                commands: [
                  ...this.state.snapshot.commands,
                  { sequence: frame.sequence, command: frame.command },
                ],
              },
              rejected: this.state.rejected.filter((item) => item.command.id !== frame.command.id),
            },
            accepted,
          ),
        )
      }
    }
  }
}
