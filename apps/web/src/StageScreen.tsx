import type { ContestState } from '@werewolf/core'
import * as Option from 'effect/Option'
import { Barbell } from './Barbell.tsx'
import { useLegacy } from './legacy-i18n.ts'
import { QrCode } from './QrCode.tsx'
import {
  currentView,
  ScreenClock,
  statusOf,
  useDecipher,
  useTween,
  useVerdictVideo,
  VerdictFlash,
  VerdictVideo,
  type CurrentView,
} from './screen-parts.tsx'

/** Every judged attempt pulses in its colour; the current one pulses white, larger. */
const tileGlow = (status: string, highlighted: boolean) =>
  status === 'successful'
    ? 'animate-pulse-glow-success'
    : status === 'failed'
      ? 'animate-pulse-glow-failed'
      : highlighted
        ? 'scale-105 border-white animate-pulse-glow-pending'
        : ''

const tileTone = (status: string) =>
  status === 'successful'
    ? 'border-green-500 bg-green-900/50 text-green-50'
    : status === 'failed'
      ? 'border-red-600 bg-red-950/60 text-red-100'
      : 'border-border-color bg-card-bg text-text-primary'

/** The stage screen behind the platform: the lifter for the audience, the plates for the loaders. */
export function StageScreen({
  state,
  title,
}: {
  readonly state: ContestState
  readonly title: string
}) {
  const { lt, locale } = useLegacy()
  const view = currentView(state, locale)
  const [video, stopVideo, verdict] = useVerdictVideo(state)
  const judgedAny = state.attempts.some((attempt) => attempt._tag === 'Judged')
  return (
    <div className="flex h-screen flex-col overflow-hidden bg-black text-white">
      <header className="flex items-center gap-6 border-b border-primary-red/40 px-8 py-3">
        <img src="/wuap-logo.webp" alt="WUAP" className="h-14 rounded-lg bg-white p-1" />
        <h1
          className="min-w-0 flex-1 truncate font-display text-4xl uppercase tracking-[0.12em]"
          style={{ textShadow: '0 0 18px rgba(220, 20, 60, 0.6)' }}
        >
          {title}
        </h1>
        <ScreenClock state={state} className="text-7xl" />
      </header>
      {Option.match(view, {
        onNone: () => (
          <main className="flex flex-1 flex-col items-center justify-center gap-4 text-center">
            <h2 className="font-display text-7xl uppercase tracking-[0.15em] animate-rise">
              {lt(
                judgedAny
                  ? 'display_current.waiting.next_title'
                  : 'display_current.waiting.first_title',
              )}
            </h2>
            <p className="text-xl text-text-secondary">
              {lt(
                judgedAny
                  ? 'display_current.waiting.next_hint'
                  : 'display_current.waiting.first_hint',
              )}
            </p>
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
  // Names are stored "Surname First name"; each part gets its own line so long names fit.
  const words = view.name.trim().split(/\s+/)
  const surname = useDecipher(
    (words.length > 1 ? words.slice(0, -1) : words).join(' ').toUpperCase(),
  )
  const firstName = useDecipher(words.length > 1 ? (words.at(-1) ?? '').toUpperCase() : '')
  const weight = useTween(view.attempt.weight)
  const barbell = state.rulebook.barbell
  const plates = view.load.platesPerSide
  const meta = [
    view.team || lt('display_current.hero.club_placeholder'),
    lt('display_current.meta.age') + ' ' + view.age,
    view.ageClass,
    view.weightClass,
    typeof view.entry.bodyweight === 'number' ? view.entry.bodyweight + ' kg' : '',
  ].filter((item) => item !== '')
  return (
    <main className="grid min-h-0 flex-1 grid-cols-[1.25fr_1fr] gap-10 px-8 py-6">
      <section key={view.key} className="flex min-h-0 flex-col gap-5">
        <div className="relative overflow-hidden">
          <h2
            className="font-mono font-bold uppercase leading-[1.02] tracking-[0.05em]"
            style={{ fontSize: 'clamp(2.5rem, 4.6vw, 6rem)' }}
          >
            <span className="block break-words">{surname}</span>
            {firstName && (
              <span className="block break-words text-text-secondary">{firstName}</span>
            )}
          </h2>
          <span className="pointer-events-none absolute inset-0 bg-gradient-to-r from-transparent via-primary-red/30 to-transparent animate-sweep" />
        </div>
        <p
          className="flex flex-wrap gap-x-4 gap-y-1 text-xl uppercase tracking-[0.18em] text-text-secondary animate-rise"
          style={{ animationDelay: '120ms' }}
        >
          {meta.map((item, index) => (
            <span key={index} className={index === 0 ? 'text-text-primary' : ''}>
              {index > 0 && <span className="mr-4 text-primary-red">•</span>}
              {item}
            </span>
          ))}
        </p>
        <p
          className="font-display text-5xl uppercase tracking-[0.15em] text-primary-red animate-rise"
          style={{ animationDelay: '200ms' }}
        >
          {view.liftName} — {lt('display_current.tiles.attempt', { number: view.attempt.number })}
        </p>
        <div className="grid grid-cols-3 gap-5" style={{ perspective: '800px' }}>
          {view.tiles.map((tile, index) => {
            const status = statusOf(tile)
            const highlighted = tile.number === view.attempt.number
            return (
              // The entrance runs on the wrapper; the endless glow runs on the tile itself.
              <div
                key={tile.number}
                className="animate-pop"
                style={{ animationDelay: 260 + index * 90 + 'ms' }}
              >
                <div
                  className={
                    'attempt-tile relative flex flex-col items-center gap-1 overflow-hidden border-2 px-3 py-4 ' +
                    tileTone(status) +
                    ' ' +
                    tileGlow(status, highlighted)
                  }
                >
                  {highlighted && <span className="tile-sheen" aria-hidden="true" />}
                  <span className="text-sm uppercase tracking-[0.3em] text-text-secondary">
                    {lt('display_current.tiles.attempt', { number: tile.number })}
                  </span>
                  <span
                    className="font-mono text-5xl font-bold leading-none tabular-nums"
                    style={
                      highlighted || status !== 'pending'
                        ? { textShadow: '0 0 18px currentColor' }
                        : {}
                    }
                  >
                    {tile._tag === 'Unannounced' ? '—' : tile.weight.toFixed(2)}
                  </span>
                </div>
              </div>
            )
          })}
        </div>
      </section>
      <section className="flex min-h-0 flex-col gap-5">
        <div className="flex items-baseline justify-end gap-4">
          <span
            className="font-mono font-bold leading-none tabular-nums"
            style={{ fontSize: 'clamp(4.5rem, 9vw, 10.5rem)' }}
          >
            {weight.toFixed(2)}
          </span>
          <span className="font-display text-5xl text-text-secondary">KG</span>
        </div>
        <div className="flex items-center justify-center border border-border-color bg-card-bg px-4 py-6">
          {plates.length > 0 ? (
            <Barbell
              key={view.key + ':' + view.attempt.weight}
              plates={plates}
              colors={view.colors}
              heightPx={260}
              maxWidthPx={52}
              animated
              showBar
            />
          ) : (
            <p className="py-20 text-xl text-text-secondary">
              {lt('display_current.sidebar.no_plates')}
            </p>
          )}
        </div>
        <div className="flex flex-wrap justify-center gap-3">
          {plates.map((plate, index) => (
            <span
              key={view.key + plate.weight}
              className="flex items-baseline gap-2 border border-border-color bg-card-bg px-4 py-2 animate-rise"
              style={{ animationDelay: 300 + index * 60 + 'ms' }}
            >
              <span className="font-mono text-4xl font-bold">{plate.weight}</span>
              <span className="text-xl text-text-secondary">× {plate.count}</span>
            </span>
          ))}
        </div>
        <p className="text-center text-xl uppercase tracking-[0.2em] text-text-secondary">
          {lt('display_current.sidebar.bar_weight', {
            weight: barbell.bars[view.entry.lifter.sex],
          })}
          {barbell.clampsPerSide > 0 &&
            ' • ' +
              lt('display_current.sidebar.collar_weight', {
                total: barbell.clampsPerSide * 2,
                perClamp: barbell.clampsPerSide,
              })}
          {view.load._tag === 'Unloadable' && (
            <span className="ml-3 text-status-warning">
              {lt('display_current.sidebar.target_weight', { target: view.load.requested })}
            </span>
          )}
        </p>
        <div className="mt-auto flex items-end justify-between">
          {Option.match(view.rack, {
            onNone: () => <span />,
            onSome: (rack) => (
              <div className="flex items-baseline gap-4">
                <span className="text-xl uppercase tracking-[0.3em] text-text-secondary">
                  {lt('display_current.footer.rack_height')}
                </span>
                <span className="font-mono text-7xl font-bold">{rack}</span>
              </div>
            ),
          })}
          {Option.match(state.scoreboard.qrUrl, {
            onNone: () => <></>,
            onSome: (url) => <QrCode url={url} />,
          })}
        </div>
      </section>
    </main>
  )
}
