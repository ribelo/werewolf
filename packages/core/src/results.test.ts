import * as Option from 'effect/Option'
import * as Result from 'effect/Result'
import * as Schema from 'effect/Schema'
import { describe, expect, it } from 'vitest'
import {
  CalendarDate,
  Kilograms,
  entryResults,
  entryWeightClass,
  individualRankings,
  mcCulloughCoefficient,
  parseCommand,
  parseRulebook,
  replay,
  reshelCoefficient,
  type Command,
  type ContestState,
  type Rulebook,
} from './index.ts'

const name = { pl: 'Własna', en: 'Custom' }
const classification = {
  name,
  kind: 'individual',
  membership: { kind: 'divisions', ids: ['open'] },
  liftIds: ['upper'],
  result: 'best',
  formula: 'kilograms',
  split: 'none',
}
const input = {
  version: 1,
  name,
  lifts: [
    { id: 'upper', name, attempts: 3, rackHeight: false },
    { id: 'lower', name, attempts: 3, rackHeight: false },
  ],
  divisions: [
    { id: 'open', name, policy: 'reject', conditions: {} },
    { id: 'monster', name, policy: 'reject', conditions: {} },
    { id: 'junior', name, policy: 'reject', conditions: { minAge: 7, maxAge: 13 } },
  ],
  ageClasses: [
    { id: 'young', name, from: 7, through: 13 },
    { id: 'adult', name, from: 14 },
  ],
  weightClasses: [
    { id: 'm80', name, sex: 'male', upperInclusive: 80 },
    { id: 'mAbove80', name, sex: 'male', lowerExclusive: 80 },
    { id: 'f64', name, sex: 'female', upperInclusive: 64 },
    { id: 'fAbove64', name, sex: 'female', lowerExclusive: 64 },
  ],
  classifications: [{ ...classification, id: 'open' }],
  barbell: {
    bars: { male: 20, female: 15 },
    clampsPerSide: 0,
    plates: [
      { weight: 25, pairs: 10 },
      { weight: 5, pairs: 8 },
      { weight: 1.25, pairs: 8 },
    ],
  },
}
const date = Schema.decodeSync(CalendarDate)('2025-03-01')
function book(overrides: Readonly<Record<string, unknown>> = {}): Rulebook {
  return Result.getOrThrow(parseRulebook({ ...input, ...overrides }))
}
function command(raw: Readonly<Record<string, unknown>>): Command {
  return Result.getOrThrow(parseCommand({ at: 1, ...raw }))
}
function add(
  id: string,
  lotNumber: number,
  fields: Readonly<Record<string, unknown>> = {},
): Command {
  return command({
    _tag: 'AddEntry',
    id: 'add-' + id,
    entry: {
      id,
      lotNumber,
      lifter: { id: 'lifter-' + id, name: id, sex: 'male', birthDate: '1995-03-01' },
      bodyweight: 80,
      divisions: ['open'],
      lifts: [{ liftId: 'upper', openingWeight: 100 }],
      ...fields,
    },
  })
}
function judge(
  id: string,
  at: number,
  entryId: string,
  liftId = 'upper',
  number = 1,
  verdict = 'goodLift',
): Command {
  return command({ _tag: 'SetVerdict', id, at, attempt: { entryId, liftId, number }, verdict })
}
function state(commands: ReadonlyArray<Command>, rulebook = book()): ContestState {
  return Result.getOrThrow(replay(rulebook, date, commands))
}
function ranking(contest: ContestState, id: string) {
  const selected = individualRankings(contest).find((row) => row.classificationId === id)
  if (!selected) throw new Error('Classification fixture is missing')
  return selected
}
function rows(contest: ContestState, id = 'open') {
  return ranking(contest, id).groups.flatMap((group) => group.rows)
}

describe('individual contest results', () => {
  it('ww-e1fo: kids have no weight class and rank only where their age class is listed', () => {
    const kidsBook = book({
      ageClasses: [
        { id: 'young', name, from: 7, through: 13, kids: true },
        { id: 'adult', name, from: 14 },
      ],
      classifications: [
        { ...classification, id: 'open', membership: { kind: 'all' } },
        { ...classification, id: 'kids', membership: { kind: 'all' }, ageClassIds: ['young'] },
      ],
    })
    const contest = state(
      [
        add('adult', 1),
        add('kid', 2, {
          lifter: { id: 'lifter-kid', name: 'kid', sex: 'male', birthDate: '2015-03-01' },
        }),
        judge('a', 10, 'adult'),
        judge('k', 11, 'kid'),
      ],
      kidsBook,
    )
    expect(rows(contest, 'open').map((row) => row.entry.id)).toEqual(['adult'])
    expect(rows(contest, 'kids').map((row) => row.entry.id)).toEqual(['kid'])
    const kid = contest.entries.find((entry) => entry.id === 'kid')
    if (!kid) throw new Error('kid missing')
    expect(Option.isNone(entryWeightClass(contest, kid))).toBe(true)
  })

  it('ww-m7xy retains best good attempts, requires all total lifts and replays corrections', () => {
    const commands = [
      add('both', 1, {
        lifts: [
          { liftId: 'upper', openingWeight: 100 },
          { liftId: 'lower', openingWeight: 150 },
        ],
      }),
      add('single', 2),
      judge('u1', 100, 'both'),
      command({
        _tag: 'SetWeight',
        id: 'u2w',
        attempt: { entryId: 'both', liftId: 'upper', number: 2 },
        weight: 110,
      }),
      judge('u2', 200, 'both', 'upper', 2, 'noLift'),
      command({
        _tag: 'SetWeight',
        id: 'u3w',
        attempt: { entryId: 'both', liftId: 'upper', number: 3 },
        weight: 90,
      }),
      judge('u3', 250, 'both', 'upper', 3),
      judge('lower', 300, 'both', 'lower'),
      judge('single', 500, 'single'),
    ]
    const rulebook = book({
      classifications: [
        { ...classification, id: 'open' },
        { ...classification, id: 'total', result: 'sum', liftIds: ['upper', 'lower'] },
      ],
    })
    const contest = state(commands, rulebook)
    expect(entryResults(contest)).toMatchObject([
      {
        entry: { id: 'both' },
        lifts: [
          { _tag: 'GoodResult', weight: 100, achievedAt: 100 },
          { _tag: 'GoodResult', weight: 150, achievedAt: 300 },
        ],
      },
      { entry: { id: 'single' }, lifts: [{ _tag: 'GoodResult', weight: 100 }] },
    ])
    expect(rows(contest, 'total')).toMatchObject([{ kilograms: 250, points: 250, achievedAt: 300 }])
    expect(ranking(contest, 'total').pending).toEqual([
      { _tag: 'PendingEntry', entryId: 'single', reason: 'incompleteLifts' },
    ])
    const correction = judge('correct-u1', 9_000, 'both', 'upper', 1, 'noLift')
    expect(rows(state([...commands, correction], rulebook), 'total')).toMatchObject([
      { kilograms: 240, achievedAt: 300 },
    ])
    const undone = state(
      [...commands, correction, command({ _tag: 'Undo', id: 'undo', target: 'correct-u1' })],
      rulebook,
    )
    expect(individualRankings(undone)).toEqual(individualRankings(contest))
  })

  it('ww-90sr ww-sbfk restricts explicit division and lift membership without MONSTER leakage', () => {
    const rulebook = book({
      classifications: [
        { ...classification, id: 'open' },
        { ...classification, id: 'monster', membership: { kind: 'divisions', ids: ['monster'] } },
        { ...classification, id: 'lower', liftIds: ['lower'] },
        { ...classification, id: 'all', membership: { kind: 'all' } },
      ],
    })
    const contest = state(
      [
        add('only-monster', 1, { divisions: ['monster'] }),
        add('open', 2),
        add('lower-only', 3, { lifts: [{ liftId: 'lower', openingWeight: 150 }] }),
        judge('m', 100, 'only-monster'),
        judge('o', 200, 'open'),
        judge('l', 300, 'lower-only', 'lower'),
      ],
      rulebook,
    )
    expect(rows(contest).map((row) => row.entry.id)).toEqual(['open'])
    expect(rows(contest, 'monster').map((row) => row.entry.id)).toEqual(['only-monster'])
    expect(rows(contest, 'lower').map((row) => row.entry.id)).toEqual(['lower-only'])
    expect(rows(contest, 'all').map((row) => row.entry.id)).toEqual(['only-monster', 'open'])
  })

  it('ww-zpeu matches published 2025 coefficients, quarter-kilogram rounding and date boundaries', () => {
    const kg = Schema.decodeSync(Kilograms)
    const day = Schema.decodeSync(CalendarDate)
    expect(reshelCoefficient(kg(82.5), 'male')).toBe(1.029)
    expect(reshelCoefficient(kg(63), 'female')).toBe(1.715)
    expect(reshelCoefficient(kg(80.124), 'male')).toBe(1.054)
    expect(reshelCoefficient(kg(80.125), 'male')).toBe(1.051)
    expect(reshelCoefficient(kg(35), 'male')).toBe(1.955)
    expect(reshelCoefficient(kg(500), 'male')).toBe(0.814)
    expect(reshelCoefficient(kg(164.75), 'male')).toBe(0.821)
    expect(mcCulloughCoefficient(day('1960-03-01'), date)).toBe(1.48)
    expect(mcCulloughCoefficient(day('1960-03-02'), date)).toBe(1.45)
    expect(mcCulloughCoefficient(day('1900-01-01'), date)).toBe(2.549)
    expect(mcCulloughCoefficient(day('2008-01-01'), date)).toBe(1)
    expect(mcCulloughCoefficient(day('1960-02-29'), day('2025-02-28'))).toBe(1.45)
    expect(mcCulloughCoefficient(day('1960-02-29'), date)).toBe(1.48)
    const rulebook = book({
      classifications: [
        { ...classification, id: 'kg' },
        { ...classification, id: 'reshel', formula: 'reshel' },
        { ...classification, id: 'masters', formula: 'reshelMcCullough' },
      ],
    })
    const contest = state(
      [
        add('master', 1, {
          bodyweight: 82.5,
          lifter: { id: 'person', name: 'Person', sex: 'male', birthDate: '1960-03-01' },
        }),
        judge('result', 100, 'master'),
      ],
      rulebook,
    )
    expect(rows(contest, 'kg')).toMatchObject([{ points: 100 }])
    expect(rows(contest, 'reshel')).toMatchObject([{ points: expect.closeTo(102.9, 10) }])
    expect(rows(contest, 'masters')).toMatchObject([{ points: expect.closeTo(152.292, 10) }])
  })

  it('ww-1pjp orders points then bodyweight then actual occurrence time, not arrival order', () => {
    const commands = [
      add('score', 1, { bodyweight: 90, lifts: [{ liftId: 'upper', openingWeight: 110 }] }),
      add('light', 2, { bodyweight: 70 }),
      add('early', 3),
      add('late', 4),
      judge('late', 2_000, 'late'),
      judge('early', 1_000, 'early'),
      judge('score', 5_000, 'score'),
      judge('light', 6_000, 'light'),
    ]
    const contest = state(commands)
    expect(rows(contest).map((row) => [row.entry.id, row.place])).toEqual([
      ['score', 1],
      ['light', 2],
      ['early', 3],
      ['late', 4],
    ])
    const corrected = state([
      ...commands,
      command({
        _tag: 'SetWeight',
        id: 'change-past',
        at: 10_000,
        attempt: { entryId: 'early', liftId: 'upper', number: 1 },
        weight: 110,
      }),
      judge('correct-verdict', 11_000, 'early'),
    ])
    expect(rows(corrected).map((row) => row.entry.id)).toEqual(['early', 'score', 'light', 'late'])
    expect(rows(corrected).map((row) => row.achievedAt)).toEqual([1_000, 5_000, 6_000, 2_000])
  })

  it('ww-90sr uses optional age and weight splits with exact inclusive upper boundaries', () => {
    const rulebook = book({
      classifications: ['none', 'age', 'weight', 'ageAndWeight'].map((split) => ({
        ...classification,
        id: split,
        split,
      })),
    })
    const commands = [
      add('male', 1),
      add('female', 2, {
        bodyweight: 64,
        lifter: { id: 'f', name: 'Female', sex: 'female', birthDate: '2012-03-01' },
        lifts: [{ liftId: 'upper', openingWeight: 95 }],
      }),
      judge('m', 100, 'male'),
      judge('f', 200, 'female'),
    ]
    const contest = state(commands, rulebook)
    expect(ranking(contest, 'none').groups.map((group) => group.bucket)).toEqual([{ _tag: 'All' }])
    expect(ranking(contest, 'age').groups.map((group) => group.bucket)).toEqual([
      { _tag: 'Age', ageClassId: 'adult' },
      { _tag: 'Age', ageClassId: 'young' },
    ])
    expect(ranking(contest, 'weight').groups.map((group) => group.bucket)).toEqual([
      { _tag: 'Weight', weightClassId: 'm80' },
      { _tag: 'Weight', weightClassId: 'f64' },
    ])
    expect(ranking(contest, 'ageAndWeight').groups.map((group) => group.bucket)).toEqual([
      { _tag: 'AgeAndWeight', ageClassId: 'adult', weightClassId: 'm80' },
      { _tag: 'AgeAndWeight', ageClassId: 'young', weightClassId: 'f64' },
    ])
    const changed = state(
      [
        ...commands,
        command({ _tag: 'SetBodyweight', id: 'weigh-again', entryId: 'male', bodyweight: 80.25 }),
      ],
      rulebook,
    )
    expect(ranking(changed, 'weight').groups.map((group) => group.bucket)).toEqual([
      { _tag: 'Weight', weightClassId: 'mAbove80' },
      { _tag: 'Weight', weightClassId: 'f64' },
    ])
    expect(
      Result.isFailure(
        parseRulebook({
          ...input,
          ageClasses: [
            { id: 'one', name, from: 7, through: 14 },
            { id: 'two', name, from: 14 },
          ],
        }),
      ),
    ).toBe(true)
    expect(
      Result.isFailure(
        parseRulebook({
          ...input,
          weightClasses: [
            { id: 'one', name, upperInclusive: 80 },
            { id: 'two', name, lowerExclusive: 79 },
          ],
        }),
      ),
    ).toBe(true)
  })

  it('ww-e1fo configures kids ranges and kilogram scoring only through rulebook data', () => {
    const junior = {
      ...classification,
      id: 'junior',
      membership: { kind: 'divisions', ids: ['junior'] },
      split: 'age',
    }
    const rules = book({ classifications: [junior] })
    const child = add('child', 1, {
      bodyweight: 45,
      divisions: ['junior'],
      lifter: { id: 'child', name: 'Child', sex: 'female', birthDate: '2012-03-01' },
      lifts: [{ liftId: 'upper', openingWeight: 55 }],
    })
    expect(rows(state([child, judge('c', 100, 'child')], rules), 'junior')).toMatchObject([
      { kilograms: 55, points: 55 },
    ])
    const older = add('older', 1, {
      bodyweight: 45,
      divisions: ['junior'],
      lifter: { id: 'older', name: 'Older', sex: 'female', birthDate: '2011-03-01' },
      lifts: [{ liftId: 'upper', openingWeight: 55 }],
    })
    expect(Result.isFailure(replay(rules, date, [older]))).toBe(true)
    const adjusted = book({
      classifications: [junior],
      divisions: input.divisions.map((division) =>
        division.id === 'junior'
          ? { ...division, conditions: { minAge: 8, maxAge: 14 } }
          : division,
      ),
      ageClasses: [
        { id: 'young', name, from: 8, through: 14 },
        { id: 'adult', name, from: 15 },
      ],
    })
    expect(rows(state([older, judge('older', 100, 'older')], adjusted), 'junior')).toMatchObject([
      { points: 55 },
    ])
  })

  it('ww-m7xy ww-90sr exposes genuine pending results without inventing weigh-ins or class matches', () => {
    const unweighed = add('pending', 1, { bodyweight: 80 })
    const failed = state([unweighed, judge('fail', 100, 'pending', 'upper', 1, 'noLift')])
    expect(entryResults(failed)).toMatchObject([{ lifts: [{ _tag: 'NoResult' }] }])
    expect(ranking(failed, 'open').pending).toMatchObject([{ reason: 'noGoodLift' }])
    const rawEntry = {
      id: 'raw',
      lotNumber: 1,
      lifter: { id: 'p', name: 'Person', sex: 'male', birthDate: '1995-03-01' },
      divisions: ['open'],
      lifts: [{ liftId: 'upper', openingWeight: 100 }],
    }
    const commands = [
      command({ _tag: 'AddEntry', id: 'raw', entry: rawEntry }),
      judge('good', 100, 'raw'),
    ]
    const formulas = book({
      classifications: [
        { ...classification, id: 'kg' },
        { ...classification, id: 'reshel', formula: 'reshel' },
      ],
    })
    expect(rows(state(commands, formulas), 'kg')).toMatchObject([{ points: 100 }])
    expect(ranking(state(commands, formulas), 'reshel').pending).toMatchObject([
      { reason: 'bodyweightMissing' },
    ])
    const gaps = book({
      ageClasses: [],
      weightClasses: [],
      classifications: [
        { ...classification, id: 'age', split: 'age' },
        { ...classification, id: 'weight', split: 'weight' },
      ],
    })
    const weighed = state([add('one', 1), judge('one', 100, 'one')], gaps)
    expect(ranking(weighed, 'age').pending).toMatchObject([{ reason: 'ageClassMissing' }])
    expect(ranking(weighed, 'weight').pending).toMatchObject([{ reason: 'weightClassMissing' }])
  })
})
