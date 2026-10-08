import {
  ageOnDate,
  entryAgeClass,
  entryWeightClass,
  Kilograms,
  mcCulloughCoefficient,
  reshelCoefficient,
  type Attempt,
  type ContestState,
  type Entry,
  type ScoreboardFilter,
} from '@werewolf/core'
import * as Option from 'effect/Option'
import * as Schema from 'effect/Schema'
import qrcode from 'qrcode-generator'
import { Fragment, useEffect, useRef, type FormEvent } from 'react'
import { useMessages } from './i18n.ts'

/** Only entries that belong to the chosen division, lift, sex and classes are shown. */
function scoreboardRows(state: ContestState, filter: ScoreboardFilter): ReadonlyArray<Entry> {
  return state.entries
    .filter(
      (entry) =>
        (!filter.divisionId || entry.divisions.includes(filter.divisionId)) &&
        (!filter.liftId || entry.lifts.some((lift) => lift.liftId === filter.liftId)) &&
        (!filter.sex || entry.lifter.sex === filter.sex) &&
        (!filter.ageClassId || Option.contains(entryAgeClass(state, entry), filter.ageClassId)) &&
        (!filter.weightClassId ||
          Option.contains(entryWeightClass(state, entry), filter.weightClassId)),
    )
    .toSorted((left, right) => left.lotNumber - right.lotNumber)
}

function QrCode({ url }: { readonly url: string }) {
  const code = qrcode(0, 'M')
  code.addData(url)
  code.make()
  return (
    <div
      className="qr"
      role="img"
      aria-label="QR"
      data-url={url}
      // The generator returns trusted SVG markup built from its own matrix.
      dangerouslySetInnerHTML={{ __html: code.createSvgTag({ cellSize: 6, scalable: true }) }}
    />
  )
}

/** Slow continuous scroll for a TV nobody touches; it returns to the top at the end. */
function useAutoScroll(active: boolean) {
  const box = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const element = box.current
    if (!active || !element) return
    const timer = window.setInterval(() => {
      if (element.scrollTop + element.clientHeight >= element.scrollHeight - 1)
        element.scrollTop = 0
      else element.scrollTop += 1
    }, 40)
    return () => window.clearInterval(timer)
  }, [active])
  return box
}

function AttemptBox({ attempt }: { readonly attempt: Attempt }) {
  const judged = attempt._tag === 'Judged'
  const good = judged && attempt.verdict === 'goodLift'
  return (
    <div className="flex flex-col items-center gap-1">
      <span
        className={
          'flex h-7 w-7 items-center justify-center border text-sm ' +
          (!judged
            ? 'border-border-color text-text-secondary'
            : good
              ? 'border-green-600 bg-[#1b3a2a] text-green-400'
              : 'border-red-600 bg-[#3a1b1b] text-red-400')
        }
        aria-hidden="true"
      >
        {!judged ? '·' : good ? '✓' : '✗'}
      </span>
      <span
        className={
          'min-w-16 border border-border-color bg-element-bg px-2 py-1 text-center font-mono text-xs ' +
          (judged
            ? good
              ? 'good text-text-primary'
              : 'noLift text-text-secondary line-through'
            : 'pending text-text-secondary')
        }
      >
        {attempt._tag === 'Unannounced' ? '—' : attempt.weight + 'kg'}
      </span>
    </div>
  )
}

/** The TV table, laid out like the 2025 one: dark rows, status boxes over the weights. */
export function Scoreboard({
  state,
  title,
}: {
  readonly state: ContestState
  readonly title: string
}) {
  const { locale, t } = useMessages()
  const { filter, qrUrl } = state.scoreboard
  const rows = scoreboardRows(state, filter)
  const lifts = state.rulebook.lifts.filter(
    (lift) =>
      (!filter.liftId || lift.id === filter.liftId) &&
      state.entries.some((entry) => entry.lifts.some((item) => item.liftId === lift.id)),
  )
  const box = useAutoScroll(true)
  const className = (
    id: string,
    list: ReadonlyArray<{
      readonly id: string
      readonly name: { readonly pl: string; readonly en: string }
    }>,
  ) => list.find((item) => item.id === id)?.name[locale] ?? ''
  return (
    <div className="scoreboard display-view p-4">
      <header className="relative mb-4 text-center">
        <h1 className="text-h1 tracking-[0.2em] uppercase [text-shadow:0_0_14px_rgba(255,0,64,0.6)]">
          {title}
        </h1>
        {Option.isSome(qrUrl) && (
          <div className="absolute top-0 right-0">
            <QrCode url={qrUrl.value} />
          </div>
        )}
      </header>
      <div className="card">
        <div className="table-scroll scoreboard-scroll max-h-[75vh] overflow-y-auto" ref={box}>
          <table className="data-table">
            <thead>
              <tr>
                <th>#</th>
                <th>{t('desk.name')}</th>
                <th>{t('board.sexShort')}</th>
                <th>{t('board.age')}</th>
                <th>{t('board.bodyweight')}</th>
                <th>{t('board.weightClass')}</th>
                <th>{t('board.ageClass')}</th>
                <th>{t('board.reshel')}</th>
                <th>{t('board.mcc')}</th>
                {lifts.map((lift) => (
                  <th key={lift.id} className="text-center" colSpan={lift.attempts + 1}>
                    {lift.name[locale]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((entry) => {
                const bodyweight = Schema.decodeUnknownOption(Kilograms)(entry.bodyweight)
                return (
                  <tr key={entry.id}>
                    <td className="text-text-secondary">{entry.lotNumber}</td>
                    <td>
                      <div className="font-semibold uppercase">{entry.lifter.name}</div>
                      <div className="text-xxs text-text-secondary uppercase">
                        {state.teams.find((team) => team.id === entry.lifter.teamId)?.name ?? ''}
                      </div>
                    </td>
                    <td className="text-center text-xs">
                      {entry.lifter.sex === 'male' ? 'M' : 'K'}
                    </td>
                    <td className="text-center">{ageOnDate(entry.lifter.birthDate, state.date)}</td>
                    <td className="text-center">
                      {typeof entry.bodyweight === 'number' ? entry.bodyweight + 'kg' : '—'}
                    </td>
                    <td className="text-center">
                      {Option.match(entryWeightClass(state, entry), {
                        onNone: () => '—',
                        onSome: (id) => className(id, state.rulebook.weightClasses),
                      })}
                    </td>
                    <td className="text-center">
                      {Option.match(entryAgeClass(state, entry), {
                        onNone: () => '—',
                        onSome: (id) => className(id, state.rulebook.ageClasses),
                      })}
                    </td>
                    <td className="text-center font-mono">
                      {Option.isSome(bodyweight)
                        ? reshelCoefficient(bodyweight.value, entry.lifter.sex).toFixed(3)
                        : '—'}
                    </td>
                    <td className="text-center font-mono">
                      {mcCulloughCoefficient(entry.lifter.birthDate, state.date).toFixed(3)}
                    </td>
                    {lifts.map((lift) => {
                      const mine = state.attempts.filter(
                        (a) => a.entryId === entry.id && a.liftId === lift.id,
                      )
                      const best = Math.max(
                        0,
                        ...mine.map((a) =>
                          a._tag === 'Judged' && a.verdict === 'goodLift' ? a.weight : 0,
                        ),
                      )
                      return (
                        <Fragment key={lift.id}>
                          {mine.length === 0
                            ? Array.from({ length: lift.attempts }, (_, index) => (
                                <td
                                  key={lift.id + index}
                                  className="text-center text-text-secondary"
                                >
                                  ·
                                </td>
                              ))
                            : mine.map((a) => (
                                <td key={a.number} className="text-center">
                                  <AttemptBox attempt={a} />
                                </td>
                              ))}
                          <td className="text-center font-mono font-bold">
                            {best > 0 ? best + 'kg' : '—'}
                          </td>
                        </Fragment>
                      )
                    })}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

/** The desk pushes a filter and the QR code to every scoreboard through the command log. */
export function ScoreboardControl({
  state,
  resultsUrl,
  submit,
}: {
  readonly state: ContestState
  readonly resultsUrl: Option.Option<string>
  readonly submit: (input: object) => void
}) {
  const { locale, t } = useMessages()
  const { filter, qrUrl } = state.scoreboard
  function push(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const chosen: Record<string, string> = {}
    for (const name of ['divisionId', 'liftId', 'sex', 'ageClassId', 'weightClassId']) {
      const value = form.get(name)
      if (typeof value === 'string' && value !== '') chosen[name] = value
    }
    submit({
      _tag: 'SetScoreboard',
      filter: chosen,
      ...(Option.isSome(qrUrl) ? { qrUrl: qrUrl.value } : {}),
    })
  }
  const book = state.rulebook
  const choice = (
    name: string,
    label: string,
    current: string,
    options: ReadonlyArray<{ id: string; label: string }>,
  ) => (
    <label className="mb-3 block">
      <span className="input-label">{label}</span>
      <select
        className="input-field w-full"
        name={name}
        defaultValue={current}
        key={name + current}
      >
        <option value="">{t('board.all')}</option>
        {options.map((option) => (
          <option key={option.id} value={option.id}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  )
  return (
    <form className="scoreboard-control card" onSubmit={push} aria-label={t('board.filter')}>
      <h3 className="text-h3 mb-3">{t('board.filter')}</h3>
      {choice(
        'divisionId',
        t('desk.division'),
        filter.divisionId ?? '',
        book.divisions.map((d) => ({ id: d.id, label: d.name[locale] })),
      )}
      {choice(
        'liftId',
        t('desk.lift'),
        filter.liftId ?? '',
        book.lifts.map((l) => ({ id: l.id, label: l.name[locale] })),
      )}
      {choice('sex', t('board.sex'), filter.sex ?? '', [
        { id: 'male', label: t('desk.male') },
        { id: 'female', label: t('desk.female') },
      ])}
      {choice(
        'ageClassId',
        t('board.ageClass'),
        filter.ageClassId ?? '',
        book.ageClasses.map((c) => ({ id: c.id, label: c.name[locale] })),
      )}
      {choice(
        'weightClassId',
        t('board.weightClass'),
        filter.weightClassId ?? '',
        book.weightClasses.map((c) => ({ id: c.id, label: c.name[locale] })),
      )}
      <button className="btn-primary" type="submit">
        {t('board.apply')}
      </button>{' '}
      {Option.isSome(resultsUrl) && (
        <button
          type="button"
          className="btn-secondary"
          onClick={() =>
            submit({
              _tag: 'SetScoreboard',
              filter,
              ...(Option.isSome(qrUrl) ? {} : { qrUrl: resultsUrl.value }),
            })
          }
        >
          {t(Option.isSome(qrUrl) ? 'board.hideQr' : 'board.showQr')}
        </button>
      )}
    </form>
  )
}
