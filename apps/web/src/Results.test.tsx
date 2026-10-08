import { RegistryProvider } from '@effect/atom-react'
import { CalendarDate, Command, ContestJournal, Rulebook, client2026Rulebook } from '@werewolf/core'
import { cleanup, render, screen } from '@testing-library/react'
import * as Result from 'effect/Result'
import * as Schema from 'effect/Schema'
import { afterEach, expect, it } from 'vitest'
import { Results } from './Results.tsx'

afterEach(cleanup)
const decode = Schema.decodeUnknownSync(Command)
const book = Schema.decodeUnknownSync(Rulebook)({
  ...client2026Rulebook,
  ageClasses: [
    { id: 'junior', name: { pl: 'Junior', en: 'Junior' }, from: 0, through: 23 },
    { id: 'senior', name: { pl: 'Senior', en: 'Senior' }, from: 24 },
  ],
  classifications: client2026Rulebook.classifications.map((item) =>
    item.id === 'open-bench'
      ? { ...Schema.encodeSync(Rulebook.fields.classifications)([item])[0], split: 'age' }
      : Schema.encodeSync(Rulebook.fields.classifications)([item])[0],
  ),
})
const add = (id: string, name: string, birth: string, lot: number, open: number, team: string) =>
  decode({
    _tag: 'AddEntry',
    id: 'a' + id,
    at: lot,
    entry: {
      id,
      lifter: { id: 'l' + id, name, sex: 'male', birthDate: birth, teamId: team },
      bodyweight: 90,
      lotNumber: lot,
      divisions: ['open'],
      lifts: [{ liftId: 'bench', openingWeight: open }],
    },
  })
const good = (id: string) =>
  decode({
    _tag: 'SetVerdict',
    id: 'v' + id,
    at: 50,
    attempt: { entryId: id, liftId: 'bench', number: 1 },
    verdict: 'goodLift',
  })
const state = Result.getOrThrow(
  ContestJournal.restore(book, Schema.decodeSync(CalendarDate)('2026-11-14'), [
    decode({ _tag: 'UpsertTeam', id: 't', at: 1, team: { id: 't1', name: 'Górnik' } }),
    add('j', 'Junior Jan', '2005-01-01', 1, 100, 't1'),
    add('s', 'Senior Adam', '1990-01-01', 2, 120, 't1'),
    good('j'),
    good('s'),
  ]),
).state

it('ww-sbfk ww-zpeu: a split classification shows one table per age class, in rank order', () => {
  render(
    <RegistryProvider>
      <Results state={state} title="Test" exports={false} />
    </RegistryProvider>,
  )
  const heading = screen.getByRole('heading', { name: 'Open — wyciskanie' })
  const card = heading.closest('section')
  expect(card?.textContent).toContain('Junior')
  expect(card?.textContent).toContain('Senior')
  expect(card?.textContent).toContain('Junior Jan')
  expect(card?.textContent).toContain('Senior Adam')
})

it('ww-6hvn: a team classification lists the counted lifters with their points', () => {
  render(
    <RegistryProvider>
      <Results state={state} title="Test" exports={false} />
    </RegistryProvider>,
  )
  const team = screen.getAllByRole('cell', { name: /Senior Adam \(/ })
  expect(team.length).toBeGreaterThan(0)
})

it('ww-gr75: the public results page offers no export buttons', () => {
  render(
    <RegistryProvider>
      <Results state={state} title="Test" exports={false} />
    </RegistryProvider>,
  )
  expect(screen.queryByRole('button', { name: 'CSV (federacja)' })).toBeNull()
})
