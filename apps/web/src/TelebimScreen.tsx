import type { ContestState } from '@werewolf/core'
import * as Option from 'effect/Option'
import { useLegacy } from './legacy-i18n.ts'
import {
  currentView,
  ScreenClock,
  statusOf,
  upNext,
  useDecipher,
  useFlip,
  useTween,
  useVerdictVideo,
  VerdictFlash,
  VerdictVideo,
  type CurrentView,
} from './screen-parts.tsx'

/**
 * The big screen in the hall (telebim): read from far away, so only the lifter, the weight,
 * the three attempts, the clock and who is next, in very large type. Verdict clips play here.
 */
export function TelebimScreen({
  state,
  title,
}: {
  readonly state: ContestState
  readonly title: string
}) {
  const { lt, locale } = useLegacy()
  const view = currentView(state, locale)
  const [video, stopVideo, verdict] = useVerdictVideo(state)
  return (
    <div className="flex h-screen flex-col overflow-hidden bg-black text-white">
      <header className="flex items-center gap-6 px-[3vw] pt-[2vh]">
        <img src="/wuap-logo.webp" alt="WUAP" className="h-[8vh] rounded-lg bg-white p-1" />
        <h1
          className="min-w-0 flex-1 truncate font-display uppercase tracking-[0.12em] text-text-secondary"
          style={{ fontSize: '3.2vh' }}
        >
          {title}
        </h1>
        <ScreenClock state={state} className="text-[12vh]" />
      </header>
      {Option.match(view, {
        onNone: () => (
          <main className="flex flex-1 items-center justify-center">
            <h2
              className="font-display uppercase tracking-[0.2em] animate-rise"
              style={{ fontSize: '12vh' }}
            >
              {title}
            </h2>
          </main>
        ),
        onSome: (current) => <Current state={state} view={current} />,
      })}
      {Option.match(verdict, {
        onNone: () => <></>,
        onSome: (kind) => (
          <VerdictFlash verdict={kind} good={lt('v2.screen.good')} bad={lt('v2.screen.bad')} />
        ),
      })}
      {Option.match(video, {
        onNone: () => <></>,
        onSome: (src) => <VerdictVideo src={src} onEnd={stopVideo} />,
      })}
    </div>
  )
}

function Current({ state, view }: { readonly state: ContestState; readonly view: CurrentView }) {
  const { lt } = useLegacy()
  const name = useDecipher(view.name.toUpperCase())
  const weight = useTween(view.attempt.weight)
  const next = upNext(state, 3)
  const list = useFlip(next.map((item) => item.key).join('|'))
  return (
    <main className="flex min-h-0 flex-1 flex-col px-[3vw] pb-[2vh]">
      <section key={view.key} className="flex flex-1 flex-col justify-center gap-[2vh]">
        <h2
          className="truncate font-display uppercase leading-none tracking-[0.05em]"
          style={{ fontSize: '15vh' }}
        >
          {name}
        </h2>
        <div className="flex items-end justify-between gap-8">
          <div className="space-y-[1vh] animate-rise" style={{ animationDelay: '150ms' }}>
            <p
              className="uppercase tracking-[0.2em] text-text-secondary"
              style={{ fontSize: '4vh' }}
            >
              {view.team || lt('display_current.hero.club_placeholder')}
            </p>
            <p
              className="font-display uppercase tracking-[0.15em] text-primary-red"
              style={{ fontSize: '7vh' }}
            >
              {view.liftName} —{' '}
              {lt('display_current.tiles.attempt', { number: view.attempt.number })}
            </p>
          </div>
          <p className="flex items-baseline gap-4 font-mono font-bold leading-none tabular-nums">
            <span style={{ fontSize: '24vh' }}>{Math.round(weight * 100) / 100}</span>
            <span className="font-display text-text-secondary" style={{ fontSize: '8vh' }}>
              KG
            </span>
          </p>
        </div>
        <div className="grid grid-cols-3 gap-[2vw]" style={{ perspective: '800px' }}>
          {view.tiles.map((tile, index) => {
            const status = statusOf(tile)
            return (
              <div
                key={tile.number}
                className={
                  'flex items-center justify-center border-4 py-[1.5vh] font-mono font-bold animate-pop ' +
                  (status === 'successful'
                    ? 'border-green-500 bg-green-700/60'
                    : status === 'failed'
                      ? 'border-red-600 bg-red-800/60 line-through decoration-4'
                      : tile.number === view.attempt.number
                        ? 'border-white bg-white/10'
                        : 'border-border-color text-text-secondary')
                }
                style={{ fontSize: '8vh', animationDelay: 250 + index * 90 + 'ms' }}
              >
                {tile._tag === 'Unannounced' ? '—' : tile.weight}
              </div>
            )
          })}
        </div>
      </section>
      {next.length > 0 && (
        <div
          ref={list}
          className="relative grid grid-cols-3 gap-[2vw] border-t border-primary-red/50 pt-[2.2vh]"
        >
          <span
            className="absolute left-0 top-[0.4vh] uppercase tracking-[0.4em] text-primary-red"
            style={{ fontSize: '1.6vh' }}
          >
            {lt('v2.screen.next')}
          </span>
          {next.map((item) => (
            <div
              key={item.key}
              data-flip={item.key}
              className="flex items-baseline justify-between gap-4"
            >
              <span className="truncate uppercase tracking-[0.06em]" style={{ fontSize: '3.6vh' }}>
                {item.name}
              </span>
              <span className="font-mono font-bold" style={{ fontSize: '4vh' }}>
                {item.attempt.weight}
              </span>
            </div>
          ))}
        </div>
      )}
    </main>
  )
}
