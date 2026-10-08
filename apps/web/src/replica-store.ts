import { ReplicaState, type ContestId } from '@werewolf/sync'
import * as Data from 'effect/Data'
import * as Effect from 'effect/Effect'
import * as Option from 'effect/Option'
import * as Schema from 'effect/Schema'
import type { Access } from './live-contest.ts'

class StorageFailure extends Data.TaggedError('StorageFailure')<{
  readonly code: 'storage.failed' | 'storage.invalid'
  readonly cause: unknown
}> {}
const ioFailure = (cause: unknown) => new StorageFailure({ code: 'storage.failed', cause })
const invalid = (cause: unknown) => new StorageFailure({ code: 'storage.invalid', cause })
export const deviceId = Effect.try({
  try: () => {
    const existing = sessionStorage.getItem('werewolf-v2-replica')
    if (existing) return existing
    const id = crypto.randomUUID()
    sessionStorage.setItem('werewolf-v2-replica', id)
    return id
  },
  catch: ioFailure,
})
const openDatabase = Effect.tryPromise({
  try: () =>
    new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('werewolf-v2-replicas', 1)
      request.onupgradeneeded = () => request.result.createObjectStore('replicas')
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    }),
  catch: ioFailure,
})
function withDatabase<A>(use: (database: IDBDatabase) => Effect.Effect<A, StorageFailure>) {
  return Effect.acquireUseRelease(openDatabase, use, (database) =>
    Effect.sync(() => database.close()),
  )
}
function readValue(key: string) {
  return withDatabase((database) =>
    Effect.tryPromise({
      try: () =>
        new Promise<Option.Option<unknown>>((resolve, reject) => {
          const request = database
            .transaction('replicas', 'readonly')
            .objectStore('replicas')
            .get(key)
          request.onsuccess = () => resolve(Option.fromUndefinedOr<unknown>(request.result))
          request.onerror = () => reject(request.error)
        }),
      catch: ioFailure,
    }),
  )
}
function writeValue(key: string, value: unknown) {
  return withDatabase((database) =>
    Effect.tryPromise({
      try: () =>
        new Promise<void>((resolve, reject) => {
          const transaction = database.transaction('replicas', 'readwrite')
          transaction.objectStore('replicas').put(value, key)
          transaction.oncomplete = () => resolve()
          transaction.onerror = () => reject(transaction.error)
          transaction.onabort = () => reject(transaction.error)
        }),
      catch: ioFailure,
    }),
  )
}
function replicaKey(id: ContestId, access: Access) {
  if (access._tag === 'Editor')
    return Effect.map(deviceId, (device) => 'editor:' + device + ':' + id)
  return Effect.tryPromise({
    try: async () => {
      const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(access.token))
      return (
        'viewer:' +
        id +
        ':' +
        Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')
      )
    },
    catch: ioFailure,
  })
}
/** Read only the current desk's replica, or the exact capability's read-only replica. */
export function readReplica(
  id: ContestId,
  access: Access,
): Effect.Effect<Option.Option<ReplicaState>, StorageFailure> {
  return Effect.gen(function* () {
    const key = yield* replicaKey(id, access)
    const value = yield* readValue(key)
    if (Option.isNone(value)) return Option.none<ReplicaState>()
    const state = yield* Schema.decodeUnknownEffect(ReplicaState)(value.value).pipe(
      Effect.mapError(invalid),
    )
    if (state.snapshot.definition.id !== id) return yield* invalid('wrongContest')
    return Option.some(state)
  })
}
/** Complete the IndexedDB transaction before a local change is rendered or sent. */
export function saveReplica(
  id: ContestId,
  access: Access,
  state: ReplicaState,
): Effect.Effect<void, StorageFailure> {
  return Effect.gen(function* () {
    const key = yield* replicaKey(id, access)
    const encoded = yield* Schema.encodeEffect(ReplicaState)(state).pipe(Effect.mapError(invalid))
    yield* writeValue(key, encoded)
  })
}
/** This permits only offline local work. The server still checks its own session. */
export const hasEditorGrant: Effect.Effect<boolean, StorageFailure> = Effect.gen(function* () {
  const device = yield* deviceId
  const value = yield* readValue('editorGrant:' + device)
  if (Option.isNone(value)) return false
  return yield* Schema.decodeUnknownEffect(Schema.Boolean)(value.value).pipe(
    Effect.mapError(invalid),
  )
})
/** A successful session response grants access; logout revokes it without deleting pending work. */
export function setEditorGrant(enabled: boolean): Effect.Effect<void, StorageFailure> {
  return Effect.gen(function* () {
    const device = yield* deviceId
    yield* writeValue('editorGrant:' + device, enabled)
  })
}
