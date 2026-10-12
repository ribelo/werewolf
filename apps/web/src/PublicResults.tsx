import type { ContestState } from '@werewolf/core'
import type { ContestDefinition } from '@werewolf/sync'
import * as Option from 'effect/Option'
import { Calendar, MapPin } from 'lucide-react'
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
import { useTableState } from './LiftPanel.tsx'
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
        (liftId === 'ALL' || row.entry.lifts.some((item) => item.liftId === liftId)),
    ),
    sort.column === 'order' ? (liftId === 'ALL' ? 'points' : 'points:' + liftId) : sort.column,
    sort.column === 'order' ? 'desc' : sort.direction,
    order,
  )
  const tabClass = (active: boolean) =>
    'whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm transition-colors ' +
    (active
      ? 'border-primary-red text-primary-red'
      : 'border-transparent text-text-secondary hover:text-text-primary hover:border-border-color')
  return (
    <div className="min-h-screen bg-main-bg">
      <div className="container mx-auto px-4 py-8">
        <header className="mb-8">
          <div className="space-y-4">
            <div className="flex items-center gap-4">
              <img src="/wuap-logo.webp" alt="WUAP" className="h-16 rounded-lg bg-white p-1" />
              <div>
                <h1 className="text-h1 text-text-primary mb-2">{definition.name}</h1>
                <p className="text-h4 text-text-secondary">{lt('public.results.subtitle')}</p>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 text-sm text-text-secondary">
              <div className="flex items-center gap-2">
                <Calendar className="h-4 w-4" />
                <span>
                  {new Date(definition.date + 'T00:00:00').toLocaleDateString(
                    locale === 'pl' ? 'pl-PL' : 'en-GB',
                  )}
                </span>
              </div>
              {Option.match(Option.fromUndefinedOr(definition.location), {
                onNone: () => <></>,
                onSome: (place) => (
                  <div className="flex items-center gap-2">
                    <MapPin className="h-4 w-4" />
                    <span>{place}</span>
                  </div>
                ),
              })}
            </div>
          </div>
        </header>
        <main className="space-y-6">
          <div className="border-b border-border-color">
            <nav className="flex space-x-8">
              <button
                type="button"
                className={tabClass(tab === 'individual')}
                onClick={() => setTab('individual')}
              >
                {lt('public.results.tabs.individual')}
              </button>
              <button
                type="button"
                className={tabClass(tab === 'team')}
                onClick={() => setTab('team')}
              >
                {lt('public.results.tabs.team')}
              </button>
            </nav>
          </div>
          {tab === 'individual' ? (
            <section className="space-y-4">
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
              <div className="overflow-x-auto">
                <ContestTable
                  state={state}
                  rows={rows}
                  liftIds={state.rulebook.lifts
                    .filter((lift) => liftId === 'ALL' || lift.id === liftId)
                    .map((lift) => lift.id)}
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
        <footer className="mt-16 pt-8 border-t border-border-color text-center text-sm text-text-secondary">
          <p>{definition.name}</p>
        </footer>
      </div>
    </div>
  )
}
