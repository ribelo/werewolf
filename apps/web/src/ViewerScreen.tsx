import type { ContestId } from '@werewolf/sync'
import { useMessages } from './i18n.ts'
import { useLiveContest } from './live-contest.ts'
import { PublicResults } from './PublicResults.tsx'
import { StageScreen } from './StageScreen.tsx'
import { TelebimScreen } from './TelebimScreen.tsx'
import { AnnouncerTable, PublicTable } from './TableScreens.tsx'

/** A read-only screen keeps the last known state on display and marks a lost connection. */
export function ViewerScreen({
  id,
  token,
  role,
}: {
  readonly id: ContestId
  readonly token: string
  readonly role: 'stage' | 'telebim' | 'announcer' | 'scoreboard' | 'results'
}) {
  const { t } = useMessages()
  const live = useLiveContest(id, { _tag: 'Viewer', token })
  if (live.view._tag !== 'Ready')
    return (
      <p role="status">{t(live.view._tag === 'Invalid' ? 'request.invalid' : 'view.loading')}</p>
    )
  const state = live.view.replica.journal.state
  const definition = live.view.replica.state.snapshot.definition
  return (
    <section className={'screen display-view ' + role}>
      {!live.connected && (
        <p
          role="status"
          className="offline fixed inset-x-0 top-0 z-40 bg-status-warning px-4 py-1 text-center font-display text-sm tracking-widest text-black uppercase"
        >
          {t('view.offline')}
        </p>
      )}
      {role === 'stage' ? (
        <StageScreen state={state} title={definition.name} />
      ) : role === 'telebim' ? (
        <TelebimScreen state={state} title={definition.name} />
      ) : role === 'announcer' ? (
        <AnnouncerTable state={state} title={definition.name} connected={live.connected} />
      ) : role === 'results' ? (
        <PublicResults state={state} definition={definition} />
      ) : (
        <PublicTable state={state} title={definition.name} />
      )}
    </section>
  )
}
