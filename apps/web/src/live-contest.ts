// ADR 0004 requires Effect Atom. Pin its version because the API is unstable.
// @effect-diagnostics unstableApiUsage:off
import { useAtom } from '@effect/atom-react'
import { Command, type CommandId, type ContestFailure } from '@werewolf/core'
import {
  ContestReplica,
  DeviceId,
  ServerFrame,
  type ContestId,
  type ReplicaConflict,
} from '@werewolf/sync'
import * as Atom from 'effect/reactivity/Atom'
import * as Data from 'effect/Data'
import * as Effect from 'effect/Effect'
import * as Fiber from 'effect/Fiber'
import * as Option from 'effect/Option'
import * as Queue from 'effect/Queue'
import * as Result from 'effect/Result'
import * as Schema from 'effect/Schema'
import { useEffect, useRef, useState } from 'react'
import { serverNow, syncServerClock } from './clock.ts'
import { createMesh, type PeerMesh } from './peer-mesh.ts'
import { deviceId, readReplica, saveReplica } from './replica-store.ts'
import type { MessageKey } from './i18n.ts'

export type Access =
  | { readonly _tag: 'Editor' }
  | { readonly _tag: 'Viewer'; readonly token: string }
type View =
  | { readonly _tag: 'Loading' }
  | { readonly _tag: 'Invalid' }
  | { readonly _tag: 'Ready'; readonly replica: ContestReplica }
class NetworkFailure extends Data.TaggedError('NetworkFailure')<{
  readonly code: 'request.failed'
  readonly cause: unknown
}> {}
class HttpFailure extends Data.TaggedError('HttpFailure')<{
  readonly code: 'request.failed'
  readonly status: number
}> {}
class DecodeFailure extends Data.TaggedError('DecodeFailure')<{
  readonly code: 'request.invalid'
  readonly cause: unknown
}> {}
const networkFailure = (cause: unknown) => new NetworkFailure({ code: 'request.failed', cause })
export function requestJson<A>(
  schema: Schema.Decoder<A>,
  path: string,
  init: RequestInit = {},
): Effect.Effect<A, NetworkFailure | HttpFailure | DecodeFailure> {
  return Effect.gen(function* () {
    const response = yield* Effect.tryPromise({
      try: (signal) => fetch(path, { ...init, signal }),
      catch: networkFailure,
    })
    if (!response.ok)
      return yield* new HttpFailure({ code: 'request.failed', status: response.status })
    const raw = yield* Effect.tryPromise({
      try: () => response.json(),
      catch: (cause) => new DecodeFailure({ code: 'request.invalid', cause }),
    })
    return yield* Schema.decodeUnknownEffect(schema)(raw).pipe(
      Effect.mapError((cause) => new DecodeFailure({ code: 'request.invalid', cause })),
    )
  })
}
type Link =
  | { readonly _tag: 'Disconnected' }
  | { readonly _tag: 'Connecting' | 'CatchingUp'; readonly socket: WebSocket }
  | {
      readonly _tag: 'Online'
      readonly socket: WebSocket
      readonly inFlight: Option.Option<CommandId>
    }

export function useLiveContest(id: ContestId, access: Access) {
  const [atom] = useState(() => Atom.make<View>({ _tag: 'Loading' }))
  const [view, setView] = useAtom(atom)
  const [connected, setConnected] = useState(false)
  const [peers, setPeers] = useState(0)
  const [error, setError] = useState<MessageKey | ''>('')
  const [rejection, setRejection] = useState('')
  const dispatch = useRef<(input: object) => void>(() => {})
  const role = access._tag
  const token = access._tag === 'Viewer' ? access.token : ''
  useEffect(() => {
    const scope: Access = role === 'Editor' ? { _tag: 'Editor' } : { _tag: 'Viewer', token }
    const inbox = Effect.runSync(Queue.make<Effect.Effect<void, { readonly code: MessageKey }>>())
    let current: Option.Option<ContestReplica> = Option.none()
    let link: Link = { _tag: 'Disconnected' }
    let retry: Option.Option<number> = Option.none()
    let active = true
    let mesh: Option.Option<PeerMesh> = Option.none()
    let device = Option.none<DeviceId>()
    function enqueue(operation: Effect.Effect<void, { readonly code: MessageKey }>) {
      Queue.offerUnsafe(inbox, operation)
    }
    const worker = Effect.runFork(
      Effect.forever(
        Effect.gen(function* () {
          const operation = yield* Queue.take(inbox)
          yield* operation.pipe(
            Effect.catch((failure) => Effect.sync(() => setError(failure.code))),
          )
        }),
      ),
    )
    function schedule() {
      if (!active || !navigator.onLine || Option.isSome(retry)) return
      retry = Option.some(
        window.setTimeout(() => {
          retry = Option.none()
          enqueue(connect())
        }, 1500),
      )
    }
    function disconnect() {
      if (link._tag !== 'Disconnected') link.socket.close()
      link = { _tag: 'Disconnected' }
      setConnected(false)
    }
    function persist(replica: ContestReplica) {
      return saveReplica(id, scope, replica.state).pipe(
        Effect.andThen(
          Effect.sync(() => {
            current = Option.some(replica)
            setView({ _tag: 'Ready', replica })
          }),
        ),
      )
    }
    function flush() {
      return Effect.try({
        try: () => {
          if (
            role !== 'Editor' ||
            link._tag !== 'Online' ||
            Option.isSome(link.inFlight) ||
            Option.isNone(current)
          )
            return
          // Commands heard from peers go first; the server accepts each identifier once.
          const command = current.value.outbox[0]
          if (!command) return
          link = { ...link, inFlight: Option.some(command.id) }
          link.socket.send(JSON.stringify({ _tag: 'Submit', command }))
        },
        catch: networkFailure,
      }).pipe(
        Effect.catch((failure) =>
          Effect.sync(() => {
            setError(failure.code)
            disconnect()
            schedule()
          }),
        ),
      )
    }
    function receive(frame: ServerFrame) {
      return Effect.gen(function* () {
        if (frame._tag === 'Failure') {
          setError(frame.code)
          disconnect()
          return
        }
        if (frame._tag === 'Presence') {
          if (Option.isSome(mesh)) mesh.value.meet(frame.devices)
          return
        }
        if (frame._tag === 'Signal') {
          if (Option.isSome(mesh)) mesh.value.negotiate(frame.from, frame.role, frame.payload)
          return
        }
        const next: Result.Result<
          ContestReplica,
          ContestFailure | ReplicaConflict | DecodeFailure
        > = Option.isNone(current)
          ? frame._tag === 'Snapshot'
            ? ContestReplica.restore({
                snapshot: frame.snapshot,
                pending: [],
                heard: [],
                rejected: [],
              })
            : Result.fail(new DecodeFailure({ code: 'request.invalid', cause: 'snapshotRequired' }))
          : current.value.receive(frame)
        if (Result.isFailure(next) || next.success.state.snapshot.definition.id !== id) {
          setError('request.invalid')
          disconnect()
          schedule()
          return
        }
        yield* persist(next.success)
        if (frame._tag === 'Snapshot' && link._tag === 'CatchingUp') {
          link = { _tag: 'Online', socket: link.socket, inFlight: Option.none() }
          setConnected(true)
          setError('')
        }
        const acknowledged =
          frame._tag === 'Accepted'
            ? frame.command.id
            : frame._tag === 'Rejected'
              ? frame.commandId
              : ''
        if (link._tag === 'Online' && Option.contains(link.inFlight, acknowledged))
          link = { ...link, inFlight: Option.none() }
        if (frame._tag === 'Rejected') setRejection(frame.reason)
        yield* flush()
      })
    }
    function connect() {
      return Effect.try({
        try: () => {
          if (!active || !navigator.onLine || link._tag !== 'Disconnected') return
          const url = new URL('/api/contests/' + id + '/events', location.href)
          if (Option.isSome(device)) url.searchParams.set('device', device.value)
          url.protocol = location.protocol === 'https:' ? 'wss:' : 'ws:'
          if (token) url.searchParams.set('token', token)
          const socket = new WebSocket(url)
          link = { _tag: 'Connecting', socket }
          socket.addEventListener('open', () => {
            if (active && link._tag !== 'Disconnected' && link.socket === socket)
              link = { _tag: 'CatchingUp', socket }
          })
          socket.addEventListener('close', () => {
            if (!active || link._tag === 'Disconnected' || link.socket !== socket) return
            link = { _tag: 'Disconnected' }
            setConnected(false)
            schedule()
          })
          socket.addEventListener('error', () => {
            if (active && link._tag !== 'Disconnected' && link.socket === socket)
              setError('request.failed')
          })
          socket.addEventListener('message', (event: MessageEvent<unknown>) => {
            if (!active || link._tag === 'Disconnected' || link.socket !== socket) return
            const parsed = Schema.decodeUnknownResult(Schema.fromJsonString(ServerFrame))(
              event.data,
            )
            if (Result.isFailure(parsed)) {
              setError('request.invalid')
              disconnect()
              schedule()
            } else enqueue(receive(parsed.success))
          })
        },
        catch: networkFailure,
      }).pipe(
        Effect.catch((failure) =>
          Effect.sync(() => {
            setError(failure.code)
            schedule()
          }),
        ),
      )
    }
    syncServerClock()
    dispatch.current = (input) => {
      const parsed = Schema.decodeUnknownResult(Command)({
        ...input,
        id: crypto.randomUUID(),
        at: serverNow(),
      })
      if (Result.isFailure(parsed)) {
        setError('request.invalid')
        return
      }
      enqueue(
        Effect.gen(function* () {
          if (role !== 'Editor') {
            setError('auth.readOnly')
            return
          }
          if (Option.isNone(current)) {
            setError('request.failed')
            return
          }
          const queued = current.value.enqueue(parsed.success)
          if (Result.isFailure(queued)) {
            setRejection('reason' in queued.failure ? queued.failure.reason : queued.failure._tag)
            return
          }
          yield* persist(queued.success)
          if (Option.isSome(mesh)) mesh.value.broadcast([parsed.success])
          setError('')
          setRejection('')
          yield* flush()
        }),
      )
    }
    function hear(commands: ReadonlyArray<Command>) {
      enqueue(
        Effect.gen(function* () {
          if (Option.isNone(current)) return
          const heard = current.value.hear(commands)
          if (heard.fresh.length === 0) return
          yield* persist(heard.replica)
          // Pass news along so a third device that cannot reach the sender still converges.
          if (Option.isSome(mesh)) mesh.value.broadcast(heard.fresh)
          yield* flush()
        }),
      )
    }
    enqueue(
      Effect.gen(function* () {
        const self = Schema.decodeOption(DeviceId)(yield* deviceId)
        if (Option.isSome(self) && typeof RTCPeerConnection !== 'undefined') {
          device = self
          mesh = Option.some(
            createMesh({
              self: self.value,
              signal: (to, payload) => {
                if (link._tag !== 'Disconnected' && link.socket.readyState === 1)
                  link.socket.send(JSON.stringify({ _tag: 'Signal', to, payload }))
              },
              heard: hear,
              backlog: () => (Option.isSome(current) ? current.value.outbox : []),
              changed: () => {
                if (Option.isSome(mesh)) setPeers(mesh.value.openCount())
              },
            }),
          )
        }
        const cached = yield* readReplica(id, scope)
        if (Option.isSome(cached)) {
          const restored = ContestReplica.restore(cached.value)
          if (Result.isFailure(restored)) {
            setView({ _tag: 'Invalid' })
            return
          }
          current = Option.some(restored.success)
          setView({ _tag: 'Ready', replica: restored.success })
        }
        yield* connect()
      }),
    )
    const online = () => enqueue(connect())
    const offline = () => disconnect()
    window.addEventListener('online', online)
    window.addEventListener('offline', offline)
    return () => {
      active = false
      dispatch.current = () => {}
      if (Option.isSome(mesh)) mesh.value.close()
      if (Option.isSome(retry)) window.clearTimeout(retry.value)
      disconnect()
      Queue.shutdownUnsafe(inbox)
      Effect.runFork(Fiber.interrupt(worker))
      window.removeEventListener('online', online)
      window.removeEventListener('offline', offline)
    }
  }, [id, role, token, setView])
  return {
    view,
    connected,
    peers,
    error,
    rejection,
    submit: (input: object) => dispatch.current(input),
  }
}
