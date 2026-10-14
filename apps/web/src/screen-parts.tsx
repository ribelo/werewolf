import {
  ageOnDate,
  currentAttempt,
  entryAgeClass,
  entryWeightClass,
  liftingOrder,
  loadBarbell,
  type Attempt,
  type BarbellLoad,
  type ContestState,
  type Entry,
} from '@werewolf/core'
import * as Option from 'effect/Option'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
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

/**
 * FLIP for a keyed list: when the order changes, each item glides from its old place to the new
 * one. Items mark themselves with data-flip set to their key.
 */
export function useFlip(order: string) {
  const container = useRef<HTMLDivElement>(null)
  const last = useRef(new Map<string, DOMRect>())
  useLayoutEffect(() => {
    const root = container.current
    if (!root) return
    const items = Array.from(root.querySelectorAll<HTMLElement>('[data-flip]'))
    const next = new Map<string, DOMRect>()
    for (const item of items) {
      // Older TV browsers lack the Web Animations API; the list then simply jumps.
      if (typeof item.animate !== 'function') continue
      const key = item.dataset['flip'] ?? ''
      const rect = item.getBoundingClientRect()
      next.set(key, rect)
      const before = last.current.get(key)
      if (before) {
        const dx = before.left - rect.left
        const dy = before.top - rect.top
        if (dx !== 0 || dy !== 0)
          item.animate(
            [{ transform: 'translate(' + dx + 'px,' + dy + 'px)' }, { transform: 'none' }],
            { duration: 450, easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)' },
          )
      } else
        item.animate(
          [
            { opacity: 0, transform: 'translateX(40px)' },
            { opacity: 1, transform: 'none' },
          ],
          { duration: 400, easing: 'ease-out' },
        )
    }
    last.current = next
  }, [order])
  return container
}

export const statusOf = (attempt: Attempt) =>
  attempt._tag === 'Judged' ? (attempt.verdict === 'goodLift' ? 'successful' : 'failed') : 'pending'

/** Everything the stage screen and the big screen show about the current attempt. */
export interface CurrentView {
  readonly key: string
  readonly attempt: Attempt & { readonly _tag: 'Declared' }
  readonly entry: Entry
  readonly name: string
  readonly team: string
  readonly liftName: string
  readonly age: number
  readonly ageClass: string
  readonly weightClass: string
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

/** The next lifters after the current one, in lifting order. */
export function upNext(state: ContestState, count: number) {
  const current = Option.getOrUndefined(currentAttempt(state))
  return liftingOrder(state)
    .filter(
      (attempt) =>
        !current ||
        attempt.entryId !== current.entryId ||
        attempt.liftId !== current.liftId ||
        attempt.number !== current.number,
    )
    .slice(0, count)
    .map((attempt) => ({
      key: attempt.entryId + ':' + attempt.liftId + ':' + attempt.number,
      attempt,
      name: state.entries.find((entry) => entry.id === attempt.entryId)?.lifter.name ?? '',
    }))
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

/** After every new verdict a random clip of that kind plays; none when the library is empty. */
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
  const seen = useRef(sequence)
  useEffect(() => {
    if (sequence <= seen.current) {
      seen.current = sequence
      return
    }
    seen.current = sequence
    Option.map(last, (attempt) => {
      const kind: VideoKind = attempt.verdict === 'goodLift' ? 'good' : 'bad'
      setVerdict(Option.some(kind))
      window.setTimeout(() => setVerdict(Option.none()), 2200)
      const list = videos[kind]
      const pick = list[Math.floor(Math.random() * list.length)]
      if (pick) setPlaying(Option.some(videoUrl(kind, pick.name)))
    })
  }, [sequence, last, videos])
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
