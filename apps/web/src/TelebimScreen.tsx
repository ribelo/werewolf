import type { ContestState } from '@werewolf/core'
import * as Option from 'effect/Option'
import { useLegacy } from './legacy-i18n.ts'
import { QrCode } from './QrCode.tsx'
import {
  currentView,
  ScreenClock,
  statusOf,
  useDecipher,
  useTween,
  useSettledVerdicts,
  useVerdictVideo,
  VerdictFlash,
  VerdictVideo,
  type CurrentView,
} from './screen-parts.tsx'

/**
 * The big screen in the hall (telebim): read from far away, so only the lifter, the weight,
 * the three attempts, the clock and the current places, in very large type. Verdict clips play here.
 */
export function TelebimScreen({
  state: live,
  title,
}: {
  readonly state: ContestState
  readonly title: string
}) {
  const { lt, locale } = useLegacy()
  const state = useSettledVerdicts(live)
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
        onSome: (current) => <Current view={current} />,
      })}
      {Option.match(state.scoreboard.qrUrl, {
        onNone: () => <></>,
        onSome: (url) => (
          <div className="fixed bottom-[2vh] right-[2vw] z-30">
            <QrCode url={url} />
          </div>
        ),
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

function Current({ view }: { readonly view: CurrentView }) {
  const { lt } = useLegacy()
  // Surname and first name on their own lines, so long names fit.
  const words = view.name.trim().split(/\s+/)
  const surname = useDecipher(
    (words.length > 1 ? words.slice(0, -1) : words).join(' ').toUpperCase(),
  )
  const firstName = useDecipher(words.length > 1 ? (words.at(-1) ?? '').toUpperCase() : '')
  const weight = useTween(view.attempt.weight)
  return (
    <main className="flex min-h-0 flex-1 flex-col px-[3vw] pb-[2vh]">
      <section key={view.key} className="flex flex-1 flex-col justify-center gap-[2vh]">
        <h2
          className="font-display uppercase leading-[0.95] tracking-[0.05em]"
          style={{ fontSize: '12vh' }}
        >
          <span className="block break-words">{surname}</span>
          {firstName && <span className="block break-words text-text-secondary">{firstName}</span>}
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
              style={{ fontSize: '5.5vh' }}
            >
              {view.liftName} —{' '}
              {lt('display_current.tiles.attempt', { number: view.attempt.number })}
            </p>
          </div>
          <p className="flex items-baseline gap-4 font-mono font-bold leading-none tabular-nums">
            <span style={{ fontSize: '19vh' }}>{weight.toFixed(2)}</span>
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
                {tile._tag === 'Unannounced' ? '—' : tile.weight.toFixed(2)}
              </div>
            )
          })}
        </div>
        {view.places.length > 0 && (
          <div className="flex flex-wrap gap-[1.5vw] animate-rise">
            {view.places.map((item) => (
              <span
                key={item.label}
                className="flex items-baseline gap-[1vw] border-2 border-primary-red/70 bg-primary-red/10 px-[1.2vw] py-[0.6vh]"
              >
                <span className="font-mono font-bold" style={{ fontSize: '6vh' }}>
                  {item.place}.
                </span>
                <span
                  className="uppercase tracking-[0.12em] text-text-secondary"
                  style={{ fontSize: '3vh' }}
                >
                  {item.label}
                </span>
              </span>
            ))}
          </div>
        )}
      </section>
    </main>
  )
}
