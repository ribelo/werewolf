// ADR 0004 requires Effect Atom. Pin its version because the API is unstable.
// @effect-diagnostics unstableApiUsage:off
import { useAtom } from '@effect/atom-react'
import { Command, ContestJournal } from '@werewolf/core'
import { ServerFrame, type ContestDefinition, type ContestId } from '@werewolf/sync'
import * as Atom from 'effect/reactivity/Atom'
import * as Data from 'effect/Data'
import * as Effect from 'effect/Effect'
import * as Option from 'effect/Option'
import * as Result from 'effect/Result'
import * as Schema from 'effect/Schema'
import { useEffect, useState } from 'react'
import type { MessageKey } from './i18n.ts'

export type Access =
  | { readonly _tag: 'Editor' }
  | { readonly _tag: 'Viewer'; readonly token: string }
type View =
  | { readonly _tag: 'Loading' }
  | { readonly _tag: 'Invalid' }
  | {
      readonly _tag: 'Ready'
      readonly definition: ContestDefinition
      readonly journal: ContestJournal
    }
class UiFailure extends Data.TaggedError('UiFailure')<{
  readonly code: MessageKey
  readonly cause: unknown
}> {}
export function requestJson<A>(schema: Schema.Decoder<A>, path: string, init: RequestInit = {}) {
  return Effect.gen(function* () {
    const response = yield* Effect.tryPromise({
      try: (signal) => fetch(path, { ...init, signal }),
      catch: (cause) => new UiFailure({ code: 'request.failed', cause }),
    })
    if (!response.ok)
      return yield* new UiFailure({ code: 'request.failed', cause: response.status })
    const raw = yield* Effect.tryPromise({
      try: () => response.json(),
      catch: (cause) => new UiFailure({ code: 'request.invalid', cause }),
    })
    return yield* Schema.decodeUnknownEffect(schema)(raw).pipe(
      Effect.mapError((cause) => new UiFailure({ code: 'request.invalid', cause })),
    )
  })
}

export function useLiveContest(id: ContestId, access: Access) {
  const [atom] = useState(() => Atom.make<View>({ _tag: 'Loading' }))
  const [view, setView] = useAtom(atom)
  const [socket, setSocket] = useState<Option.Option<WebSocket>>(Option.none())
  const [connected, setConnected] = useState(false)
  const [error, setError] = useState<MessageKey | ''>('')
  const [rejection, setRejection] = useState('')
  const token = access._tag === 'Viewer' ? access.token : ''
  useEffect(() => {
    const url = new URL('/api/contests/' + id + '/events', location.href)
    url.protocol = location.protocol === 'https:' ? 'wss:' : 'ws:'
    if (token) url.searchParams.set('token', token)
    const ws = new WebSocket(url)
    setSocket(Option.some(ws))
    const opened = () => {
      setConnected(true)
      setError('')
    }
    const closed = () => setConnected(false)
    const failed = () => setError('request.failed')
    const received = (event: MessageEvent<unknown>) => {
      const parsed = Schema.decodeUnknownResult(Schema.fromJsonString(ServerFrame))(event.data)
      if (Result.isFailure(parsed)) {
        setError('request.invalid')
        return
      }
      const frame = parsed.success
      switch (frame._tag) {
        case 'Failure':
          setError(frame.code)
          return
        case 'Rejected':
          setRejection(frame.reason)
          return
        case 'Snapshot': {
          const restored = ContestJournal.restore(
            frame.snapshot.definition.rulebook,
            frame.snapshot.definition.date,
            frame.snapshot.commands.map((item) => item.command),
          )
          if (Result.isFailure(restored) || frame.snapshot.definition.id !== id) {
            setView({ _tag: 'Invalid' })
            return
          }
          setView({
            _tag: 'Ready',
            definition: frame.snapshot.definition,
            journal: restored.success,
          })
          return
        }
        case 'Accepted':
          setView((previous) => {
            if (previous._tag !== 'Ready') return { _tag: 'Invalid' }
            if (frame.sequence <= previous.journal.commands.length) return previous
            if (frame.sequence !== previous.journal.commands.length + 1) return { _tag: 'Invalid' }
            const appended = previous.journal.append(frame.command)
            return Result.isFailure(appended)
              ? { _tag: 'Invalid' }
              : { ...previous, journal: appended.success }
          })
      }
    }
    ws.addEventListener('open', opened)
    ws.addEventListener('close', closed)
    ws.addEventListener('error', failed)
    ws.addEventListener('message', received)
    return () => {
      ws.removeEventListener('open', opened)
      ws.removeEventListener('close', closed)
      ws.removeEventListener('error', failed)
      ws.removeEventListener('message', received)
      ws.close()
    }
  }, [id, token, setView])
  function submit(input: object) {
    if (access._tag !== 'Editor') {
      setError('auth.readOnly')
      return
    }
    const parsed = Schema.decodeUnknownResult(Command)({
      ...input,
      id: crypto.randomUUID(),
      at: Date.now(),
    })
    if (Result.isFailure(parsed)) {
      setError('request.invalid')
      return
    }
    if (Option.isNone(socket) || socket.value.readyState !== WebSocket.OPEN) {
      setError('request.failed')
      return
    }
    setError('')
    setRejection('')
    Effect.try({
      try: () => socket.value.send(JSON.stringify({ _tag: 'Submit', command: parsed.success })),
      catch: (cause) => new UiFailure({ code: 'request.failed', cause }),
    }).pipe(
      Effect.match({ onFailure: (failure) => setError(failure.code), onSuccess: () => {} }),
      Effect.runSync,
    )
  }
  return { view, connected, error, rejection, submit }
}
