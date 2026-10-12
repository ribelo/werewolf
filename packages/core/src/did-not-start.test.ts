import * as Option from 'effect/Option'
import * as Result from 'effect/Result'
import * as Schema from 'effect/Schema'
import { describe, expect, it } from 'vitest'
import { Command, ContestJournal, currentAttempt, liftingOrder } from './contest.ts'
import { CalendarDate } from './lifter.ts'
import { client2026Rulebook } from './presets.ts'
import { individualRankings } from './results.ts'
import { federationCsv, individualTable } from './results-export.ts'

const decode = Schema.decodeUnknownSync(Command)
const date = Schema.decodeSync(CalendarDate)('2026-11-14')
const entry = (
  id: string,
  name: string,
  lot: number,
  lifts: ReadonlyArray<readonly [string, number]>,
) =>
  decode({
    _tag: 'AddEntry',
    id: 'add-' + id,
    at: lot,
    entry: {
      id,
      lifter: { id: 'l' + id, name, sex: 'male', birthDate: '1990-01-01' },
      bodyweight: 90,
      lotNumber: lot,
      divisions: [],
      lifts: lifts.map(([liftId, openingWeight]) => ({ liftId, openingWeight })),
    },
  })
const dns = (
  id: string,
  liftId: string,
  value: boolean,
  at: number,
  commandId = 'dns-' + id + liftId + at,
) => decode({ _tag: 'SetDidNotStart', id: commandId, at, entryId: id, liftId, value })
const base = [
  entry('a', 'Anna Absent', 1, [
    ['bench', 60],
    ['deadlift', 100],
  ]),
  entry('b', 'Bartek Both', 2, [
    ['bench', 70],
    ['deadlift', 110],
  ]),
  decode({
    _tag: 'SetVerdict',
    id: 'vb',
    at: 9,
    attempt: { entryId: 'b', liftId: 'bench', number: 1 },
    verdict: 'goodLift',
  }),
]
const run = (extra: ReadonlyArray<Command>) =>
  Result.getOrThrow(ContestJournal.restore(client2026Rulebook, date, [...base, ...extra]))

describe('did not start (DNS)', () => {
  it('ww-9jq6: the entry leaves the lifting order for that lift only, and the next attempt becomes current', () => {
    const before = run([])
    expect(liftingOrder(before.state).map((a) => a.entryId + '/' + a.liftId)).toEqual([
      'a/bench',
      'a/deadlift',
      'b/deadlift',
    ])
    const after = run([dns('a', 'bench', true, 20)])
    expect(liftingOrder(after.state).map((a) => a.entryId + '/' + a.liftId)).toEqual([
      'a/deadlift',
      'b/deadlift',
    ])
    const current = currentAttempt(after.state)
    expect(Option.isSome(current) && current.value.entryId + '/' + current.value.liftId).toBe(
      'a/deadlift',
    )
  })

  it('ww-9jq6: an undo or an explicit false takes the mark back', () => {
    const marked = run([dns('a', 'bench', true, 20, 'mark')])
    const undone = Result.getOrThrow(
      marked.append(decode({ _tag: 'Undo', id: 'u', at: 21, target: 'mark' })),
    )
    expect(liftingOrder(undone.state)).toHaveLength(3)
    const cleared = Result.getOrThrow(marked.append(dns('a', 'bench', false, 22)))
    expect(liftingOrder(cleared.state)).toHaveLength(3)
  })

  it('ww-9jq6: a lifter who was judged did start, and a DNS lift takes no verdict', () => {
    const refused = run([]).append(dns('b', 'bench', true, 30))
    expect(Result.isFailure(refused) && refused.failure._tag).toBe('AttemptUnavailable')
    const marked = run([dns('a', 'bench', true, 20)])
    const verdict = marked.append(
      decode({
        _tag: 'SetVerdict',
        id: 'x',
        at: 40,
        attempt: { entryId: 'a', liftId: 'bench', number: 1 },
        verdict: 'goodLift',
      }),
    )
    expect(Result.isFailure(verdict)).toBe(true)
  })

  it('ww-9jq6: no result and no place in that lift; the table and the federation file say DNS', () => {
    const state = run([dns('a', 'bench', true, 20)]).state
    const bench = individualRankings(state).find((r) => r.classificationId === 'open-bench')
    if (!bench) throw new Error('missing ranking')
    expect(bench.groups.flatMap((g) => g.rows.map((r) => r.entry.id))).toEqual(['b'])
    expect(bench.pending).toEqual([{ _tag: 'PendingEntry', entryId: 'a', reason: 'didNotStart' }])
    const labels = {
      place: 'P',
      name: 'N',
      team: 'T',
      ageClass: 'A',
      weightClass: 'W',
      bodyweight: 'B',
      result: 'R',
      points: 'Pt',
      counted: 'C',
      didNotStart: 'DNS',
    }
    const table = individualTable(state, bench, 'en', labels)
    expect(table.rows.map((row) => row[0])).toEqual(['1', 'DNS'])
    expect(table.rows[1]?.slice(1, 2)).toEqual(['Anna Absent'])
    const csv = federationCsv(state, bench, 'en').split('\n')
    const lines = csv.filter((line) => /^(\d+|DNS);/.test(line))
    expect(lines.map((line) => line.split(';').slice(0, 3).join(';'))).toEqual([
      '1;Bartek;Both',
      'DNS;Anna;Absent',
    ])
    // The other lift is untouched: Anna can still lift the deadlift.
    const deadlift = individualRankings(state).find((r) => r.classificationId === 'open-deadlift')
    expect(deadlift?.pending.some((item) => item.reason === 'didNotStart')).toBe(false)
  })
})
