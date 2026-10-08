import {
  entryAgeClass,
  entryWeightClass,
  type ContestState,
  type Entry,
  type ScoreboardFilter,
} from '@werewolf/core'
import * as Option from 'effect/Option'
import qrcode from 'qrcode-generator'
import { Fragment, useEffect, useRef, type FormEvent } from 'react'
import { useMessages } from './i18n.ts'

/** Only entries that belong to the chosen division, lift, sex and classes are shown. */
export function scoreboardRows(
  state: ContestState,
  filter: ScoreboardFilter,
): ReadonlyArray<Entry> {
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

export function Scoreboard({ state }: { readonly state: ContestState }) {
  const { locale, t } = useMessages()
  const { filter, qrUrl } = state.scoreboard
  const rows = scoreboardRows(state, filter)
  const lifts = state.rulebook.lifts.filter((lift) => !filter.liftId || lift.id === filter.liftId)
  const box = useAutoScroll(true)
  return (
    <div className="scoreboard">
      <div className="table-scroll scoreboard-scroll" ref={box}>
        <table>
          <thead>
            <tr>
              <th>{t('desk.lotNumber')}</th>
              <th>{t('desk.name')}</th>
              <th>{t('meet.team')}</th>
              {lifts.map((lift) => (
                <th key={lift.id} colSpan={lift.attempts + 1}>
                  {lift.name[locale]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((entry) => (
              <tr key={entry.id}>
                <td>{entry.lotNumber}</td>
                <td>{entry.lifter.name}</td>
                <td>{state.teams.find((team) => team.id === entry.lifter.teamId)?.name ?? ''}</td>
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
                            <td key={lift.id + index}>·</td>
                          ))
                        : mine.map((a) => (
                            <td
                              key={a.number}
                              className={a._tag === 'Judged' ? a.verdict : 'pending'}
                            >
                              {a._tag === 'Unannounced' ? '—' : a.weight}
                            </td>
                          ))}
                      <td key={lift.id + 'best'}>
                        <strong>{best > 0 ? best : '—'}</strong>
                      </td>
                    </Fragment>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {Option.isSome(qrUrl) && <QrCode url={qrUrl.value} />}
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
    <label>
      {label}
      <select name={name} defaultValue={current} key={name + current}>
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
    <form className="scoreboard-control" onSubmit={push} aria-label={t('board.filter')}>
      <h3>{t('board.filter')}</h3>
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
      <button type="submit">{t('board.apply')}</button>{' '}
      {Option.isSome(resultsUrl) && (
        <button
          type="button"
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
