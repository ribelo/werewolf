import type { Attempt, AttemptRef, ContestState } from '@werewolf/core'
import {
  ArrowUpDown,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Circle,
  Clock,
  Radio,
  XCircle,
} from 'lucide-react'
import * as Option from 'effect/Option'
import { useLegacy } from './legacy-i18n.ts'
import {
  formatCoefficient,
  formatWeight,
  liftPoints,
  type SortDirection,
  type TableRow,
} from './contest-table.ts'

/** Port of the 2025 UnifiedContestTable and AttemptCell: same columns, classes and controls. */
const NAME_COLUMN_WIDTH = 220
const attemptLabels = ['I', 'II', 'III', 'IV', 'V']
const LIVE_BUTTON_BASE =
  'inline-flex h-7 w-7 items-center justify-center rounded-sm border transition-colors duration-200'
const STATUS_BUTTON_BASE = LIVE_BUTTON_BASE
const PLACEHOLDER_CLASS =
  'inline-flex h-7 w-[3.75rem] items-center justify-center rounded border border-border-color/40 bg-element-bg/60 text-xs text-text-tertiary'
const TOGGLE_BUTTON_BASE =
  'inline-flex h-7 w-[3.75rem] items-center justify-center rounded border transition-colors duration-200'

type Status = 'pending' | 'successful' | 'failed'
export function attemptStatus(attempt: Attempt): Status {
  return attempt._tag === 'Judged'
    ? attempt.verdict === 'goodLift'
      ? 'successful'
      : 'failed'
    : 'pending'
}
export function attemptStatusClass(status: Status): string {
  switch (status) {
    case 'successful':
      return 'text-green-200 bg-green-600/30 border border-green-500'
    case 'failed':
      return 'text-red-200 bg-red-600/30 border border-red-500'
    case 'pending':
      return 'text-gray-400 bg-element-bg border border-border-color'
  }
}
const statusIcon = { pending: Clock, successful: CheckCircle2, failed: XCircle } as const

function parseWeightInput(raw: string): Option.Option<number> {
  const normalized = raw
    .replace(/,/g, '.')
    .replace(/[^0-9.-]/g, '')
    .replace(/(\..*?)\./g, '$1')
  const value = Number.parseFloat(normalized)
  return Number.isFinite(value) ? Option.some(Math.round(value * 100) / 100) : Option.none()
}

export interface TableActions {
  readonly submit: (input: object) => void
}

function ref(attempt: Attempt): AttemptRef {
  return { entryId: attempt.entryId, liftId: attempt.liftId, number: attempt.number }
}

/** Status cycles like 2025: pending → good → failed → pending. */
export function cycleStatus(attempt: Attempt, submit: (input: object) => void) {
  if (attempt._tag === 'Unannounced') return
  if (attempt._tag === 'Declared')
    submit({ _tag: 'SetVerdict', attempt: ref(attempt), verdict: 'goodLift' })
  else if (attempt.verdict === 'goodLift')
    submit({ _tag: 'SetVerdict', attempt: ref(attempt), verdict: 'noLift' })
  else submit({ _tag: 'ClearVerdict', attempt: ref(attempt) })
}

function AttemptCell({
  attempt: found,
  enabled,
  readOnly,
  live,
  dns,
  submit,
}: {
  readonly attempt: Option.Option<Attempt>
  readonly enabled: boolean
  readonly readOnly: boolean
  readonly live: boolean
  readonly dns: boolean
  readonly submit: (input: object) => void
}) {
  const { lt } = useLegacy()
  if (!enabled || Option.isNone(found)) return <span className={PLACEHOLDER_CLASS}>—</span>
  if (dns) return <span className={PLACEHOLDER_CLASS}>DNS</span>
  const attempt = found.value
  const status = attemptStatus(attempt)
  const Icon = statusIcon[status]
  const statusLabel = lt('attempt.status.' + status)
  const declared = attempt._tag !== 'Unannounced'
  const liveDisabled = live || !declared || attempt._tag === 'Judged'
  const liveClass = live
    ? LIVE_BUTTON_BASE + ' border-primary-red bg-primary-red/20 text-primary-red shadow-glow'
    : liveDisabled
      ? LIVE_BUTTON_BASE + ' border-border-color/60 text-text-tertiary cursor-not-allowed'
      : LIVE_BUTTON_BASE +
        ' border-border-color text-text-secondary hover:border-primary-red hover:text-primary-red'
  const weight = attempt._tag === 'Unannounced' ? '' : attempt.weight.toFixed(2)
  // Read-only screens show one box per attempt, coloured by its verdict, to keep rows short.
  if (readOnly)
    return (
      <span
        className={
          'inline-flex h-7 w-[4.25rem] items-center justify-center rounded px-1 font-mono text-xs ' +
          attemptStatusClass(status) +
          (live ? ' ring-2 ring-primary-red' : '') +
          (status === 'failed' ? ' line-through' : '')
        }
        aria-label={statusLabel}
        title={statusLabel}
      >
        {attempt._tag === 'Unannounced' ? '—' : attempt.weight}
      </span>
    )
  return (
    <div className="flex flex-col items-center gap-1">
      <div className="flex items-center gap-1">
        <button
          className={liveClass}
          type="button"
          aria-label={lt(
            live ? 'contest_table.actions.live_now' : 'contest_table.actions.set_live',
          )}
          title={lt(live ? 'contest_table.actions.live_now' : 'contest_table.actions.set_live')}
          aria-pressed={live}
          disabled={liveDisabled}
          onClick={() => submit({ _tag: 'SetCurrent', attempt: ref(attempt) })}
        >
          <Radio className="h-4 w-4" aria-hidden="true" />
        </button>
        <button
          className={
            STATUS_BUTTON_BASE + ' ' + attemptStatusClass(status) + ' hover:brightness-110'
          }
          type="button"
          aria-label={statusLabel}
          title={statusLabel}
          disabled={!declared}
          onClick={() => cycleStatus(attempt, submit)}
        >
          <Icon className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
      <input
        key={weight}
        className="h-7 w-[3.75rem] rounded border border-border-color bg-main-bg px-2 text-center text-xs"
        type="text"
        inputMode="decimal"
        autoComplete="off"
        defaultValue={weight}
        placeholder="—"
        aria-label={lt('contest_table.columns.lifter') + ' ' + attemptLabels[attempt.number - 1]}
        onBlur={(event) => {
          const input = event.currentTarget
          // An emptied field takes the declaration back; a judged attempt keeps its weight.
          if (input.value.trim() === '') {
            if (attempt._tag === 'Declared') submit({ _tag: 'ClearWeight', attempt: ref(attempt) })
            else input.value = weight
            return
          }
          Option.map(parseWeightInput(input.value), (parsed) => {
            if (parsed.toFixed(2) !== weight)
              submit({ _tag: 'SetWeight', attempt: ref(attempt), weight: parsed })
          })
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter') event.currentTarget.blur()
        }}
      />
    </div>
  )
}

export interface ContestTableProps {
  readonly state: ContestState
  readonly rows: ReadonlyArray<TableRow>
  readonly liftIds: ReadonlyArray<string>
  readonly sortColumn: string
  readonly sortDirection: SortDirection
  readonly onSortChange: (column: string) => void
  readonly readOnly?: boolean
  readonly mode?: 'attempts' | 'registration'
  /** Registration shows only the first attempt of each lift, as in 2025. */
  readonly attemptNumbers?: ReadonlyArray<number>
  readonly showRowNumbers?: boolean
  readonly showAttemptGrid?: boolean
  readonly showPointsColumn?: boolean
  readonly showMaxColumn?: boolean
  readonly showLabelsColumn?: boolean
  readonly showRackColumn?: boolean
  readonly showReshelColumn?: boolean
  readonly showMcculloughColumn?: boolean
  readonly current: Option.Option<AttemptRef>
  readonly submit: (input: object) => void
  readonly onEditCompetitor?: (entryId: string) => void
}

export function ContestTable({
  state,
  rows,
  liftIds,
  sortColumn,
  sortDirection,
  onSortChange,
  readOnly = false,
  mode = 'attempts',
  attemptNumbers,
  showRowNumbers = false,
  showAttemptGrid = true,
  showPointsColumn = true,
  showMaxColumn = true,
  showLabelsColumn = true,
  showRackColumn = true,
  showReshelColumn = true,
  showMcculloughColumn = true,
  current,
  submit,
  onEditCompetitor,
}: ContestTableProps) {
  const { lt, locale } = useLegacy()
  const chosen = state.rulebook.lifts.filter((lift) => liftIds.includes(lift.id))
  const lifts = showAttemptGrid ? chosen : []
  const [only] = chosen
  const sole = chosen.length === 1 ? Option.fromUndefinedOr(only) : Option.none()
  const maxSortKey = Option.match(sole, { onNone: () => 'max', onSome: (lift) => 'max:' + lift.id })
  const pointsSortKey = Option.match(sole, {
    onNone: () => 'points',
    onSome: (lift) => 'points:' + lift.id,
  })
  const rackLifts = chosen.filter((lift) => lift.rackHeight)
  const isSorted = (column: string) =>
    (column === pointsSortKey && (sortColumn.startsWith('points') || sortColumn === 'points')) ||
    (column === maxSortKey && (sortColumn.startsWith('max') || sortColumn === 'max')) ||
    sortColumn === column
  const SortIcon = ({ column, small = false }: { column: string; small?: boolean }) => {
    const Icon = !isSorted(column) ? ArrowUpDown : sortDirection === 'asc' ? ChevronUp : ChevronDown
    return <Icon className={(small ? 'h-3 w-3' : 'h-3.5 w-3.5') + ' opacity-70'} />
  }
  const aria = (column: string) =>
    !isSorted(column) ? 'none' : sortDirection === 'asc' ? 'ascending' : 'descending'
  const header = (column: string, label: string, extra = '') => (
    <th
      className={'sticky top-0 z-10 bg-element-bg px-2 py-1.5 cursor-pointer ' + extra}
      rowSpan={2}
      role="columnheader"
      aria-sort={aria(column)}
      onClick={() => onSortChange(column)}
    >
      <div className="flex items-center gap-1">
        <span>{label}</span>
        <span aria-hidden="true">
          <SortIcon column={column} />
        </span>
      </div>
    </th>
  )
  const numbers = (attempts: number) =>
    Array.from({ length: attempts }, (_, index) => index + 1).filter(
      (number) => !attemptNumbers || attemptNumbers.includes(number),
    )
  const nameLeft = showRowNumbers ? 'left-[40px]' : 'left-0'
  return (
    <table className="w-full min-w-[1200px] border-collapse text-sm">
      <thead className="bg-element-bg text-label sticky top-0 z-20">
        <tr>
          {showRowNumbers && (
            <th
              className="sticky left-0 top-0 z-20 bg-element-bg px-2 py-2 text-center border-r border-border-color"
              rowSpan={2}
              style={{ minWidth: 40, width: 40 }}
              role="columnheader"
            >
              {/* The header of the number column counts the rows shown now. */}
              <span className="font-mono text-xs" title={lt('v2.columns.count')}>
                {rows.length}
              </span>
            </th>
          )}
          <th
            className={
              'sticky top-0 z-20 bg-element-bg px-2 py-1.5 text-left border-r border-border-color cursor-pointer ' +
              nameLeft
            }
            rowSpan={2}
            style={{ minWidth: NAME_COLUMN_WIDTH, width: NAME_COLUMN_WIDTH }}
            role="columnheader"
            aria-sort={aria('name')}
            onClick={() => onSortChange('name')}
          >
            <div className="flex items-center gap-1">
              <span>{lt('contest_table.columns.lifter')}</span>
              <span aria-hidden="true">
                <SortIcon column="name" />
              </span>
            </div>
          </th>
          {header('gender', lt('contest_table.columns.sex'))}
          {header('age', lt('contest_table.columns.age'))}
          {header('bodyweight', lt('contest_table.columns.bodyweight'))}
          {header('weightClass', lt('contest_table.columns.weight_class'))}
          {header('ageClass', lt('contest_table.columns.age_class'))}
          {showReshelColumn && header('reshel', lt('contest_table.columns.reshel'))}
          {showMcculloughColumn && header('mccullough', lt('contest_table.columns.mccullough'))}
          {showRackColumn && rackLifts.length > 0 && (
            <th className="sticky top-0 z-10 bg-element-bg px-2 py-1.5" rowSpan={2}>
              {lt('contest_table.columns.rack')}
            </th>
          )}
          {lifts.map((lift) => (
            <th
              key={lift.id}
              className="px-2 py-1.5 text-center uppercase tracking-[0.3em]"
              colSpan={numbers(lift.attempts).length}
            >
              {lift.name[locale]}
            </th>
          ))}
          {showPointsColumn && header(pointsSortKey, lt('contest_table.columns.points'))}
          {showMaxColumn && header(maxSortKey, lt('contest_table.columns.max'))}
          {showLabelsColumn && (
            <th className="sticky top-0 z-10 bg-element-bg px-2 py-1.5" rowSpan={2}>
              {lt('contest_table.columns.labels')}
            </th>
          )}
          {!readOnly && (
            <th className="sticky top-0 z-10 bg-element-bg px-2 py-1.5" rowSpan={2}>
              {lt('contest_table.columns.actions')}
            </th>
          )}
        </tr>
        <tr>
          {lifts.flatMap((lift) =>
            numbers(lift.attempts).map((number) => {
              const key = 'attempt:' + lift.id + ':' + number
              return (
                <th
                  key={key}
                  className="px-2 py-1 text-center text-xxs uppercase tracking-[0.3em] cursor-pointer select-none"
                  role="columnheader"
                  aria-sort={aria(key)}
                  onClick={() => onSortChange(key)}
                  title={(lift.code ?? lift.id) + ' ' + attemptLabels[number - 1]}
                >
                  <div className="inline-flex items-center gap-1">
                    <span>
                      {lift.code ?? lift.id}&nbsp;{attemptLabels[number - 1]}
                    </span>
                    <span aria-hidden="true">
                      <SortIcon column={key} small />
                    </span>
                  </div>
                </th>
              )
            }),
          )}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, index) => {
          const entry = row.entry
          const taken = (liftId: string) => entry.lifts.some((item) => item.liftId === liftId)
          const value = Option.match(sole, {
            onNone: () => row.points,
            onSome: (lift) => liftPoints(row, lift.id),
          })
          const max = Option.match(sole, {
            onNone: () => row.maxLift,
            onSome: (lift) => row.best[lift.id] ?? 0,
          })
          return (
            <tr key={entry.id} className="border-b border-border-color hover:bg-element-bg/50">
              {showRowNumbers && (
                <td
                  className="sticky left-0 z-10 bg-main-bg/95 px-2 py-2 text-center border-r border-border-color"
                  style={{ minWidth: 40, width: 40 }}
                >
                  <span className="text-sm text-text-secondary">{index + 1}</span>
                </td>
              )}
              <td
                className={
                  'sticky z-10 bg-main-bg/95 px-2 py-1.5 border-r border-border-color ' + nameLeft
                }
                style={{ minWidth: NAME_COLUMN_WIDTH, width: NAME_COLUMN_WIDTH }}
              >
                <div className="flex flex-col">
                  <span className="font-semibold text-text-primary">{entry.lifter.name}</span>
                  {row.team ? (
                    <span className="text-caption text-text-secondary">{row.team}</span>
                  ) : (
                    <span className="text-caption text-text-tertiary">—</span>
                  )}
                </div>
              </td>
              <td className="px-2 py-1.5 text-center text-xxs uppercase tracking-[0.2em]">
                {entry.lifter.sex === 'male' ? 'M' : locale === 'pl' ? 'K' : 'F'}
              </td>
              <td className="px-2 py-1.5 text-center">
                <span className="block whitespace-nowrap text-xxs leading-tight text-text-secondary">
                  {entry.lifter.birthDate}
                </span>
                <span className="block leading-tight">{row.age}</span>
              </td>
              <td className="px-2 py-1.5 text-center">
                {formatWeight(Option.fromUndefinedOr(entry.bodyweight))}
              </td>
              <td className="px-2 py-1.5 text-center">{row.weightClass || '—'}</td>
              <td className="px-2 py-1.5 text-center">
                <span className="block leading-tight">{row.ageClass || '—'}</span>
              </td>
              {showReshelColumn && (
                <td className="px-2 py-1.5 text-center">{formatCoefficient(row.reshel)}</td>
              )}
              {showMcculloughColumn && (
                <td className="px-2 py-1.5 text-center">{formatCoefficient(row.mccullough)}</td>
              )}
              {showRackColumn && rackLifts.length > 0 && (
                <td className="px-2 py-1.5 text-center">
                  <div className="flex flex-col gap-1 text-xxs uppercase tracking-[0.2em]">
                    {rackLifts.map((lift) => (
                      <span key={lift.id}>
                        {(lift.code ?? lift.id) + ': '}
                        {entry.lifts.find((item) => item.liftId === lift.id)?.rackHeight ?? '—'}
                      </span>
                    ))}
                  </div>
                </td>
              )}
              {lifts.flatMap((lift) =>
                numbers(lift.attempts).map((number) => {
                  const attempt = Option.fromUndefinedOr(row.attempts[lift.id]?.[number - 1])
                  const active = taken(lift.id)
                  const label = lt(
                    active
                      ? 'contest_table.actions.disable_lift'
                      : 'contest_table.actions.enable_lift',
                    { lift: lift.name[locale] },
                  )
                  return (
                    <td key={lift.id + number} className="px-2 py-2 text-center">
                      {mode === 'registration' ? (
                        <button
                          className={
                            TOGGLE_BUTTON_BASE +
                            (active
                              ? ' border-primary-red bg-primary-red/20 text-primary-red shadow-glow'
                              : ' border-border-color text-text-secondary hover:border-primary-red hover:text-primary-red')
                          }
                          type="button"
                          aria-label={label}
                          title={label}
                          aria-pressed={active}
                          onClick={() => {
                            const next = state.rulebook.lifts
                              .map((item) => item.id as string)
                              .filter((id) => (id === lift.id ? !active : taken(id)))
                            if (next.length > 0)
                              submit({ _tag: 'SetEntryLifts', entryId: entry.id, liftIds: next })
                          }}
                        >
                          {active ? (
                            <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                          ) : (
                            <Circle className="h-4 w-4" aria-hidden="true" />
                          )}
                        </button>
                      ) : (
                        <AttemptCell
                          attempt={attempt}
                          enabled={active}
                          readOnly={readOnly}
                          dns={row.didNotStart.has(lift.id)}
                          live={Option.exists(
                            Option.all([attempt, current]),
                            ([a, c]) =>
                              c.entryId === a.entryId &&
                              c.liftId === a.liftId &&
                              c.number === a.number,
                          )}
                          submit={submit}
                        />
                      )}
                    </td>
                  )
                }),
              )}
              {showPointsColumn && (
                <td className="px-2 py-1.5 text-center">{formatCoefficient(value)}</td>
              )}
              {showMaxColumn && (
                <td className="px-2 py-1.5 text-center">{max > 0 ? formatWeight(max) : '—'}</td>
              )}
              {showLabelsColumn && (
                <td className="px-2 py-1.5">
                  <div className="flex flex-wrap items-center gap-2">
                    {row.labels.length > 0 ? (
                      row.labels.map((label) => (
                        <span
                          key={label}
                          className="inline-flex items-center rounded bg-element-bg px-2 py-1 text-xxs uppercase tracking-[0.2em]"
                        >
                          {label}
                        </span>
                      ))
                    ) : (
                      <span className="text-xxs uppercase tracking-[0.2em] text-text-tertiary">
                        —
                      </span>
                    )}
                  </div>
                </td>
              )}
              {!readOnly && (
                <td className="px-2 py-1.5">
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      className="btn-secondary whitespace-nowrap px-2 py-0.5 text-xxs"
                      onClick={() => onEditCompetitor?.(entry.id)}
                    >
                      {lt('contest_table.actions.edit_competitor')}
                    </button>
                  </div>
                </td>
              )}
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}
