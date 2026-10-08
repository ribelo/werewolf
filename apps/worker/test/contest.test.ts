import { SELF } from 'cloudflare:test'
import { client2026Rulebook, Command, replay } from '@werewolf/core'
import { Catalog, ReadLinks, ServerFrame, Snapshot } from '@werewolf/sync'
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
  socket.addEventListener('message', (event) => {
    const frame = Schema.decodeUnknownSync(Schema.fromJsonString(ServerFrame))(event.data)
    const receiver = waiting.shift()
    if (receiver) receiver(frame)
    else frames.push(frame)
  })
  socket.accept()
  return {
    socket,
    next: () => {
      const frame = frames.shift()
      return frame
        ? Promise.resolve(frame)
        : new Promise<ServerFrame>((resolve) => waiting.push(resolve))
    },
  }
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
          divisions: ['open'],
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
