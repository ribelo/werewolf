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

/** Now in server time, in whole milliseconds; this device's time until the first sync succeeds. */
export const serverNow = () => Date.now() + serverOffset

const SAMPLES = 5
const RESYNC_MS = 5 * 60 * 1000

async function sample(): Promise<{ readonly offset: number; readonly roundTrip: number }> {
  const sent = Date.now()
  const response = await fetch('/api/health', { cache: 'no-store' })
  const body: unknown = await response.json()
  const received = Date.now()
  if (typeof body !== 'object' || body === null || !('now' in body) || typeof body.now !== 'number')
    throw new Error('health without time')
  return { offset: body.now - (sent + received) / 2, roundTrip: received - sent }
}

/**
 * Measure the offset to the server clock. The sample with the shortest round trip is the most
 * exact one, so a slow first request (a cold start) does not skew the clock by seconds.
 * Whole milliseconds: command timestamps are integers, a half millisecond is refused.
 */
export function syncServerClock(): void {
  if (synced) return
  synced = true
  const run = async () => {
    let best = Number.POSITIVE_INFINITY
    for (let index = 0; index < SAMPLES; index++) {
      const measured = await sample()
      if (measured.roundTrip < best) {
        best = measured.roundTrip
        serverOffset = Math.round(measured.offset)
      }
    }
  }
  run().catch(() => {
    synced = false
  })
  window.setTimeout(() => {
    synced = false
  }, RESYNC_MS)
}

/** Seconds the clock shows: full time when idle, the countdown when running, frozen when stopped. */
export function useClockSeconds(clock: AttemptClock, fullSeconds: number): number {
  const [now, setNow] = useState(serverNow)
  const running = clock._tag === 'Running'
  useEffect(() => {
    syncServerClock()
    if (!running) return
    // The time captured when the component mounted is stale by the moment the clock starts.
    setNow(serverNow())
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
