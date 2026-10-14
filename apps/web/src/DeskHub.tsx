import { liftingOrder, type ContestState } from '@werewolf/core'
import type { ContestDefinition, ReadLinks } from '@werewolf/sync'
import * as Option from 'effect/Option'
import { useLegacy } from './legacy-i18n.ts'

const tileClass =
  'flex flex-col gap-1 border border-border-color bg-card-bg px-4 py-3 text-left transition-colors hover:border-primary-red hover:bg-element-bg focus:outline-none focus:ring-2 focus:ring-primary-red'

export type DeskAction = 'edit' | 'categories' | 'backups' | 'plates' | 'videos'

/** The "Stanowisko" tab: a dashboard of tiles to the screens and the contest setup. */
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
  const judged = state.attempts.filter((attempt) => attempt._tag === 'Judged').length
  const queue = liftingOrder(state).length
  const status = judged === 0 ? 'Setup' : queue === 0 ? 'Completed' : 'InProgress'
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
  const tile = (title: string, description: string) => (
    <>
      <span className="font-display text-xl uppercase tracking-[0.1em] text-text-primary">
        {title}
      </span>
      <span className="text-caption text-text-secondary">{description}</span>
    </>
  )
  const screen = (role: keyof ReadLinks, title: string, description: string) => (
    <a
      key={role}
      className={tileClass}
      {...Option.match(links, { onNone: () => ({}), onSome: (value) => ({ href: value[role] }) })}
      target="_blank"
      rel="noreferrer"
    >
      {tile(title, description)}
    </a>
  )
  const action = (key: DeskAction, title: string, description: string) => (
    <button key={key} type="button" className={tileClass} onClick={() => onAction(key)}>
      {tile(title, description)}
    </button>
  )
  const fact = (label: string, value: string | number) => (
    <span className="flex items-baseline gap-2">
      <span className="text-xxs uppercase tracking-[0.3em] text-text-secondary">{label}</span>
      <span className="font-mono text-lg text-text-primary">{value}</span>
    </span>
  )
  const heading = (text: string) => (
    <h3 className="text-xxs uppercase tracking-[0.4em] text-text-secondary">{text}</h3>
  )
  return (
    <div className="space-y-5">
      <section className="flex flex-wrap items-center gap-x-8 gap-y-2 border border-border-color bg-card-bg px-4 py-2">
        <span
          className={
            'status-badge ' +
            (status === 'Setup'
              ? 'status-warning'
              : status === 'InProgress'
                ? 'status-active'
                : 'status-neutral')
          }
        >
          {lt('v2.status.' + status)}
        </span>
        {fact(
          (definition.location ?? '').toUpperCase() || '—',
          new Date(definition.date + 'T00:00:00').toLocaleDateString(
            locale === 'pl' ? 'pl-PL' : 'en-GB',
          ),
        )}
        {fact(lt('contest_detail.cards.lifters.title'), state.entries.length)}
        {fact(lt('contest_detail.cards.queue.title'), queue)}
        {fact(lt('v2.status.judged'), judged)}
        <span className={'status-badge ' + (connected ? 'status-active' : 'status-error')}>
          {lt(connected ? 'contest_detail.connection.live' : 'contest_detail.connection.offline')}
        </span>
        <button
          type="button"
          className="btn-secondary ml-auto px-3 py-1 text-xxs"
          disabled={Option.isNone(links)}
          onClick={toggleQr}
        >
          {lt(qrVisible ? 'display_table.actions.hide_qr' : 'display_table.actions.show_qr')}
        </button>
      </section>
      <section className="space-y-2">
        {heading(lt('v2.hub.screens'))}
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          {screen(
            'announcer',
            lt('contest_detail.links.announcer.title'),
            lt('contest_detail.links.announcer.description'),
          )}
          {screen(
            'stage',
            lt('contest_detail.links.display.title'),
            lt('contest_detail.links.display.description'),
          )}
          {screen('telebim', lt('v2.links.telebim.title'), lt('v2.links.telebim.description'))}
          {screen(
            'scoreboard',
            lt('contest_detail.links.shareable.title'),
            lt('contest_detail.links.shareable.description'),
          )}
          {screen(
            'results',
            lt('contest_detail.links.public_results.title'),
            lt('contest_detail.links.public_results.description'),
          )}
        </div>
      </section>
      <section className="space-y-2">
        {heading(lt('v2.hub.setup'))}
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
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
          {action(
            'plates',
            lt('contest_detail.plates.title'),
            lt('contest_detail.plates.manage_link'),
          )}
          {action('videos', lt('v2.tiles.videos_title'), lt('v2.tiles.videos_description'))}
          {action('backups', lt('v2.tiles.backups_title'), lt('v2.tiles.backups_description'))}
        </div>
      </section>
    </div>
  )
}
