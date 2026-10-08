import {
  currentAttempt,
  Kilograms,
  liftingOrder,
  loadBarbell,
  type AttemptRef,
  type Command,
  type ContestState,
  type Entry,
} from '@werewolf/core'
import * as Option from 'effect/Option'
import * as Result from 'effect/Result'
import * as Schema from 'effect/Schema'
import { useEffect, useState, type FormEvent } from 'react'
import { useMessages } from './i18n.ts'

type Submit = (input: object) => void
const reference = (attempt: AttemptRef): AttemptRef => ({
  entryId: attempt.entryId,
  liftId: attempt.liftId,
  number: attempt.number,
})
const same = (left: AttemptRef, right: AttemptRef) =>
  left.entryId === right.entryId && left.liftId === right.liftId && left.number === right.number
const parseKilograms = Schema.decodeUnknownResult(Kilograms)

/** A declaration is checked against the plates while it is typed, so the desk never calls an impossible weight. */
export function WeightForm({
  state,
  entry,
  attempt,
  initial,
  submit,
}: {
  readonly state: ContestState
  readonly entry: Entry
  readonly attempt: AttemptRef
  readonly initial: string
  readonly submit: Submit
}) {
  const { t } = useMessages()
  const [text, setText] = useState(initial)
  useEffect(() => setText(initial), [initial])
  const parsed = parseKilograms(text === '' ? Number.NaN : Number(text))
  const load = Result.isSuccess(parsed)
    ? Option.some(loadBarbell(state.rulebook.barbell, entry.lifter.sex, parsed.success))
    : Option.none()
  const nearest =
    Option.isSome(load) && load.value._tag === 'Unloadable'
      ? Option.some(load.value.nearest)
      : Option.none()
  function declare(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (Result.isSuccess(parsed) && Option.isNone(nearest))
      submit({ _tag: 'SetWeight', attempt: reference(attempt), weight: parsed.success })
  }
  return (
    <form className="weight-form flex flex-wrap items-center gap-2" onSubmit={declare}>
      <input
        className="input-field w-28 font-mono"
        aria-label={t('desk.weight')}
        name="weight"
        type="number"
        min="0"
        step="0.001"
        value={text}
        onChange={(event) => setText(event.target.value)}
        required
      />
      <button
        className="btn-primary"
        type="submit"
        disabled={!Result.isSuccess(parsed) || Option.isSome(nearest)}
      >
        {t('desk.declare')}
      </button>
      {Option.isSome(nearest) && (
        <span role="alert">
          {t('meet.unloadable')} {t('meet.nearest')}: {nearest.value}{' '}
          <button
            type="button"
            className="btn-secondary px-2 py-1 text-xs"
            onClick={() => setText(String(nearest.value))}
          >
            {t('meet.useNearest')}
          </button>
        </span>
      )}
    </form>
  )
}

function Plates({
  state,
  entry,
  weight,
}: {
  readonly state: ContestState
  readonly entry: Entry
  readonly weight: number
}) {
  const { t } = useMessages()
  const load = Result.map(parseKilograms(weight), (kg) =>
    loadBarbell(state.rulebook.barbell, entry.lifter.sex, kg),
  )
  if (Result.isFailure(load)) return <></>
  return (
    <p className="plates font-mono text-sm text-text-secondary">
      {t('meet.plates')}:{' '}
      {load.success.platesPerSide.length === 0
        ? t('meet.bar')
        : load.success.platesPerSide.map((stack) => stack.count + '×' + stack.weight).join(' + ')}
    </p>
  )
}

export function MeetDay({
  state,
  commands,
  submit,
  editor,
}: {
  readonly state: ContestState
  readonly commands: ReadonlyArray<Command>
  readonly submit: Submit
  readonly editor: boolean
}) {
  const { locale, t } = useMessages()
  const order = liftingOrder(state)
  const current = currentAttempt(state)
  const entryOf = (attempt: AttemptRef) => state.entries.find((item) => item.id === attempt.entryId)
  const liftName = (attempt: AttemptRef) =>
    state.rulebook.lifts.find((item) => item.id === attempt.liftId)?.name[locale] ?? ''
  const teamName = (entry: Entry) =>
    state.teams.find((team) => team.id === entry.lifter.teamId)?.name ?? ''
  const verdict = (value: 'goodLift' | 'noLift') => {
    if (editor && Option.isSome(current))
      submit({ _tag: 'SetVerdict', attempt: reference(current.value), verdict: value })
  }
  useEffect(() => {
    function key(event: KeyboardEvent) {
      const target = event.target
      if (
        event.ctrlKey ||
        event.metaKey ||
        event.altKey ||
        (target instanceof HTMLElement && ['INPUT', 'SELECT', 'TEXTAREA'].includes(target.tagName))
      )
        return
      if (event.key.toLowerCase() === 'g') verdict('goodLift')
      if (event.key.toLowerCase() === 'n') verdict('noLift')
    }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  })
  // Every lifter whose last attempt has a verdict and whose next attempt has no weight yet waits here.
  const awaiting = state.attempts
    .flatMap((item) => {
      if (item._tag !== 'Unannounced') return []
      const before = state.attempts.find(
        (past) =>
          past.entryId === item.entryId &&
          past.liftId === item.liftId &&
          past.number === item.number - 1,
      )
      return before?._tag === 'Judged' ? [{ next: item, before }] : []
    })
    .toSorted((left, right) => right.before.sequence - left.before.sequence)
  const undoTarget = commands.findLast(
    (command) =>
      command._tag !== 'Undo' &&
      !commands.some((other) => other._tag === 'Undo' && other.target === command.id),
  )
  const currentEntry = Option.flatMap(current, (attempt) =>
    Option.fromUndefinedOr(entryOf(attempt)),
  )
  return (
    <section className="space-y-4" aria-label={t('meet.title')}>
      <div className="current card">
        <h4 className="text-h3 mb-2 text-text-secondary">{t('meet.current')}</h4>
        {Option.isSome(current) && Option.isSome(currentEntry) ? (
          <>
            <p className="current-line font-mono text-2xl">
              <strong>{currentEntry.value.lifter.name}</strong> — {liftName(current.value)} #
              {current.value.number}: <strong>{current.value.weight} kg</strong>
              {teamName(currentEntry.value) && <> · {teamName(currentEntry.value)}</>}
            </p>
            <Plates state={state} entry={currentEntry.value} weight={current.value.weight} />
            {editor && (
              <p>
                <button
                  type="button"
                  className="btn-good text-lg"
                  onClick={() => verdict('goodLift')}
                >
                  {t('desk.goodLift')}
                </button>{' '}
                <button type="button" className="btn-bad text-lg" onClick={() => verdict('noLift')}>
                  {t('desk.noLift')}
                </button>{' '}
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() =>
                    submit({
                      _tag: 'SetDidNotStart',
                      entryId: current.value.entryId,
                      liftId: current.value.liftId,
                      value: true,
                    })
                  }
                >
                  {t('meet.dns')}
                </button>
              </p>
            )}
            {editor && <small className="text-xs text-text-secondary">{t('meet.shortcuts')}</small>}
          </>
        ) : (
          <p>{t('meet.none')}</p>
        )}
      </div>
      {editor && awaiting.length > 0 && (
        <div className="next-attempt card border-primary-red">
          <h4 className="text-h3 mb-2">{t('meet.next')}</h4>
          {awaiting.map(({ next, before }) => {
            const entry = entryOf(next)
            return (
              entry && (
                <div key={next.entryId + '/' + next.liftId} className="mb-3">
                  <p>
                    {entry.lifter.name} — {liftName(next)} #{next.number}
                  </p>
                  <WeightForm
                    state={state}
                    entry={entry}
                    attempt={next}
                    initial={String(before.weight)}
                    submit={submit}
                  />
                </div>
              )
            )
          })}
        </div>
      )}
      {editor && (
        <p>
          <button
            type="button"
            className="btn-secondary"
            disabled={!undoTarget}
            onClick={() => undoTarget && submit({ _tag: 'Undo', target: undoTarget.id })}
          >
            {t('meet.undo')}
          </button>{' '}
          <button
            type="button"
            className="btn-secondary"
            onClick={() => submit({ _tag: 'ResetOrder' })}
          >
            {t('meet.resetOrder')}
          </button>
        </p>
      )}
      <div className="card">
        <h4 className="text-h3 mb-2">{t('meet.order')}</h4>
        <div className="table-scroll overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th>{t('meet.position')}</th>
                <th>{t('desk.name')}</th>
                <th>{t('desk.lift')}</th>
                <th>{t('desk.attempt')}</th>
                <th>{t('desk.weight')}</th>
                {editor && <th>{t('desk.actions')}</th>}
              </tr>
            </thead>
            <tbody>
              {order.map((attempt, index) => {
                const isCurrent = Option.isSome(current) && same(current.value, attempt)
                const previous = order[index - 1]
                const after = order[index + 2]
                return (
                  <tr
                    key={attempt.entryId + '/' + attempt.liftId + '/' + attempt.number}
                    aria-current={isCurrent}
                  >
                    <td>{index + 1}</td>
                    <td>{entryOf(attempt)?.lifter.name}</td>
                    <td>{liftName(attempt)}</td>
                    <td>{attempt.number}</td>
                    <td>{attempt.weight}</td>
                    {editor && (
                      <td>
                        <button
                          type="button"
                          className="btn-secondary px-2 py-1 text-xs"
                          disabled={isCurrent}
                          onClick={() =>
                            submit({ _tag: 'SetCurrent', attempt: reference(attempt) })
                          }
                        >
                          {t('meet.setCurrent')}
                        </button>{' '}
                        <button
                          type="button"
                          className="btn-secondary px-2 py-1 text-xs"
                          disabled={!previous}
                          onClick={() =>
                            previous &&
                            submit({
                              _tag: 'MoveAttempt',
                              attempt: reference(attempt),
                              position: { _tag: 'Before', attempt: reference(previous) },
                            })
                          }
                        >
                          {t('meet.up')}
                        </button>{' '}
                        <button
                          type="button"
                          className="btn-secondary px-2 py-1 text-xs"
                          disabled={index === order.length - 1}
                          onClick={() =>
                            submit({
                              _tag: 'MoveAttempt',
                              attempt: reference(attempt),
                              position: after
                                ? { _tag: 'Before', attempt: reference(after) }
                                : { _tag: 'Last' },
                            })
                          }
                        >
                          {t('meet.down')}
                        </button>
                      </td>
                    )}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  )
}
