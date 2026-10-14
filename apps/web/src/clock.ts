import { clockRemaining, type AttemptClock } from '@werewolf/core'
import * as Option from 'effect/Option'
import { useEffect, useState } from 'react'

/**
 * Milliseconds to add to this device's clock to get the server's clock. Devices disagree by
 * seconds or minutes; the attempt clock is stamped and counted in server time so that the desk
 * and every screen show the same second.
 */
let serverOffset = 0
let synced = false

/** Now in server time; this device's time until the first sync succeeds. */
export const serverNow = () => Date.now() + serverOffset

/** Measure the offset once per page; a failed request keeps the device clock. */
export function syncServerClock(): void {
  if (synced) return
  synced = true
  const sent = Date.now()
  fetch('/api/health', { cache: 'no-store' })
    .then((response) => response.json())
    .then((body: unknown) => {
      const received = Date.now()
      if (
        typeof body === 'object' &&
        body !== null &&
        'now' in body &&
        typeof body.now === 'number'
      )
        serverOffset = body.now - (sent + received) / 2
    })
    .catch(() => {
      synced = false
    })
}

/** Seconds the clock shows: full time when idle, the countdown when running, frozen when stopped. */
export function useClockSeconds(clock: AttemptClock, fullSeconds: number): number {
  const [now, setNow] = useState(serverNow)
  const running = clock._tag === 'Running'
  useEffect(() => {
    syncServerClock()
    if (!running) return
    const timer = window.setInterval(() => setNow(serverNow()), 200)
    return () => window.clearInterval(timer)
  }, [running])
  switch (clock._tag) {
    case 'Idle':
      return fullSeconds
    case 'Running':
      return clockRemaining(clock, now)
    case 'Stopped':
      return clock.remaining
  }
}

/** Seconds left while the clock runs; none otherwise. */
export function useCountdown(clock: AttemptClock, fullSeconds: number): Option.Option<number> {
  const seconds = useClockSeconds(clock, fullSeconds)
  return clock._tag === 'Running' ? Option.some(seconds) : Option.none()
}

export const clockText = (seconds: number) =>
  Math.floor(seconds / 60) + ':' + String(seconds % 60).padStart(2, '0')
