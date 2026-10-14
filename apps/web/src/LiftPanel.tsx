import {
  federationCsv,
  individualRankings,
  type AttemptRef,
  type ContestState,
  type TableModel,
} from '@werewolf/core'
import * as Option from 'effect/Option'
import { useEffect, useMemo, useState } from 'react'
import { buildResultsJpg } from './export-jpg.ts'
import { buildResultsPdf, loadPdfFonts } from './export-pdf.ts'
import { ClockControl } from './ClockControl.tsx'
import { ContestTable } from './ContestTable.tsx'
import {
  buildRows,
  filterOptions,
  formatCoefficient,
  liftPoints,
  matches,
  noFilters,
  sortRows,
  type Filters,
  type SortDirection,
  type TableRow,
} from './contest-table.ts'
import { FilterBar } from './FilterBar.tsx'
import { useLegacy } from './legacy-i18n.ts'
import { filterFrom } from './TableScreens.tsx'
import { downloadBlob, fileSlug, printTables, tablesToXlsx } from './table-export.ts'

/** The table exactly as filtered and sorted on screen, as plain cells for print, Excel, PDF and JPG. */
export function visibleTableModel(
  state: ContestState,
  rows: ReadonlyArray<TableRow>,
  liftIds: ReadonlyArray<string>,
  title: string,
  lt: (key: string) => string,
  locale: 'pl' | 'en',
): TableModel {
  const lifts = state.rulebook.lifts.filter((lift) => liftIds.includes(lift.id))
  const roman = ['I', 'II', 'III', 'IV', 'V']
  const [only] = lifts
  const sole = lifts.length === 1 ? Option.fromUndefinedOr(only) : Option.none()
  return {
    title,
    columns: [
      '#',
      lt('contest_table.columns.lifter'),
      lt('v2.columns.team'),
      lt('contest_table.columns.sex'),
      lt('contest_table.columns.age'),
      lt('contest_table.columns.bodyweight'),
      lt('contest_table.columns.weight_class'),
      lt('contest_table.columns.age_class'),
      lt('contest_table.columns.reshel'),
      lt('contest_table.columns.mccullough'),
      ...lifts.flatMap((lift) =>
        Array.from(
          { length: lift.attempts },
          (_, index) => (lift.code ?? lift.id) + ' ' + roman[index],
        ),
      ),
      lt('contest_table.columns.points'),
      lt('contest_table.columns.max'),
      lt('contest_table.columns.labels'),
    ],
    rows: rows.map((row, index) => {
      const points = Option.match(sole, {
        onNone: () => row.points,
        onSome: (lift) => liftPoints(row, lift.id),
      })
      const max = Option.match(sole, {
        onNone: () => row.maxLift,
        onSome: (lift) => row.best[lift.id] ?? 0,
      })
      return [
        String(index + 1),
        row.entry.lifter.name,
        row.team,
        row.entry.lifter.sex === 'male' ? 'M' : locale === 'pl' ? 'K' : 'F',
        String(row.age),
        typeof row.entry.bodyweight === 'number' ? String(row.entry.bodyweight) : '',
        row.weightClass,
        row.ageClass,
        Option.match(row.reshel, { onNone: () => '', onSome: formatCoefficient }),
        formatCoefficient(row.mccullough),
        ...lifts.flatMap((lift) =>
          Array.from({ length: lift.attempts }, (_, number) => {
            if (!row.entry.lifts.some((item) => item.liftId === lift.id)) return ''
            if (row.didNotStart.has(lift.id)) return 'DNS'
            const attempt = row.attempts[lift.id]?.[number]
            if (!attempt || attempt._tag === 'Unannounced') return ''
            return attempt._tag === 'Judged' && attempt.verdict === 'noLift'
              ? '-' + attempt.weight
              : String(attempt.weight)
          }),
        ),
        Option.match(points, { onNone: () => '', onSome: formatCoefficient }),
        max > 0 ? String(max) : '',
        row.labels.join(', '),
      ]
    }),
  }
}

export function useTableState(key: string) {
  const [filters, setFilters] = useState<Filters>(noFilters)
  const [sort, setSort] = useState<{ column: string; direction: SortDirection }>({
    column: 'order',
    direction: 'asc',
  })
  useEffect(() => {
    setFilters(noFilters)
    setSort({ column: 'order', direction: 'asc' })
  }, [key])
  const onSortChange = (column: string) =>
    setSort((previous) =>
      previous.column === column
        ? { column, direction: previous.direction === 'asc' ? 'desc' : 'asc' }
        : {
            column,
            direction: column.startsWith('points') || column.startsWith('max') ? 'desc' : 'asc',
          },
    )
  return { filters, setFilters, sort, onSortChange }
}

export function ExportMenu({
  disabled,
  onExport,
}: {
  readonly disabled: boolean
  readonly onExport: (format: 'csv' | 'pdf' | 'jpg' | 'xlsx' | 'print') => Promise<void>
}) {
  const { lt } = useLegacy()
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    if (!open) return
    const close = () => setOpen(false)
    window.addEventListener('click', close)
    return () => window.removeEventListener('click', close)
  }, [open])
  const item = (format: 'csv' | 'pdf' | 'jpg' | 'xlsx' | 'print', label: string) => (
    <button
      key={format}
      type="button"
      className="flex w-full items-center justify-between px-3 py-2 text-xxs uppercase tracking-[0.2em] transition hover:bg-element-bg/80 disabled:opacity-50"
      disabled={busy}
      onClick={() => {
        setOpen(false)
        setBusy(true)
        onExport(format)
          .catch(() => {})
          .finally(() => setBusy(false))
      }}
    >
      <span>{label}</span>
    </button>
  )
  return (
    <div className="relative" onClick={(event) => event.stopPropagation()}>
      <button
        type="button"
        className="btn-secondary px-3 py-1 text-xxs"
        disabled={busy || disabled}
        onClick={() => setOpen(!open)}
      >
        {busy ? lt('contest_detail.export.exporting') : lt('contest_detail.export.menu')}
      </button>
      {open && (
        <div className="absolute right-0 top-full z-40 mt-2 w-56 rounded border border-border-color bg-element-bg shadow-lg">
          {item('xlsx', lt('v2.export.xlsx'))}
          {item('csv', lt('contest_detail.export.csv'))}
          {item('pdf', lt('contest_detail.export.pdf'))}
          {item('jpg', lt('contest_detail.export.jpg'))}
        </div>
      )}
    </div>
  )
}

/** Prints the table as shown, on its own button next to the export menu. */
export function PrintButton({
  disabled,
  onPrint,
}: {
  readonly disabled: boolean
  readonly onPrint: () => void
}) {
  const { lt } = useLegacy()
  return (
    <button
      type="button"
      className="btn-secondary px-3 py-1 text-xxs"
      disabled={disabled}
      onClick={onPrint}
    >
      {lt('v2.export.print')}
    </button>
  )
}

/** One lift tab of the 2025 desk: filters, export menu, QR button and the attempt grid. */
export function LiftPanel({
  state,
  contestName,
  liftId,
  current,
  submit,
  qr,
  onEditCompetitor,
}: {
  readonly state: ContestState
  readonly contestName: string
  readonly liftId: string
  readonly current: Option.Option<AttemptRef>
  readonly submit: (input: object) => void
  readonly qr: {
    readonly visible: boolean
    readonly toggle: () => void
    readonly available: boolean
  }
  readonly onEditCompetitor: (entryId: string) => void
}) {
  const { lt, locale } = useLegacy()
  const lift = state.rulebook.lifts.find((item) => item.id === liftId)
  const { filters, setFilters, sort, onSortChange } = useTableState(liftId)
  const all = useMemo(() => buildRows(state, locale), [state, locale])
  const lifters = all.filter((row) => row.entry.lifts.some((item) => item.liftId === liftId))
  const order = useMemo(
    () => new Map(state.entries.map((entry) => [entry.id as string, entry.lotNumber as number])),
    [state],
  )
  const rows = sortRows(
    lifters.filter((row) => matches(row, filters)),
    sort.column,
    sort.direction,
    order,
  )
  const options = filterOptions(state, lifters, locale, lt)
  const title = lift ? lift.name[locale] : liftId
  // "Synchronizuj" sends this lift and these filters to the announcer table, as in 2025.
  const pushed = filterFrom(state, filters, liftId)
  const canonical = (value: object) =>
    JSON.stringify(Object.entries(value).toSorted(([a], [b]) => a.localeCompare(b)))
  const synced = canonical(pushed) === canonical(state.scoreboard.filter)
  async function exportTable(format: 'csv' | 'pdf' | 'jpg' | 'xlsx' | 'print'): Promise<void> {
    const model = visibleTableModel(state, rows, [liftId], title, lt, locale)
    const subtitle = contestName + ' — ' + state.date
    const name = fileSlug(contestName + '-' + title)
    switch (format) {
      case 'print':
        printTables(contestName, subtitle, [model])
        return
      case 'xlsx':
        downloadBlob(await tablesToXlsx([model]), name + '.xlsx')
        return
      case 'pdf': {
        const doc = await buildResultsPdf([model], {
          subtitle,
          generatedAt: new Date().toISOString().slice(0, 16).replace('T', ' '),
          fonts: await loadPdfFonts(),
        })
        downloadBlob(doc.output('blob'), name + '.pdf')
        return
      }
      case 'jpg':
        downloadBlob(await buildResultsJpg(model, subtitle), name + '.jpg')
        return
      case 'csv': {
        // The federation format of 2025, limited to the lifters shown.
        const classification = state.rulebook.classifications.find(
          (item) =>
            item.kind === 'individual' && item.liftIds.length === 1 && item.liftIds[0] === liftId,
        )
        const ranking = individualRankings(state).find(
          (item) => item.classificationId === classification?.id,
        )
        if (!ranking) return
        const shown = new Set(rows.map((row) => row.entry.id as string))
        const filtered = {
          ...ranking,
          groups: ranking.groups.map((group) => ({
            ...group,
            rows: group.rows.filter((row) => shown.has(row.entry.id)),
          })),
          pending: ranking.pending.filter((item) => shown.has(item.entryId)),
        }
        downloadBlob(
          new Blob([federationCsv(state, filtered, locale)], { type: 'text/csv;charset=utf-8' }),
          name + '.csv',
        )
        return
      }
    }
  }
  return (
    <section className="space-y-2">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="mr-2 font-display text-2xl uppercase tracking-[0.15em] text-text-primary">
            {title}
          </h3>
          <FilterBar options={options} filters={filters} onChange={setFilters} />
        </div>
        <div className="flex flex-wrap items-stretch gap-2">
          <button
            type="button"
            className={(synced ? 'btn-secondary' : 'btn-primary') + ' px-3 py-1 text-xxs'}
            disabled={rows.length === 0}
            onClick={() =>
              submit({
                _tag: 'SetScoreboard',
                filter: pushed,
                ...Option.match(state.scoreboard.qrUrl, {
                  onNone: () => ({}),
                  onSome: (qrUrl) => ({ qrUrl }),
                }),
              })
            }
          >
            {lt('contest_detail.sync.button')}
          </button>
          {qr.available && (
            <button type="button" className="btn-secondary px-3 py-1 text-xxs" onClick={qr.toggle}>
              {lt(qr.visible ? 'display_table.actions.hide_qr' : 'display_table.actions.show_qr')}
            </button>
          )}
          <ExportMenu disabled={rows.length === 0} onExport={exportTable} />
          <PrintButton
            disabled={rows.length === 0}
            onPrint={() => {
              exportTable('print').catch(() => {})
            }}
          />
          <ClockControl state={state} submit={submit} />
        </div>
      </header>
      {lifters.length === 0 ? (
        <div className="text-center py-8 text-text-secondary">
          {lt('contest_detail.registrations.empty')}
        </div>
      ) : rows.length === 0 ? (
        <div className="text-center py-8 text-text-secondary">
          {lt('contest_detail.registrations.empty_filter')}
        </div>
      ) : (
        <div className="max-h-[calc(100vh-9.5rem)] overflow-auto border border-border-color">
          <ContestTable
            state={state}
            rows={rows}
            liftIds={[liftId]}
            sortColumn={sort.column}
            sortDirection={sort.direction}
            onSortChange={onSortChange}
            showRowNumbers
            current={current}
            submit={submit}
            onEditCompetitor={onEditCompetitor}
          />
        </div>
      )}
    </section>
  )
}
