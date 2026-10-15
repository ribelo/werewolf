import {
  ageOnDate,
  currentAttempt,
  entryAgeClass,
  entryWeightClass,
  individualRankings,
  loadBarbell,
  type Attempt,
  type BarbellLoad,
  type ContestState,
  type LiveAttempt,
  type Entry,
} from '@werewolf/core'
import * as Option from 'effect/Option'
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { clockText, useClockSeconds } from './clock.ts'
import { useLegacy } from './legacy-i18n.ts'
import { useVideos, videoUrl, type VideoKind } from './Videos.tsx'

const STEP_MS = 24
const GLYPHS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789#%&*+=/<>'
const LITERAL = new Set([' ', '•', ':', '.', ',', '-'])

/** The 2025 decipher effect: a new text is revealed left to right over scrambled characters. */
export function useDecipher(target: string): string {
  const [text, setText] = useState(target)
  const previous = useRef(target)
  useEffect(() => {
    if (previous.current === target) return
    previous.current = target
    let revealed = 0
    const timer = window.setInterval(() => {
      if (revealed >= target.length + 2) {
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

/** A number that counts from its previous value to the new one in a short ease-out. */
export function useTween(target: number, durationMs = 500): number {
  const [value, setValue] = useState(target)
  const from = useRef(target)
  useEffect(() => {
    const start = performance.now()
    const origin = from.current
    let frame = 0
    const step = (now: number) => {
      const progress = Math.min(1, (now - start) / durationMs)
      const eased = 1 - Math.pow(1 - progress, 3)
      const next = origin + (target - origin) * eased
      from.current = next
      setValue(next)
      if (progress < 1) frame = requestAnimationFrame(step)
    }
    frame = requestAnimationFrame(step)
    return () => cancelAnimationFrame(frame)
  }, [target, durationMs])
  return value
}

export const statusOf = (attempt: Attempt) =>
  attempt._tag === 'Judged' ? (attempt.verdict === 'goodLift' ? 'successful' : 'failed') : 'pending'

/** Everything the stage screen and the big screen show about the current attempt. */
export interface CurrentView {
  readonly key: string
  readonly attempt: LiveAttempt
  readonly entry: Entry
  readonly name: string
  readonly team: string
  readonly liftName: string
  readonly age: number
  readonly ageClass: string
  readonly weightClass: string
  /** Names of the divisions (tags) of the entry, such as MUNDUROWI. */
  readonly divisions: ReadonlyArray<string>
  /** Places of the entry in the rankings of this lift alone (not totals), for example "2 • Senior". */
  readonly places: ReadonlyArray<{ readonly place: number; readonly label: string }>
  readonly tiles: ReadonlyArray<Attempt>
  readonly rack: Option.Option<number>
  readonly load: BarbellLoad
  readonly colors: Readonly<Record<number, string>>
}

export function currentView(state: ContestState, locale: 'pl' | 'en'): Option.Option<CurrentView> {
  return Option.flatMap(currentAttempt(state), (attempt) => {
    const entry = state.entries.find((item) => item.id === attempt.entryId)
    if (!entry) return Option.none()
    const lift = state.rulebook.lifts.find((item) => item.id === attempt.liftId)
    const team = entry.lifter.teamId
      ? (state.teams.find((item) => item.id === entry.lifter.teamId)?.name ?? '')
      : ''
    const rack = entry.lifts.find((item) => item.liftId === attempt.liftId)?.rackHeight
    const name = (
      list: ReadonlyArray<{
        readonly id: string
        readonly name: { readonly pl: string; readonly en: string }
      }>,
      id: string,
    ) => list.find((item) => item.id === id)?.name[locale] ?? ''
    const places = individualRankings(state).flatMap((ranking) => {
      const classification = state.rulebook.classifications.find(
        (item) => item.id === ranking.classificationId,
      )
      if (
        !classification ||
        classification.kind !== 'individual' ||
        !(classification.liftIds.length === 1 && classification.liftIds[0] === attempt.liftId)
      )
        return []
      return ranking.groups.flatMap((group) =>
        group.rows
          .filter((row) => row.entry.id === entry.id)
          .map((row) => {
            const bucket =
              group.bucket._tag === 'Age'
                ? [name(state.rulebook.ageClasses, group.bucket.ageClassId)]
                : group.bucket._tag === 'Weight'
                  ? [name(state.rulebook.weightClasses, group.bucket.weightClassId)]
                  : group.bucket._tag === 'AgeAndWeight'
                    ? [
                        name(state.rulebook.ageClasses, group.bucket.ageClassId),
                        name(state.rulebook.weightClasses, group.bucket.weightClassId),
                      ]
                    : []
            return {
              place: row.place,
              label: [classification.name[locale], ...bucket].filter(Boolean).join(' • '),
            }
          }),
      )
    })
    return Option.some({
      key: attempt.entryId + ':' + attempt.liftId + ':' + attempt.number,
      attempt,
      entry,
      name: entry.lifter.name,
      team,
      liftName: lift ? lift.name[locale] : attempt.liftId,
      age: ageOnDate(entry.lifter.birthDate, state.date),
      ageClass: Option.match(entryAgeClass(state, entry), {
        onNone: () => '',
        onSome: (id) => state.rulebook.ageClasses.find((c) => c.id === id)?.name[locale] ?? '',
      }),
      weightClass: Option.match(entryWeightClass(state, entry), {
        onNone: () => '',
        onSome: (id) => state.rulebook.weightClasses.find((c) => c.id === id)?.name[locale] ?? '',
      }),
      divisions: entry.divisions.map((id) => name(state.rulebook.divisions, id)).filter(Boolean),
      places,
      tiles: state.attempts
        .filter((item) => item.entryId === attempt.entryId && item.liftId === attempt.liftId)
        .toSorted((a, b) => a.number - b.number),
      rack: typeof rack === 'number' ? Option.some(rack) : Option.none(),
      load: loadBarbell(state.rulebook.barbell, entry.lifter.sex, attempt.weight),
      colors: Object.fromEntries(
        state.rulebook.barbell.plates.flatMap((plate) =>
          plate.color ? [[plate.weight, plate.color] as const] : [],
        ),
      ),
    })
  })
}

/** The attempt clock as screens show it; red in the last ten seconds, amber when stopped. */
export function ScreenClock({
  state,
  className = '',
}: {
  readonly state: ContestState
  readonly className?: string
}) {
  const { lt } = useLegacy()
  const seconds = useClockSeconds(state.clock, state.rulebook.clockSeconds ?? 60)
  const tone =
    state.clock._tag === 'Running'
      ? seconds <= 10
        ? 'text-primary-red animate-pulse'
        : 'text-text-primary'
      : state.clock._tag === 'Stopped'
        ? 'text-status-warning'
        : 'text-text-secondary/60'
  return (
    <div
      role="timer"
      aria-label={lt('v2.clock.title')}
      className={'font-mono font-bold tabular-nums leading-none ' + tone + ' ' + className}
    >
      {clockText(seconds)}
    </div>
  )
}

/** The verdicts are already settled by useSettledVerdicts; this only lets the tiles repaint first. */
const VERDICT_SETTLE_MS = 100

/** How long a verdict must stay the same before the screens show it. */
const SETTLE_MS = 1200
const attemptKey = (attempt: Attempt) =>
  attempt.entryId + ':' + attempt.liftId + ':' + attempt.number
const verdictOf = (attempt: Attempt) => (attempt._tag === 'Judged' ? attempt.verdict : attempt._tag)

/**
 * The state as the screens should show it. The desk sets a failed lift by clicking the status
 * button twice (good, then failed); the screens keep the previous verdict of every attempt until
 * the clicks have stopped for a moment, so "good" never flashes on the way to "failed".
 * Weights, the live lifter and the clock pass through at once.
 */
export function useSettledVerdicts(state: ContestState): ContestState {
  const signature = state.attempts
    .map((attempt) => attemptKey(attempt) + verdictOf(attempt))
    .join('|')
  const [settled, setSettled] = useState(
    () => new Map(state.attempts.map((attempt) => [attemptKey(attempt), attempt] as const)),
  )
  const latest = useRef(state.attempts)
  latest.current = state.attempts
  useEffect(() => {
    const timer = window.setTimeout(
      () =>
        setSettled(
          new Map(latest.current.map((attempt) => [attemptKey(attempt), attempt] as const)),
        ),
      SETTLE_MS,
    )
    return () => window.clearTimeout(timer)
  }, [signature])
  return useMemo(
    () => ({
      ...state,
      attempts: state.attempts.map((attempt): Attempt => {
        const before = settled.get(attemptKey(attempt))
        if (!before || verdictOf(before) === verdictOf(attempt) || attempt._tag === 'Unannounced')
          return attempt
        const ref = { entryId: attempt.entryId, liftId: attempt.liftId, number: attempt.number }
        return before._tag === 'Judged'
          ? { ...before, weight: attempt.weight }
          : { ...ref, _tag: 'Declared', weight: attempt.weight }
      }),
    }),
    [state, settled],
  )
}

/**
 * After every new verdict a random clip of that kind plays; none when the library is empty.
 * The flash waits until the newest verdict has stayed the same for a moment: a click through
 * "good" on the way to "failed" shows only "failed".
 */
export function useVerdictVideo(
  state: ContestState,
): readonly [Option.Option<string>, () => void, Option.Option<'good' | 'bad'>] {
  const [videos] = useVideos()
  const [playing, setPlaying] = useState<Option.Option<string>>(Option.none())
  const [verdict, setVerdict] = useState<Option.Option<'good' | 'bad'>>(Option.none())
  const last = state.attempts.reduce<Option.Option<Attempt & { readonly _tag: 'Judged' }>>(
    (found, attempt) =>
      attempt._tag === 'Judged' &&
      Option.match(found, { onNone: () => true, onSome: (f) => attempt.sequence > f.sequence })
        ? Option.some(attempt)
        : found,
    Option.none(),
  )
  const sequence = Option.match(last, { onNone: () => 0, onSome: (a) => a.sequence })
  const kind: VideoKind | '' = Option.match(last, {
    onNone: (): VideoKind | '' => '',
    onSome: (a): VideoKind => (a.verdict === 'goodLift' ? 'good' : 'bad'),
  })
  const seen = useRef({ sequence, kind })
  const videosRef = useRef(videos)
  videosRef.current = videos
  useEffect(() => {
    const before = seen.current
    seen.current = { sequence, kind }
    // A verdict taken back or an older attempt: nothing new to celebrate.
    if (kind === '' || sequence < before.sequence) return
    if (sequence === before.sequence && kind === before.kind) return
    const settled: VideoKind = kind
    const timer = window.setTimeout(() => {
      setVerdict(Option.some(settled))
      window.setTimeout(() => setVerdict(Option.none()), 2200)
      const list = videosRef.current[settled]
      const pick = list[Math.floor(Math.random() * list.length)]
      if (pick) setPlaying(Option.some(videoUrl(settled, pick.name)))
    }, VERDICT_SETTLE_MS)
    return () => window.clearTimeout(timer)
  }, [sequence, kind])
  return [playing, () => setPlaying(Option.none()), verdict]
}

export function VerdictVideo({ src, onEnd }: { readonly src: string; readonly onEnd: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black">
      <video
        key={src}
        src={src}
        className="h-full w-full object-contain"
        playsInline
        onEnded={onEnd}
        onError={onEnd}
        onCanPlay={(event) => {
          const player = event.currentTarget
          // A browser may refuse sound before the first click on the screen; then play muted.
          player.play().catch(() => {
            player.muted = true
            player.play().catch(onEnd)
          })
        }}
      />
    </div>
  )
}

/** A full-screen flash of the verdict: green for a good lift, red for a failed one. */
export function VerdictFlash({
  verdict,
  good,
  bad,
}: {
  readonly verdict: 'good' | 'bad'
  readonly good: string
  readonly bad: string
}) {
  return (
    <div
      className={
        'pointer-events-none fixed inset-0 z-40 flex items-center justify-center animate-verdict ' +
        (verdict === 'good' ? 'bg-green-600/25' : 'bg-red-700/30')
      }
    >
      <span
        className={
          'font-display uppercase leading-none tracking-[0.1em] ' +
          (verdict === 'good' ? 'text-green-300' : 'text-red-400')
        }
        style={{ fontSize: '14vw', textShadow: '0 0 60px currentColor' }}
      >
        {verdict === 'good' ? good : bad}
      </span>
    </div>
  )
}
/**
 * A fixed 1920×1080 stage scaled to fit the window, so a TV at 720p, 1080p or any other size
 * shows exactly the same layout, letterboxed when the aspect ratio differs.
 */
export function FitCanvas({
  children,
  width = 1920,
  height = 1080,
}: {
  readonly children: ReactNode
  readonly width?: number
  readonly height?: number
}) {
  const [scale, setScale] = useState(1)
  useEffect(() => {
    const fit = () => setScale(Math.min(window.innerWidth / width, window.innerHeight / height))
    fit()
    window.addEventListener('resize', fit)
    return () => window.removeEventListener('resize', fit)
  }, [width, height])
  return (
    <div className="fixed inset-0 overflow-hidden bg-black">
      <div
        className="absolute left-1/2 top-1/2"
        style={{ width, height, transform: 'translate(-50%, -50%) scale(' + scale + ')' }}
      >
        {children}
      </div>
    </div>
  )
}
