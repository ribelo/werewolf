import { SELF } from 'cloudflare:test'
import { client2026Rulebook, Command, replay } from '@werewolf/core'
import {
  Catalog,
  ContestReplica,
  ReadLinks,
  ReplicaState,
  ServerFrame,
  Snapshot,
} from '@werewolf/sync'
import * as Result from 'effect/Result'
import * as Schema from 'effect/Schema'
import { expect, it } from 'vitest'

const origin = 'https://app.example'
async function organizer() {
  const response = await SELF.fetch(origin + '/api/session', {
    method: 'POST',
    headers: { Origin: origin, 'Content-Type': 'application/json' },
    body: JSON.stringify({ password: 'test-password' }),
  })
  expect(response.status).toBe(200)
  return (response.headers.get('Set-Cookie') ?? '').split(';')[0] ?? ''
}
async function open(path: string, cookie: string) {
  const response = await SELF.fetch(path, {
    headers: { Upgrade: 'websocket', Origin: origin, Cookie: cookie },
  })
  expect(response.status).toBe(101)
  const socket = response.webSocket
  if (!socket) throw new Error('Expected a workerd WebSocket upgrade')
  const frames: Array<ServerFrame> = []
  const waiting: Array<(frame: ServerFrame) => void> = []
  const peerFrames: Array<ServerFrame> = []
  const peerWaiting: Array<(frame: ServerFrame) => void> = []
  socket.addEventListener('message', (event) => {
    const frame = Schema.decodeUnknownSync(Schema.fromJsonString(ServerFrame))(event.data)
    const peer = frame._tag === 'Signal' || frame._tag === 'Presence'
    const receiver = (peer ? peerWaiting : waiting).shift()
    if (receiver) receiver(frame)
    else (peer ? peerFrames : frames).push(frame)
  })
  socket.accept()
  return {
    socket,
    /** Presence and signalling frames, kept apart from the ordered contest log. */
    nextPeer: (): Promise<ServerFrame> => {
      const frame = peerFrames.shift()
      return frame
        ? Promise.resolve(frame)
        : new Promise<ServerFrame>((resolve) => peerWaiting.push(resolve))
    },
    next: async (sequence = 0): Promise<ServerFrame> => {
      // An issuer can receive both its broadcast and its idempotent acknowledgement.
      for (;;) {
        const frame =
          frames.shift() ?? (await new Promise<ServerFrame>((resolve) => waiting.push(resolve)))
        if (frame._tag !== 'Accepted' || frame.sequence >= sequence) return frame
      }
    },
  }
}

function accept(replica: ContestReplica, frame: ServerFrame): ContestReplica {
  if (frame._tag === 'Failure' || frame._tag === 'Signal' || frame._tag === 'Presence')
    throw new Error('Expected a replica frame')
  return Result.getOrThrow(replica.receive(frame))
}

it('ww-bdzb ww-uewf: two workerd clients receive the ordered core log and capability clients cannot write', async () => {
  const cookie = await organizer()
  const id = crypto.randomUUID()
  const path = origin + '/api/contests/' + id
  const definition = {
    id,
    name: 'Online integration contest',
    date: '2026-10-08',
    rulebook: client2026Rulebook,
  }
  const create = () =>
    SELF.fetch(origin + '/api/contests', {
      method: 'POST',
      headers: { Origin: origin, Cookie: cookie, 'Content-Type': 'application/json' },
      body: JSON.stringify(definition),
    })
  const created = await create()
  expect(created.status).toBe(201)
  const initial = Schema.decodeUnknownSync(Snapshot)(await created.json())
  expect(initial.commands).toEqual([])
  const retry = await create()
  expect(retry.status).toBe(200)
  expect(Schema.decodeUnknownSync(Snapshot)(await retry.json())).toEqual(initial)
  const catalog = Schema.decodeUnknownSync(Catalog)(
    await (await SELF.fetch(origin + '/api/contests', { headers: { Cookie: cookie } })).json(),
  )
  expect(catalog.contests.filter((contest) => contest.id === id)).toHaveLength(1)
  const links = Schema.decodeUnknownSync(ReadLinks)(
    await (await SELF.fetch(path + '/links', { headers: { Cookie: cookie } })).json(),
  )
  const token = new URL(links.stage).searchParams.get('token') ?? ''
  const readerPath = path + '/events?token=' + token
  expect(
    (await SELF.fetch(path + '/snapshot', { headers: { 'X-Werewolf-Editor': '1' } })).status,
  ).toBe(401)
  expect(
    (
      await SELF.fetch(path + '/events', {
        headers: { Cookie: cookie, Upgrade: 'websocket', Origin: 'https://other.example' },
      })
    ).status,
  ).toBe(403)
  const writer = await open(path + '/events', cookie)
  const reader = await open(readerPath, '')
  try {
    expect(await writer.next()).toEqual({ _tag: 'Snapshot', snapshot: initial })
    expect(await reader.next()).toEqual({ _tag: 'Snapshot', snapshot: initial })
    const rawCommands = [
      {
        _tag: 'AddEntry',
        id: 'entry-command',
        at: 11111,
        entry: {
          id: 'entry',
          lifter: { id: 'lifter', name: 'Ada Example', sex: 'male', birthDate: '1990-01-01' },
          bodyweight: 80,
          lotNumber: 1,
          divisions: [],
          lifts: [{ liftId: 'bench' }],
        },
      },
      {
        _tag: 'SetWeight',
        id: 'weight-command',
        at: 22222,
        attempt: { entryId: 'entry', liftId: 'bench', number: 1 },
        weight: 50,
      },
      {
        _tag: 'SetVerdict',
        id: 'verdict-command',
        at: 33333,
        attempt: { entryId: 'entry', liftId: 'bench', number: 1 },
        verdict: 'goodLift',
      },
    ]
    const commands = rawCommands.map((command) => Schema.decodeUnknownSync(Command)(command))
    for (const [index, command] of commands.entries()) {
      const started = performance.now()
      writer.socket.send(JSON.stringify({ _tag: 'Submit', command }))
      expect(await reader.next()).toEqual({ _tag: 'Accepted', sequence: index + 1, command })
      expect(performance.now() - started).toBeLessThan(200)
    }
    const stored = Schema.decodeUnknownSync(Snapshot)(
      await (await SELF.fetch(path + '/snapshot?token=' + token)).json(),
    )
    expect(stored.commands.map((item) => item.sequence)).toEqual([1, 2, 3])
    expect(stored.commands.map((item) => item.command)).toEqual(commands)
    const state = Result.getOrThrow(
      replay(
        stored.definition.rulebook,
        stored.definition.date,
        stored.commands.map((item) => item.command),
      ),
    )
    expect(state.attempts[0]).toMatchObject({
      _tag: 'Judged',
      weight: 50,
      verdict: 'goodLift',
      achievedAt: 33333,
      sequence: 3,
    })
    const submit = (command: object, query = '', headers: Record<string, string> = {}) =>
      SELF.fetch(path + '/commands' + query, {
        method: 'POST',
        headers: { Origin: origin, Cookie: cookie, 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify({ _tag: 'Submit', command }),
      })
    const rejectedCommand = {
      _tag: 'SetWeight',
      id: 'bad-weight-command',
      at: 44444,
      attempt: { entryId: 'entry', liftId: 'bench', number: 2 },
      weight: 51,
    }
    const rejected = await submit(rejectedCommand)
    expect(rejected.status).toBe(422)
    expect(await rejected.json()).toEqual({
      _tag: 'Rejected',
      commandId: 'bad-weight-command',
      reason: 'UnloadableWeight',
    })
    const duplicate = await submit(rawCommands[0] ?? {})
    expect(duplicate.status).toBe(200)
    expect(await duplicate.json()).toEqual({ _tag: 'Accepted', sequence: 1, command: commands[0] })
    expect(
      (await submit(rejectedCommand, '?token=' + token, { 'X-Werewolf-Editor': '1' })).status,
    ).toBe(403)
    reader.socket.send(JSON.stringify({ _tag: 'Submit', command: rejectedCommand }))
    expect(await reader.next()).toEqual({ _tag: 'Failure', code: 'auth.readOnly' })
    const late = await open(readerPath, '')
    try {
      expect(await late.next()).toEqual({ _tag: 'Snapshot', snapshot: stored })
      const later = Schema.decodeSync(Command)({
        _tag: 'SetWeight',
        id: 'later-command',
        at: 55555,
        attempt: { entryId: 'entry', liftId: 'bench', number: 2 },
        weight: 55,
      })
      writer.socket.send(JSON.stringify({ _tag: 'Submit', command: later }))
      expect(await late.next()).toEqual({ _tag: 'Accepted', sequence: 4, command: later })
      expect(await reader.next()).toEqual({ _tag: 'Accepted', sequence: 4, command: later })
      const after = Schema.decodeUnknownSync(Snapshot)(
        await (await SELF.fetch(path + '/snapshot', { headers: { Cookie: cookie } })).json(),
      )
      expect(after.commands).toHaveLength(4)
    } finally {
      late.socket.close()
    }
  } finally {
    writer.socket.close()
    reader.socket.close()
  }
})

it('ww-mned ww-yo7x ww-gouf: offline queues converge by server order, not client clocks', async () => {
  const cookie = await organizer()
  const path = origin + '/api/contests/' + crypto.randomUUID()
  const created = await SELF.fetch(origin + '/api/contests', {
    method: 'POST',
    headers: { Origin: origin, Cookie: cookie, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      id: path.split('/').at(-1),
      name: 'Offline integration contest',
      date: '2026-10-08',
      rulebook: client2026Rulebook,
    }),
  })
  expect(created.status).toBe(201)
  const post = (command: Command) =>
    SELF.fetch(path + '/commands', {
      method: 'POST',
      headers: { Origin: origin, Cookie: cookie, 'Content-Type': 'application/json' },
      body: JSON.stringify({ _tag: 'Submit', command }),
    })
  await post(
    Schema.decodeSync(Command)({
      _tag: 'AddEntry',
      id: 'start',
      at: 100,
      entry: {
        id: 'entry',
        lifter: { id: 'lifter', name: 'Offline Lifter', sex: 'male', birthDate: '1990-01-01' },
        bodyweight: 80,
        lotNumber: 1,
        divisions: [],
        lifts: [{ liftId: 'bench' }],
      },
    }),
  )
  const snapshot = Schema.decodeUnknownSync(Snapshot)(
    await (await SELF.fetch(path + '/snapshot', { headers: { Cookie: cookie } })).json(),
  )
  const links = Schema.decodeUnknownSync(ReadLinks)(
    await (await SELF.fetch(path + '/links', { headers: { Cookie: cookie } })).json(),
  )
  const stage = new URL(links.stage)
  const reader = await open(path + '/events?token=' + (stage.searchParams.get('token') ?? ''), '')
  const editor = await open(path + '/events', cookie)
  let desk = Result.getOrThrow(
    ContestReplica.restore({ snapshot, pending: [], heard: [], rejected: [] }),
  )
  let remote = accept(desk, await editor.next())
  let screen = accept(desk, await reader.next())
  try {
    // The offline desk has no connection. Its twenty changes are durable serializable state.
    for (let index = 0; index < 20; index++) {
      desk = Result.getOrThrow(
        desk.enqueue(
          Schema.decodeSync(Command)({
            _tag: 'SetBodyweight',
            id: 'offline-' + index,
            at: 2_000_000_000 + index,
            entryId: 'entry',
            bodyweight: 81 + index,
          }),
        ),
      )
    }
    expect(desk.state.pending).toHaveLength(20)
    const saved = Schema.encodeSync(Schema.fromJsonString(ReplicaState))(desk.state)
    const changes = [
      { _tag: 'SetLotNumber', id: 'remote-lot', at: 1, entryId: 'entry', lotNumber: 7 },
      { _tag: 'SetBodyweight', id: 'remote-weight', at: 2, entryId: 'entry', bodyweight: 90 },
    ].map((command) => Schema.decodeUnknownSync(Command)(command))
    for (const [index, command] of changes.entries()) {
      editor.socket.send(JSON.stringify({ _tag: 'Submit', command }))
      remote = accept(remote, await editor.next(index + 2))
      screen = accept(screen, await reader.next())
    }
    desk = Result.getOrThrow(
      ContestReplica.restore(Schema.decodeSync(Schema.fromJsonString(ReplicaState))(saved)),
    )
    const reconnected = await open(path + '/events', cookie)
    try {
      // Receive the authoritative snapshot before submitting any pending command.
      desk = accept(desk, await reconnected.next())
      expect(desk.journal.state.entries[0]).toMatchObject({ bodyweight: 100, lotNumber: 7 })
      const pending = desk.state.pending
      for (const [index, command] of pending.entries()) {
        reconnected.socket.send(JSON.stringify({ _tag: 'Submit', command }))
        const acknowledgement = await reconnected.next(index + 4)
        expect(acknowledgement).toEqual({ _tag: 'Accepted', sequence: index + 4, command })
        desk = accept(desk, acknowledgement)
        remote = accept(remote, await editor.next(index + 4))
        screen = accept(screen, await reader.next())
      }
      expect(desk.state.pending).toEqual([])
      expect(desk.journal.state.entries[0]).toMatchObject({ bodyweight: 100, lotNumber: 7 })
      // The last server acceptance wins even when its client clock is earlier.
      const last = Schema.decodeSync(Command)({
        _tag: 'SetBodyweight',
        id: 'last',
        at: 0,
        entryId: 'entry',
        bodyweight: 91,
      })
      editor.socket.send(JSON.stringify({ _tag: 'Submit', command: last }))
      remote = accept(remote, await editor.next(24))
      screen = accept(screen, await reader.next())
      desk = accept(desk, await reconnected.next(24))
      expect(desk.journal.state.entries[0]).toMatchObject({ bodyweight: 91, lotNumber: 7 })
      expect(remote.state.snapshot).toEqual(desk.state.snapshot)
      expect(screen.journal.state).toEqual(desk.journal.state)
      reconnected.socket.close()
      // Acceptance with a lost client acknowledgement must not create a duplicate on reconnect.
      const unacknowledged = Schema.decodeSync(Command)({
        _tag: 'SetLotNumber',
        id: 'lost-ack',
        at: 3,
        entryId: 'entry',
        lotNumber: 9,
      })
      desk = Result.getOrThrow(desk.enqueue(unacknowledged))
      expect((await post(unacknowledged)).status).toBe(200)
      remote = accept(remote, await editor.next(25))
      screen = accept(screen, await reader.next())
      const recovered = await open(path + '/events', cookie)
      try {
        desk = accept(desk, await recovered.next())
        expect(desk.state.pending).toEqual([])
        expect(desk.state.snapshot.commands).toHaveLength(25)
        expect(desk.journal.state.entries[0]).toMatchObject({ bodyweight: 91, lotNumber: 9 })
        expect(desk.journal.state).toEqual(remote.journal.state)
        expect(desk.journal.state).toEqual(screen.journal.state)
      } finally {
        recovered.socket.close()
      }
    } finally {
      reconnected.socket.close()
    }
  } finally {
    editor.socket.close()
    reader.socket.close()
  }
})

it('ww-bjq1: peers negotiate through the actor with server-stamped roles and hear commands without duplicates', async () => {
  const cookie = await organizer()
  const id = crypto.randomUUID()
  const path = origin + '/api/contests/' + id
  const created = await SELF.fetch(origin + '/api/contests', {
    method: 'POST',
    headers: { Origin: origin, Cookie: cookie, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      id,
      name: 'Peer contest',
      date: '2026-10-08',
      rulebook: client2026Rulebook,
    }),
  })
  expect(created.status).toBe(201)
  const post = (command: Command) =>
    SELF.fetch(path + '/commands', {
      method: 'POST',
      headers: { Origin: origin, Cookie: cookie, 'Content-Type': 'application/json' },
      body: JSON.stringify({ _tag: 'Submit', command }),
    })
  expect(
    (
      await post(
        Schema.decodeSync(Command)({
          _tag: 'AddEntry',
          id: 'start',
          at: 100,
          entry: {
            id: 'entry',
            lifter: { id: 'lifter', name: 'Peer Lifter', sex: 'male', birthDate: '1990-01-01' },
            bodyweight: 80,
            lotNumber: 1,
            divisions: [],
            lifts: [{ liftId: 'bench' }],
          },
        }),
      )
    ).status,
  ).toBe(200)
  const snapshot = Schema.decodeUnknownSync(Snapshot)(
    await (await SELF.fetch(path + '/snapshot', { headers: { Cookie: cookie } })).json(),
  )
  const links = Schema.decodeUnknownSync(ReadLinks)(
    await (await SELF.fetch(path + '/links', { headers: { Cookie: cookie } })).json(),
  )
  const token = new URL(links.announcer).searchParams.get('token') ?? ''
  const desk = await open(path + '/events?device=desk-device-1', cookie)
  const second = await open(path + '/events?device=desk-device-2', cookie)
  const screen = await open(path + '/events?device=screen-device-1&token=' + token, '')
  try {
    for (const device of [desk, second, screen])
      expect(await device.next()).toMatchObject({ _tag: 'Snapshot' })
    // Every device learns who else is present, from the actor, not from itself.
    let presence = await screen.nextPeer()
    while (presence._tag !== 'Presence' || presence.devices.length < 3)
      presence = await screen.nextPeer()
    expect(presence.devices.map((item) => item.device).toSorted()).toEqual([
      'desk-device-1',
      'desk-device-2',
      'screen-device-1',
    ])
    expect(presence.devices.find((item) => item.device === 'screen-device-1')?.role).toBe('viewer')
    desk.socket.send(JSON.stringify({ _tag: 'Signal', to: 'screen-device-1', payload: 'offer' }))
    let signal = await screen.nextPeer()
    while (signal._tag !== 'Signal') signal = await screen.nextPeer()
    expect(signal).toEqual({
      _tag: 'Signal',
      from: 'desk-device-1',
      role: 'editor',
      payload: 'offer',
    })
    // A read-only screen may negotiate, and the actor labels it read-only.
    screen.socket.send(JSON.stringify({ _tag: 'Signal', to: 'desk-device-1', payload: 'answer' }))
    let answer = await desk.nextPeer()
    while (answer._tag !== 'Signal') answer = await desk.nextPeer()
    expect(answer).toMatchObject({ from: 'screen-device-1', role: 'viewer' })
    // Read-only screens cannot write, whatever they send.
    screen.socket.send(
      JSON.stringify({
        _tag: 'Submit',
        command: { _tag: 'ResetOrder', id: 'forbidden', at: 1 },
      }),
    )
    expect(await screen.next()).toEqual({ _tag: 'Failure', code: 'auth.readOnly' })

    // The desk is offline from the actor but reaches the screen and the second desk directly.
    let deskReplica = Result.getOrThrow(
      ContestReplica.restore({ snapshot, pending: [], heard: [], rejected: [] }),
    )
    const change = Schema.decodeSync(Command)({
      _tag: 'SetBodyweight',
      id: 'peer-weight',
      at: 5,
      entryId: 'entry',
      bodyweight: 85,
    })
    deskReplica = Result.getOrThrow(deskReplica.enqueue(change))
    const restore = () =>
      Result.getOrThrow(ContestReplica.restore({ snapshot, pending: [], heard: [], rejected: [] }))
    let screenReplica = restore()
    let secondReplica = restore()
    for (const delivery of [deskReplica.outbox, deskReplica.outbox]) {
      const heard = screenReplica.hear(delivery)
      screenReplica = heard.replica
    }
    expect(screenReplica.state.heard).toEqual([change])
    expect(screenReplica.journal.state.entries[0]?.bodyweight).toBe(85)
    // The screen passes news on; the second desk hears it once whoever sends it.
    secondReplica = secondReplica.hear(screenReplica.outbox).replica
    expect(secondReplica.hear(deskReplica.outbox).fresh).toEqual([])
    expect(secondReplica.state.heard).toEqual([change])

    // The internet returns while peers stay connected: both desks relay the same command.
    for (const socket of [desk.socket, second.socket])
      socket.send(JSON.stringify({ _tag: 'Submit', command: change }))
    expect(await desk.next(2)).toMatchObject({ _tag: 'Accepted', sequence: 2 })
    expect(await second.next(2)).toMatchObject({ _tag: 'Accepted', sequence: 2 })
    const accepted = await screen.next()
    screenReplica = accept(screenReplica, accepted)
    secondReplica = accept(secondReplica, await second.next(2))
    expect(screenReplica.state.heard).toEqual([])
    expect(screenReplica.state.snapshot.commands).toHaveLength(2)
    expect(secondReplica.journal.state).toEqual(screenReplica.journal.state)
    const final = Schema.decodeUnknownSync(Snapshot)(
      await (await SELF.fetch(path + '/snapshot', { headers: { Cookie: cookie } })).json(),
    )
    expect(final.commands.map((item) => item.command.id)).toEqual(['start', 'peer-weight'])
  } finally {
    desk.socket.close()
    second.socket.close()
    screen.socket.close()
  }
})

it('ww-l06a ww-8tai: a screen that connects late receives the pushed filter and QR with the snapshot', async () => {
  const cookie = await organizer()
  const id = crypto.randomUUID()
  const path = origin + '/api/contests/' + id
  const headers = { Origin: origin, Cookie: cookie, 'Content-Type': 'application/json' }
  await SELF.fetch(origin + '/api/contests', {
    method: 'POST',
    headers,
    body: JSON.stringify({ id, name: 'Board', date: '2026-10-08', rulebook: client2026Rulebook }),
  })
  const push = await SELF.fetch(path + '/commands', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      _tag: 'Submit',
      command: {
        _tag: 'SetScoreboard',
        id: 'board',
        at: 1,
        filter: { divisionId: 'mundurowi' },
        qrUrl: 'https://app.example/view/' + id + '/results?token=public',
      },
    }),
  })
  expect(push.status).toBe(200)
  const links = Schema.decodeUnknownSync(ReadLinks)(
    await (await SELF.fetch(path + '/links', { headers: { Cookie: cookie } })).json(),
  )
  const token = new URL(links.scoreboard).searchParams.get('token') ?? ''
  const late = await open(path + '/events?token=' + token, '')
  try {
    const frame = await late.next()
    if (frame._tag !== 'Snapshot') throw new Error('Expected a snapshot')
    const replica = Result.getOrThrow(
      ContestReplica.restore({ snapshot: frame.snapshot, pending: [], heard: [], rejected: [] }),
    )
    const board = replica.journal.state.scoreboard
    expect(board.filter).toEqual({ divisionId: 'mundurowi' })
    expect(board.qrUrl._tag).toBe('Some')
  } finally {
    late.socket.close()
  }
})
