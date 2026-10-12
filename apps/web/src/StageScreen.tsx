import {
  ageOnDate,
  currentAttempt,
  entryAgeClass,
  entryWeightClass,
  loadBarbell,
  type Attempt,
  type ContestState,
} from '@werewolf/core'
import * as Option from 'effect/Option'
import { useEffect, useRef, useState } from 'react'
import { Barbell } from './Barbell.tsx'
import { clockText, useCountdown } from './clock.ts'
import { useLegacy } from './legacy-i18n.ts'
import { QrCode } from './QrCode.tsx'
import { useVideos, videoUrl, type VideoKind } from './Videos.tsx'

const STEP_MS = 30
const GLYPHS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*()'
const LITERAL = new Set([' ', '•', ':', '.', ','])

/** The 2025 decipher effect: a new text is revealed left to right over scrambled characters. */
function useDecipher(target: string): string {
  const [text, setText] = useState(target)
  const previous = useRef(target)
  useEffect(() => {
    if (previous.current === target) return
    previous.current = target
    let revealed = 0
    const timer = window.setInterval(() => {
      if (revealed >= target.length + 3) {
        window.clearInterval(timer)
        setText(target)
        return
      }
      let next = ''
      for (let index = 0; index < target.length; index++) {
        const char = target.charAt(index)
        next +=
          index < revealed || LITERAL.has(char)
            ? char
            : GLYPHS.charAt(Math.floor(Math.random() * GLYPHS.length))
      }
      setText(next)
      revealed++
    }, STEP_MS)
    return () => window.clearInterval(timer)
  }, [target])
  return text
}

function background(status: string): string {
  if (status === 'successful') return 'bg-green-900/40 border border-green-600 text-green-100'
  if (status === 'failed') return 'bg-red-900/40 border border-red-700 text-red-100'
  return 'bg-element-bg border border-border-color text-text-secondary'
}
function glow(status: string): string {
  if (status === 'successful')
    return 'shadow-[0_0_90px_rgba(255,255,255,0.55),0_0_65px_rgba(34,197,94,0.65)] animate-pulse-glow-success'
  if (status === 'failed')
    return 'shadow-[0_0_90px_rgba(255,255,255,0.55),0_0_65px_rgba(220,20,60,0.65)] animate-pulse-glow-failed'
  return 'shadow-[0_0_90px_rgba(255,255,255,0.55)] animate-pulse-glow-pending'
}
const statusOf = (attempt: Attempt) =>
  attempt._tag === 'Judged' ? (attempt.verdict === 'goodLift' ? 'successful' : 'failed') : 'pending'

/** After every new verdict the screen plays a random clip of that kind, then returns to the attempt. */
function useVerdictVideo(state: ContestState): readonly [Option.Option<string>, () => void] {
  const [videos] = useVideos()
  const [playing, setPlaying] = useState<Option.Option<string>>(Option.none())
  const last = state.attempts.reduce<Option.Option<Attempt & { readonly _tag: 'Judged' }>>(
    (found, attempt) =>
      attempt._tag === 'Judged' &&
      Option.match(found, { onNone: () => true, onSome: (f) => attempt.sequence > f.sequence })
        ? Option.some(attempt)
        : found,
    Option.none(),
  )
  const sequence = Option.match(last, { onNone: () => 0, onSome: (a) => a.sequence })
  const seen = useRef(sequence)
  useEffect(() => {
    if (sequence <= seen.current) {
      seen.current = sequence
      return
    }
    seen.current = sequence
    Option.map(last, (attempt) => {
      const kind: VideoKind = attempt.verdict === 'goodLift' ? 'good' : 'bad'
      const list = videos[kind]
      const pick = list[Math.floor(Math.random() * list.length)]
      if (pick) setPlaying(Option.some(videoUrl(kind, pick.name)))
    })
  }, [sequence, last, videos])
  return [playing, () => setPlaying(Option.none())]
}

/** The 2025 stage screen ("Ekran sceniczny"), with the attempt clock, the WUAP logo and verdict videos. */
export function StageScreen({
  state,
  title,
}: {
  readonly state: ContestState
  readonly title: string
}) {
  const { lt, locale } = useLegacy()
  const current = currentAttempt(state)
  const remaining = useCountdown(state.clock)
  const [video, stopVideo] = useVerdictVideo(state)
  const judgedAny = state.attempts.some((attempt) => attempt._tag === 'Judged')
  const attempt = Option.getOrUndefined(current)
  const entry = attempt
    ? state.entries.find((item) => item.id === attempt.entryId)
    : state.entries.find(() => false)
  const lift = attempt
    ? state.rulebook.lifts.find((item) => item.id === attempt.liftId)
    : state.rulebook.lifts.find(() => false)
  const name = useDecipher(entry ? entry.lifter.name.toUpperCase() : '')
  const liftLabel = useDecipher(lift ? lift.name[locale] : '')
  const team = entry?.lifter.teamId
    ? state.teams.find((item) => item.id === entry.lifter.teamId)?.name
    : ''
  const ageClass = entry
    ? Option.match(entryAgeClass(state, entry), {
        onNone: () => '',
        onSome: (id) => state.rulebook.ageClasses.find((c) => c.id === id)?.name[locale] ?? '',
      })
    : ''
  const weightClass = entry
    ? Option.match(entryWeightClass(state, entry), {
        onNone: () => '—',
        onSome: (id) => state.rulebook.weightClasses.find((c) => c.id === id)?.name[locale] ?? '—',
      })
    : '—'
  const tiles = attempt
    ? state.attempts
        .filter((item) => item.entryId === attempt.entryId && item.liftId === attempt.liftId)
        .toSorted((a, b) => a.number - b.number)
    : []
  const rack = entry?.lifts.find((item) => item.liftId === attempt?.liftId)?.rackHeight
  const load =
    attempt && entry
      ? Option.some(loadBarbell(state.rulebook.barbell, entry.lifter.sex, attempt.weight))
      : Option.none()
  const colors = Object.fromEntries(
    state.rulebook.barbell.plates.flatMap((plate) =>
      plate.color ? [[plate.weight, plate.color] as const] : [],
    ),
  )
  const barbell = state.rulebook.barbell
  const clock = (
    <div
      className={
        'font-mono leading-none tracking-[0.1em] ' +
        Option.match(remaining, {
          onNone: () => 'text-text-secondary',
          onSome: (seconds) =>
            seconds <= 10 ? 'text-primary-red animate-pulse' : 'text-text-primary',
        })
      }
      aria-label={lt('v2.clock.title')}
      style={{ fontSize: '5rem' }}
    >
      {Option.match(remaining, {
        onNone: () => clockText(state.rulebook.clockSeconds ?? 60),
        onSome: clockText,
      })}
    </div>
  )
  return (
    <div className="min-h-screen bg-black text-white flex flex-col">
      <header className="relative w-full bg-black px-4 sm:px-6 md:px-8 lg:px-10 py-6 sm:py-8 md:py-10 text-center">
        <img
          src="/wuap-logo.webp"
          alt="WUAP"
          className="absolute left-6 top-1/2 h-24 -translate-y-1/2 rounded-xl bg-white p-2"
        />
        <h1
          className="font-display text-2xl sm:text-3xl md:text-4xl lg:text-5xl uppercase tracking-[0.1rem] sm:tracking-[0.15rem] md:tracking-[0.2rem] text-white"
          style={{
            textShadow: '0 0 16px rgba(220, 20, 60, 0.55), 0 0 32px rgba(220, 20, 60, 0.35)',
          }}
        >
          {title}
        </h1>
        <div className="absolute right-8 top-1/2 -translate-y-1/2">{clock}</div>
      </header>
      {!attempt || !entry ? (
        <main className="flex-1 flex items-center justify-center px-6 py-12">
          <div className="card max-w-3xl text-center space-y-4">
            <h2 className="text-display text-text-primary">
              {lt(
                judgedAny
                  ? 'display_current.waiting.next_title'
                  : 'display_current.waiting.first_title',
              )}
            </h2>
            <p className="text-body text-text-secondary">
              {lt(
                judgedAny
                  ? 'display_current.waiting.next_hint'
                  : 'display_current.waiting.first_hint',
              )}
            </p>
          </div>
        </main>
      ) : (
        <main className="flex-1 container-full py-6 sm:py-8 md:py-10 lg:py-12 flex">
          <section className="card flex-1 flex flex-col space-y-10">
            <header className="space-y-4">
              <div className="flex flex-col gap-4">
                <div className="flex flex-wrap items-baseline gap-4 justify-between w-full">
                  <h2 className="text-display text-text-primary uppercase tracking-[0.3em] font-mono">
                    {name}
                  </h2>
                  <h3 className="text-display text-text-secondary uppercase tracking-[0.3em] font-mono">
                    {liftLabel}
                  </h3>
                </div>
                <div className="flex flex-wrap items-center gap-4 text-caption uppercase tracking-[0.3em] text-text-secondary">
                  <span className="font-mono">
                    {team || lt('display_current.hero.club_placeholder')}
                  </span>
                  <span className="font-mono">
                    • {lt('display_current.meta.age')}:{' '}
                    <span className="text-text-primary">
                      {ageOnDate(entry.lifter.birthDate, state.date)}
                    </span>
                  </span>
                  <span className="font-mono">
                    • {lt('display_current.meta.bodyweight')}:{' '}
                    <span className="text-text-primary">
                      {typeof entry.bodyweight === 'number' ? entry.bodyweight + ' kg' : '—'}
                    </span>
                  </span>
                  {ageClass && (
                    <span className="font-mono">
                      • {lt('display_current.info.age_category')}:{' '}
                      <span className="text-text-primary">{ageClass}</span>
                    </span>
                  )}
                  <span className="font-mono">
                    • {lt('display_current.info.weight_class')}:{' '}
                    <span className="text-text-primary">{weightClass}</span>
                  </span>
                </div>
              </div>
            </header>
            <section className="flex-1 flex flex-col space-y-6">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-stretch flex-1">
                {tiles.map((tile) => {
                  const status = statusOf(tile)
                  const highlighted = tile.number === attempt.number
                  return (
                    <div
                      key={tile.number}
                      className={
                        'attempt-tile flex-1 min-w-[120px] sm:min-w-[140px] md:min-w-[160px] px-3 sm:px-4 md:px-6 py-4 sm:py-5 md:py-6 flex flex-col tracking-[0.2em] sm:tracking-[0.3em] uppercase text-center shadow-inner transform ' +
                        background(status) +
                        ' ' +
                        (highlighted ? 'border-2 border-white ' + glow(status) + ' scale-105' : '')
                      }
                    >
                      <p className="text-h3 text-text-secondary">
                        {lt('display_current.tiles.attempt', { number: tile.number })}
                      </p>
                      <div className="flex-1 flex items-center justify-center">
                        <div className="flex items-baseline justify-center gap-2 md:gap-4">
                          <span className="text-4xl sm:text-5xl md:text-6xl lg:text-[6rem] leading-none font-mono text-text-primary">
                            {tile._tag === 'Unannounced' ? '—' : tile.weight}
                          </span>
                          {tile._tag !== 'Unannounced' && (
                            <span className="text-lg sm:text-xl md:text-2xl lg:text-3xl font-mono text-text-secondary uppercase tracking-[0.3em]">
                              kg
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
              {typeof rack === 'number' && (
                <div className="inline-flex items-center gap-3 text-label text-text-secondary uppercase tracking-[0.3em]">
                  <span>{lt('display_current.footer.rack_height')}</span>
                  <span className="text-h3 font-mono text-text-primary">{rack}</span>
                </div>
              )}
              {Option.match(load, {
                onNone: () => <></>,
                onSome: (plan) => (
                  <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:gap-8">
                    {plan.platesPerSide.length > 0 && (
                      <div className="w-full lg:w-auto flex justify-center lg:justify-start">
                        <Barbell
                          plates={plan.platesPerSide}
                          colors={colors}
                          heightPx={200}
                          maxWidthPx={40}
                        />
                      </div>
                    )}
                    <div className="space-y-3 self-center lg:self-center">
                      {plan.platesPerSide.length > 0 ? (
                        <div className="flex flex-col gap-4">
                          <div className="flex flex-wrap items-center gap-8 justify-center lg:justify-start">
                            {plan.platesPerSide.map((plate) => (
                              <div
                                key={plate.weight}
                                className="flex items-center gap-4 text-text-secondary uppercase tracking-[0.2em]"
                              >
                                <span className="text-text-primary font-mono text-4xl">
                                  {plate.weight} kg
                                </span>
                                <span className="text-text-secondary font-mono text-2xl opacity-70">
                                  {lt('display_current.sidebar.plates_per_side', {
                                    count: plate.count,
                                  })}
                                </span>
                              </div>
                            ))}
                          </div>
                          <div className="flex flex-wrap items-center justify-center gap-6 text-text-secondary uppercase tracking-[0.2em] text-2xl">
                            <span className="font-mono">
                              {lt('display_current.sidebar.bar_weight', {
                                weight: barbell.bars[entry.lifter.sex],
                              })}
                            </span>
                            {barbell.clampsPerSide > 0 && (
                              <span className="font-mono">
                                {lt('display_current.sidebar.collar_weight', {
                                  total: barbell.clampsPerSide * 2,
                                  perClamp: barbell.clampsPerSide,
                                })}
                              </span>
                            )}
                            {plan._tag === 'Unloadable' && (
                              <span className="text-status-warning">
                                {lt('display_current.sidebar.target_weight', {
                                  target: plan.requested,
                                })}
                              </span>
                            )}
                          </div>
                        </div>
                      ) : (
                        <p className="text-body text-text-secondary">
                          {lt('display_current.sidebar.no_plates')}
                        </p>
                      )}
                    </div>
                  </div>
                ),
              })}
              {Option.match(state.scoreboard.qrUrl, {
                onNone: () => <></>,
                onSome: (url) => (
                  <div className="self-end">
                    <QrCode url={url} />
                  </div>
                ),
              })}
            </section>
          </section>
        </main>
      )}
      {Option.match(video, {
        onNone: () => <></>,
        onSome: (src) => (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black">
            <video
              key={src}
              src={src}
              className="h-full w-full object-contain"
              playsInline
              onEnded={stopVideo}
              onError={stopVideo}
              onCanPlay={(event) => {
                const player = event.currentTarget
                // A browser may refuse sound before the first click on the screen; then play muted.
                player.play().catch(() => {
                  player.muted = true
                  player.play().catch(stopVideo)
                })
              }}
            />
          </div>
        ),
      })}
    </div>
  )
}
