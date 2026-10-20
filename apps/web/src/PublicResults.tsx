import type { ContestState } from '@werewolf/core'
import type { ContestDefinition } from '@werewolf/sync'
import * as Option from 'effect/Option'
import { useMemo, useState } from 'react'
import { ContestTable } from './ContestTable.tsx'
import {
  buildRows,
  filterOptions,
  matches,
  noFilters,
  sortRows,
  type Filters,
} from './contest-table.ts'
import { FilterBar } from './FilterBar.tsx'
import { useLegacy } from './legacy-i18n.ts'
import { ExportMenu, PrintButton, useTableState, visibleTableModel } from './LiftPanel.tsx'
import { buildResultsJpg } from './export-jpg.ts'
import { buildResultsPdf, loadPdfFonts } from './export-pdf.ts'
import { downloadBlob, fileSlug, printTables, tablesToCsv, tablesToXlsx } from './table-export.ts'
import { TeamResults } from './TeamResults.tsx'

/** The 2025 public results page (/results/[id]): individual and team tabs, read only, for phones too. */
export function PublicResults({
  state,
  definition,
}: {
  readonly state: ContestState
  readonly definition: ContestDefinition
}) {
  const { lt, locale } = useLegacy()
  const [tab, setTab] = useState<'individual' | 'team'>('individual')
  const [filters, setFilters] = useState<Filters>(noFilters)
  const [liftId, setLiftId] = useState<string>(state.rulebook.lifts[0]?.id ?? 'ALL')
  const { sort, onSortChange } = useTableState('public')
  const all = useMemo(() => buildRows(state, locale), [state, locale])
  const order = useMemo(
    () => new Map(state.entries.map((entry) => [entry.id as string, entry.lotNumber as number])),
    [state],
  )
  const rows = sortRows(
    all.filter(
      (row) =>
        matches(row, filters) &&
        // Kids are listed only when a kids age class is chosen, never among adults.
        row.kid ===
          state.rulebook.ageClasses.some((item) => item.id === filters.age && item.kids === true) &&
        (liftId === 'ALL' || row.entry.lifts.some((item) => item.liftId === liftId)),
    ),
    sort.column === 'order' ? (liftId === 'ALL' ? 'points' : 'points:' + liftId) : sort.column,
    sort.column === 'order' ? 'desc' : sort.direction,
    order,
  )
  const liftIds = state.rulebook.lifts
    .filter((lift) => liftId === 'ALL' || lift.id === liftId)
    .map((lift) => lift.id as string)
  const date = new Date(definition.date + 'T00:00:00').toLocaleDateString(
    locale === 'pl' ? 'pl-PL' : 'en-GB',
  )
  const liftTitle =
    liftId === 'ALL'
      ? lt('public.results.tabs.individual')
      : (state.rulebook.lifts.find((lift) => lift.id === liftId)?.name[locale] ?? liftId)
  async function exportTable(format: 'csv' | 'pdf' | 'jpg' | 'xlsx' | 'print'): Promise<void> {
    const model = visibleTableModel(state, rows, liftIds, liftTitle, lt, locale)
    const subtitle = definition.name + ' — ' + definition.date
    const name = fileSlug(definition.name + '-' + liftTitle)
    if (format === 'print') printTables(definition.name, subtitle, [model])
    else if (format === 'xlsx') downloadBlob(await tablesToXlsx([model]), name + '.xlsx')
    else if (format === 'csv') downloadBlob(tablesToCsv(model), name + '.csv')
    else if (format === 'jpg') downloadBlob(await buildResultsJpg(model, subtitle), name + '.jpg')
    else {
      const doc = await buildResultsPdf([model], {
        subtitle,
        generatedAt: new Date().toISOString().slice(0, 16).replace('T', ' '),
        fonts: await loadPdfFonts(),
      })
      downloadBlob(doc.output('blob'), name + '.pdf')
    }
  }
  const tabClass = (active: boolean) =>
    'px-3 py-1.5 font-display text-sm uppercase tracking-[0.15em] border transition ' +
    (active
      ? 'bg-primary-red text-black border-primary-red'
      : 'border-border-color text-text-secondary hover:text-text-primary hover:border-primary-red')
  return (
    <div className="min-h-screen bg-main-bg">
      <header className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-border-color px-4 py-2">
        <img src="/wuap-logo.webp" alt="WUAP" className="h-10 rounded bg-white p-0.5" />
        <h1 className="font-display text-2xl uppercase tracking-[0.12em] text-text-primary">
          {definition.name}
        </h1>
        <span className="text-caption uppercase tracking-[0.2em] text-text-secondary">
          {[definition.location, date].filter(Boolean).join(' • ')}
        </span>
        <nav className="ml-auto flex gap-2" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'individual'}
            className={tabClass(tab === 'individual')}
            onClick={() => setTab('individual')}
          >
            {lt('public.results.tabs.individual')}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'team'}
            className={tabClass(tab === 'team')}
            onClick={() => setTab('team')}
          >
            {lt('public.results.tabs.team')}
          </button>
        </nav>
      </header>
      <main className="px-4 py-3">
        {tab === 'individual' ? (
          <section className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <FilterBar
                options={filterOptions(state, all, locale, lt)}
                filters={filters}
                onChange={setFilters}
                lift={{
                  options: state.rulebook.lifts.map((lift) => ({
                    id: lift.id as string,
                    label: lift.name[locale],
                  })),
                  selected: liftId,
                  onSelect: setLiftId,
                }}
              />
              <div className="flex items-stretch gap-2">
                <ExportMenu disabled={rows.length === 0} onExport={exportTable} />
                <PrintButton
                  disabled={rows.length === 0}
                  onPrint={() => {
                    exportTable('print').catch(() => {})
                  }}
                />
              </div>
            </div>
            <div className="max-h-[calc(100vh-8rem)] overflow-auto border border-border-color">
              <ContestTable
                state={state}
                rows={rows}
                liftIds={liftIds}
                readOnly
                showRowNumbers
                showRackColumn={false}
                sortColumn={sort.column}
                sortDirection={sort.direction}
                onSortChange={onSortChange}
                current={Option.none()}
                submit={() => {}}
              />
            </div>
          </section>
        ) : (
          <TeamResults state={state} contestName={definition.name} />
        )}
      </main>
    </div>
  )
}
