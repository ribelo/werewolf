import {
  ageOnDate,
  entryAgeClass,
  entryWeightClass,
  mcCulloughCoefficient,
  reshelCoefficient,
  teamRankings,
  type ContestState,
  type TableModel,
  type TeamRanking,
} from '@werewolf/core'
import * as Option from 'effect/Option'
import { useState } from 'react'
import { buildResultsJpg } from './export-jpg.ts'
import { buildResultsPdf, loadPdfFonts } from './export-pdf.ts'
import { useLegacy } from './legacy-i18n.ts'
import { ExportMenu } from './LiftPanel.tsx'
import { downloadBlob, fileSlug, printTables, tablesToXlsx } from './table-export.ts'

const formatLift = (value: number) => (value > 0 ? value.toFixed(1) + ' kg' : '–')
const formatPoints = (value: number) => (value === 0 ? '0.00' : value.toFixed(2))
const formatBodyweight = (value: Option.Option<number>) =>
  Option.match(
    Option.filter(value, (v) => v > 0),
    { onNone: () => '–', onSome: (v) => v.toFixed(2) + ' kg' },
  )
const formatCoefficient = (value: Option.Option<number>) =>
  Option.match(
    Option.filter(value, (v) => v > 0),
    { onNone: () => '–', onSome: (v) => v.toFixed(3) },
  )

interface Contributor {
  readonly placeholder: false
  readonly name: string
  readonly sex: 'male' | 'female'
  readonly bodyweight: Option.Option<number>
  readonly weightClass: string
  readonly age: number
  readonly ageClass: string
  readonly lift: string
  readonly best: number
  readonly reshel: Option.Option<number>
  readonly mcc: number
  readonly points: number
}
type Slot =
  | Contributor
  | { readonly placeholder: true; readonly sex: Option.Option<'male' | 'female'> }
interface Row {
  readonly place: number
  readonly team: string
  readonly points: number
  readonly slots: ReadonlyArray<Slot>
  readonly filled: number
}

function rowsOf(
  state: ContestState,
  ranking: TeamRanking,
  locale: 'pl' | 'en',
): ReadonlyArray<Row> {
  const classification = state.rulebook.classifications.find(
    (item) => item.id === ranking.classificationId,
  )
  if (!classification || classification.kind !== 'team') return []
  const quota = classification.quota
  const size = quota.kind === 'any' ? quota.count : quota.male + quota.female
  return ranking.rows.map((row) => {
    const counted: Array<Contributor> = row.counted.map((item) => {
      const entry = item.entry
      // The lift that gave this lifter's counted result.
      const lift =
        classification.liftIds
          .map((liftId) => state.rulebook.lifts.find((l) => l.id === liftId))
          .find((l) =>
            l
              ? state.attempts.some(
                  (attempt) =>
                    attempt.entryId === entry.id &&
                    attempt.liftId === l.id &&
                    attempt._tag === 'Judged' &&
                    attempt.verdict === 'goodLift' &&
                    attempt.weight === item.kilograms,
                )
              : false,
          )?.name[locale] ?? '–'
      const ageClassId = Option.getOrElse(entryAgeClass(state, entry), () => '')
      const weightClassId = Option.getOrElse(entryWeightClass(state, entry), () => '')
      return {
        placeholder: false,
        name: entry.lifter.name,
        sex: entry.lifter.sex,
        bodyweight: Option.fromUndefinedOr(entry.bodyweight),
        weightClass:
          state.rulebook.weightClasses.find((c) => c.id === weightClassId)?.name[locale] ?? '–',
        age: ageOnDate(entry.lifter.birthDate, state.date),
        ageClass: state.rulebook.ageClasses.find((c) => c.id === ageClassId)?.name[locale] ?? '–',
        lift,
        best: item.kilograms,
        reshel: Option.map(Option.fromUndefinedOr(entry.bodyweight), (bw) =>
          reshelCoefficient(bw, entry.lifter.sex),
        ),
        mcc: mcCulloughCoefficient(entry.lifter.birthDate, state.date),
        points: item.points,
      }
    })
    const missing: Array<Slot> =
      quota.kind === 'any'
        ? Array.from({ length: Math.max(0, size - counted.length) }, () => ({
            placeholder: true as const,
            sex: Option.fromUndefinedOr(classification.sex),
          }))
        : [
            ...Array.from(
              { length: Math.max(0, quota.male - counted.filter((c) => c.sex === 'male').length) },
              () => ({ placeholder: true as const, sex: Option.some('male' as const) }),
            ),
            ...Array.from(
              {
                length: Math.max(
                  0,
                  quota.female - counted.filter((c) => c.sex === 'female').length,
                ),
              },
              () => ({ placeholder: true as const, sex: Option.some('female' as const) }),
            ),
          ]
    return {
      place: row.place,
      team: row.team.name,
      points: row.points,
      slots: [...counted, ...missing],
      filled: counted.length,
    }
  })
}

function modelOf(title: string, rows: ReadonlyArray<Row>, lt: (key: string) => string): TableModel {
  const c = (key: string) => lt('contest_detail.team_results.columns.' + key)
  return {
    title,
    columns: [
      c('place'),
      c('team_or_lifter'),
      c('gender'),
      c('bodyweight'),
      c('weight_class'),
      c('age'),
      c('age_category'),
      c('lift_type'),
      c('lift_weight'),
      c('reshel'),
      c('mcc'),
      c('lift_points'),
    ],
    rows: rows.flatMap((row) => [
      [String(row.place), row.team, '', '', '', '', '', '', '', '', '', formatPoints(row.points)],
      ...row.slots
        .filter((slot): slot is Contributor => !slot.placeholder)
        .map((slot) => [
          '',
          slot.name,
          lt('contest_detail.team_results.labels.' + (slot.sex === 'male' ? 'sex_m' : 'sex_f')),
          formatBodyweight(slot.bodyweight),
          slot.weightClass,
          String(slot.age),
          slot.ageClass,
          slot.lift,
          formatLift(slot.best),
          formatCoefficient(slot.reshel),
          formatCoefficient(Option.some(slot.mcc)),
          formatPoints(slot.points),
        ]),
    ]),
  }
}

/** The 2025 team results page, with one tab per team classification of the rulebook. */
export function TeamResults({
  state,
  contestName,
}: {
  readonly state: ContestState
  readonly contestName: string
}) {
  const { lt, locale } = useLegacy()
  const rankings = teamRankings(state)
  const [selected, setSelected] = useState(0)
  const ranking = rankings[selected] ?? rankings[0]
  const classification = state.rulebook.classifications.find(
    (item) => item.id === ranking?.classificationId,
  )
  const rows = ranking ? rowsOf(state, ranking, locale) : []
  const size =
    classification?.kind === 'team'
      ? classification.quota.kind === 'any'
        ? classification.quota.count
        : classification.quota.male + classification.quota.female
      : 5
  const title = classification ? classification.name[locale] : ''
  async function exportTable(format: 'csv' | 'pdf' | 'jpg' | 'xlsx' | 'print') {
    const model = modelOf(title, rows, lt)
    const subtitle = contestName + ' — ' + state.date
    const name = fileSlug(contestName + '-' + title)
    if (format === 'print') printTables(contestName, subtitle, [model])
    else if (format === 'xlsx') downloadBlob(await tablesToXlsx([model]), name + '.xlsx')
    else if (format === 'jpg') downloadBlob(await buildResultsJpg(model, subtitle), name + '.jpg')
    else if (format === 'pdf') {
      const doc = await buildResultsPdf([model], {
        subtitle,
        generatedAt: new Date().toISOString().slice(0, 16).replace('T', ' '),
        fonts: await loadPdfFonts(),
      })
      downloadBlob(doc.output('blob'), name + '.pdf')
    } else {
      const csv = [model.columns, ...model.rows]
        .map((row) =>
          row
            .map((cell) => (/[";\n]/.test(cell) ? '"' + cell.replaceAll('"', '""') + '"' : cell))
            .join(';'),
        )
        .join('\n')
      downloadBlob(new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' }), name + '.csv')
    }
  }
  const placeholder = (sex: Option.Option<'male' | 'female'>) =>
    lt('contest_detail.team_results.placeholder.' + Option.getOrElse(sex, () => 'generic'))
  return (
    <section className="space-y-6">
      <header className="space-y-2">
        <p className="text-caption uppercase tracking-[0.35em] text-text-secondary">
          {lt('contest_detail.team_results.header_label')}
        </p>
        <h1 className="text-h2 text-text-primary">{lt('contest_detail.team_results.title')}</h1>
        <p className="text-body text-text-secondary">
          {contestName
            ? lt('contest_detail.team_results.subtitle_with_name', { contest: contestName })
            : lt('contest_detail.team_results.subtitle')}
        </p>
      </header>
      {rankings.length > 1 && (
        <nav className="flex flex-wrap gap-3" role="tablist">
          {rankings.map((item, index) => {
            const name = state.rulebook.classifications.find((c) => c.id === item.classificationId)
              ?.name[locale]
            return (
              <button
                key={item.classificationId}
                type="button"
                role="tab"
                aria-selected={index === selected}
                onClick={() => setSelected(index)}
                className={
                  'px-4 py-2 font-display text-xs uppercase tracking-[0.3em] border-2 transition ' +
                  (index === selected
                    ? 'bg-primary-red text-black border-primary-red'
                    : 'border-border-color text-text-secondary hover:text-text-primary hover:border-primary-red')
                }
              >
                {name}
              </button>
            )
          })}
        </nav>
      )}
      <div className="card space-y-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-2">
            <h2 className="text-h3 text-text-primary">
              {title || lt('contest_detail.team_results.leaderboard_title')}
            </h2>
            <p className="max-w-2xl text-body text-text-secondary">
              {lt('contest_detail.team_results.summary', { count: rows.length })}
            </p>
          </div>
          {rows.length > 0 && <ExportMenu disabled={false} onExport={exportTable} />}
        </div>
        {rows.length === 0 ? (
          <p className="text-body text-text-secondary">{lt('contest_detail.team_results.empty')}</p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-border-color/60 bg-element-bg">
            <table className="min-w-full border-separate border-spacing-0 text-left text-sm text-text-secondary">
              <thead className="bg-element-bg text-xxs font-semibold uppercase tracking-[0.3em] text-text-secondary">
                <tr>
                  {modelOf(title, [], lt).columns.map((column) => (
                    <th key={column} className="px-4 py-3 text-left">
                      {column}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <TeamRows key={row.team} row={row} size={size} placeholder={placeholder} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  )
}

function TeamRows({
  row,
  size,
  placeholder,
}: {
  readonly row: Row
  readonly size: number
  readonly placeholder: (sex: Option.Option<'male' | 'female'>) => string
}) {
  const { lt } = useLegacy()
  const dash = <td className="px-4 py-4 align-top text-text-secondary">–</td>
  return (
    <>
      <tr className="bg-main-bg/30 text-text-primary">
        <td className="px-4 py-4 align-top font-semibold">{row.place}</td>
        <td className="px-4 py-4 align-top">
          <div className="flex flex-col gap-1">
            <span className="text-body font-semibold text-text-primary">{row.team}</span>
            <span className="text-xxs uppercase tracking-[0.3em] text-text-secondary">
              {row.filled}/{size} {lt('contest_detail.team_results.labels.slots_filled')}
            </span>
          </div>
        </td>
        {dash}
        {dash}
        {dash}
        {dash}
        {dash}
        {dash}
        {dash}
        {dash}
        {dash}
        <td className="px-4 py-4 align-top font-semibold text-text-primary">
          {formatPoints(row.points)}
        </td>
      </tr>
      {row.slots.map((slot, index) =>
        slot.placeholder ? (
          <tr
            key={index}
            className="border-t border-border-color/40 bg-main-bg/20 italic text-text-secondary"
          >
            <td className="px-4 py-3 align-top text-text-secondary">–</td>
            <td className="px-4 py-3 align-top">
              <span>{placeholder(slot.sex)}</span>
            </td>
            {Array.from({ length: 10 }, (_, cell) => (
              <td key={cell} className="px-4 py-3 align-top">
                –
              </td>
            ))}
          </tr>
        ) : (
          <tr key={index} className="border-t border-border-color/40 text-text-primary">
            <td className="px-4 py-3 align-top text-text-secondary">–</td>
            <td className="px-4 py-3 align-top">
              <span className="font-medium text-text-primary">{slot.name}</span>
            </td>
            <td className="px-4 py-3 align-top">
              {lt(
                'contest_detail.team_results.labels.' + (slot.sex === 'male' ? 'sex_m' : 'sex_f'),
              )}
            </td>
            <td className="px-4 py-3 align-top">{formatBodyweight(slot.bodyweight)}</td>
            <td className="px-4 py-3 align-top">{slot.weightClass}</td>
            <td className="px-4 py-3 align-top">{slot.age}</td>
            <td className="px-4 py-3 align-top">{slot.ageClass}</td>
            <td className="px-4 py-3 align-top">{slot.lift}</td>
            <td className="px-4 py-3 align-top">{formatLift(slot.best)}</td>
            <td className="px-4 py-3 align-top">{formatCoefficient(slot.reshel)}</td>
            <td className="px-4 py-3 align-top">{formatCoefficient(Option.some(slot.mcc))}</td>
            <td className="px-4 py-3 align-top">
              <span className="font-semibold text-text-primary">{formatPoints(slot.points)}</span>
            </td>
          </tr>
        ),
      )}
    </>
  )
}
