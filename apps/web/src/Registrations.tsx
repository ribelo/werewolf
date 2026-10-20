import type { ContestJournal, ContestState, TableModel } from '@werewolf/core'
import * as Option from 'effect/Option'
import { useMemo, useState } from 'react'
import { CompetitorModal } from './CompetitorModal.tsx'
import { ContestTable } from './ContestTable.tsx'
import { buildRows, filterOptions, matches, sortRows, type TableRow } from './contest-table.ts'
import { ImportPanel, TeamsPanel } from './EntriesPanel.tsx'
import { FilterBar } from './FilterBar.tsx'
import { useLegacy } from './legacy-i18n.ts'
import { PrintButton, useTableState } from './LiftPanel.tsx'
import { printTables } from './table-export.ts'

export const NEW_ENTRY = 'new'

/** The registration list as filtered and sorted on screen, for printing. */
function registrationModel(
  state: ContestState,
  rows: ReadonlyArray<TableRow>,
  title: string,
  lt: (key: string) => string,
  locale: 'pl' | 'en',
): TableModel {
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
      ...state.rulebook.lifts.map((lift) => lift.name[locale]),
      lt('contest_table.columns.labels'),
    ],
    rows: rows.map((row, index) => [
      String(index + 1),
      row.entry.lifter.name,
      row.team,
      row.entry.lifter.sex === 'male' ? 'M' : locale === 'pl' ? 'K' : 'F',
      row.entry.lifter.birthDate + ' (' + row.age + ')',
      typeof row.entry.bodyweight === 'number' ? String(row.entry.bodyweight) : '',
      row.weightClass,
      row.ageClass,
      ...state.rulebook.lifts.map((lift) => {
        const taken = row.entry.lifts.find((item) => item.liftId === lift.id)
        if (!taken) return ''
        return typeof taken.openingWeight === 'number' ? String(taken.openingWeight) : '✓'
      }),
      row.labels.join(', '),
    ]),
  }
}

/** The "Rejestracja" tab: lifters with lift switches, the competitor dialog, import and teams. */
export function Registrations({
  state,
  journal,
  contestName,
  submit,
  editing,
  onEdit,
}: {
  readonly state: ContestState
  readonly journal: ContestJournal
  readonly contestName: string
  readonly submit: (input: object) => void
  /** The entry in the competitor dialog, or NEW_ENTRY for an empty dialog. */
  readonly editing: Option.Option<string>
  readonly onEdit: (entryId: Option.Option<string>) => void
}) {
  const { lt, locale } = useLegacy()
  const { filters, setFilters, sort, onSortChange } = useTableState('registrations')
  const [panel, setPanel] = useState<'none' | 'import' | 'teams'>('none')
  const toggle = (next: 'import' | 'teams') => setPanel(panel === next ? 'none' : next)
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
            className={
              (panel === 'import' ? 'btn-primary' : 'btn-secondary') + ' px-3 py-1 text-xxs'
            }
            onClick={() => toggle('import')}
          >
            {lt('v2.registrations.import_only')}
          </button>
          <button
            type="button"
            className={
              (panel === 'teams' ? 'btn-primary' : 'btn-secondary') + ' px-3 py-1 text-xxs'
            }
            onClick={() => toggle('teams')}
          >
            {lt('v2.registrations.teams')}
          </button>
          <PrintButton
            disabled={rows.length === 0}
            onPrint={() =>
              printTables(contestName, contestName + ' — ' + state.date, [
                registrationModel(
                  state,
                  rows,
                  lt('contest_detail.registrations.title'),
                  lt,
                  locale,
                ),
              ])
            }
          />
        </div>
      </header>
      {panel === 'import' && <ImportPanel state={state} journal={journal} submit={submit} />}
      {panel === 'teams' && <TeamsPanel state={state} submit={submit} />}
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
