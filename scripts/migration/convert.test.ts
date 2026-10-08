import {
  individualRankings,
  mcCulloughCoefficient,
  replay,
  reshelCoefficient,
  Kilograms,
  CalendarDate,
} from '@werewolf/core'
import { Snapshot } from '@werewolf/sync'
import * as Result from 'effect/Result'
import * as Schema from 'effect/Schema'
import { expect, it } from 'vitest'
import { convertContest, SourceData } from './convert.ts'

const registration = (
  id: string,
  first: string,
  birth: string,
  bodyweight: number,
  labels: string,
  club: string,
  gender = 'Male',
) => ({
  id,
  competitor_id: 'c-' + id,
  bodyweight,
  rack_height_bench: 6,
  flight_order: Number(id.slice(1)),
  created_at: '2025-10-01T10:00:00.000Z',
  labels,
  first_name: first,
  last_name: 'Tester',
  birth_date: birth,
  gender,
  club,
})
const attempt = (
  reg: string,
  lift: string,
  number: number,
  weight: number,
  status: string,
  minute: number,
) => ({
  id: reg + lift + number,
  registration_id: reg,
  lift_type: lift,
  attempt_number: number,
  weight,
  status,
  timestamp: '2025-11-08T10:' + String(minute).padStart(2, '0') + ':00.000Z',
  created_at: '2025-10-01T10:00:00.000Z',
})
// The old database stores a missing age as NULL.
const absent: unknown = JSON.parse('null')
const source = Schema.decodeUnknownSync(SourceData)({
  contest: {
    id: 'contest-1',
    name: 'TEST  CONTEST',
    date: '2025-11-08',
    mens_bar_weight: 20,
    womens_bar_weight: 20,
    clamp_weight: 2.5,
  },
  tags: [
    { label: 'Open', created_at: '1' },
    { label: 'MONSTER', created_at: '2' },
  ],
  ageCategories: [
    { code: 'T16', name: 'T16', min_age: absent, max_age: 16, sort_order: 1 },
    { code: 'T19', name: 'T19', min_age: 16, max_age: 19, sort_order: 2 },
    { code: 'SENIOR', name: 'Senior', min_age: 24, max_age: 39, sort_order: 4 },
  ],
  weightClasses: [
    { gender: 'Male', code: 'M_95', name: 'Do 95 kg', max_weight: 95, sort_order: 1 },
  ],
  plates: [
    { plate_weight: 25, quantity: 4 },
    { plate_weight: 10, quantity: 6 },
    { plate_weight: 5, quantity: 6 },
    { plate_weight: 2.5, quantity: 6 },
  ],
  registrations: [
    registration('r1', 'Both', '1990-01-01', 90, '["Open"]', 'Górnik'),
    registration('r2', 'BenchOnly', '1990-01-01', 90, '["Open"]', 'GÓRNIK'),
    registration('r3', 'MonsterOnly', '1990-01-01', 90, '["MONSTER"]', 'Górnik'),
    registration('r4', 'Light', '1990-01-01', 60, '[]', '', 'Female'),
    registration('r5', 'NoShow', '1990-01-01', 90, '["Open"]', ''),
  ],
  lifts: [
    { registration_id: 'r1', lift_type: 'Bench' },
    { registration_id: 'r1', lift_type: 'Deadlift' },
    { registration_id: 'r2', lift_type: 'Bench' },
    { registration_id: 'r3', lift_type: 'Bench' },
    { registration_id: 'r4', lift_type: 'Bench' },
    { registration_id: 'r5', lift_type: 'Bench' },
  ],
  attempts: [
    attempt('r1', 'Bench', 1, 100, 'Successful', 1),
    attempt('r1', 'Bench', 2, 105, 'Failed', 2),
    attempt('r1', 'Bench', 3, 105, 'Successful', 3),
    attempt('r1', 'Deadlift', 1, 150, 'Successful', 4),
    attempt('r1', 'Deadlift', 2, 160, 'Failed', 5),
    attempt('r1', 'Deadlift', 3, 160, 'Pending', 6),
    attempt('r2', 'Bench', 1, 120, 'Successful', 7),
    attempt('r3', 'Bench', 1, 200, 'Successful', 8),
    attempt('r4', 'Bench', 1, 20, 'Successful', 9),
    attempt('r5', 'Bench', 1, 20, 'Failed', 10),
    attempt('r5', 'Bench', 2, 20, 'Failed', 11),
    attempt('r5', 'Bench', 3, 20, 'Failed', 12),
  ],
})

it('ww-zchn: a 2025 contest converts to a log that replays with the old scoring and its recorded facts', () => {
  const conversion = convertContest(source)
  const backup = Schema.decodeUnknownSync(Snapshot)(conversion.backup)
  expect(backup.definition.name).toBe('TEST CONTEST')
  const state = Result.getOrThrow(
    replay(
      backup.definition.rulebook,
      backup.definition.date,
      backup.commands.map((c) => c.command),
    ),
  )
  // Every registration and attempt arrived; a pending attempt keeps its weight without a verdict.
  expect(state.entries).toHaveLength(5)
  expect(state.attempts.filter((a) => a._tag !== 'Unannounced')).toHaveLength(9)
  // Three burned 20 kg attempts became DNS, not three failed lifts.
  expect(state.didNotStart).toEqual([{ entryId: 'r5', liftId: 'bench' }])
  expect(conversion.didNotStart).toBe(1)
  expect(
    state.attempts.find((a) => a.entryId === 'r1' && a.liftId === 'deadlift' && a.number === 3)
      ?._tag,
  ).toBe('Declared')
  // "Górnik" and "GÓRNIK" are one team; a lifter without a label is in Open.
  expect(state.teams.map((team) => team.name)).toEqual(['Górnik'])
  expect(state.entries.find((entry) => entry.id === 'r4')?.divisions).toEqual(['open'])
  // The 2025 total adds the points of the lifts done: bench 105 + deadlift 150, one coefficient.
  const open = individualRankings(state).find((ranking) => ranking.classificationId === 'open')
  const coefficient =
    reshelCoefficient(Schema.decodeSync(Kilograms)(90), 'male') *
    mcCulloughCoefficient(Schema.decodeSync(CalendarDate)('1990-01-01'), backup.definition.date)
  const first = open?.groups[0]?.rows[0]
  expect(first?.entry.id).toBe('r1')
  expect(first?.points).toBeCloseTo((105 + 150) * coefficient, 6)
  // A MONSTER-only lifter is not in the Open ranking.
  expect(open?.groups.flatMap((group) => group.rows).map((row) => row.entry.id)).toEqual([
    'r1',
    'r2',
    'r4',
  ])
  // A woman's 20 kg opening needs the 15 kg women's bar (bar + two clamps); the change is reported, clamps stay.
  expect(conversion.adjustments).toHaveLength(1)
  expect(backup.definition.rulebook.barbell.bars.female).toBe(15)
  expect(backup.definition.rulebook.barbell.clampsPerSide).toBe(2.5)
})

it('ww-zchn: converting the same data twice gives the same file, so an upload can be repeated', () => {
  expect(JSON.stringify(convertContest(source).backup)).toBe(
    JSON.stringify(convertContest(source).backup),
  )
})
