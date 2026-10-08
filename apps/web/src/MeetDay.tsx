import {
  currentAttempt,
  Kilograms,
  liftingOrder,
  loadBarbell,
  type Attempt,
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
    <form className="weight-form" onSubmit={declare}>
      <input
        aria-label={t('desk.weight')}
        name="weight"
        type="number"
        min="0"
        step="0.001"
        value={text}
        onChange={(event) => setText(event.target.value)}
        required
      />
      <button type="submit" disabled={!Result.isSuccess(parsed) || Option.isSome(nearest)}>
        {t('desk.declare')}
      </button>
      {Option.isSome(nearest) && (
        <span role="alert">
          {t('meet.unloadable')} {t('meet.nearest')}: {nearest.value}{' '}
          <button type="button" onClick={() => setText(String(nearest.value))}>
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
    <p className="plates">
      {t('meet.plates')}:{' '}
      {load.success.platesPerSide.length === 0
        ? t('meet.bar')
        : load.success.platesPerSide.map((stack) => stack.count + '×' + stack.weight).join(' + ')}
    </p>
  )
}

function lastJudged(state: ContestState): Option.Option<Attempt & { readonly _tag: 'Judged' }> {
  let best: Option.Option<Attempt & { readonly _tag: 'Judged' }> = Option.none()
  for (const attempt of state.attempts)
    if (
      attempt._tag === 'Judged' &&
      (Option.isNone(best) || attempt.achievedAt >= best.value.achievedAt)
    )
      best = Option.some(attempt)
  return best
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
  const judged = lastJudged(state)
  const following = Option.flatMap(judged, (past) =>
    Option.fromUndefinedOr(
      state.attempts.find(
        (item) =>
          item._tag === 'Unannounced' &&
          item.entryId === past.entryId &&
          item.liftId === past.liftId &&
          item.number === past.number + 1,
      ),
    ),
  )
  const undoTarget = commands.findLast(
    (command) =>
      command._tag !== 'Undo' &&
      !commands.some((other) => other._tag === 'Undo' && other.target === command.id),
  )
  const followingEntry = Option.flatMap(following, (attempt) =>
    Option.fromUndefinedOr(entryOf(attempt)),
  )
  const currentEntry = Option.flatMap(current, (attempt) =>
    Option.fromUndefinedOr(entryOf(attempt)),
  )
  return (
    <section aria-label={t('meet.title')}>
      <h3>{t('meet.title')}</h3>
      <div className="current">
        <h4>{t('meet.current')}</h4>
        {Option.isSome(current) && Option.isSome(currentEntry) ? (
          <>
            <p className="current-line">
              <strong>{currentEntry.value.lifter.name}</strong> — {liftName(current.value)} #
              {current.value.number}: <strong>{current.value.weight} kg</strong>
              {teamName(currentEntry.value) && <> · {teamName(currentEntry.value)}</>}
            </p>
            <Plates state={state} entry={currentEntry.value} weight={current.value.weight} />
            {editor && (
              <p>
                <button type="button" className="good" onClick={() => verdict('goodLift')}>
                  {t('desk.goodLift')}
                </button>{' '}
                <button type="button" className="bad" onClick={() => verdict('noLift')}>
                  {t('desk.noLift')}
                </button>
              </p>
            )}
            {editor && <small>{t('meet.shortcuts')}</small>}
          </>
        ) : (
          <p>{t('meet.none')}</p>
        )}
      </div>
      {editor && Option.isSome(following) && Option.isSome(judged) && (
        <div className="next-attempt">
          <h4>{t('meet.next')}</h4>
          <p>
            {entryOf(following.value)?.lifter.name} — {liftName(following.value)} #
            {following.value.number}
          </p>
          {Option.isSome(followingEntry) && (
            <WeightForm
              state={state}
              entry={followingEntry.value}
              attempt={following.value}
              initial={String(judged.value.weight)}
              submit={submit}
            />
          )}
        </div>
      )}
      {editor && (
        <p>
          <button
            type="button"
            disabled={!undoTarget}
            onClick={() => undoTarget && submit({ _tag: 'Undo', target: undoTarget.id })}
          >
            {t('meet.undo')}
          </button>{' '}
          <button type="button" onClick={() => submit({ _tag: 'ResetOrder' })}>
            {t('meet.resetOrder')}
          </button>
        </p>
      )}
      <h4>{t('meet.order')}</h4>
      <div className="table-scroll">
        <table>
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
                        disabled={isCurrent}
                        onClick={() => submit({ _tag: 'SetCurrent', attempt: reference(attempt) })}
                      >
                        {t('meet.setCurrent')}
                      </button>{' '}
                      <button
                        type="button"
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
    </section>
  )
}
