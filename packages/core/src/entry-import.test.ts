import * as Result from 'effect/Result'
import * as Schema from 'effect/Schema'
import { describe, expect, it } from 'vitest'
import { Command, ContestJournal } from './contest.ts'
import { parseDelimited, planImport, suggestMapping } from './entry-import.ts'
import { CalendarDate } from './lifter.ts'
import { client2026Rulebook } from './presets.ts'

const date = Schema.decodeSync(CalendarDate)('2026-11-14')
const journal = Result.getOrThrow(ContestJournal.restore(client2026Rulebook, date, []))
let counter = 0
const env = { newId: () => 'id-' + counter++, now: 1000, random: () => 0.5 }
// The layout of a typical hand-made entry list: Polish headers, semicolons, a BOM, quoted cells.
const csv =
  '\uFEFFImię;Nazwisko;Płeć;Data urodzenia;Klub;Wyciskanie;Martwy ciąg\r\n' +
  'Anna;Nowak;K;01.02.1990;Górnik;60;80\r\n' +
  'Jan;"Kowalski; junior";M;1985-12-31;GÓRNIK;100;\r\n' +
  'Ewa;Błędna;K;31.02.1990;Górnik;50;\r\n' +
  'Piotr;Nieznany;X;1980-01-01;Orzeł;70;\r\n'

describe('entry import', () => {
  it('ww-8pme: a semicolon file with Polish headers is mapped and previewed with per-row errors', () => {
    const table = parseDelimited(csv)
    expect(table[0]).toEqual([
      'Imię',
      'Nazwisko',
      'Płeć',
      'Data urodzenia',
      'Klub',
      'Wyciskanie',
      'Martwy ciąg',
    ])
    expect(table[2]?.[1]).toBe('Kowalski; junior')
    const mapping = suggestMapping(table[0] ?? [], { rulebook: client2026Rulebook })
    expect(mapping.fields).toMatchObject({
      firstName: 0,
      lastName: 1,
      sex: 2,
      birthDate: 3,
      team: 4,
    })
    expect(mapping.openings).toEqual({ bench: 5, deadlift: 6 })
    const plan = planImport(
      journal.state,
      journal,
      table.slice(1),
      mapping,
      { divisions: [], lifts: ['bench', 'deadlift'] },
      env,
    )
    expect(plan.rows.map((row) => [row.row, row.problems.map((p) => p.problem)])).toEqual([
      [2, []],
      [3, []],
      [4, ['birthDateInvalid']],
      [5, ['sexInvalid']],
    ])
    const applied = Result.getOrThrow(
      plan.commands.reduce<Result.Result<ContestJournal, unknown>>(
        (current, command) => Result.flatMap(current, (value) => value.append(command)),
        Result.succeed(journal),
      ),
    )
    const { entries, teams } = applied.state
    expect(entries.map((entry) => entry.lifter.name)).toEqual([
      'Anna Nowak',
      'Jan Kowalski; junior',
    ])
    // "Górnik" and "GÓRNIK" are one team.
    expect(teams.map((team) => team.name)).toEqual(['Górnik'])
    expect(entries.map((entry) => entry.lifter.teamId)).toEqual([teams[0]?.id, teams[0]?.id])
    expect(entries[0]?.lifts).toEqual([
      { liftId: 'bench', openingWeight: 60 },
      { liftId: 'deadlift', openingWeight: 80 },
    ])
    expect(entries[1]?.lifts).toEqual([{ liftId: 'bench', openingWeight: 100 }])
    expect(entries.every((entry) => entry.divisions.length === 0)).toBe(true)
  })

  it('ww-nmgu ww-3vpp: lot numbers are drawn without clashes and a single-lift entry is accepted', () => {
    const rows = [
      ['Ola', 'F', '2000-05-05', 'curl'],
      ['Ala', 'F', '2000-06-06', 'curl'],
    ]
    const mapping = suggestMapping(['Name', 'Sex', 'Birth date', 'Lifts'], {
      rulebook: client2026Rulebook,
    })
    const plan = planImport(
      journal.state,
      journal,
      rows,
      mapping,
      { divisions: [], lifts: [] },
      env,
    )
    const added = plan.commands.filter((command) => command._tag === 'AddEntry')
    expect(added).toHaveLength(2)
    const lots = added.map((command) => command.entry.lotNumber)
    expect(new Set(lots).size).toBe(2)
    expect(added.every((command) => command.entry.lifts.length === 1)).toBe(true)
  })

  it('ww-tzv6: merging a team moves every entry and a team can be cleared', () => {
    const add = (id: string, lot: number, team: string) =>
      Schema.decodeSync(Command)({
        _tag: 'AddEntry',
        id: 'add-' + id,
        at: lot,
        entry: {
          id,
          lifter: { id: 'l' + id, name: id, sex: 'male', birthDate: '1990-01-01', teamId: team },
          lotNumber: lot,
          divisions: [],
          lifts: [{ liftId: 'bench' }],
        },
      })
    const team = (id: string, name: string) =>
      Schema.decodeSync(Command)({
        _tag: 'UpsertTeam',
        id: 'team-' + id,
        at: 1,
        team: { id, name },
      })
    const commands = [
      team('t1', 'Górnik'),
      team('t2', 'Gornik Zabrze'),
      add('a', 1, 't1'),
      add('b', 2, 't2'),
      Schema.decodeSync(Command)({
        _tag: 'MergeTeams',
        id: 'merge',
        at: 3,
        from: 't2',
        into: 't1',
      }),
      Schema.decodeSync(Command)({ _tag: 'SetEntryTeam', id: 'clear', at: 4, entryId: 'a' }),
    ]
    const state = Result.getOrThrow(
      ContestJournal.restore(client2026Rulebook, date, commands),
    ).state
    expect(state.teams.map((item) => item.id)).toEqual(['t1'])
    expect(state.entries.map((entry) => 'teamId' in entry.lifter)).toEqual([false, true])
    expect(state.entries[1]?.lifter.teamId).toBe('t1')
  })
})
