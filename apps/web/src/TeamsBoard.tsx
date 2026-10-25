import type { ContestState, Entry } from '@werewolf/core'
import { useMemo, useState } from 'react'
import { buildRows, type TableRow } from './contest-table.ts'
import { useLegacy } from './legacy-i18n.ts'

const NO_TEAM = ''
const NONE = '\u0000none'

/**
 * The "Drużyny" tab: lifters grouped by club, with drag and drop between clubs.
 * Clubs without lifters are not shown; lifters without a club have their own group.
 */
export function TeamsBoard({
  state,
  submit,
}: {
  readonly state: ContestState
  readonly submit: (input: object) => void
}) {
  const { lt, locale } = useLegacy()
  const rows = useMemo(() => buildRows(state, locale), [state, locale])
  const [dragged, setDragged] = useState('')
  /** The group under the dragged lifter; NONE when nothing is over a group. */
  const [over, setOver] = useState<string>(NONE)
  const groups = useMemo(() => {
    const byTeam = new Map<string, Array<TableRow>>()
    for (const row of rows) {
      const key = row.entry.lifter.teamId ?? NO_TEAM
      byTeam.set(key, [...(byTeam.get(key) ?? []), row])
    }
    const named = state.teams
      .filter((team) => (byTeam.get(team.id) ?? []).length > 0)
      .toSorted((a, b) => a.name.localeCompare(b.name, locale))
      .map((team) => ({ id: team.id as string, name: team.name, rows: byTeam.get(team.id) ?? [] }))
    const loose = byTeam.get(NO_TEAM) ?? []
    return [
      ...(loose.length > 0
        ? [{ id: NO_TEAM, name: lt('v2.teams_board.no_team'), rows: loose }]
        : []),
      ...named,
    ].map((group) => ({
      ...group,
      rows: group.rows.toSorted((a, b) =>
        a.entry.lifter.name.localeCompare(b.entry.lifter.name, locale),
      ),
    }))
  }, [rows, state.teams, locale, lt])
  const move = (entry: Entry, teamId: string) => {
    if ((entry.lifter.teamId ?? NO_TEAM) === teamId) return
    submit(
      teamId === NO_TEAM
        ? { _tag: 'SetEntryTeam', entryId: entry.id }
        : { _tag: 'SetEntryTeam', entryId: entry.id, teamId },
    )
  }
  const liftCode = (id: string) => {
    const lift = state.rulebook.lifts.find((item) => item.id === id)
    return lift ? (lift.code ?? lift.name[locale]) : id
  }
  return (
    <section className="space-y-2">
      <header className="flex flex-wrap items-baseline gap-4">
        <h3 className="font-display text-2xl uppercase tracking-[0.15em] text-text-primary">
          {lt('v2.teams_board.title')}
        </h3>
        <span className="text-caption text-text-secondary">{lt('v2.teams_board.hint')}</span>
      </header>
      <div className="columns-1 gap-2 md:columns-2 xl:columns-3 2xl:columns-4">
        {groups.map((group) => (
          <div
            key={group.id || 'none'}
            className={
              'mb-2 break-inside-avoid border bg-card-bg transition-colors ' +
              (over === group.id ? 'border-primary-red bg-primary-red/10' : 'border-border-color')
            }
            onDragOver={(event) => {
              event.preventDefault()
              event.dataTransfer.dropEffect = 'move'
              if (over !== group.id) setOver(group.id)
            }}
            onDragLeave={(event) => {
              const next = event.relatedTarget
              if (!(next instanceof Node) || !event.currentTarget.contains(next)) setOver(NONE)
            }}
            onDrop={(event) => {
              event.preventDefault()
              setOver(NONE)
              const entry = state.entries.find(
                (item) => item.id === (event.dataTransfer.getData('text/plain') || dragged),
              )
              if (entry) move(entry, group.id)
              setDragged('')
            }}
          >
            <div className="flex items-baseline justify-between gap-2 border-b border-border-color px-3 py-2">
              <span
                className={
                  'font-display text-lg uppercase tracking-[0.1em] ' +
                  (group.id === NO_TEAM ? 'text-text-secondary' : 'text-text-primary')
                }
              >
                {group.name}
              </span>
              <span className="font-mono text-sm text-text-secondary">{group.rows.length}</span>
            </div>
            <ul className="divide-y divide-border-color/60">
              {group.rows.map((row) => (
                <li
                  key={row.entry.id}
                  draggable
                  onDragStart={(event) => {
                    event.dataTransfer.setData('text/plain', row.entry.id)
                    event.dataTransfer.effectAllowed = 'move'
                    setDragged(row.entry.id)
                  }}
                  onDragEnd={() => {
                    setDragged('')
                    setOver(NONE)
                  }}
                  className={
                    'flex cursor-grab items-center gap-3 px-3 py-1.5 text-sm active:cursor-grabbing ' +
                    (dragged === row.entry.id ? 'opacity-40' : 'hover:bg-element-bg')
                  }
                >
                  <span className="w-5 text-center text-xxs uppercase text-text-secondary">
                    {row.entry.lifter.sex === 'male' ? 'M' : locale === 'pl' ? 'K' : 'F'}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold text-text-primary">
                      {row.entry.lifter.name}
                    </span>
                    <span className="block truncate text-xxs text-text-secondary">
                      {[row.age + ' ' + lt('v2.teams_board.years'), row.ageClass, row.weightClass]
                        .filter(Boolean)
                        .join(' • ')}
                    </span>
                  </span>
                  <span className="whitespace-nowrap font-mono text-xxs text-text-secondary">
                    {row.entry.lifts.map((item) => liftCode(item.liftId)).join(' ')}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </section>
  )
}
