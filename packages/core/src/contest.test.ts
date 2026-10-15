import { describe, expect, it } from 'vitest'
import * as Option from 'effect/Option'
import * as Result from 'effect/Result'
import * as Schema from 'effect/Schema'
import {
  CalendarDate,
  Kilograms,
  ageOnDate,
  currentAttempt,
  liftingOrder,
  loadBarbell,
  parseCommand,
  parseRulebook,
  replay,
  type Command,
  type ContestState,
  type Rulebook,
} from './index.ts'

const input = {
  version: 1,
  name: { pl: 'Wyciskanie i martwy ciąg', en: 'Bench and deadlift' },
  lifts: [
    { id: 'upper', name: { pl: 'Wyciskanie', en: 'Bench press' }, attempts: 3, rackHeight: true },
    { id: 'lower', name: { pl: 'Martwy ciąg', en: 'Deadlift' }, attempts: 3, rackHeight: false },
  ],
  divisions: [
    { id: 'open', name: { pl: 'Open', en: 'Open' }, policy: 'reject', conditions: {} },
    { id: 'monster', name: { pl: 'MONSTER', en: 'MONSTER' }, policy: 'reject', conditions: {} },
  ],
  ageClasses: [],
  weightClasses: [],
  classifications: [],
  barbell: {
    bars: { male: 20, female: 15 },
    clampsPerSide: 2.5,
    plates: [
      { weight: 25, pairs: 3 },
      { weight: 20, pairs: 4 },
      { weight: 10, pairs: 2 },
      { weight: 5, pairs: 2 },
      { weight: 2.5, pairs: 2 },
      { weight: 1.25, pairs: 2 },
    ],
  },
} as const
const date = Schema.decodeSync(CalendarDate)('2026-10-08')
function book(value: unknown = input): Rulebook {
  return Result.getOrThrow(parseRulebook(value))
}
function command(value: Readonly<Record<string, unknown>>): Command {
  return Result.getOrThrow(parseCommand({ at: 1_000, ...value }))
}
function add(
  id: string,
  lotNumber: number,
  lifts: ReadonlyArray<{ readonly liftId: string; readonly openingWeight: number }> = [
    { liftId: 'upper', openingWeight: 100 },
    { liftId: 'lower', openingWeight: 150 },
  ],
  extra: Readonly<Record<string, unknown>> = {},
): Command {
  return command({
    id: 'add-' + id,
    _tag: 'AddEntry',
    entry: {
      id,
      lifter: { id: 'lifter-' + id, name: 'Person ' + id, sex: 'male', birthDate: '1990-01-01' },
      bodyweight: 80,
      lotNumber,
      divisions: ['open'],
      lifts,
      ...extra,
    },
  })
}
function state(commands: ReadonlyArray<Command>, rulebook: Rulebook = book()): ContestState {
  return Result.getOrThrow(replay(rulebook, date, commands))
}
function ref(
  entryId: string,
  liftId = 'upper',
  number = 1,
): { readonly entryId: string; readonly liftId: string; readonly number: number } {
  return { entryId, liftId, number }
}
function order(value: ContestState): ReadonlyArray<string> {
  return liftingOrder(value).map(
    (attempt) => attempt.entryId + ':' + attempt.liftId + ':' + attempt.number,
  )
}

describe('portable contest core', () => {
  it('ww-s8ny ww-dwfd ww-8fz8 ww-3vpp ww-03e1 replays two lifts, single-lift entries and a curl-only rulebook', () => {
    const combined = state([add('a', 1), add('b', 2, [{ liftId: 'lower', openingWeight: 140 }])])
    expect(combined.attempts).toHaveLength(9)
    expect(order(combined)).toEqual(['a:upper:1', 'b:lower:1', 'a:lower:1'])
    expect(
      combined.attempts
        .filter((attempt) => attempt.entryId === 'b')
        .map((attempt) => attempt.liftId),
    ).toEqual(['lower', 'lower', 'lower'])
    const curl = book({
      ...input,
      lifts: [
        {
          id: 'custom',
          name: { pl: 'Uginanie ramion', en: 'Biceps curl' },
          attempts: 4,
          rackHeight: false,
        },
      ],
    })
    const curled = state([add('c', 1, [{ liftId: 'custom', openingWeight: 30 }])], curl)
    expect(curled.attempts).toHaveLength(4)
    expect(order(curled)).toEqual(['c:custom:1'])
  })

  it('ww-cdxd ww-nmgu ww-y3gt orders configured lifts, rounds, weights and then editable lots', () => {
    const entries = [
      add('a', 2),
      add('b', 1, [
        { liftId: 'upper', openingWeight: 100 },
        { liftId: 'lower', openingWeight: 140 },
      ]),
      add('c', 3, [{ liftId: 'upper', openingWeight: 95 }]),
    ] as const
    expect(order(state(entries))).toEqual([
      'c:upper:1',
      'b:upper:1',
      'a:upper:1',
      'b:lower:1',
      'a:lower:1',
    ])
    const progressed = [
      ...entries,
      command({ id: 'judge-c', _tag: 'SetVerdict', attempt: ref('c'), verdict: 'goodLift' }),
      command({ id: 'next-c', _tag: 'SetWeight', attempt: ref('c', 'upper', 2), weight: 105 }),
    ]
    expect(order(state(progressed))).toEqual([
      'b:upper:1',
      'a:upper:1',
      'c:upper:2',
      'b:lower:1',
      'a:lower:1',
    ])
    const newLot = command({ id: 'lot-b', _tag: 'SetLotNumber', entryId: 'b', lotNumber: 3 })
    expect(order(state([entries[0], entries[1], newLot])).slice(0, 2)).toEqual([
      'a:upper:1',
      'b:upper:1',
    ])
  })

  it('ww-tds3 ww-u0ni ww-adgy ww-z7vp ww-lcu1 honours exceptions, advances after a verdict and corrects past attempts', () => {
    const initial = [add('a', 2), add('b', 1)]
    const moved = [
      ...initial,
      command({
        id: 'move-a',
        _tag: 'MoveAttempt',
        attempt: ref('a'),
        position: { _tag: 'Before', attempt: ref('b') },
      }),
    ]
    expect(order(state(moved)).slice(0, 2)).toEqual(['a:upper:1', 'b:upper:1'])
    const selected = [...moved, command({ id: 'select-b', _tag: 'SetCurrent', attempt: ref('b') })]
    expect(Option.getOrThrow(currentAttempt(state(selected))).entryId).toBe('b')
    const judged = [
      ...selected,
      command({ id: 'judge-b', _tag: 'SetVerdict', attempt: ref('b'), verdict: 'noLift' }),
    ]
    // The judged attempt stays live until the desk sets the next one by hand.
    expect(Option.getOrThrow(currentAttempt(state(judged))).entryId).toBe('b')
    expect(
      Option.getOrThrow(
        currentAttempt(
          state([...judged, command({ id: 'select-a', _tag: 'SetCurrent', attempt: ref('a') })]),
        ),
      ).entryId,
    ).toBe('a')
    // Without any choice the first in order is live, and its verdict pins it too.
    const unpicked = state([
      ...initial,
      command({ id: 'judge-first', _tag: 'SetVerdict', attempt: ref('b'), verdict: 'goodLift' }),
    ])
    expect(Option.getOrThrow(currentAttempt(unpicked)).entryId).toBe('b')
    const corrected = [
      ...judged,
      command({ id: 'correct-b-weight', _tag: 'SetWeight', attempt: ref('b'), weight: 110 }),
      command({
        id: 'correct-b-verdict',
        _tag: 'SetVerdict',
        attempt: ref('b'),
        verdict: 'goodLift',
      }),
      command({ id: 'next-b', _tag: 'SetWeight', attempt: ref('b', 'upper', 2), weight: 115 }),
    ]
    expect(
      state(corrected).attempts.find(
        (attempt) => attempt.entryId === 'b' && attempt.liftId === 'upper' && attempt.number === 1,
      ),
    ).toMatchObject({ _tag: 'Judged', weight: 110, verdict: 'goodLift', sequence: 5 })
    expect(order(state([...corrected, command({ id: 'reset', _tag: 'ResetOrder' })]))[0]).toBe(
      'a:upper:1',
    )
  })

  it('ww-ot23 ww-lxn4 ww-s8zx ww-ss5k ww-ym25 warns or rejects division conditions and never inherits Open', () => {
    const restricted = {
      ...input,
      ageClasses: [
        { id: 'junior', name: { pl: 'Junior', en: 'Junior' }, from: 0, through: 17 },
        { id: 'adult', name: { pl: 'Dorosły', en: 'Adult' }, from: 18 },
      ],
      weightClasses: [
        { id: 'light', name: { pl: 'Do 80 kg', en: 'At most 80 kg' }, upperInclusive: 80 },
        { id: 'heavy', name: { pl: 'Powyżej 80 kg', en: 'Above 80 kg' }, lowerExclusive: 80 },
      ],
      divisions: [
        {
          id: 'monster',
          name: { pl: 'MONSTER', en: 'MONSTER' },
          policy: 'warn',
          conditions: { sex: 'female', minAge: 40, minBodyweight: 90, allowedLifts: ['lower'] },
        },
      ],
    }
    const participant = add('a', 1, [{ liftId: 'upper', openingWeight: 100 }], {
      divisions: ['monster'],
    })
    const warned = state([participant], book(restricted))
    expect(warned.entries[0]?.divisions).toEqual(['monster'])
    expect(warned.warnings.map((warning) => warning.reason)).toEqual([
      'sex',
      'age',
      'bodyweight',
      'lifts',
    ])
    const rejected = replay(
      book({ ...restricted, divisions: [{ ...restricted.divisions[0], policy: 'reject' }] }),
      date,
      [participant],
    )
    expect(rejected).toMatchObject({
      _tag: 'Failure',
      failure: { _tag: 'EntryRejected', reason: 'divisionCondition' },
    })
  })

  it('ww-1mwv derives age at the contest date and rechecks bodyweight on weigh-in', () => {
    expect(ageOnDate(Schema.decodeSync(CalendarDate)('2000-10-10'), date)).toBe(25)
    expect(Schema.decodeResult(CalendarDate)('2025-02-29')).toMatchObject({
      _tag: 'Failure',
    })
    const weighted = book({
      ...input,
      divisions: [
        {
          id: 'open',
          name: { pl: 'Open', en: 'Open' },
          policy: 'reject',
          conditions: { minBodyweight: 75, maxBodyweight: 85 },
        },
      ],
    })
    const weighed = command({ id: 'weigh-a', _tag: 'SetBodyweight', entryId: 'a', bodyweight: 82 })
    expect(state([add('a', 1), weighed], weighted).entries[0]?.bodyweight).toBe(82)
    const outside = command({ id: 'outside', _tag: 'SetBodyweight', entryId: 'a', bodyweight: 86 })
    expect(replay(weighted, date, [add('a', 1), outside])).toMatchObject({
      _tag: 'Failure',
      failure: { _tag: 'EntryRejected' },
    })
  })

  it('ww-mq50 ww-sy28 rejects impossible declarations with the nearest physical load', () => {
    const rulebook = book()
    const impossible = command({
      id: 'bad-weight',
      _tag: 'SetWeight',
      attempt: ref('a'),
      weight: 71.25,
    })
    expect(replay(rulebook, date, [add('a', 1), impossible])).toMatchObject({
      _tag: 'Failure',
      failure: { _tag: 'UnloadableWeight', requested: 71.25, nearest: 70 },
    })
    expect(
      replay(rulebook, date, [add('a', 1, [{ liftId: 'upper', openingWeight: 20 }])]),
    ).toMatchObject({ _tag: 'Failure', failure: { _tag: 'UnloadableWeight', nearest: 25 } })
    expect(loadBarbell(rulebook.barbell, 'female', Schema.decodeSync(Kilograms)(0))).toMatchObject({
      _tag: 'Unloadable',
      nearest: 20,
    })
    expect(loadBarbell(rulebook.barbell, 'male', Schema.decodeSync(Kilograms)(1000))).toMatchObject(
      { _tag: 'Unloadable', nearest: 410 },
    )
    const irregular = book({
      ...input,
      barbell: {
        bars: { male: 20, female: 15 },
        clampsPerSide: 0,
        plates: [
          { weight: 5, pairs: 1 },
          { weight: 3, pairs: 2 },
        ],
      },
    })
    expect(loadBarbell(irregular.barbell, 'male', Schema.decodeSync(Kilograms)(32))).toEqual({
      _tag: 'Loadable',
      weight: 32,
      platesPerSide: [{ weight: 3, count: 2 }],
    })
  })

  it('ww-widg loads each weight with the fewest plates per side', () => {
    const rulebook = book({
      ...input,
      barbell: {
        bars: { male: 20, female: 15 },
        clampsPerSide: 2.5,
        plates: [
          { weight: 25, pairs: 4 },
          { weight: 20, pairs: 4 },
          { weight: 15, pairs: 4 },
          { weight: 10, pairs: 4 },
          { weight: 5, pairs: 4 },
          { weight: 2.5, pairs: 6 },
          { weight: 1.25, pairs: 4 },
        ],
      },
    })
    expect(loadBarbell(rulebook.barbell, 'male', Schema.decodeSync(Kilograms)(170))).toEqual({
      _tag: 'Loadable',
      weight: 170,
      platesPerSide: [
        { weight: 25, count: 2 },
        { weight: 20, count: 1 },
        { weight: 2.5, count: 1 },
      ],
    })
  })

  it('the attempt clock starts, freezes on its second when stopped and resets to idle', () => {
    const start = command({ id: 'start', _tag: 'StartClock', at: 10_000, seconds: 60 })
    expect(state([add('a', 1), start]).clock).toEqual({
      _tag: 'Running',
      startedAt: 10_000,
      seconds: 60,
    })
    const stopped = state([
      add('a', 1),
      start,
      command({ id: 'stop', _tag: 'StopClock', at: 10_000 + 17_400 }),
    ])
    expect(stopped.clock).toEqual({ _tag: 'Stopped', remaining: 43 })
    // A stop stamped before the start (devices disagree) keeps the full time, not more.
    expect(
      state([add('a', 1), start, command({ id: 'early', _tag: 'StopClock', at: 7_000 })]).clock,
    ).toEqual({ _tag: 'Stopped', remaining: 60 })
    expect(
      state([
        add('a', 1),
        start,
        command({ id: 'stop', _tag: 'StopClock', at: 20_000 }),
        command({ id: 'reset', _tag: 'ResetClock', at: 30_000 }),
      ]).clock,
    ).toEqual({ _tag: 'Idle' })
  })

  it('ww-lcu1 takes a declared weight back, but not a judged one', () => {
    const declared = [
      add('a', 1),
      command({ id: 'second', _tag: 'SetWeight', attempt: ref('a', 'upper', 2), weight: 110 }),
      command({ id: 'pick', _tag: 'SetCurrent', attempt: ref('a', 'upper', 2) }),
    ]
    const cleared = state([
      ...declared,
      command({ id: 'clear', _tag: 'ClearWeight', attempt: ref('a', 'upper', 2) }),
    ])
    expect(cleared.attempts).toContainEqual({ ...ref('a', 'upper', 2), _tag: 'Unannounced' })
    expect(cleared.selected).toEqual(Option.none())
    expect(
      replay(book(), date, [
        add('a', 1),
        command({ id: 'judge', _tag: 'SetVerdict', attempt: ref('a'), verdict: 'goodLift' }),
        command({ id: 'clear', _tag: 'ClearWeight', attempt: ref('a') }),
      ]),
    ).toMatchObject({
      _tag: 'Failure',
      failure: { _tag: 'AttemptUnavailable', reason: 'alreadyJudged' },
    })
  })

  it('ww-8ta6 undoes exactly the last mutation, including corrections, selection and ordering', () => {
    const prefix = [
      add('a', 1),
      command({ id: 'judge', _tag: 'SetVerdict', attempt: ref('a'), verdict: 'goodLift' }),
    ]
    const before = state(prefix)
    const correction = command({ id: 'change', _tag: 'SetWeight', attempt: ref('a'), weight: 120 })
    expect(
      state([...prefix, correction, command({ id: 'undo', _tag: 'Undo', target: 'change' })]),
    ).toEqual(before)
    const base = [add('a', 2), add('b', 1)]
    for (const mutation of [
      command({
        id: 'move',
        _tag: 'MoveAttempt',
        attempt: ref('a'),
        position: { _tag: 'Before', attempt: ref('b') },
      }),
      command({ id: 'select', _tag: 'SetCurrent', attempt: ref('a') }),
      command({ id: 'weigh', _tag: 'SetBodyweight', entryId: 'a', bodyweight: 90 }),
    ]) {
      expect(
        state([
          ...base,
          mutation,
          command({ id: 'undo-' + mutation.id, _tag: 'Undo', target: mutation.id }),
        ]),
      ).toEqual(state(base))
    }
    expect(
      replay(book(), date, [command({ id: 'empty-undo', _tag: 'Undo', target: 'absent' })]),
    ).toMatchObject({
      _tag: 'Failure',
      failure: { _tag: 'NothingToUndo' },
    })
  })

  it('ww-8ta6 ww-9hlk targeted undo retains another editor change and rejects dependent cancellation', () => {
    const base = [
      add('a', 1),
      command({ id: 'weigh', _tag: 'SetBodyweight', entryId: 'a', bodyweight: 90 }),
      command({ id: 'lot', _tag: 'SetLotNumber', entryId: 'a', lotNumber: 5 }),
    ]
    const reverted = state([...base, command({ id: 'undo-weigh', _tag: 'Undo', target: 'weigh' })])
    expect(reverted.entries[0]).toMatchObject({ bodyweight: 80, lotNumber: 5 })
    expect(
      replay(book(), date, [...base, command({ id: 'undo-entry', _tag: 'Undo', target: 'add-a' })]),
    ).toMatchObject({ _tag: 'Failure', failure: { _tag: 'UndoConflict' } })
  })

  it('ww-tzv6 adds and renames teams, refuses spelling duplicates and merges membership', () => {
    const teams = [
      command({ id: 'team-one', _tag: 'UpsertTeam', team: { id: 'one', name: 'Górnik' } }),
      command({ id: 'team-two', _tag: 'UpsertTeam', team: { id: 'two', name: 'Another club' } }),
    ] as const
    const member = add('a', 1, [{ liftId: 'upper', openingWeight: 100 }], {
      lifter: { id: 'person-a', name: 'A', sex: 'male', birthDate: '1990-01-01', teamId: 'two' },
    })
    const merged = state([
      ...teams,
      member,
      command({ id: 'rename', _tag: 'UpsertTeam', team: { id: 'one', name: 'GÓRNIK' } }),
      command({ id: 'merge', _tag: 'MergeTeams', from: 'two', into: 'one' }),
    ])
    expect(merged.teams).toEqual([{ id: 'one', name: 'GÓRNIK' }])
    expect(merged.entries[0]?.lifter.teamId).toBe('one')
    expect(
      replay(book(), date, [
        teams[0],
        command({
          id: 'duplicate-team',
          _tag: 'UpsertTeam',
          team: { id: 'duplicate', name: '  GÓRNIK  ' },
        }),
      ]),
    ).toMatchObject({ _tag: 'Failure', failure: { _tag: 'TeamConflict', reason: 'duplicateName' } })
  })

  it('ww-dwfd ww-8fz8 rejects broken rulebook versions, duplicate references and invalid commands', () => {
    expect(parseRulebook({ ...input, version: 2 })).toMatchObject({
      _tag: 'Failure',
      failure: { _tag: 'InvalidRulebook' },
    })
    expect(parseRulebook({ ...input, lifts: [{ ...input.lifts[0], attempts: 0 }] })).toMatchObject({
      _tag: 'Failure',
    })
    expect(
      parseRulebook({
        ...input,
        divisions: [
          {
            id: 'open',
            name: { pl: 'Open', en: 'Open' },
            policy: 'reject',
            conditions: { allowedLifts: ['absent'] },
          },
        ],
      }),
    ).toMatchObject({ _tag: 'Failure' })
    expect(
      parseCommand({
        id: 'invalid',
        at: 1_000,
        _tag: 'SetWeight',
        attempt: ref('a', 'upper', 0),
        weight: 100,
      }),
    ).toMatchObject({ _tag: 'Failure', failure: { _tag: 'InvalidCommand' } })
    expect(replay(book(), date, [add('a', 1), add('a', 1)])).toMatchObject({
      _tag: 'Failure',
      failure: { _tag: 'InvalidCommand' },
    })
    expect(
      replay(book(), date, [
        add('a', 1),
        command({ id: 'invalid-current', _tag: 'SetCurrent', attempt: ref('a', 'upper', 2) }),
      ]),
    ).toMatchObject({ _tag: 'Failure', failure: { _tag: 'AttemptUnavailable' } })
  })
})
