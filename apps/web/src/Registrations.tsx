import type { ContestJournal, ContestState } from '@werewolf/core'
import * as Option from 'effect/Option'
import { useMemo, useState } from 'react'
import { CompetitorModal } from './CompetitorModal.tsx'
import { ContestTable } from './ContestTable.tsx'
import { buildRows, filterOptions, matches, sortRows } from './contest-table.ts'
import { ImportPanel, TeamsPanel } from './EntriesPanel.tsx'
import { FilterBar } from './FilterBar.tsx'
import { useLegacy } from './legacy-i18n.ts'
import { useTableState } from './LiftPanel.tsx'

export const NEW_ENTRY = 'new'

/** The "Rejestracja" tab: lifters with lift switches, the competitor dialog, import and teams. */
export function Registrations({
  state,
  journal,
  submit,
  editing,
  onEdit,
}: {
  readonly state: ContestState
  readonly journal: ContestJournal
  readonly submit: (input: object) => void
  /** The entry in the competitor dialog, or NEW_ENTRY for an empty dialog. */
  readonly editing: Option.Option<string>
  readonly onEdit: (entryId: Option.Option<string>) => void
}) {
  const { lt, locale } = useLegacy()
  const { filters, setFilters, sort, onSortChange } = useTableState('registrations')
  const [extras, setExtras] = useState(false)
  const all = useMemo(() => buildRows(state, locale), [state, locale])
  const order = useMemo(
    () => new Map(state.entries.map((entry) => [entry.id as string, entry.lotNumber as number])),
    [state],
  )
  const rows = sortRows(
    all.filter((row) => matches(row, filters)),
    sort.column,
    sort.direction,
    order,
  )
  return (
    <div className="space-y-2">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="mr-2 font-display text-2xl uppercase tracking-[0.15em] text-text-primary">
            {lt('contest_detail.registrations.title')}
          </h3>
          <FilterBar
            options={filterOptions(state, all, locale, lt)}
            filters={filters}
            onChange={setFilters}
          />
        </div>
        <div className="flex flex-wrap items-stretch gap-2">
          <button
            type="button"
            className="btn-primary px-3 py-1 text-xxs"
            onClick={() => onEdit(Option.some(NEW_ENTRY))}
          >
            {lt('contest_detail.registrations.add_competitor')}
          </button>
          <button
            type="button"
            className={(extras ? 'btn-primary' : 'btn-secondary') + ' px-3 py-1 text-xxs'}
            onClick={() => setExtras(!extras)}
          >
            {lt('v2.registrations.import')}
          </button>
        </div>
      </header>
      {extras && (
        <div className="grid gap-2 xl:grid-cols-2">
          <ImportPanel state={state} journal={journal} submit={submit} />
          <TeamsPanel state={state} submit={submit} />
        </div>
      )}
      {state.entries.length === 0 ? (
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
            liftIds={state.rulebook.lifts.map((lift) => lift.id)}
            attemptNumbers={[1]}
            mode="registration"
            showRowNumbers
            showPointsColumn={false}
            showMaxColumn={false}
            sortColumn={sort.column}
            sortDirection={sort.direction}
            onSortChange={onSortChange}
            current={Option.none()}
            submit={submit}
            onEditCompetitor={(entryId) => onEdit(Option.some(entryId))}
          />
        </div>
      )}
      {Option.match(editing, {
        onNone: () => <></>,
        onSome: (entryId) => (
          <CompetitorModal
            key={entryId}
            state={state}
            entry={Option.fromUndefinedOr(state.entries.find((entry) => entry.id === entryId))}
            submit={submit}
            onClose={() => onEdit(Option.none())}
          />
        ),
      })}
    </div>
  )
}
