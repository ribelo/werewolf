import {
  currentAttempt,
  individualRankings,
  Kilograms,
  liftingOrder,
  loadBarbell,
  type Attempt,
  type ContestState,
  type Entry,
} from '@werewolf/core'
import * as Option from 'effect/Option'
import * as Result from 'effect/Result'
import * as Schema from 'effect/Schema'
import { Barbell } from './Barbell.tsx'
import { useMessages } from './i18n.ts'

const kilograms = Schema.decodeUnknownResult(Kilograms)
function useNames(state: ContestState) {
  const { locale } = useMessages()
  return {
    lift: (id: string) => state.rulebook.lifts.find((item) => item.id === id)?.name[locale] ?? id,
    division: (id: string) =>
      state.rulebook.divisions.find((item) => item.id === id)?.name[locale] ?? id,
    team: (entry: Entry) => state.teams.find((team) => team.id === entry.lifter.teamId)?.name ?? '',
    classification: (id: string) =>
      state.rulebook.classifications.find((item) => item.id === id)?.name[locale] ?? id,
  }
}
function lastVerdict(state: ContestState) {
  return state.attempts
    .filter((a): a is Attempt & { readonly _tag: 'Judged' } => a._tag === 'Judged')
    .toSorted((a, b) => b.sequence - a.sequence)
    .at(0)
}
function VerdictBanner({ state }: { readonly state: ContestState }) {
  const { t } = useMessages()
  const names = useNames(state)
  const last = lastVerdict(state)
  const entry = state.entries.find((item) => item.id === last?.entryId)
  if (!last || !entry) return <></>
  return (
    <p className={'verdict ' + last.verdict} role="status">
      {t('stage.lastVerdict')}: {entry.lifter.name} — {names.lift(last.liftId)} #{last.number},{' '}
      {last.weight} kg — {t(last.verdict === 'goodLift' ? 'desk.goodLift' : 'desk.noLift')}
    </p>
  )
}

/** The big screen: who lifts, what weight, and the plates the loaders must put on. */
export function Stage({ state }: { readonly state: ContestState }) {
  const { t } = useMessages()
  const names = useNames(state)
  const current = currentAttempt(state)
  const entry = Option.flatMap(current, (attempt) =>
    Option.fromUndefinedOr(state.entries.find((item) => item.id === attempt.entryId)),
  )
  if (Option.isNone(current) || Option.isNone(entry))
    return (
      <div className="stage">
        <p>{t('stage.waiting')}</p>
        <VerdictBanner state={state} />
      </div>
    )
  const load = Result.map(kilograms(current.value.weight), (kg) =>
    loadBarbell(state.rulebook.barbell, entry.value.lifter.sex, kg),
  )
  const previous = state.attempts.filter(
    (a) =>
      a.entryId === current.value.entryId &&
      a.liftId === current.value.liftId &&
      a.number < current.value.number,
  )
  const team = names.team(entry.value)
  return (
    <div className="stage">
      <h2 className="stage-name">{entry.value.lifter.name}</h2>
      <p>
        {names.lift(current.value.liftId)} · #{current.value.number}
        {team && (
          <>
            {' '}
            · {t('stage.team')}: {team}
          </>
        )}
      </p>
      <p>
        {t('stage.divisions')}: {entry.value.divisions.map(names.division).join(', ')}
        {typeof entry.value.bodyweight === 'number' && (
          <>
            {' '}
            · {t('stage.bodyweight')}: {entry.value.bodyweight} kg
          </>
        )}
      </p>
      <p className="stage-weight">{current.value.weight} kg</p>
      {Result.isSuccess(load) && <Barbell plates={load.success.platesPerSide} />}
      <p>
        {t('stage.previous')}:{' '}
        {previous.length === 0
          ? '—'
          : previous
              .map((a) =>
                a._tag === 'Judged'
                  ? a.weight + (a.verdict === 'goodLift' ? ' ✓' : ' ✗')
                  : a._tag === 'Declared'
                    ? String(a.weight)
                    : '—',
              )
              .join(' · ')}
      </p>
      <VerdictBanner state={state} />
    </div>
  )
}

/** The speaker's view: the lifter on the platform, the next ones and live places. */
export function Announcer({ state }: { readonly state: ContestState }) {
  const { t } = useMessages()
  const names = useNames(state)
  const order = liftingOrder(state)
  const current = currentAttempt(state)
  const entry = Option.flatMap(current, (attempt) =>
    Option.fromUndefinedOr(state.entries.find((item) => item.id === attempt.entryId)),
  )
  const upcoming = order
    .filter(
      (a) =>
        Option.isNone(current) ||
        a.entryId !== current.value.entryId ||
        a.number !== current.value.number ||
        a.liftId !== current.value.liftId,
    )
    .slice(0, 5)
  const places = Option.isSome(entry)
    ? individualRankings(state).flatMap((ranking) => {
        const id = entry.value.id
        const row = ranking.groups
          .flatMap((group) => group.rows)
          .find((item) => item.entry.id === id)
        return row
          ? [{ classificationId: ranking.classificationId, place: row.place, points: row.points }]
          : []
      })
    : []
  return (
    <div className="announcer">
      {Option.isSome(current) && Option.isSome(entry) ? (
        <h2>
          {entry.value.lifter.name} — {names.lift(current.value.liftId)} #{current.value.number}:{' '}
          {current.value.weight} kg
        </h2>
      ) : (
        <h2>{t('stage.waiting')}</h2>
      )}
      <VerdictBanner state={state} />
      <h3>{t('announcer.next')}</h3>
      <ol className="upcoming">
        {upcoming.map((a) => (
          <li key={a.entryId + '/' + a.liftId + '/' + a.number}>
            {state.entries.find((item) => item.id === a.entryId)?.lifter.name} —{' '}
            {names.lift(a.liftId)} #{a.number}: {a.weight} kg
          </li>
        ))}
      </ol>
      <h3>{t('announcer.places')}</h3>
      <ul className="places">
        {Option.isSome(entry) &&
          entry.value.divisions.map((division) => (
            <li key={division}>{names.division(division)}</li>
          ))}
        {places.map((p) => (
          <li key={p.classificationId}>
            {names.classification(p.classificationId)}: {p.place}.
          </li>
        ))}
        {places.length === 0 && Option.isSome(entry) && <li>{t('announcer.noPlace')}</li>}
      </ul>
    </div>
  )
}
