import { isDidNotStart, type Attempt, type ContestState } from '@werewolf/core'
import { ReadLinks, type ContestId } from '@werewolf/sync'
import * as Effect from 'effect/Effect'
import * as Fiber from 'effect/Fiber'
import * as Option from 'effect/Option'
import { useEffect, useState } from 'react'
import { useMessages, rejectionText, type MessageKey } from './i18n.ts'
import { requestJson, useLiveContest, type Access } from './live-contest.ts'
import { BackupPanel } from './Backup.tsx'
import { EntriesPanel } from './EntriesPanel.tsx'
import { MeetDay, WeightForm } from './MeetDay.tsx'
import { Results } from './Results.tsx'
import { ScoreboardControl } from './Scoreboard.tsx'
import { AppHeader } from './Layout.tsx'

type Tab = 'desk' | 'entries' | 'results' | 'lifts' | 'plates' | 'backup'
const tabKeys: ReadonlyArray<readonly [Tab, MessageKey]> = [
  ['desk', 'tab.desk'],
  ['entries', 'tab.entries'],
  ['results', 'tab.results'],
  ['lifts', 'tab.lifts'],
  ['plates', 'tab.plates'],
  ['backup', 'tab.backup'],
]

function AttemptEditor({
  state,
  attempt,
  submit,
}: {
  readonly state: ContestState
  readonly attempt: Attempt
  readonly submit: (input: object) => void
}) {
  const { t } = useMessages()
  const entry = state.entries.find((item) => item.id === attempt.entryId)
  const ref = { entryId: attempt.entryId, liftId: attempt.liftId, number: attempt.number }
  return (
    <div className="attempt-editor flex flex-wrap items-center gap-2">
      {entry && (
        <WeightForm
          state={state}
          entry={entry}
          attempt={ref}
          initial={attempt._tag === 'Unannounced' ? '' : String(attempt.weight)}
          submit={submit}
        />
      )}
      <button
        type="button"
        className="btn-good"
        disabled={attempt._tag === 'Unannounced'}
        onClick={() => submit({ _tag: 'SetVerdict', attempt: ref, verdict: 'goodLift' })}
      >
        {t('desk.goodLift')}
      </button>
      <button
        type="button"
        className="btn-bad"
        disabled={attempt._tag === 'Unannounced'}
        onClick={() => submit({ _tag: 'SetVerdict', attempt: ref, verdict: 'noLift' })}
      >
        {t('desk.noLift')}
      </button>
    </div>
  )
}
export function ContestDesk({
  id,
  access,
  onLogout,
}: {
  readonly id: ContestId
  readonly access: Access
  readonly onLogout?: () => void
}) {
  const { locale, t } = useMessages()
  const live = useLiveContest(id, access)
  const [links, setLinks] = useState<Option.Option<ReadLinks>>(Option.none())
  const [error, setError] = useState<MessageKey | ''>('')
  const [tab, setTab] = useState<Tab>('desk')
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
      <section className="card">
        <p role="status" className="text-text-secondary">
          {t(live.view._tag === 'Invalid' ? 'request.invalid' : 'desk.connecting')}
        </p>
        {live.error && <p role="alert">{t(live.error)}</p>}
      </section>
    )
  const { replica } = live.view
  const { definition } = replica.state.snapshot
  const { journal } = replica
  const state = journal.state
  const badge = (tone: string, text: string) => (
    <span className={'status-badge ' + tone}>{text}</span>
  )
  return (
    <section>
      {editor && onLogout && (
        <AppHeader
          title={definition.name}
          subtitle={t('contest_detail.subtitle')}
          current="contests"
          onLogout={onLogout}
        />
      )}
      <div className="container-full space-y-6 py-8">
        <div className="flex flex-wrap items-end justify-between gap-4">
          {!editor && (
            <div>
              <h2 className="text-display uppercase tracking-[0.25em]">{definition.name}</h2>
              <p className="text-caption tracking-[0.4em] text-text-secondary uppercase">
                {definition.date}
              </p>
            </div>
          )}
          <p
            role="status"
            className="flex flex-wrap items-center gap-3 text-xs tracking-[0.3em] text-text-secondary uppercase"
          >
            {badge(
              live.connected ? 'status-active' : 'status-error',
              t(live.connected ? 'desk.connected' : 'desk.disconnected'),
            )}
            <span>
              {t('desk.sequence')}: {replica.state.snapshot.commands.length}
            </span>
            {badge(
              replica.state.pending.length > 0 ? 'status-warning' : 'status-neutral',
              t('sync.pending') + ': ' + replica.state.pending.length,
            )}
            {badge('status-neutral', t('sync.peers') + ': ' + live.peers)}
            {!editor && <span>{t('auth.readOnly')}</span>}
          </p>
        </div>
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
        <nav className="flex flex-wrap gap-3 border-b-2 border-border-color pb-3" role="tablist">
          {tabKeys.map(([key, label]) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={tab === key}
              onClick={() => setTab(key)}
              className={
                'border-2 px-4 py-2 font-display text-xs tracking-[0.4em] uppercase transition ' +
                (tab === key
                  ? 'border-primary-red bg-primary-red text-black'
                  : 'border-border-color text-text-secondary hover:border-primary-red hover:text-text-primary')
              }
            >
              {t(label)}
            </button>
          ))}
          {Option.isSome(links) &&
            Object.entries(links.value).map(([role, url]) => (
              <a
                key={role}
                href={url}
                target="_blank"
                rel="noreferrer"
                className="ml-auto border-2 border-transparent px-3 py-2 font-display text-xs tracking-[0.3em] text-text-secondary uppercase hover:text-primary-red"
              >
                {t(
                  role === 'stage'
                    ? 'desk.stage'
                    : role === 'announcer'
                      ? 'desk.announcer'
                      : role === 'scoreboard'
                        ? 'desk.scoreboardLink'
                        : 'desk.results',
                )}
              </a>
            ))}
        </nav>
        {tab === 'desk' && (
          <>
            <MeetDay
              state={state}
              commands={journal.commands}
              submit={live.submit}
              editor={editor}
            />
            {editor && (
              <ScoreboardControl
                state={state}
                resultsUrl={Option.map(links, (value) => value.results)}
                submit={live.submit}
              />
            )}
          </>
        )}
        {tab === 'entries' && editor && (
          <EntriesPanel state={state} journal={journal} submit={live.submit} />
        )}
        {tab === 'results' && <Results state={state} title={definition.name} exports={editor} />}
        {tab === 'lifts' &&
          state.rulebook.lifts.map((lift) => (
            <section key={lift.id} className="card">
              <h3 className="text-h3 mb-2">{lift.name[locale]}</h3>
              <div className="table-scroll overflow-x-auto">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>{t('desk.lotNumber')}</th>
                      <th>{t('desk.name')}</th>
                      <th>{t('desk.attempt')}</th>
                      <th>{t('desk.weight')}</th>
                      <th>{t('desk.verdict')}</th>
                      {editor && <th>{t('desk.actions')}</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {state.attempts
                      .filter((attempt) => attempt.liftId === lift.id)
                      .map((attempt) => {
                        const entry = state.entries.find((item) => item.id === attempt.entryId)
                        return (
                          <tr key={attempt.entryId + '/' + attempt.number}>
                            <td>{entry?.lotNumber}</td>
                            <td className="font-semibold uppercase">{entry?.lifter.name}</td>
                            <td>{attempt.number}</td>
                            <td className="font-mono">
                              {attempt._tag === 'Unannounced' ? '—' : attempt.weight}
                            </td>
                            <td>
                              {isDidNotStart(state, attempt.entryId, attempt.liftId) ? (
                                <span className="attempt-pending text-status-warning">DNS</span>
                              ) : attempt._tag === 'Judged' ? (
                                <span
                                  className={
                                    attempt.verdict === 'goodLift'
                                      ? 'attempt-good'
                                      : 'attempt-failed'
                                  }
                                >
                                  {t(
                                    attempt.verdict === 'goodLift'
                                      ? 'desk.goodLift'
                                      : 'desk.noLift',
                                  )}
                                </span>
                              ) : (
                                <span className="attempt-pending">—</span>
                              )}
                            </td>
                            {editor && (
                              <td>
                                <AttemptEditor
                                  state={state}
                                  attempt={attempt}
                                  submit={live.submit}
                                />
                              </td>
                            )}
                          </tr>
                        )
                      })}
                  </tbody>
                </table>
              </div>
            </section>
          ))}
        {tab === 'backup' && editor && <BackupPanel id={id} online={live.connected} />}
        {tab === 'plates' && (
          <section className="card">
            <h3 className="text-h3 mb-2">{t('plates.inventory')}</h3>
            <p className="text-text-secondary">
              {t('plates.bar')}:{' '}
              <span className="font-mono text-text-primary">
                {state.rulebook.barbell.bars.male} / {state.rulebook.barbell.bars.female} kg
              </span>{' '}
              · {t('plates.clamps')}:{' '}
              <span className="font-mono text-text-primary">
                {state.rulebook.barbell.clampsPerSide} kg
              </span>
            </p>
            <table className="data-table mt-3 max-w-md">
              <tbody>
                {state.rulebook.barbell.plates.map((plate) => (
                  <tr key={plate.weight}>
                    <td className="font-mono">{plate.weight} kg</td>
                    <td>
                      {plate.pairs} {t('plates.pairs')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}
      </div>
    </section>
  )
}
