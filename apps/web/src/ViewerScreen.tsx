import type { ContestId } from '@werewolf/sync'
import { Announcer, Stage } from './LiveScreens.tsx'
import { Results } from './Results.tsx'
import { Scoreboard } from './Scoreboard.tsx'
import { useMessages } from './i18n.ts'
import { useLiveContest } from './live-contest.ts'

/** A read-only screen keeps the last known state on display and marks a lost connection. */
export function ViewerScreen({
  id,
  token,
  role,
}: {
  readonly id: ContestId
  readonly token: string
  readonly role: 'stage' | 'announcer' | 'scoreboard' | 'results'
}) {
  const { t } = useMessages()
  const live = useLiveContest(id, { _tag: 'Viewer', token })
  if (live.view._tag !== 'Ready')
    return (
      <p role="status">{t(live.view._tag === 'Invalid' ? 'request.invalid' : 'view.loading')}</p>
    )
  const state = live.view.replica.journal.state
  return (
    <section className={'screen display-view ' + role}>
      {!live.connected && (
        <p
          role="status"
          className="offline bg-status-warning px-4 py-1 text-center font-display text-sm tracking-widest text-black uppercase"
        >
          {t('view.offline')}
        </p>
      )}
      {role === 'stage' ? (
        <Stage state={state} title={live.view.replica.state.snapshot.definition.name} />
      ) : role === 'announcer' ? (
        <Announcer state={state} />
      ) : role === 'results' ? (
        <div className="container-full py-4">
          <h1 className="text-h1 mb-1 uppercase">
            {live.view.replica.state.snapshot.definition.name}
          </h1>
          <p className="text-caption mb-4 tracking-[0.3em] text-text-secondary uppercase">
            {t('res.live')}
          </p>
          <Results
            state={state}
            title={live.view.replica.state.snapshot.definition.name}
            exports={false}
          />
        </div>
      ) : (
        <Scoreboard state={state} title={live.view.replica.state.snapshot.definition.name} />
      )}
    </section>
  )
}
