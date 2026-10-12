import { currentAttempt, liftingOrder, type Attempt, type ContestState } from '@werewolf/core'
import type { ContestDefinition, ReadLinks } from '@werewolf/sync'
import * as Option from 'effect/Option'
import { attemptStatus, attemptStatusClass } from './ContestTable.tsx'
import { clockText, useCountdown } from './clock.ts'
import { formatWeight } from './contest-table.ts'
import { useLegacy } from './legacy-i18n.ts'

const tileClass =
  'card transition-transform hover:-translate-y-1 focus:outline-none focus:ring-2 focus:ring-primary-red focus:ring-offset-2 focus:ring-offset-main-bg text-left'

export type DeskAction = 'edit' | 'categories' | 'backups' | 'plates'

/** The 2025 "Stanowisko" tab: status cards, screen links, setup tiles, current attempt and recent attempts. */
export function DeskHub({
  state,
  definition,
  links,
  connected,
  submit,
  onAction,
}: {
  readonly state: ContestState
  readonly definition: ContestDefinition
  readonly links: Option.Option<ReadLinks>
  readonly connected: boolean
  readonly submit: (input: object) => void
  readonly onAction: (action: DeskAction) => void
}) {
  const { lt, locale } = useLegacy()
  const liftName = (id: string) =>
    state.rulebook.lifts.find((lift) => lift.id === id)?.name[locale] ?? id
  const lifterName = (entryId: string) =>
    state.entries.find((entry) => entry.id === entryId)?.lifter.name ??
    lt('contest_detail.registrations.unknown_competitor')
  const judged = state.attempts.filter((attempt) => attempt._tag === 'Judged')
  const pending = state.attempts.filter((attempt) => attempt._tag === 'Declared')
  const status = judged.length === 0 ? 'Setup' : pending.length === 0 ? 'Completed' : 'InProgress'
  const statusClass =
    status === 'Setup'
      ? 'status-badge status-warning'
      : status === 'InProgress'
        ? 'status-badge status-active'
        : 'status-badge status-neutral'
  const connection = connected ? 'status-badge status-active' : 'status-badge status-error'
  const connectionLabel = lt(
    connected ? 'contest_detail.connection.live' : 'contest_detail.connection.offline',
  )
  const lastSequence = judged.reduce(
    (top, attempt) => Math.max(top, attempt._tag === 'Judged' ? attempt.achievedAt : 0),
    0,
  )
  const lastUpdate = new Date(lastSequence || Date.now()).toLocaleString(
    locale === 'pl' ? 'pl-PL' : 'en-GB',
  )
  const current = currentAttempt(state)
  const order = liftingOrder(state)
  const phase = Option.match(current, { onNone: () => order[0], onSome: (value) => value })
  const queue = phase
    ? order.filter((attempt) => attempt.liftId === phase.liftId && attempt.number === phase.number)
    : []
  const recent = state.attempts
    .filter(
      (attempt): attempt is Attempt & { readonly _tag: 'Judged' } => attempt._tag === 'Judged',
    )
    .toSorted((a, b) => b.sequence - a.sequence)
    .slice(0, 5)
  const qrVisible = Option.isSome(state.scoreboard.qrUrl)
  const toggleQr = () =>
    Option.match(links, {
      onNone: () => {},
      onSome: (value) =>
        submit(
          qrVisible
            ? { _tag: 'SetScoreboard', filter: state.scoreboard.filter }
            : { _tag: 'SetScoreboard', filter: state.scoreboard.filter, qrUrl: value.results },
        ),
    })
  const link = (role: keyof ReadLinks, key: string) => (
    <a
      key={role}
      className={tileClass}
      {...Option.match(links, { onNone: () => ({}), onSome: (value) => ({ href: value[role] }) })}
      target="_blank"
      rel="noreferrer"
    >
      <div className="mb-3">
        <h3 className="text-h3 text-text-primary">
          {lt('contest_detail.links.' + key + '.title')}
        </h3>
      </div>
      <p className="text-body text-text-secondary">
        {lt('contest_detail.links.' + key + '.description')}
      </p>
    </a>
  )
  const action = (key: DeskAction, title: string, description: string) => (
    <button key={key} type="button" className={tileClass} onClick={() => onAction(key)}>
      <div className="mb-3">
        <h3 className="text-h3 text-text-primary">{title}</h3>
      </div>
      <p className="text-body text-text-secondary">{description}</p>
    </button>
  )
  return (
    <div className="space-y-8">
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <div className="card">
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-2">
              <h3 className="text-label text-text-secondary">
                {lt('contest_detail.cards.status.title')}
              </h3>
              <p className="text-body text-text-secondary">
                {lt('contest_detail.cards.status.meta', {
                  location: (definition.location ?? '').toUpperCase() || '—',
                  date: new Date(definition.date + 'T00:00:00').toLocaleDateString(
                    locale === 'pl' ? 'pl-PL' : 'en-US',
                  ),
                })}
              </p>
            </div>
            <div className="flex flex-col items-end gap-2 shrink-0">
              <button
                type="button"
                className="btn-secondary px-3 py-1 text-xxs"
                disabled={Option.isNone(links)}
                onClick={toggleQr}
              >
                {lt(qrVisible ? 'display_table.actions.hide_qr' : 'display_table.actions.show_qr')}
              </button>
            </div>
          </div>
          <div className="mt-4 flex items-center justify-between">
            <span className="text-h2 text-text-primary uppercase tracking-[0.3em]">{status}</span>
            <span className={statusClass}>{status}</span>
          </div>
        </div>
        <div className="card">
          <h3 className="text-label text-text-secondary mb-2">
            {lt('contest_detail.cards.lifters.title')}
          </h3>
          <div className="mt-4 flex items-baseline justify-between gap-4">
            <span className="text-h2 text-text-primary">{state.entries.length}</span>
            <p className="text-body text-text-secondary text-right">
              {lt('contest_detail.cards.lifters.hint')}
            </p>
          </div>
        </div>
        <div className="card">
          <h3 className="text-label text-text-secondary mb-2">
            {lt('contest_detail.cards.queue.title')}
          </h3>
          <div className="mt-4 flex items-baseline justify-between gap-4">
            <span className="text-h2 text-text-primary">{order.length}</span>
            <p className="text-body text-text-secondary text-right">
              {lt('contest_detail.cards.queue.hint')}
            </p>
          </div>
        </div>
        <div className="card">
          <h3 className="text-label text-text-secondary mb-2">
            {lt('contest_detail.cards.last_update.title')}
          </h3>
          <p className="mt-4 text-body text-text-secondary">{lastUpdate}</p>
          <p className="mt-2 text-body text-text-secondary">
            {lt('contest_detail.cards.last_update.connection_prefix')}
            <span className={connection}>{connectionLabel}</span>
          </p>
        </div>
      </section>
      <section className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {link('announcer', 'announcer')}
        {link('stage', 'display')}
        {link('scoreboard', 'shareable')}
        {link('results', 'public_results')}
      </section>
      <section className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {action(
          'edit',
          lt('contest_detail.actions.edit_contest'),
          lt('contest_detail.actions.edit_contest_description'),
        )}
        {action(
          'categories',
          lt('contest_detail.registrations.manage_categories'),
          lt('contest_detail.registrations.manage_categories_description'),
        )}
        {action('backups', lt('v2.tiles.backups_title'), lt('v2.tiles.backups_description'))}
        {action(
          'plates',
          lt('contest_detail.plates.title'),
          lt('contest_detail.plates.manage_link'),
        )}
      </section>
      <section className="grid gap-4 lg:grid-cols-2">
        <CurrentAttemptCard
          state={state}
          connected={connected}
          submit={submit}
          liftName={liftName}
          lifterName={lifterName}
          queue={queue}
        />
        <div className="card">
          <header className="mb-4">
            <h3 className="text-h3 text-text-primary">{lt('contest_detail.recent.title')}</h3>
            <p className="text-body text-text-secondary">{lt('contest_detail.recent.subtitle')}</p>
          </header>
          {recent.length > 0 ? (
            <ul className="space-y-3">
              {recent.map((attempt) => (
                <li
                  key={attempt.entryId + attempt.liftId + attempt.number}
                  className="flex items-center justify-between border-b border-border-color pb-3 last:border-b-0"
                >
                  <div>
                    <p className="text-body text-text-primary font-semibold">
                      {lifterName(attempt.entryId)}
                    </p>
                    <p className="text-caption text-text-secondary">
                      {lt('contest_detail.recent.meta', {
                        lift: liftName(attempt.liftId),
                        number: attempt.number,
                        weight: String(attempt.weight),
                      })}
                    </p>
                  </div>
                  <div className="text-right">
                    <span
                      className={
                        'inline-flex items-center justify-center rounded px-2 py-1 text-xxs font-semibold ' +
                        attemptStatusClass(attemptStatus(attempt))
                      }
                    >
                      {lt('attempt.status.' + attemptStatus(attempt))}
                    </span>
                    <p className="text-xxs text-text-secondary mt-1">
                      {lt('contest_detail.recent.time', {
                        time: new Date(attempt.achievedAt).toLocaleTimeString(
                          locale === 'pl' ? 'pl-PL' : 'en-GB',
                        ),
                      })}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <div className="text-center py-8 text-text-secondary">
              <p className="text-body">{lt('contest_detail.attempts.empty')}</p>
            </div>
          )}
        </div>
      </section>
    </div>
  )
}

function CurrentAttemptCard({
  state,
  connected,
  submit,
  liftName,
  lifterName,
  queue,
}: {
  readonly state: ContestState
  readonly connected: boolean
  readonly submit: (input: object) => void
  readonly liftName: (id: string) => string
  readonly lifterName: (id: string) => string
  readonly queue: ReadonlyArray<Attempt & { readonly _tag: 'Declared' }>
}) {
  const { lt } = useLegacy()
  const current = currentAttempt(state)
  const remaining = useCountdown(state.clock)
  const seconds = state.rulebook.clockSeconds ?? 60
  const connection = connected ? 'status-badge status-active' : 'status-badge status-error'
  const phase = Option.getOrUndefined(current) ?? queue[0]
  return (
    <div className="card">
      <header className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-h3 text-text-primary">{lt('contest_detail.current.title')}</h3>
          <p className="text-body text-text-secondary">{lt('contest_detail.current.subtitle')}</p>
        </div>
        <span className={connection}>
          {lt(connected ? 'contest_detail.connection.live' : 'contest_detail.connection.offline')}
        </span>
      </header>
      {Option.isSome(current) ? (
        (() => {
          const attempt = current.value
          const ref = { entryId: attempt.entryId, liftId: attempt.liftId, number: attempt.number }
          return (
            <>
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <p className="text-label text-text-secondary mb-1">
                    {lt('contest_detail.current.lifter_label')}
                  </p>
                  <p className="text-h2 text-text-primary">{lifterName(attempt.entryId)}</p>
                  <p className="text-body text-text-secondary mt-2">
                    {lt('contest_detail.current.attempt_meta', {
                      number: attempt.number,
                      lift: liftName(attempt.liftId),
                    })}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-label text-text-secondary mb-1">
                    {lt('contest_detail.current.weight_label')}
                  </p>
                  <p className="weight-large text-text-primary">{formatWeight(attempt.weight)}</p>
                  <p className="text-caption text-text-secondary mt-2">
                    {lt('attempt.status.pending')}
                  </p>
                </div>
              </div>
              <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    className="btn-primary px-4 py-2 text-xxs"
                    onClick={() =>
                      submit({ _tag: 'SetVerdict', attempt: ref, verdict: 'goodLift' })
                    }
                  >
                    {lt('contest_detail.current.actions.mark_good')}
                  </button>
                  <button
                    type="button"
                    className="btn-secondary px-4 py-2 text-xxs"
                    onClick={() => submit({ _tag: 'SetVerdict', attempt: ref, verdict: 'noLift' })}
                  >
                    {lt('contest_detail.current.actions.mark_fail')}
                  </button>
                </div>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() =>
                    submit({
                      _tag: 'SetDidNotStart',
                      entryId: attempt.entryId,
                      liftId: attempt.liftId,
                      value: true,
                    })
                  }
                >
                  {lt('v2.dns.mark')}
                </button>
              </div>
            </>
          )
        })()
      ) : (
        <div className="text-center py-8 text-text-secondary">
          <p className="text-body">{lt('contest_detail.current.empty_title')}</p>
          <p className="text-caption mt-2">{lt('contest_detail.current.empty_hint')}</p>
        </div>
      )}
      <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-border-color pt-4">
        <div>
          <h4 className="text-label text-text-secondary">{lt('v2.clock.title')}</h4>
          <p
            className={
              'weight-medium mt-1 ' +
              (Option.isSome(remaining) && remaining.value <= 10
                ? 'text-primary-red'
                : 'text-text-primary')
            }
          >
            {Option.match(remaining, { onNone: () => clockText(seconds), onSome: clockText })}
          </p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            className="btn-primary px-4 py-2 text-xxs"
            onClick={() => submit({ _tag: 'StartClock', seconds })}
          >
            {lt('v2.clock.start')}
          </button>
          <button
            type="button"
            className="btn-secondary px-4 py-2 text-xxs"
            disabled={Option.isNone(state.clock)}
            onClick={() => submit({ _tag: 'StopClock' })}
          >
            {lt('v2.clock.stop')}
          </button>
        </div>
      </div>
      <div className="mt-6 border-t border-border-color pt-4">
        <div className="flex items-center justify-between">
          <h4 className="text-label text-text-secondary">
            {phase
              ? lt('contest_detail.current.queue_header', {
                  lift: liftName(phase.liftId),
                  round: phase.number,
                })
              : lt('contest_detail.current.queue_empty')}
          </h4>
          {queue.length > 0 && (
            <span className="text-caption text-text-secondary">{queue.length}</span>
          )}
        </div>
        {queue.length > 0 ? (
          <ul className="mt-3 space-y-2">
            {queue.map((attempt, index) => {
              const isCurrent =
                Option.isSome(current) &&
                current.value.entryId === attempt.entryId &&
                current.value.liftId === attempt.liftId &&
                current.value.number === attempt.number
              const lot = state.entries.find((entry) => entry.id === attempt.entryId)?.lotNumber
              return (
                <li
                  key={attempt.entryId + attempt.liftId + attempt.number}
                  className="flex flex-col gap-3 rounded border border-border-color px-3 py-2 md:flex-row md:items-center md:justify-between"
                >
                  <div>
                    <p className="text-body text-text-primary font-semibold">
                      {lifterName(attempt.entryId)}
                    </p>
                    <p className="text-caption text-text-secondary">
                      {lot
                        ? lt('contest_detail.current.queue_order', { order: lot })
                        : lt('contest_detail.current.queue_order_unknown')}
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-2 md:flex-row md:items-center md:gap-4">
                    <div className="text-right">
                      {index === 0 && (
                        <span className="mb-1 inline-flex items-center justify-center rounded bg-status-info/10 px-2 py-0.5 text-xxs font-semibold uppercase tracking-[0.3em] text-status-info">
                          {lt('contest_detail.current.queue_badge_next')}
                        </span>
                      )}
                      <p className="text-h4 text-text-primary">{formatWeight(attempt.weight)}</p>
                    </div>
                    <button
                      type="button"
                      className={
                        (index === 0 ? 'btn-primary' : 'btn-secondary') + ' px-4 py-1.5 text-xxs'
                      }
                      disabled={isCurrent}
                      onClick={() =>
                        submit({
                          _tag: 'SetCurrent',
                          attempt: {
                            entryId: attempt.entryId,
                            liftId: attempt.liftId,
                            number: attempt.number,
                          },
                        })
                      }
                    >
                      {isCurrent
                        ? lt('contest_detail.current.actions.is_current')
                        : index === 0
                          ? lt('contest_detail.current.actions.go_live')
                          : lt('contest_detail.current.actions.queue_set_current')}
                    </button>
                  </div>
                </li>
              )
            })}
          </ul>
        ) : (
          <p className="mt-3 text-caption text-text-secondary">
            {lt('contest_detail.current.queue_empty')}
          </p>
        )}
      </div>
    </div>
  )
}
