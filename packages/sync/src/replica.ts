import { Command, ContestJournal, type ContestFailure } from '@werewolf/core'
import * as Data from 'effect/Data'
import * as Result from 'effect/Result'
import * as Schema from 'effect/Schema'
import { Snapshot, type ServerFrame } from './protocol.ts'

const RejectedCommand = Schema.Struct({ command: Command, reason: Schema.NonEmptyString })
export const ReplicaState = Schema.Struct({
  snapshot: Snapshot,
  pending: Schema.Array(Command),
  rejected: Schema.Array(RejectedCommand),
}).check(
  Schema.makeFilter(
    (state) => new Set(state.pending.map((command) => command.id)).size === state.pending.length,
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
    let journal = accepted
    const conflicts: Array<typeof RejectedCommand.Type> = []
    for (const command of pending) {
      const appended = journal.append(command)
      if (Result.isFailure(appended))
        conflicts.push({ command, reason: rejectionReason(appended.failure) })
      else journal = appended.success
    }
    return new ContestReplica({ ...state, pending }, accepted, journal, conflicts)
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

  /** Duplicate acknowledgments are harmless. A gap requires a new authoritative snapshot. */
  receive(
    frame: Exclude<ServerFrame, { readonly _tag: 'Failure' }>,
  ): Result.Result<ContestReplica, ContestFailure | ReplicaConflict> {
    switch (frame._tag) {
      case 'Snapshot':
        if (frame.snapshot.definition.id !== this.state.snapshot.definition.id)
          return Result.fail(new ReplicaConflict({ reason: 'wrongContest' }))
        return ContestReplica.restore({ ...this.state, snapshot: frame.snapshot })
      case 'Rejected': {
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
