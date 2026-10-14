import type { ContestState } from '@werewolf/core'
import { clockText, useClockSeconds } from './clock.ts'
import { useLegacy } from './legacy-i18n.ts'

/**
 * The attempt clock at the desk, sized like the filter buttons. One button walks through the
 * states: start, then stop (the clock freezes on its second), then reset to the full time.
 */
export function ClockControl({
  state,
  submit,
}: {
  readonly state: ContestState
  readonly submit: (input: object) => void
}) {
  const { lt } = useLegacy()
  const full = state.rulebook.clockSeconds ?? 60
  const seconds = useClockSeconds(state.clock, full)
  const { clock } = state
  const action =
    clock._tag === 'Idle'
      ? {
          label: lt('v2.clock.start'),
          command: { _tag: 'StartClock', seconds: full },
          primary: true,
        }
      : clock._tag === 'Running'
        ? { label: lt('v2.clock.stop'), command: { _tag: 'StopClock' }, primary: true }
        : { label: lt('v2.clock.reset'), command: { _tag: 'ResetClock' }, primary: false }
  const urgent = clock._tag === 'Running' && seconds <= 10
  return (
    <div className="flex items-stretch gap-2" aria-label={lt('v2.clock.title')}>
      <div className="btn-secondary flex min-w-[120px] items-center justify-between gap-3 px-3 py-1 text-xxs">
        <span className="font-semibold">{lt('v2.clock.short')}</span>
        <span
          className={
            'font-mono text-lg leading-none tabular-nums ' +
            (urgent
              ? 'text-primary-red'
              : clock._tag === 'Stopped'
                ? 'text-status-warning'
                : 'text-text-primary')
          }
          role="timer"
        >
          {clockText(seconds)}
        </span>
      </div>
      <button
        type="button"
        className={
          (action.primary ? 'btn-primary' : 'btn-secondary') + ' min-w-[130px] px-3 py-1 text-xxs'
        }
        onClick={() => submit(action.command)}
      >
        {action.label}
      </button>
    </div>
  )
}
