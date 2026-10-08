import * as Data from 'effect/Data'
import * as Effect from 'effect/Effect'
import * as Schema from 'effect/Schema'

export class SessionCryptoError extends Data.TaggedError('SessionCryptoError')<{
  readonly cause: unknown
}> {
  override readonly message = 'Session cryptography failed'
}

function sessionCrypto<A>(operation: () => Promise<A>): Effect.Effect<A, SessionCryptoError> {
  return Effect.tryPromise({ try: operation, catch: (cause) => new SessionCryptoError({ cause }) })
}

export const AuthEnv = Schema.Struct({
  ORGANIZER_PASSWORD: Schema.NonEmptyString,
  SESSION_SECRET: Schema.NonEmptyString,
})
export type AuthEnv = typeof AuthEnv.Type

const encoder = new TextEncoder()
const cookieName = 'werewolf_session'
const sessionSeconds = 7 * 24 * 60 * 60

async function sign(value: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const signature = new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(value)))
  return Array.from(signature, (byte) => byte.toString(16).padStart(2, '0')).join('')
}

/** Compare hashes without an early exit. Crypto failures stay in the error channel. */
export function passwordMatches(
  password: string,
  expected: string,
): Effect.Effect<boolean, SessionCryptoError> {
  return sessionCrypto(async () => {
    const left = new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(password)))
    const right = new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(expected)))
    let difference = 0
    for (const [index, byte] of left.entries()) difference |= byte ^ (right[index] ?? 0)
    return difference === 0
  })
}

/** Missing, malformed and expired cookies mean no session. */
export function hasSession(
  request: Request,
  env: AuthEnv,
): Effect.Effect<boolean, SessionCryptoError> {
  return Effect.gen(function* () {
    const cookie = (request.headers.get('Cookie') ?? '')
      .split(';')
      .map((part) => part.trim())
      .find((part) => part.startsWith(cookieName + '='))
    if (!cookie) return false
    const parts = cookie.slice(cookieName.length + 1).split('.')
    if (parts.length !== 3) return false
    const [expires, nonce, signature] = parts
    if (!expires || !nonce || !signature || !/^\d+$/.test(expires)) return false
    if (Number(expires) <= Date.now() / 1000) return false
    const expected = yield* sessionCrypto(() => sign(expires + '.' + nonce, env.SESSION_SECRET))
    return yield* passwordMatches(signature, expected)
  })
}

/** Issue a seven-day, signed HttpOnly cookie; HTTPS cookies also use Secure. */
export function sessionCookie(
  request: Request,
  env: AuthEnv,
): Effect.Effect<string, SessionCryptoError> {
  return sessionCrypto(async () => {
    const value = String(Math.floor(Date.now() / 1000) + sessionSeconds) + '.' + crypto.randomUUID()
    const signed = value + '.' + (await sign(value, env.SESSION_SECRET))
    return (
      cookieName +
      '=' +
      signed +
      '; Path=/; HttpOnly; SameSite=Strict; Max-Age=' +
      String(sessionSeconds) +
      (new URL(request.url).protocol === 'https:' ? '; Secure' : '')
    )
  })
}

/** Expire the browser cookie without exposing its signed value. */
export function clearSession(request: Request): string {
  return (
    cookieName +
    '=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0' +
    (new URL(request.url).protocol === 'https:' ? '; Secure' : '')
  )
}
