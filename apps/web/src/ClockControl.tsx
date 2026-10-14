import type { ContestState } from '@werewolf/core'
import * as Option from 'effect/Option'
import { clockText, useCountdown } from './clock.ts'
import { useLegacy } from './legacy-i18n.ts'

/** The attempt clock at the desk: the time left and the start and stop buttons. */
export function ClockControl({
  state,
  submit,
  className = '',
}: {
  readonly state: ContestState
  readonly submit: (input: object) => void
  readonly className?: string
}) {
  const { lt } = useLegacy()
  const remaining = useCountdown(state.clock)
  const seconds = state.rulebook.clockSeconds ?? 60
  return (
    <div className={'flex flex-wrap items-center justify-between gap-3 ' + className}>
      <div>
        <h4 className="text-label text-text-secondary">{lt('v2.clock.title')}</h4>
        <p
          className={
            'weight-medium mt-1 ' +
            (Option.isSome(remaining) && remaining.value <= 10
              ? 'text-primary-red'
              : 'text-text-primary')
          }
        >
          {Option.match(remaining, { onNone: () => clockText(seconds), onSome: clockText })}
        </p>
      </div>
      <div className="flex gap-2">
        <button
          type="button"
          className="btn-primary px-4 py-2 text-xxs"
          onClick={() => submit({ _tag: 'StartClock', seconds })}
        >
          {lt('v2.clock.start')}
        </button>
        <button
          type="button"
          className="btn-secondary px-4 py-2 text-xxs"
          disabled={Option.isNone(state.clock)}
          onClick={() => submit({ _tag: 'StopClock' })}
        >
          {lt('v2.clock.stop')}
        </button>
      </div>
    </div>
  )
}
