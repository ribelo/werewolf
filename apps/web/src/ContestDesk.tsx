import { currentAttempt } from '@werewolf/core'
import { ReadLinks, type ContestId } from '@werewolf/sync'
import * as Effect from 'effect/Effect'
import * as Fiber from 'effect/Fiber'
import * as Option from 'effect/Option'
import { useEffect, useState } from 'react'
import { BackupPanel } from './Backup.tsx'
import { CompetitorModal } from './CompetitorModal.tsx'
import { CategorySettings, ContestSettings } from './ContestSettings.tsx'
import { DeskHub, type DeskAction } from './DeskHub.tsx'
import { useMessages, rejectionText, type MessageKey } from './i18n.ts'
import { AppHeader } from './Layout.tsx'
import { useLegacy } from './legacy-i18n.ts'
import { LiftPanel } from './LiftPanel.tsx'
import { requestJson, useLiveContest, type Access } from './live-contest.ts'
import { Modal } from './Modal.tsx'
import { PlatesPanel } from './PlatesPanel.tsx'
import { Registrations } from './Registrations.tsx'
import { TeamResults } from './TeamResults.tsx'
import { TeamsBoard } from './TeamsBoard.tsx'
import { VideoLibrary } from './Videos.tsx'

type Tab =
  | 'desk'
  | 'registrations'
  | 'teams'
  | 'team_results'
  | 'plates'
  | { readonly lift: string }
const legacyLiftTab: Readonly<Record<string, string>> = {
  squat: 'contest_detail.tabs.squat_table',
  bench: 'contest_detail.tabs.bench_table',
  deadlift: 'contest_detail.tabs.deadlift_table',
}
const tabClass = (active: boolean) =>
  'px-3 py-1.5 font-display text-sm uppercase tracking-[0.2em] border transition ' +
  (active
    ? 'bg-primary-red text-black border-primary-red'
    : 'border-border-color text-text-secondary hover:text-text-primary hover:border-primary-red')

/** The contest pages of 2025: Stanowisko, Rejestracja, team results, plates and one table per lift. */
export function ContestDesk({
  id,
  access,
  onLogout,
}: {
  readonly id: ContestId
  readonly access: Access
  readonly onLogout?: () => void
}) {
  const { t } = useMessages()
  const { lt, locale } = useLegacy()
  const live = useLiveContest(id, access)
  const [links, setLinks] = useState<Option.Option<ReadLinks>>(Option.none())
  const [error, setError] = useState<MessageKey | ''>('')
  const [tab, setTab] = useState<Tab>('desk')
  const [modal, setModal] = useState<Option.Option<Exclude<DeskAction, 'plates'>>>(Option.none())
  /** The entry in the competitor dialog; NEW_ENTRY opens an empty one. */
  const [editing, setEditing] = useState<Option.Option<string>>(Option.none())
  const closeModal = () => setModal(Option.none())
  const editor = access._tag === 'Editor'
  useEffect(() => {
    if (!editor) return
    const fiber = Effect.runFork(
      requestJson(ReadLinks, '/api/contests/' + id + '/links').pipe(
        Effect.match({
          onSuccess: (value) => setLinks(Option.some(value)),
          onFailure: (failure) => setError(failure.code),
        }),
      ),
    )
    return () => {
      Effect.runFork(Fiber.interrupt(fiber))
    }
  }, [id, editor])
  if (live.view._tag !== 'Ready')
    return (
      <section className="container-full py-8">
        <div className="card">
          <p role="status" className="text-text-secondary">
            {t(live.view._tag === 'Invalid' ? 'request.invalid' : 'desk.connecting')}
          </p>
          {live.error && <p role="alert">{t(live.error)}</p>}
        </div>
      </section>
    )
  const { replica } = live.view
  const snapshot = replica.state.snapshot
  const { definition } = snapshot
  const { journal } = replica
  const state = journal.state
  const current = currentAttempt(state)
  const qrVisible = Option.isSome(state.scoreboard.qrUrl)
  const qr = {
    visible: qrVisible,
    available: Option.isSome(links),
    toggle: () =>
      Option.match(links, {
        onNone: () => {},
        onSome: (value) =>
          live.submit(
            qrVisible
              ? { _tag: 'SetScoreboard', filter: state.scoreboard.filter }
              : { _tag: 'SetScoreboard', filter: state.scoreboard.filter, qrUrl: value.results },
          ),
      }),
  }
  const tabs: ReadonlyArray<readonly [Tab, string]> = [
    ['desk', lt('contest_detail.tabs.desk')],
    ['registrations', lt('contest_detail.tabs.main_table')],
    ['teams', lt('v2.teams_board.tab')],
    ['team_results', lt('contest_detail.tabs.team_results')],
    ['plates', lt('contest_detail.tabs.plates')],
    ...state.rulebook.lifts.map(
      (lift) =>
        [
          { lift: lift.id },
          legacyLiftTab[lift.id] ? lt(legacyLiftTab[lift.id] ?? '') : lift.name[locale],
        ] as const,
    ),
  ]
  const same = (a: Tab, b: Tab) =>
    typeof a === 'string' || typeof b === 'string' ? a === b : a.lift === b.lift
  return (
    <section>
      {editor && onLogout && (
        <AppHeader title={definition.name} current="contests" onLogout={onLogout} />
      )}
      <div className="px-4 py-3">
        <div className="space-y-3">
          {live.error && <p role="alert">{t(live.error)}</p>}
          {live.rejection && (
            <p role="alert">
              {t('desk.rejected')} {rejectionText(live.rejection, locale)}
            </p>
          )}
          {(replica.state.rejected.length > 0 || replica.conflicts.length > 0) && (
            <aside role="status" className="card border-status-warning">
              <h3 className="text-h3">{t('sync.review')}</h3>
              <ul>
                {[...replica.state.rejected, ...replica.conflicts].map((item) => (
                  <li key={item.command.id}>{rejectionText(item.reason, locale)}</li>
                ))}
              </ul>
            </aside>
          )}
          {error && <p role="alert">{t(error)}</p>}
          <nav className="flex flex-wrap gap-2" role="tablist">
            {tabs.map(([key, label]) => (
              <button
                key={typeof key === 'string' ? key : key.lift}
                type="button"
                role="tab"
                aria-selected={same(tab, key)}
                onClick={() => setTab(key)}
                className={tabClass(same(tab, key))}
              >
                {label}
              </button>
            ))}
          </nav>
          {tab === 'desk' && (
            <DeskHub
              state={state}
              definition={definition}
              links={links}
              connected={live.connected}
              submit={live.submit}
              onAction={(action) =>
                action === 'plates' ? setTab('plates') : setModal(Option.some(action))
              }
            />
          )}
          {tab === 'registrations' && (
            <Registrations
              state={state}
              journal={journal}
              contestName={definition.name}
              submit={live.submit}
              editing={editing}
              onEdit={setEditing}
            />
          )}
          {tab === 'teams' && <TeamsBoard state={state} submit={live.submit} />}
          {tab === 'team_results' && <TeamResults state={state} contestName={definition.name} />}
          {tab === 'plates' && <PlatesPanel state={state} submit={live.submit} editor={editor} />}
          {typeof tab !== 'string' && (
            <>
              <LiftPanel
                state={state}
                contestName={definition.name}
                liftId={tab.lift}
                current={current}
                submit={live.submit}
                qr={qr}
                onEditCompetitor={(entryId) => setEditing(Option.some(entryId))}
              />
              {Option.match(
                Option.flatMap(editing, (entryId) =>
                  Option.fromUndefinedOr(state.entries.find((entry) => entry.id === entryId)),
                ),
                {
                  onNone: () => <></>,
                  onSome: (entry) => (
                    <CompetitorModal
                      key={entry.id}
                      state={state}
                      entry={Option.some(entry)}
                      submit={live.submit}
                      onClose={() => setEditing(Option.none())}
                    />
                  ),
                },
              )}
            </>
          )}
        </div>
      </div>
      {Option.contains(modal, 'edit') && (
        <ContestSettings
          state={state}
          snapshot={snapshot}
          pending={replica.state.pending.length}
          submit={live.submit}
          onClose={closeModal}
        />
      )}
      {Option.contains(modal, 'categories') && (
        <CategorySettings state={state} submit={live.submit} onClose={closeModal} />
      )}
      {Option.contains(modal, 'videos') && (
        <Modal title={lt('v2.tiles.videos_title')} onClose={closeModal}>
          <VideoLibrary />
        </Modal>
      )}
      {Option.contains(modal, 'backups') && (
        <Modal title={lt('v2.tiles.backups_title')} onClose={closeModal}>
          <BackupPanel id={id} online={live.connected} />
        </Modal>
      )}
    </section>
  )
}
