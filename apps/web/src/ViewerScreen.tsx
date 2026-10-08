import type { ContestId } from '@werewolf/sync'
import { Announcer, Stage } from './LiveScreens.tsx'
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
  readonly role: 'stage' | 'announcer'
}) {
  const { t } = useMessages()
  const live = useLiveContest(id, { _tag: 'Viewer', token })
  if (live.view._tag !== 'Ready')
    return (
      <p role="status">{t(live.view._tag === 'Invalid' ? 'request.invalid' : 'view.loading')}</p>
    )
  const state = live.view.replica.journal.state
  return (
    <section className={'screen ' + role}>
      {!live.connected && (
        <p role="status" className="offline">
          {t('view.offline')}
        </p>
      )}
      {role === 'stage' ? <Stage state={state} /> : <Announcer state={state} />}
    </section>
  )
}
