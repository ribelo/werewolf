import { env, runDurableObjectAlarm, runInDurableObject, SELF } from 'cloudflare:test'
import {
  client2026Rulebook,
  Command,
  individualRankings,
  replay,
  teamRankings,
} from '@werewolf/core'
import { ReadLinks, Snapshot } from '@werewolf/sync'
import * as Result from 'effect/Result'
import * as Schema from 'effect/Schema'
import { expect, it } from 'vitest'

declare global {
  namespace Cloudflare {
    interface Env {
      CONTESTS: DurableObjectNamespace
      BACKUPS: R2Bucket
    }
  }
}
const origin = 'https://app.example'
async function organizer() {
  const response = await SELF.fetch(origin + '/api/session', {
    method: 'POST',
    headers: { Origin: origin, 'Content-Type': 'application/json' },
    body: JSON.stringify({ password: 'test-password' }),
  })
  return (response.headers.get('Set-Cookie') ?? '').split(';')[0] ?? ''
}
const decode = Schema.decodeUnknownSync(Command)
async function seed(cookie: string) {
  const id = crypto.randomUUID()
  const headers = { Origin: origin, Cookie: cookie, 'Content-Type': 'application/json' }
  await SELF.fetch(origin + '/api/contests', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      id,
      name: 'Backup contest',
      date: '2026-10-08',
      rulebook: client2026Rulebook,
    }),
  })
  const send = (command: unknown) =>
    SELF.fetch(origin + '/api/contests/' + id + '/commands', {
      method: 'POST',
      headers,
      body: JSON.stringify({ _tag: 'Submit', command: decode(command) }),
    })
  await send({ _tag: 'UpsertTeam', id: 'team', at: 1, team: { id: 't1', name: 'Górnik' } })
  for (const [index, name] of ['Anna', 'Bartek'].entries())
    await send({
      _tag: 'AddEntry',
      id: 'add' + index,
      at: 2 + index,
      entry: {
        id: 'e' + index,
        lifter: {
          id: 'l' + index,
          name,
          sex: index === 0 ? 'female' : 'male',
          birthDate: '1990-01-01',
          teamId: 't1',
        },
        bodyweight: 80,
        lotNumber: index + 1,
        divisions: [],
        lifts: [{ liftId: 'bench', openingWeight: 60 + index * 20 }],
      },
    })
  await send({
    _tag: 'SetVerdict',
    id: 'v0',
    at: 10,
    attempt: { entryId: 'e0', liftId: 'bench', number: 1 },
    verdict: 'goodLift',
  })
  await send({
    _tag: 'SetVerdict',
    id: 'v1',
    at: 11,
    attempt: { entryId: 'e1', liftId: 'bench', number: 1 },
    verdict: 'goodLift',
  })
  return { id, headers, cookie }
}
const snapshotOf = async (id: string, cookie: string) =>
  Schema.decodeUnknownSync(Snapshot)(
    await (
      await SELF.fetch(origin + '/api/contests/' + id + '/snapshot', {
        headers: { Cookie: cookie },
      })
    ).json(),
  )
const rankings = (snapshot: Snapshot) => {
  const state = Result.getOrThrow(
    replay(
      snapshot.definition.rulebook,
      snapshot.definition.date,
      snapshot.commands.map((item) => item.command),
    ),
  )
  return { individual: individualRankings(state), teams: teamRankings(state) }
}

it('ww-6ft3: a downloaded backup restores into a new contest with identical rankings', async () => {
  const cookie = await organizer()
  const { id } = await seed(cookie)
  const download = await SELF.fetch(origin + '/api/contests/' + id + '/backup', {
    headers: { Cookie: cookie },
  })
  expect(download.status).toBe(200)
  expect(download.headers.get('Content-Disposition')).toContain('attachment')
  const file = await download.text()
  const restored = await SELF.fetch(origin + '/api/restore', {
    method: 'POST',
    headers: { Origin: origin, Cookie: cookie, 'Content-Type': 'application/json' },
    body: file,
  })
  expect(restored.status).toBe(200)
  const copy = Schema.decodeUnknownSync(Snapshot)(await restored.json())
  expect(copy.definition.id).not.toBe(id)
  const original = await snapshotOf(id, cookie)
  expect(copy.commands).toEqual(original.commands)
  expect(rankings(copy)).toEqual(rankings(original))
  // The new contest is listed and has its own read-only links.
  const catalog = await (
    await SELF.fetch(origin + '/api/contests', { headers: { Cookie: cookie } })
  ).json()
  expect(JSON.stringify(catalog)).toContain(copy.definition.id)
  const links = Schema.decodeUnknownSync(ReadLinks)(
    await (
      await SELF.fetch(origin + '/api/contests/' + copy.definition.id + '/links', {
        headers: { Cookie: cookie },
      })
    ).json(),
  )
  expect(links.stage).toContain(copy.definition.id)
})

it('ww-6ft3: restoring into the same contest replaces its log and keeps its links', async () => {
  const cookie = await organizer()
  const { id, headers } = await seed(cookie)
  const before = await (
    await SELF.fetch(origin + '/api/contests/' + id + '/links', { headers: { Cookie: cookie } })
  ).text()
  const backup = await (
    await SELF.fetch(origin + '/api/contests/' + id + '/backup', { headers: { Cookie: cookie } })
  ).text()
  await SELF.fetch(origin + '/api/contests/' + id + '/commands', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      _tag: 'Submit',
      command: decode({ _tag: 'SetLotNumber', id: 'later', at: 99, entryId: 'e0', lotNumber: 9 }),
    }),
  })
  expect((await snapshotOf(id, cookie)).commands).toHaveLength(6)
  const restored = await SELF.fetch(origin + '/api/contests/' + id + '/restore', {
    method: 'POST',
    headers,
    body: backup,
  })
  expect(restored.status).toBe(200)
  expect((await snapshotOf(id, cookie)).commands).toHaveLength(5)
  expect(
    await (
      await SELF.fetch(origin + '/api/contests/' + id + '/links', { headers: { Cookie: cookie } })
    ).text(),
  ).toBe(before)
})

it('ww-6ft3 ww-n7wy: restore needs the organizer password and a valid backup', async () => {
  const cookie = await organizer()
  const { id, headers } = await seed(cookie)
  const backup = await (
    await SELF.fetch(origin + '/api/contests/' + id + '/backup', { headers: { Cookie: cookie } })
  ).text()
  const anonymous = { Origin: origin, 'Content-Type': 'application/json' }
  expect(
    (
      await SELF.fetch(origin + '/api/restore', {
        method: 'POST',
        headers: anonymous,
        body: backup,
      })
    ).status,
  ).toBe(401)
  expect(
    (
      await SELF.fetch(origin + '/api/contests/' + id + '/restore', {
        method: 'POST',
        headers: anonymous,
        body: backup,
      })
    ).status,
  ).toBe(401)
  expect((await SELF.fetch(origin + '/api/contests/' + id + '/backup')).status).toBe(401)
  // A backup whose log does not replay is refused and the contest stays as it was.
  const broken = JSON.parse(backup)
  broken.commands[1].command.entry.divisions = ['nope']
  const refused = await SELF.fetch(origin + '/api/contests/' + id + '/restore', {
    method: 'POST',
    headers,
    body: JSON.stringify(broken),
  })
  expect(refused.status).toBeGreaterThanOrEqual(400)
  expect((await snapshotOf(id, cookie)).commands).toHaveLength(5)
})

it('ww-edqp: a backup is written to R2 within five minutes of the first command and again only after new commands', async () => {
  const cookie = await organizer()
  const { id, headers } = await seed(cookie)
  const stub = env.CONTESTS.getByName(id)
  const due = await runInDurableObject(stub, (_instance, state) => state.storage.getAlarm())
  expect(due).not.toBeNull()
  expect((due ?? 0) - Date.now()).toBeLessThanOrEqual(5 * 60 * 1000)
  expect(await runDurableObjectAlarm(stub)).toBe(true)
  const prefix = 'contests/' + id + '/'
  const first = await env.BACKUPS.list({ prefix })
  expect(first.objects).toHaveLength(1)
  const stored = Schema.decodeUnknownSync(Snapshot)(
    await (await env.BACKUPS.get(first.objects[0]?.key ?? ''))?.json(),
  )
  expect(stored).toEqual(await snapshotOf(id, cookie))
  // Nothing new: another alarm writes nothing.
  await runDurableObjectAlarm(stub)
  expect((await env.BACKUPS.list({ prefix })).objects).toHaveLength(1)
  await SELF.fetch(origin + '/api/contests/' + id + '/commands', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      _tag: 'Submit',
      command: decode({ _tag: 'SetLotNumber', id: 'again', at: 50, entryId: 'e0', lotNumber: 7 }),
    }),
  })
  expect(
    await runInDurableObject(stub, (_instance, state) => state.storage.getAlarm()),
  ).not.toBeNull()
  await runDurableObjectAlarm(stub)
  expect((await env.BACKUPS.list({ prefix })).objects).toHaveLength(2)
})
