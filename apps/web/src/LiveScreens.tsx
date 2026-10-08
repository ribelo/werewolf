import {
  currentAttempt,
  entryAgeClass,
  entryWeightClass,
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
    ageClass: (entry: Entry) => {
      const id = entryAgeClass(state, entry)
      return Option.isSome(id)
        ? (state.rulebook.ageClasses.find((item) => item.id === id.value)?.name[locale] ?? '')
        : ''
    },
    weightClass: (entry: Entry) => {
      const id = entryWeightClass(state, entry)
      return Option.isSome(id)
        ? (state.rulebook.weightClasses.find((item) => item.id === id.value)?.name[locale] ?? '')
        : ''
    },
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
    <p
      className={
        'verdict mt-4 inline-block px-4 py-2 font-display text-xl tracking-wider uppercase ' +
        last.verdict +
        (last.verdict === 'goodLift'
          ? ' bg-status-success text-green-100'
          : ' bg-status-error text-red-100')
      }
      role="status"
    >
      {t('stage.lastVerdict')}: {entry.lifter.name} — {names.lift(last.liftId)} #{last.number},{' '}
      {last.weight} kg — {t(last.verdict === 'goodLift' ? 'desk.goodLift' : 'desk.noLift')}
    </p>
  )
}

/** The big screen, laid out like the 2025 one: name, one card per attempt, plates and their legend. */
export function Stage({ state, title }: { readonly state: ContestState; readonly title: string }) {
  const { t } = useMessages()
  const names = useNames(state)
  const current = currentAttempt(state)
  const entry = Option.flatMap(current, (attempt) =>
    Option.fromUndefinedOr(state.entries.find((item) => item.id === attempt.entryId)),
  )
  if (Option.isNone(current) || Option.isNone(entry))
    return (
      <div className="stage display-view p-8 text-center">
        <h1 className="text-h1 mb-4 tracking-[0.2em] uppercase [text-shadow:0_0_14px_rgba(255,0,64,0.6)]">
          {title}
        </h1>
        <p className="text-h1 text-text-secondary">{t('stage.waiting')}</p>
        <VerdictBanner state={state} />
      </div>
    )
  const load = Result.map(kilograms(current.value.weight), (kg) =>
    loadBarbell(state.rulebook.barbell, entry.value.lifter.sex, kg),
  )
  const attempts = state.attempts.filter(
    (a) => a.entryId === current.value.entryId && a.liftId === current.value.liftId,
  )
  const team = names.team(entry.value)
  const barbell = state.rulebook.barbell
  const info: ReadonlyArray<readonly [string, string]> = [
    [t('stage.team'), team],
    [t('stage.divisions'), entry.value.divisions.map(names.division).join(', ')],
    ...(typeof entry.value.bodyweight === 'number'
      ? ([[t('stage.bodyweight'), entry.value.bodyweight.toFixed(2) + ' kg']] as const)
      : []),
    [t('stage.ageClass'), names.ageClass(entry.value)],
    [t('stage.weightClass'), names.weightClass(entry.value)],
  ]
  return (
    <div className="stage display-view">
      <h1 className="text-h1 py-4 text-center tracking-[0.2em] uppercase [text-shadow:0_0_14px_rgba(255,0,64,0.6)]">
        {title}
      </h1>
      <div className="card mx-4">
        <h2 className="stage-name font-mono text-5xl tracking-[0.5em] uppercase">
          {entry.value.lifter.name}
        </h2>
        <p className="mt-2 text-xs font-semibold tracking-[0.35em] text-text-secondary uppercase">
          {names.lift(current.value.liftId)}
          {info
            .filter(([, value]) => value !== '')
            .map(([label, value]) => (
              <span key={label}>
                {' • '}
                {label}: <span className="text-text-primary">{value}</span>
              </span>
            ))}
        </p>
        <div
          className="mt-6 grid gap-4"
          style={{ gridTemplateColumns: 'repeat(' + attempts.length + ', minmax(0, 1fr))' }}
        >
          {attempts.map((attempt) => {
            const isCurrent = attempt.number === current.value.number
            const tone =
              attempt._tag === 'Judged'
                ? attempt.verdict === 'goodLift'
                  ? 'border-green-600 bg-[#1b3a2a]'
                  : 'border-red-600 bg-[#3a1b1b]'
                : 'border-border-color bg-element-bg'
            return (
              <div
                key={attempt.number}
                data-current={isCurrent}
                className={
                  'attempt-card border px-4 py-6 text-center ' +
                  tone +
                  (isCurrent
                    ? ' scale-105 border-2 border-white shadow-[0_0_60px_rgba(255,255,255,0.35)]'
                    : '')
                }
              >
                <p className="font-display text-lg tracking-wide text-text-secondary uppercase">
                  {t('stage.attempt')} {attempt.number}
                </p>
                <p className="mt-8 font-mono text-6xl font-bold">
                  {attempt._tag === 'Unannounced' ? '—' : attempt.weight.toFixed(2)}
                  <span className="ml-3 text-2xl font-normal text-text-secondary">KG</span>
                </p>
              </div>
            )
          })}
        </div>
        {Result.isSuccess(load) && (
          <div className="mt-8 flex items-center gap-8">
            <div className="w-72 shrink-0">
              <Barbell plates={load.success.platesPerSide} />
            </div>
            <div className="min-w-0 flex-1 text-center">
              <p className="font-mono text-3xl tracking-[0.2em] uppercase">
                {load.success.platesPerSide.map((stack) => (
                  <span key={stack.weight} className="mr-6 inline-block">
                    {stack.weight} KG{' '}
                    <span className="text-base text-text-secondary">×{stack.count}</span>
                  </span>
                ))}
              </p>
              <p className="mt-3 font-mono text-lg tracking-[0.2em] text-text-secondary uppercase">
                {t('plates.bar')}: {barbell.bars[entry.value.lifter.sex].toFixed(2)} KG
                {barbell.clampsPerSide > 0 && (
                  <>
                    {' '}
                    {t('plates.clamps')}: {barbell.clampsPerSide.toFixed(2)} KG
                  </>
                )}
              </p>
            </div>
          </div>
        )}
        <VerdictBanner state={state} />
      </div>
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
    <div className="announcer display-view p-4">
      <div className="card">
        {Option.isSome(current) && Option.isSome(entry) ? (
          <h2 className="text-h1 uppercase">
            {entry.value.lifter.name} — {names.lift(current.value.liftId)} #{current.value.number}:{' '}
            <span className="font-mono text-accent-red">{current.value.weight} kg</span>
          </h2>
        ) : (
          <h2 className="text-h1 text-text-secondary">{t('stage.waiting')}</h2>
        )}
        <VerdictBanner state={state} />
      </div>
      <div className="card">
        <h3 className="text-h3 mb-2">{t('announcer.next')}</h3>
        <ol className="upcoming divide-y divide-border-color">
          {upcoming.map((a) => (
            <li key={a.entryId + '/' + a.liftId + '/' + a.number} className="py-2 font-mono">
              {state.entries.find((item) => item.id === a.entryId)?.lifter.name} —{' '}
              {names.lift(a.liftId)} #{a.number}: <strong>{a.weight} kg</strong>
            </li>
          ))}
        </ol>
      </div>
      <div className="card">
        <h3 className="text-h3 mb-2">{t('announcer.places')}</h3>
        <ul className="places text-text-secondary">
          {Option.isSome(entry) &&
            entry.value.divisions.map((division) => (
              <li key={division} className="text-text-primary">
                {names.division(division)}
              </li>
            ))}
          {places.map((p) => (
            <li key={p.classificationId}>
              {names.classification(p.classificationId)}:{' '}
              <strong className="text-text-primary">{p.place}.</strong>
            </li>
          ))}
          {places.length === 0 && Option.isSome(entry) && <li>{t('announcer.noPlace')}</li>}
        </ul>
      </div>
    </div>
  )
}
