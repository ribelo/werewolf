import { currentAttempt, type ContestState, type ScoreboardFilter } from '@werewolf/core'
import * as Option from 'effect/Option'
import { useEffect, useMemo, useRef, useState } from 'react'
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
import { QrCode } from './QrCode.tsx'
import { useTableState } from './LiftPanel.tsx'

type Speed = 'very_slow' | 'slow' | 'normal' | 'fast'
const SPEED_PIXELS_PER_SECOND: Readonly<Record<Speed, number>> = {
  very_slow: 20,
  slow: 35,
  normal: 70,
  fast: 110,
}
const isSpeed = (value: string): value is Speed => value in SPEED_PIXELS_PER_SECOND

/**
 * The 2025 auto-scroll: down and back up at a steady speed, with a short pause at both ends.
 * The position is kept as a fraction: a screen with a device pixel ratio of 1 rounds scrollTop
 * to whole pixels, so adding less than a pixel per frame never moved the table there.
 */
function useAutoScroll(enabled: boolean, speed: Speed) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!enabled) return
    let frame = 0
    let last = 0
    let direction = 1
    let position = -1
    let pausedUntil = 0
    const step = (time: number) => {
      const element = ref.current
      if (element) {
        const seconds = last === 0 ? 0 : Math.min(0.1, (time - last) / 1000)
        last = time
        const max = element.scrollHeight - element.clientHeight
        // Follow a manual scroll or a table that changed under the screen.
        if (position < 0 || Math.abs(element.scrollTop - position) > 2) position = element.scrollTop
        if (max > 0 && time >= pausedUntil) {
          position += SPEED_PIXELS_PER_SECOND[speed] * seconds * direction
          if (position <= 0) {
            position = 0
            direction = 1
            pausedUntil = time + 2000
          } else if (position >= max) {
            position = max
            direction = -1
            pausedUntil = time + 2000
          }
          element.scrollTop = position
        }
      } else last = 0
      frame = requestAnimationFrame(step)
    }
    frame = requestAnimationFrame(step)
    return () => cancelAnimationFrame(frame)
  }, [enabled, speed])
  return ref
}

/** The desk's pushed table filter, as the screen's local filters. */
export function filtersFrom(filter: ScoreboardFilter): Filters {
  return {
    weight:
      filter.weightClassId ??
      (filter.sex === 'female' ? 'FEMALE_OPEN' : filter.sex === 'male' ? 'MALE_OPEN' : 'ALL'),
    age: filter.ageClassId ?? 'ALL',
    label: filter.divisionId ?? 'ALL',
  }
}
/** The local filters as a pushed table filter; UNASSIGNED and UNLABELED are not pushed. */
export function filterFrom(state: ContestState, filters: Filters, liftId: string): object {
  const sex =
    filters.weight === 'FEMALE_OPEN' ? 'female' : filters.weight === 'MALE_OPEN' ? 'male' : ''
  const weightClass = state.rulebook.weightClasses.some((item) => item.id === filters.weight)
    ? filters.weight
    : ''
  return {
    ...(liftId !== 'ALL' ? { liftId } : {}),
    ...(sex ? { sex } : {}),
    ...(weightClass ? { weightClassId: weightClass } : {}),
    ...(state.rulebook.ageClasses.some((item) => item.id === filters.age)
      ? { ageClassId: filters.age }
      : {}),
    ...(state.rulebook.divisions.some((item) => item.id === filters.label)
      ? { divisionId: filters.label }
      : {}),
  }
}

function useStored(key: string, initial: string): readonly [string, (value: string) => void] {
  const [value, setValue] = useState(() => localStorage.getItem(key) ?? initial)
  return [
    value,
    (next: string) => {
      localStorage.setItem(key, next)
      setValue(next)
    },
  ]
}

/** "Tabela spikera" (2025 /display/table): the live attempt table that follows the desk, with auto-scroll. */
export function AnnouncerTable({
  state,
  title,
  connected,
}: {
  readonly state: ContestState
  readonly title: string
  readonly connected: boolean
}) {
  const { lt, locale } = useLegacy()
  const [autoSync, setAutoSync] = useStored('displayTable.autoSyncEnabled', 'true')
  const [autoScroll, setAutoScroll] = useStored('displayTable.autoScrollEnabled', 'true')
  const [speedText, setSpeed] = useStored('displayTable.autoScrollSpeed', 'slow')
  const speed: Speed = isSpeed(speedText) ? speedText : 'slow'
  const following = autoSync === 'true'
  const [localFilters, setLocalFilters] = useState<Filters>(noFilters)
  const [localLift, setLocalLift] = useState('ALL')
  const { sort, onSortChange } = useTableState('announcer')
  const filters = following ? filtersFrom(state.scoreboard.filter) : localFilters
  const liftId = following ? (state.scoreboard.filter.liftId ?? 'ALL') : localLift
  const all = useMemo(() => buildRows(state, locale), [state, locale])
  const order = useMemo(
    () => new Map(state.entries.map((entry) => [entry.id as string, entry.lotNumber as number])),
    [state],
  )
  const lifts = state.rulebook.lifts.filter((lift) => liftId === 'ALL' || lift.id === liftId)
  const rows = sortRows(
    all.filter(
      (row) =>
        matches(row, filters) &&
        row.entry.lifts.some((item) => lifts.some((lift) => lift.id === item.liftId)),
    ),
    sort.column,
    sort.direction,
    order,
  )
  const scroller = useAutoScroll(autoScroll === 'true', speed)
  const [updated, setUpdated] = useState(() => Date.now())
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => setUpdated(Date.now()), [state])
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30000)
    return () => window.clearInterval(timer)
  }, [])
  const minutes = Math.max(0, Math.floor((now - updated) / 60000))
  return (
    <div className="h-screen overflow-hidden bg-black text-white flex flex-col">
      <header className="flex flex-wrap items-center gap-x-5 gap-y-2 border-b border-primary-red/40 px-4 py-2">
        <img src="/wuap-logo.webp" alt="WUAP" className="h-10 rounded bg-white p-0.5" />
        <h1
          className="font-display text-3xl uppercase tracking-[0.12em] text-white"
          style={{ textShadow: '0 0 16px rgba(220, 20, 60, 0.5)' }}
        >
          {title}
        </h1>
        <div className="flex items-center gap-2 text-xxs uppercase tracking-[0.3em] text-text-secondary">
          <span
            className={'h-2.5 w-2.5 rounded-full ' + (connected ? 'bg-green-500' : 'bg-red-600')}
            role="status"
            aria-label={lt(
              connected ? 'display_table.connection.live' : 'display_table.connection.offline',
            )}
          />
          <span>{lt('display_table.metrics.last_update')}</span>
          <span className="text-text-primary">
            {lt('display_table.metrics.last_update_relative', { minutes })}
          </span>
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-4">
          <label className="flex items-center gap-2 text-xxs uppercase tracking-[0.2em] text-text-secondary">
            <input
              type="checkbox"
              className="h-4 w-4 accent-primary-red"
              checked={following}
              onChange={(e) => setAutoSync(String(e.target.checked))}
            />
            <span className="text-text-primary">{lt('display_table.actions.auto_sync')}</span>
          </label>
          <label className="flex items-center gap-2 text-xxs uppercase tracking-[0.2em] text-text-secondary">
            <input
              type="checkbox"
              className="h-4 w-4 accent-primary-red"
              checked={autoScroll === 'true'}
              onChange={(e) => setAutoScroll(String(e.target.checked))}
            />
            <span className="text-text-primary">{lt('display_table.actions.auto_scroll')}</span>
          </label>
          {autoScroll === 'true' && (
            <select
              className="bg-black border border-white/30 text-text-primary px-2 py-1 text-xxs"
              aria-label={lt('display_table.actions.speed')}
              value={speed}
              onChange={(e) => setSpeed(e.target.value)}
            >
              {(['very_slow', 'slow', 'normal', 'fast'] as const).map((value) => (
                <option key={value} value={value}>
                  {lt('display_table.actions.speed_' + value)}
                </option>
              ))}
            </select>
          )}
        </div>
      </header>
      {Option.match(state.scoreboard.qrUrl, {
        onNone: () => <></>,
        onSome: (url) => (
          <div className="fixed bottom-3 right-3 z-30">
            <QrCode url={url} />
          </div>
        ),
      })}
      <main className="flex-1 flex flex-col gap-2 overflow-hidden px-4 py-2">
        <FilterBar
          options={filterOptions(state, all, locale, lt)}
          filters={filters}
          onChange={setLocalFilters}
          disabled={following}
          lift={{
            options: state.rulebook.lifts.map((lift) => ({
              id: lift.id as string,
              label: lift.name[locale],
            })),
            selected: liftId,
            onSelect: setLocalLift,
          }}
        />
        {rows.length === 0 ? (
          <div className="flex-1 min-h-0 flex items-center justify-center text-text-secondary text-caption">
            {lt('contest_detail.registrations.empty_filter')}
          </div>
        ) : (
          <div className="flex-1 min-h-0 overflow-auto border border-border-color" ref={scroller}>
            <ContestTable
              state={state}
              rows={rows}
              liftIds={lifts.map((lift) => lift.id)}
              readOnly
              showRowNumbers
              showLabelsColumn={false}
              showRackColumn={false}
              sortColumn={sort.column}
              sortDirection={sort.direction}
              onSortChange={onSortChange}
              current={Option.map(currentAttempt(state), (attempt) => attempt)}
              submit={() => {}}
            />
          </div>
        )}
      </main>
    </div>
  )
}

/** "Tabela publiczna" (2025 /display/share): lifters with filters; it scrolls by itself on a big screen. */
export function PublicTable({
  state,
  title,
}: {
  readonly state: ContestState
  readonly title: string
}) {
  const { lt, locale } = useLegacy()
  const [filters, setFilters] = useState<Filters>(noFilters)
  const [liftId, setLiftId] = useState('ALL')
  const [autoScroll, setAutoScroll] = useStored('displayShare.autoScrollEnabled', 'true')
  const { sort, onSortChange } = useTableState('share')
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
    sort.column,
    sort.direction,
    order,
  )
  const scroller = useAutoScroll(autoScroll === 'true', 'slow')
  return (
    <div className="h-screen overflow-hidden bg-main-bg text-text-primary flex flex-col">
      <header className="flex flex-wrap items-center gap-x-5 gap-y-2 border-b border-border-color px-4 py-2">
        <img src="/wuap-logo.webp" alt="WUAP" className="h-10 rounded bg-white p-0.5" />
        <h1 className="font-display text-3xl uppercase tracking-[0.12em] text-text-primary">
          {title}
        </h1>
        <p className="text-caption uppercase tracking-[0.3em] text-text-secondary">
          {lt('contest_detail.registrations.total', { count: state.entries.length })}
        </p>
        <label className="ml-auto flex items-center gap-2 text-xxs uppercase tracking-[0.2em] text-text-secondary">
          <input
            type="checkbox"
            className="h-4 w-4 accent-primary-red"
            checked={autoScroll === 'true'}
            onChange={(e) => setAutoScroll(String(e.target.checked))}
          />
          <span className="text-text-primary">{lt('display_table.actions.auto_scroll')}</span>
        </label>
      </header>
      <main className="flex-1 min-h-0 flex flex-col gap-2 px-4 py-2">
        <FilterBar
          options={filterOptions(state, all, locale, lt)}
          filters={filters}
          onChange={setFilters}
          showLabels={false}
          lift={{
            options: state.rulebook.lifts.map((lift) => ({
              id: lift.id as string,
              label: lift.name[locale],
            })),
            selected: liftId,
            onSelect: setLiftId,
          }}
        />
        <section className="flex-1 min-h-0 flex flex-col border border-border-color">
          {rows.length === 0 ? (
            <p className="text-caption text-text-secondary text-center py-6">
              {lt('contest_detail.registrations.empty')}
            </p>
          ) : (
            <div className="flex-1 min-h-0 overflow-auto" ref={scroller}>
              <ContestTable
                state={state}
                rows={rows}
                liftIds={state.rulebook.lifts
                  .filter((lift) => liftId === 'ALL' || lift.id === liftId)
                  .map((lift) => lift.id)}
                readOnly
                showRowNumbers
                showAttemptGrid={false}
                showPointsColumn={false}
                showMaxColumn={false}
                showLabelsColumn={false}
                showRackColumn={false}
                sortColumn={sort.column}
                sortDirection={sort.direction}
                onSortChange={onSortChange}
                current={Option.none()}
                submit={() => {}}
              />
            </div>
          )}
        </section>
      </main>
    </div>
  )
}
