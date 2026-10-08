import { DurableObject } from 'cloudflare:workers'
import { Command, ContestJournal, formatVersion } from '@werewolf/core'
import {
  Catalog,
  ClientFrame,
  ContestDefinition,
  ContestSummary,
  DeviceId,
  PeerRole,
  type Accepted,
  type ReadLinks,
  type ServerFrame,
  type Snapshot,
} from '@werewolf/sync'
import * as Data from 'effect/Data'
import * as Effect from 'effect/Effect'
import * as Option from 'effect/Option'
import * as Result from 'effect/Result'
import * as Schema from 'effect/Schema'

class ActorFailure extends Data.TaggedError('ActorFailure')<{ readonly cause: unknown }> {}
class InvalidActorRequest extends Data.TaggedError('InvalidActorRequest')<{
  readonly cause: unknown
}> {}
const io = <A>(operation: () => A) =>
  Effect.try({ try: operation, catch: (cause) => new ActorFailure({ cause }) })
const body = (request: Request) =>
  Effect.tryPromise({
    try: () => request.json(),
    catch: (cause) => new InvalidActorRequest({ cause }),
  })
const failure = (
  code: Extract<ServerFrame, { readonly _tag: 'Failure' }>['code'],
  status: number,
) => Response.json({ _tag: 'Failure', code }, { status, headers: { 'Cache-Control': 'no-store' } })
const runResponse = (effect: Effect.Effect<Response, ActorFailure | InvalidActorRequest>) =>
  effect.pipe(
    Effect.catchTags({
      ActorFailure: () => Effect.succeed(failure('request.failed', 500)),
      InvalidActorRequest: () => Effect.succeed(failure('request.invalid', 400)),
    }),
    Effect.runPromise,
  )
const Tokens = Schema.Struct({
  stage: Schema.NonEmptyString,
  announcer: Schema.NonEmptyString,
  results: Schema.NonEmptyString,
})
const StoredContest = Schema.Struct({ definition: ContestDefinition, tokens: Tokens })
const SocketAttachment = Schema.Struct({ access: PeerRole, device: DeviceId })
type SocketAttachment = typeof SocketAttachment.Type
interface LoadedContest {
  readonly stored: typeof StoredContest.Type
  readonly journal: ContestJournal
}

/** The Worker overwrites this private access header before it calls either actor. */
export const editorHeader = 'X-Werewolf-Editor'

export class ContestDO extends DurableObject {
  private current: Option.Option<LoadedContest> = Option.none()
  private load(): Option.Option<LoadedContest> {
    if (Option.isSome(this.current)) return this.current
    this.ctx.storage.sql.exec(
      'CREATE TABLE IF NOT EXISTS contest (singleton INTEGER PRIMARY KEY CHECK (singleton = 1), data TEXT NOT NULL)',
    )
    this.ctx.storage.sql.exec(
      'CREATE TABLE IF NOT EXISTS commands (sequence INTEGER PRIMARY KEY, id TEXT NOT NULL UNIQUE, data TEXT NOT NULL)',
    )
    const row = this.ctx.storage.sql
      .exec<{ data: string }>('SELECT data FROM contest WHERE singleton = 1')
      .toArray()
      .at(0)
    if (!row) return Option.none()
    const stored = Schema.decodeUnknownSync(StoredContest)(JSON.parse(row.data))
    const commands = this.ctx.storage.sql
      .exec<{ data: string }>('SELECT data FROM commands ORDER BY sequence')
      .toArray()
      .map((item) => Schema.decodeUnknownSync(Command)(JSON.parse(item.data)))
    const journal = Result.getOrThrow(
      ContestJournal.restore(stored.definition.rulebook, stored.definition.date, commands),
    )
    this.current = Option.some({ stored, journal })
    return this.current
  }
  private snapshot(contest: LoadedContest): Snapshot {
    return {
      formatVersion,
      definition: contest.stored.definition,
      commands: contest.journal.commands.map((command, index) => ({
        sequence: index + 1,
        command,
      })),
    }
  }
  private send(socket: WebSocket, frame: ServerFrame) {
    if (socket.readyState === 1) socket.send(JSON.stringify(frame))
  }
  private attachment(socket: WebSocket): Option.Option<SocketAttachment> {
    return Option.fromUndefinedOr(
      Schema.decodeUnknownOption(SocketAttachment)(socket.deserializeAttachment()).pipe(
        Option.getOrUndefined,
      ),
    )
  }
  /** Tell every device who else is present so each pair can negotiate one data channel. */
  private broadcastPresence(closing?: WebSocket) {
    const devices = this.ctx
      .getWebSockets()
      .filter((socket) => socket !== closing)
      .flatMap((socket) => {
        const attachment = this.attachment(socket)
        return Option.isSome(attachment)
          ? [{ device: attachment.value.device, role: attachment.value.access }]
          : []
      })
    for (const socket of this.ctx.getWebSockets())
      if (socket !== closing) this.send(socket, { _tag: 'Presence', devices })
  }
  private accept(
    contest: LoadedContest,
    command: Command,
  ): Accepted | Extract<ServerFrame, { readonly _tag: 'Rejected' }> {
    const index = contest.journal.commands.findIndex((item) => item.id === command.id)
    const past = contest.journal.commands[index]
    if (past) return { _tag: 'Accepted', sequence: index + 1, command: past }
    const next = contest.journal.append(command)
    if (Result.isFailure(next))
      return {
        _tag: 'Rejected',
        commandId: command.id,
        reason:
          'reason' in next.failure
            ? next.failure.reason
            : 'detail' in next.failure
              ? next.failure.detail
              : next.failure._tag,
      }
    const sequence = next.success.commands.length
    this.ctx.storage.sql.exec(
      'INSERT INTO commands(sequence, id, data) VALUES (?, ?, ?)',
      sequence,
      command.id,
      JSON.stringify(command),
    )
    this.current = Option.some({ stored: contest.stored, journal: next.success })
    const frame: Accepted = { _tag: 'Accepted', sequence, command }
    for (const socket of this.ctx.getWebSockets()) this.send(socket, frame)
    return frame
  }
  override fetch(request: Request) {
    return runResponse(
      Effect.gen({ self: this }, function* () {
        const url = new URL(request.url)
        const editor = request.headers.get(editorHeader) === '1'
        if (url.pathname.endsWith('/create') && request.method === 'POST') {
          if (!editor) return failure('auth.required', 401)
          const input = yield* body(request)
          const definition = yield* Schema.decodeUnknownEffect(ContestDefinition)(input).pipe(
            Effect.mapError((cause) => new InvalidActorRequest({ cause })),
          )
          return yield* io(() => {
            const existing = this.load()
            if (Option.isSome(existing))
              return Response.json(this.snapshot(existing.value), {
                headers: { 'Cache-Control': 'no-store' },
              })
            const stored = {
              definition,
              tokens: {
                stage: crypto.randomUUID(),
                announcer: crypto.randomUUID(),
                results: crypto.randomUUID(),
              },
            }
            this.ctx.storage.sql.exec(
              'INSERT INTO contest(singleton, data) VALUES (1, ?)',
              JSON.stringify(stored),
            )
            const journal = Result.getOrThrow(
              ContestJournal.restore(definition.rulebook, definition.date, []),
            )
            this.current = Option.some({ stored, journal })
            return Response.json(this.snapshot({ stored, journal }), {
              status: 201,
              headers: { 'Cache-Control': 'no-store' },
            })
          })
        }
        const loaded = yield* io(() => this.load())
        if (Option.isNone(loaded)) return failure('request.notFound', 404)
        const contest = loaded.value
        const token = url.searchParams.get('token')
        const viewer = Object.values(contest.stored.tokens).some((value) => value === token)
        if (!editor && !viewer) return failure('auth.required', 401)
        if (
          url.pathname.endsWith('/events') &&
          request.headers.get('Upgrade')?.toLowerCase() === 'websocket'
        )
          return yield* io(() => {
            const pair = new WebSocketPair()
            const client = pair[0]
            const server = pair[1]
            const named = Schema.decodeUnknownOption(DeviceId)(url.searchParams.get('device'))
            const attachment: SocketAttachment = {
              access: editor ? 'editor' : 'viewer',
              device: Option.getOrElse(named, () =>
                Schema.decodeSync(DeviceId)(crypto.randomUUID()),
              ),
            }
            server.serializeAttachment(attachment)
            this.ctx.acceptWebSocket(server)
            server.send(
              JSON.stringify({
                _tag: 'Snapshot',
                snapshot: this.snapshot(contest),
              } satisfies ServerFrame),
            )
            this.broadcastPresence()
            // oxlint-disable-next-line unicorn/no-null -- Workerd requires no HTTP body for a WebSocket upgrade.
            return new Response(null, { status: 101, webSocket: client })
          })
        if (url.pathname.endsWith('/snapshot') && request.method === 'GET')
          return Response.json(this.snapshot(contest), { headers: { 'Cache-Control': 'no-store' } })
        if (!editor) return failure('auth.readOnly', 403)
        if (url.pathname.endsWith('/links') && request.method === 'GET') {
          const link = (role: keyof typeof contest.stored.tokens) =>
            url.origin +
            '/view/' +
            contest.stored.definition.id +
            '/' +
            role +
            '?token=' +
            encodeURIComponent(contest.stored.tokens[role])
          const links: ReadLinks = {
            stage: link('stage'),
            announcer: link('announcer'),
            results: link('results'),
          }
          return Response.json(links, { headers: { 'Cache-Control': 'no-store' } })
        }
        if (url.pathname.endsWith('/commands') && request.method === 'POST') {
          const input = yield* body(request)
          const frame = yield* Schema.decodeUnknownEffect(ClientFrame)(input).pipe(
            Effect.mapError((cause) => new InvalidActorRequest({ cause })),
          )
          if (frame._tag !== 'Submit') return failure('request.invalid', 400)
          return yield* io(() => {
            // Read again after body I/O. Another accepted command can arrive during that wait.
            const latest = this.load()
            if (Option.isNone(latest)) return failure('request.notFound', 404)
            const result = this.accept(latest.value, frame.command)
            return Response.json(result, {
              status: result._tag === 'Rejected' ? 422 : 200,
              headers: { 'Cache-Control': 'no-store' },
            })
          })
        }
        return failure('request.notFound', 404)
      }),
    )
  }
  override webSocketMessage(socket: WebSocket, message: string | ArrayBuffer) {
    return Effect.gen({ self: this }, function* () {
      const attachment = yield* io(() =>
        Schema.decodeUnknownSync(SocketAttachment)(socket.deserializeAttachment()),
      )
      const input = yield* Effect.try({
        try: () =>
          typeof message === 'string'
            ? JSON.parse(message)
            : JSON.parse(new TextDecoder().decode(message)),
        catch: (cause) => new InvalidActorRequest({ cause }),
      })
      const frame = yield* Schema.decodeUnknownEffect(ClientFrame)(input).pipe(
        Effect.mapError((cause) => new InvalidActorRequest({ cause })),
      )
      if (frame._tag === 'Signal') {
        // Negotiation text is not a contest change, so read-only screens may send it.
        yield* io(() => {
          for (const target of this.ctx.getWebSockets()) {
            const other = this.attachment(target)
            if (Option.isSome(other) && other.value.device === frame.to)
              this.send(target, {
                _tag: 'Signal',
                from: attachment.device,
                role: attachment.access,
                payload: frame.payload,
              })
          }
        })
        return Option.none<ServerFrame>()
      }
      if (attachment.access !== 'editor')
        return Option.some<ServerFrame>({ _tag: 'Failure', code: 'auth.readOnly' })
      return yield* io(() => {
        const loaded = this.load()
        return Option.some<ServerFrame>(
          Option.isNone(loaded)
            ? { _tag: 'Failure', code: 'request.notFound' }
            : this.accept(loaded.value, frame.command),
        )
      })
    }).pipe(
      Effect.catchTags({
        ActorFailure: () =>
          Effect.succeedSome<ServerFrame>({ _tag: 'Failure', code: 'request.failed' }),
        InvalidActorRequest: () =>
          Effect.succeedSome<ServerFrame>({ _tag: 'Failure', code: 'request.invalid' }),
      }),
      Effect.flatMap((frame) =>
        io(() => {
          if (Option.isSome(frame)) this.send(socket, frame.value)
        }),
      ),
      Effect.catchTag('ActorFailure', () =>
        Effect.sync(() => socket.close(1011, 'Connection failed')),
      ),
      Effect.asVoid,
      Effect.runPromise,
    )
  }
  override webSocketClose(socket: WebSocket) {
    this.broadcastPresence(socket)
    socket.close()
  }
}

export class ContestCatalogDO extends DurableObject {
  override fetch(request: Request) {
    return runResponse(
      Effect.gen({ self: this }, function* () {
        if (request.headers.get(editorHeader) !== '1') return failure('auth.required', 401)
        yield* io(() =>
          this.ctx.storage.sql.exec(
            'CREATE TABLE IF NOT EXISTS contests (id TEXT PRIMARY KEY, data TEXT NOT NULL)',
          ),
        )
        if (request.method === 'POST') {
          const input = yield* body(request)
          const summary = yield* Schema.decodeUnknownEffect(ContestSummary)(input).pipe(
            Effect.mapError((cause) => new InvalidActorRequest({ cause })),
          )
          yield* io(() =>
            this.ctx.storage.sql.exec(
              'INSERT INTO contests(id, data) VALUES (?, ?) ON CONFLICT(id) DO UPDATE SET data = excluded.data',
              summary.id,
              JSON.stringify(summary),
            ),
          )
          return Response.json({ registered: true })
        }
        return yield* io(() => {
          const contests = this.ctx.storage.sql
            .exec<{ data: string }>(
              "SELECT data FROM contests ORDER BY json_extract(data, '$.date') DESC, id",
            )
            .toArray()
            .map((row) => Schema.decodeUnknownSync(ContestSummary)(JSON.parse(row.data)))
          const catalog: typeof Catalog.Type = { contests }
          return Response.json(catalog, { headers: { 'Cache-Control': 'no-store' } })
        })
      }),
    )
  }
}
