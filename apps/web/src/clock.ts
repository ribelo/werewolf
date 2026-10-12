import type { ContestState } from '@werewolf/core'
import * as Option from 'effect/Option'
import { useEffect, useState } from 'react'

/** Seconds left on the attempt clock, ticking on this device; none when the clock is stopped. */
export function useCountdown(clock: ContestState['clock']): Option.Option<number> {
  const [now, setNow] = useState(() => Date.now())
  const running = Option.isSome(clock)
  useEffect(() => {
    if (!running) return
    const timer = window.setInterval(() => setNow(Date.now()), 250)
    return () => window.clearInterval(timer)
  }, [running])
  return Option.map(clock, (value) =>
    Math.max(0, Math.ceil((value.startedAt + value.seconds * 1000 - now) / 1000)),
  )
}

export const clockText = (seconds: number) =>
  Math.floor(seconds / 60) + ':' + String(seconds % 60).padStart(2, '0')
