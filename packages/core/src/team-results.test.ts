import * as Result from 'effect/Result'
import * as Schema from 'effect/Schema'
import { describe, expect, it } from 'vitest'
import {
  CalendarDate,
  client2026Rulebook,
  parseCommand,
  parseRulebook,
  replay,
  teamRankings,
  type Command,
  type Rulebook,
} from './index.ts'

const name = { pl: 'Dowolna', en: 'Custom' }
const date = Schema.decodeSync(CalendarDate)('2026-11-07')
const teamClassification = {
  id: 'custom',
  name,
  kind: 'team',
  membership: { kind: 'all' },
  liftIds: ['orbit'],
  result: 'best',
  formula: 'kilograms',
  quota: { kind: 'any', count: 5 },
}
function book(overrides: Readonly<Record<string, unknown>> = {}): Rulebook {
  return Result.getOrThrow(
    parseRulebook({
      ...client2026Rulebook,
      lifts: [{ id: 'orbit', name, attempts: 2, rackHeight: false }],
      classifications: [teamClassification],
      ...overrides,
    }),
  )
}
function command(raw: Readonly<Record<string, unknown>>): Command {
  return Result.getOrThrow(parseCommand({ at: 1, ...raw }))
}
function team(id: string, label = id): Command {
  return command({ _tag: 'UpsertTeam', id: 'team-' + id, team: { id, name: label } })
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
      lifter: {
        id: 'person-' + id,
        name: id,
        sex: 'male',
        birthDate: '1995-03-01',
        teamId: 'alpha',
      },
      bodyweight: 80,
      divisions: [],
      lifts: [{ liftId: 'orbit', openingWeight: 100 }],
      ...fields,
    },
  })
}
function good(entryId: string, liftId = 'orbit'): Command {
  return command({
    _tag: 'SetVerdict',
    id: 'good-' + entryId + '-' + liftId,
    attempt: { entryId, liftId, number: 1 },
    verdict: 'goodLift',
  })
}
function rankings(commands: ReadonlyArray<Command>, rulebook = book()) {
  return teamRankings(Result.getOrThrow(replay(rulebook, date, commands)))
}

describe('rulebook team results', () => {
  it('ww-4yp8 ww-fwnw ww-gybz ww-ub7m ww-dtzk declares and calculates all four client quotas without MONSTER or curl leakage', () => {
    const commands = [team('alpha')]
    for (const sex of ['male', 'female']) {
      for (let i = 1; i <= 6; i++) {
        const id = sex + i
        const bench = sex === 'male' ? (i === 1 ? 260 : 90 + i * 10) : i === 1 ? 165 : 85 + i * 10
        const deadlift =
          sex === 'male' ? (i === 1 ? 255 : 190 + i * 10) : i === 1 ? 160 : 95 + i * 10
        commands.push(
          add(id, commands.length, {
            lifter: { id: 'person-' + id, name: id, sex, birthDate: '1995-03-01', teamId: 'alpha' },
            bodyweight: sex === 'male' ? 80 : 63,
            lifts: [
              { liftId: 'bench', openingWeight: bench },
              { liftId: 'deadlift', openingWeight: deadlift },
            ],
          }),
          good(id, 'bench'),
          good(id, 'deadlift'),
        )
      }
    }
    commands.push(
      add('monster', 100, { lifts: [{ liftId: 'monster', openingWeight: 500 }] }),
      good('monster', 'monster'),
      add('curl-only', 101, { lifts: [{ liftId: 'curl', openingWeight: 300 }] }),
      good('curl-only', 'curl'),
      add('unassigned', 102, {
        lifter: { id: 'unassigned', name: 'Unassigned', sex: 'male', birthDate: '1995-03-01' },
        lifts: [{ liftId: 'bench', openingWeight: 500 }],
      }),
      good('unassigned', 'bench'),
    )
    const result = rankings(commands, client2026Rulebook)
    expect(result.map((ranking) => [ranking.classificationId, ranking.rows[0]?.points])).toEqual([
      ['men-best', 1264.8],
      ['women-best', 1243.375],
      ['bench-mixed', 999.695],
      ['deadlift-mixed', 1302.05],
      // Nobody in this fixture is up to 19, so the youth team ranking has no points.
      ['youth-four', 0],
    ])
    expect(result.map((ranking) => ranking.rows[0]?.counted.map((row) => row.entry.id))).toEqual([
      ['male1', 'male6', 'male5', 'male4', 'male3'],
      ['female1', 'female6', 'female5', 'female4', 'female3'],
      ['female1', 'male1', 'male6', 'male5', 'male4'],
      ['female1', 'male1', 'male6', 'male5', 'male4'],
    ])
    expect(result[0]?.rows[0]?.counted.map((row) => row.points)).toEqual([
      274.04, 263.5, 252.96, 242.42, 231.88,
    ])
    expect(result[1]?.rows[0]?.counted.map((row) => row.points)).toEqual([
      282.975, 265.825, 248.675, 231.525, 214.375,
    ])
  })

  it('ww-ub7m ww-dtzk does not fill missing women slots with extra men or missing men slots with women', () => {
    const rulebook = book({
      classifications: [{ ...teamClassification, quota: { kind: 'bySex', male: 4, female: 1 } }],
    })
    const commands = [team('alpha'), team('beta')]
    for (let i = 1; i <= 5; i++)
      commands.push(
        add('man' + i, i, { lifts: [{ liftId: 'orbit', openingWeight: 90 + i * 10 }] }),
        good('man' + i),
      )
    for (let i = 1; i <= 2; i++)
      commands.push(
        add('woman' + i, i + 10, {
          lifter: {
            id: 'woman' + i,
            name: 'Woman',
            sex: 'female',
            birthDate: '1995-03-01',
            teamId: 'beta',
          },
          lifts: [{ liftId: 'orbit', openingWeight: 140 + i * 10 }],
        }),
        good('woman' + i),
      )
    commands.push(
      add('beta-man', 20, {
        lifter: {
          id: 'beta-man',
          name: 'Man',
          sex: 'male',
          birthDate: '1995-03-01',
          teamId: 'beta',
        },
        lifts: [{ liftId: 'orbit', openingWeight: 150 }],
      }),
      good('beta-man'),
    )
    const result = rankings(commands, rulebook)
    expect(
      result[0]?.rows.map((row) => [
        row.team.id,
        row.points,
        row.counted.map((person) => person.entry.id),
      ]),
    ).toEqual([
      ['alpha', 500, ['man5', 'man4', 'man3', 'man2']],
      ['beta', 310, ['woman2', 'beta-man']],
    ])
  })

  it('ww-eje4 ranks incomplete teams by their actual sum, without a completeness penalty', () => {
    const commands = [team('alpha'), team('beta'), team('empty')]
    for (let i = 1; i <= 5; i++) commands.push(add('complete' + i, i), good('complete' + i))
    commands.push(
      add('single', 10, {
        lifter: {
          id: 'single',
          name: 'Single',
          sex: 'male',
          birthDate: '1995-03-01',
          teamId: 'beta',
        },
        lifts: [{ liftId: 'orbit', openingWeight: 550 }],
      }),
      good('single'),
    )
    expect(
      rankings(commands)[0]?.rows.map((row) => [row.team.id, row.points, row.counted.length]),
    ).toEqual([
      ['beta', 550, 1],
      ['alpha', 500, 5],
      ['empty', 0, 0],
    ])
  })

  it('ww-6hvn breaks mathematically equal sums by the best counted lifter, not binary addition noise or team name', () => {
    const rulebook = book({
      barbell: {
        bars: { male: 0.1, female: 0.1 },
        clampsPerSide: 0,
        plates: [
          { weight: 10, pairs: 10 },
          { weight: 0.05, pairs: 1 },
        ],
      },
    })
    const commands = [team('alpha', 'ZZZ'), team('beta', 'AAA')]
    for (const [id, lotNumber, weight, teamId] of [
      ['a1', 1, 200.1, 'alpha'],
      ['a2', 2, 0.2, 'alpha'],
      ['b1', 3, 100.1, 'beta'],
      ['b2', 4, 100.2, 'beta'],
    ] as const)
      commands.push(
        add(id, lotNumber, {
          lifter: { id, name: id, sex: 'male', birthDate: '1995-03-01', teamId },
          lifts: [{ liftId: 'orbit', openingWeight: weight }],
        }),
        good(id),
      )
    expect(
      rankings(commands, rulebook)[0]?.rows.map((row) => [
        row.team.id,
        row.points,
        row.counted[0]?.points,
      ]),
    ).toEqual([
      ['alpha', 200.3, 200.1],
      ['beta', 200.3, 100.2],
    ])
  })

  it('ww-90sr ww-eje4 uses configured multi-lift totals and masters formulas, with explicit pending weigh-ins', () => {
    const rulebook = Result.getOrThrow(
      parseRulebook({
        ...client2026Rulebook,
        classifications: [
          {
            ...teamClassification,
            liftIds: ['bench', 'deadlift'],
            result: 'sum',
            formula: 'reshelMcCullough',
          },
        ],
      }),
    )
    const commands = [
      team('alpha'),
      add('master', 1, {
        lifter: {
          id: 'master',
          name: 'Master',
          sex: 'male',
          birthDate: '1961-11-07',
          teamId: 'alpha',
        },
        bodyweight: 82.5,
        lifts: [
          { liftId: 'bench', openingWeight: 100 },
          { liftId: 'deadlift', openingWeight: 150 },
        ],
      }),
      good('master', 'bench'),
      good('master', 'deadlift'),
      command({
        _tag: 'AddEntry',
        id: 'unweighed',
        entry: {
          id: 'unweighed',
          lotNumber: 2,
          lifter: {
            id: 'unweighed',
            name: 'Unweighed',
            sex: 'male',
            birthDate: '1995-03-01',
            teamId: 'alpha',
          },
          divisions: [],
          lifts: [
            { liftId: 'bench', openingWeight: 100 },
            { liftId: 'deadlift', openingWeight: 150 },
          ],
        },
      }),
      good('unweighed', 'bench'),
      good('unweighed', 'deadlift'),
    ]
    const result = rankings(commands, rulebook)
    expect(result[0]?.rows[0]).toMatchObject({
      points: 380.73,
      counted: [{ kilograms: 250, points: 380.73 }],
    })
    expect(result[0]?.pending).toEqual([
      { _tag: 'PendingEntry', entryId: 'unweighed', reason: 'bodyweightMissing' },
    ])
  })
})
