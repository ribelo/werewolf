import {
  federationCsv,
  individualRankings,
  individualTable,
  teamRankings,
  teamTable,
  type ContestState,
  type IndividualRanking,
  type TableLabels,
  type TableModel,
  type TeamRanking,
} from '@werewolf/core'
import * as Effect from 'effect/Effect'
import { useState } from 'react'
import { buildResultsJpg } from './export-jpg.ts'
import { buildResultsPdf, loadPdfFonts } from './export-pdf.ts'
import { useMessages } from './i18n.ts'

const run = (work: () => Promise<void>) => () => {
  Effect.runFork(Effect.promise(work))
}
function save(blob: Blob, filename: string) {
  const link = document.createElement('a')
  link.href = URL.createObjectURL(blob)
  link.download = filename
  link.click()
  URL.revokeObjectURL(link.href)
}
const fileName = (title: string, extension: string) =>
  title
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replaceAll('ł', 'l')
    .replaceAll('Ł', 'L')
    .replace(/[^\w]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase() +
  '.' +
  extension

function useLabels(): TableLabels {
  const { t } = useMessages()
  return {
    place: t('res.place'),
    name: t('res.name'),
    team: t('res.team'),
    ageClass: t('res.ageClass'),
    weightClass: t('res.weightClass'),
    bodyweight: t('res.bodyweight'),
    result: t('res.result'),
    points: t('res.points'),
    counted: t('res.counted'),
    didNotStart: t('res.dns'),
  }
}

function TableView({ model }: { readonly model: TableModel }) {
  return (
    <div className="table-scroll overflow-x-auto">
      <table className="data-table">
        <thead>
          <tr>
            {model.columns.map((column, index) => (
              // Columns are positional.
              <th key={index}>{column}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {model.rows.map((row, index) => (
            <tr key={index}>
              {row.map((cell, position) => (
                <td key={position} className={position === 0 ? 'font-display text-xl' : ''}>
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/** Every classification of the contest as a table; the desk adds export buttons. */
export function Results({
  state,
  title,
  exports,
}: {
  readonly state: ContestState
  readonly title: string
  readonly exports: boolean
}) {
  const { locale, t } = useMessages()
  const labels = useLabels()
  const [failed, setFailed] = useState(false)
  const individual = individualRankings(state)
  const teams = teamRankings(state)
  const ageName = (id: string) =>
    state.rulebook.ageClasses.find((c) => c.id === id)?.name[locale] ?? ''
  const weightName = (id: string) =>
    state.rulebook.weightClasses.find((c) => c.id === id)?.name[locale] ?? ''
  const bucketLabel = (ranking: IndividualRanking, index: number) => {
    const bucket = ranking.groups[index]?.bucket
    switch (bucket?._tag) {
      case 'Age':
        return ageName(bucket.ageClassId)
      case 'Weight':
        return weightName(bucket.weightClassId)
      case 'AgeAndWeight':
        return ageName(bucket.ageClassId) + ' · ' + weightName(bucket.weightClassId)
      default:
        return ''
    }
  }
  const subtitle = title + ' — ' + state.date
  const generated = () =>
    t('res.generated') + ' ' + new Date().toISOString().slice(0, 16).replace('T', ' ')
  async function pdf(models: ReadonlyArray<TableModel>, name: string) {
    try {
      const doc = await buildResultsPdf(models, {
        subtitle,
        generatedAt: generated(),
        fonts: await loadPdfFonts(),
      })
      save(doc.output('blob'), fileName(name, 'pdf'))
    } catch {
      setFailed(true)
    }
  }
  async function jpg(model: TableModel) {
    try {
      save(await buildResultsJpg(model, subtitle), fileName(model.title, 'jpg'))
    } catch {
      setFailed(true)
    }
  }
  const models = [
    ...individual.map((ranking) => individualTable(state, ranking, locale, labels)),
    ...teams.map((ranking) => teamTable(state, ranking, locale, labels)),
  ]
  const button = 'btn-secondary px-3 py-1 text-xs'
  return (
    <div className="space-y-6">
      {exports && models.length > 0 && (
        <p>
          <button type="button" className={button} onClick={run(() => pdf(models, title))}>
            {t('res.pdfAll')}
          </button>
        </p>
      )}
      {failed && <p role="alert">{t('res.exportFailed')}</p>}
      {individual.map((ranking, rankingIndex) => {
        const model = models[rankingIndex]
        if (!model) return <></>
        const pending = ranking.pending.length
        return (
          <section key={ranking.classificationId} className="card">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
              <h3 className="text-h2">{model.title}</h3>
              {exports && (
                <div className="flex gap-2">
                  <button
                    type="button"
                    className={button}
                    onClick={() =>
                      save(
                        new Blob([federationCsv(state, ranking, locale)], {
                          type: 'text/csv;charset=utf-8',
                        }),
                        fileName(model.title, 'csv'),
                      )
                    }
                  >
                    {t('res.csv')}
                  </button>
                  <button
                    type="button"
                    className={button}
                    onClick={run(() => pdf([model], model.title))}
                  >
                    {t('res.pdf')}
                  </button>
                  <button type="button" className={button} onClick={run(() => jpg(model))}>
                    {t('res.jpg')}
                  </button>
                </div>
              )}
            </div>
            {ranking.groups.map((group, groupIndex) => {
              const label = bucketLabel(ranking, groupIndex)
              const rows = individualTable(
                state,
                { ...ranking, groups: [group], pending: [] },
                locale,
                labels,
              )
              return (
                <div key={JSON.stringify(group.bucket)} className="mb-4">
                  {label !== '' && <h4 className="text-h3 mb-1 text-text-secondary">{label}</h4>}
                  <TableView model={rows} />
                </div>
              )
            })}
            {ranking.groups.length === 0 &&
              !ranking.pending.some((item) => item.reason === 'didNotStart') && (
                <p className="text-text-secondary">{t('res.empty')}</p>
              )}
            {ranking.pending.some((item) => item.reason === 'didNotStart') && (
              <TableView
                model={individualTable(state, { ...ranking, groups: [] }, locale, labels)}
              />
            )}
            {pending > 0 && (
              <p className="text-xs text-text-secondary">
                {t('res.pending')}: {pending}
              </p>
            )}
          </section>
        )
      })}
      {teams.map((ranking: TeamRanking, teamIndex) => {
        const model = models[individual.length + teamIndex]
        if (!model) return <></>
        return (
          <section key={ranking.classificationId} className="card">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
              <h3 className="text-h2">{model.title}</h3>
              {exports && (
                <div className="flex gap-2">
                  <button
                    type="button"
                    className={button}
                    onClick={run(() => pdf([model], model.title))}
                  >
                    {t('res.pdf')}
                  </button>
                  <button type="button" className={button} onClick={run(() => jpg(model))}>
                    {t('res.jpg')}
                  </button>
                </div>
              )}
            </div>
            <TableView model={model} />
          </section>
        )
      })}
    </div>
  )
}
