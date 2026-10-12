import { RegistryProvider } from '@effect/atom-react'
import {
  CalendarDate,
  client2026Rulebook,
  Command,
  ContestJournal,
  Kilograms,
  reshelCoefficient,
  Rulebook,
} from '@werewolf/core'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import * as Result from 'effect/Result'
import * as Schema from 'effect/Schema'
import { useState } from 'react'
import { afterEach, expect, it } from 'vitest'
import { EntriesPanel } from './EntriesPanel.tsx'

afterEach(cleanup)
const decode = Schema.decodeUnknownSync(Command)
const book = Schema.decodeUnknownSync(Rulebook)({
  ...client2026Rulebook,
  classifications: client2026Rulebook.classifications.map(
    ({ ageClassIds: _ages, ...item }) => item,
  ),
  ageClasses: [{ id: 'senior', name: { pl: 'Senior', en: 'Senior' }, from: 24, through: 39 }],
  weightClasses: [
    { id: 'w83', name: { pl: 'do 83 kg', en: 'to 83 kg' }, upperInclusive: 83 },
    { id: 'w93', name: { pl: 'do 93 kg', en: 'to 93 kg' }, lowerExclusive: 83, upperInclusive: 93 },
  ],
})
const start = Result.getOrThrow(
  ContestJournal.restore(book, Schema.decodeSync(CalendarDate)('2026-10-08'), [
    decode({
      _tag: 'AddEntry',
      id: 'add-a',
      at: 1,
      entry: {
        id: 'a',
        lifter: { id: 'la', name: 'Anna Alpha', sex: 'female', birthDate: '1990-05-05' },
        lotNumber: 1,
        divisions: [],
        lifts: [{ liftId: 'bench' }],
      },
    }),
  ]),
)
let clock = 1000
function Harness() {
  const [journal, setJournal] = useState(start)
  const submit = (input: object) => {
    const command = decode({ ...input, id: 'cmd-' + clock, at: clock++ })
    // Several commands can arrive in one tick, as when an import is applied.
    setJournal((previous) => {
      const next = previous.append(command)
      return Result.isSuccess(next) ? next.success : previous
    })
  }
  return (
    <>
      <EntriesPanel state={journal.state} journal={journal} submit={submit} />
      <output data-testid="entries">
        {journal.state.entries
          .map((entry) => entry.lifter.name + ':' + (entry.bodyweight ?? ''))
          .join('|')}
      </output>
      <output data-testid="teams">{journal.state.teams.map((team) => team.name).join('|')}</output>
    </>
  )
}
const mount = () =>
  render(
    <RegistryProvider>
      <Harness />
    </RegistryProvider>,
  )

it('ww-1mwv: typing the bodyweight updates the classes and coefficients before and after weigh-in', () => {
  mount()
  const input = screen.getAllByLabelText('Masa ciała (kg)').at(-1)
  if (!input) throw new Error('weigh-in field missing')
  fireEvent.change(input, { target: { value: '88' } })
  const reshel = reshelCoefficient(Schema.decodeSync(Kilograms)(88), 'female').toFixed(3)
  const row = screen.getByText('Anna Alpha').closest('tr')
  if (!row) throw new Error('row missing')
  expect(row.textContent).toContain('Senior')
  expect(row.textContent).toContain('do 93 kg')
  expect(row.textContent).toContain('Reshel ' + reshel)
  fireEvent.click(within(row).getByRole('button', { name: 'Ważenie' }))
  expect(screen.getByTestId('entries').textContent).toBe('Anna Alpha:88')
})

it('ww-8pme ww-tzv6: a CSV file is previewed with row errors and only valid rows are imported with one team', async () => {
  mount()
  const csv =
    'Imię;Nazwisko;Płeć;Data urodzenia;Klub;Wyciskanie\n' +
    'Jan;Nowy;M;01.02.1985;Górnik;100\n' +
    'Ewa;Zła;K;31.02.1990;Górnik;50\n' +
    'Adam;Drugi;M;1980-03-03;GÓRNIK;90\n'
  const file = new File([csv], 'list.csv', { type: 'text/csv' })
  fireEvent.change(screen.getByLabelText('Plik (.csv, .xlsx)'), { target: { files: [file] } })
  await waitFor(() => expect(screen.getAllByText('Gotowy')).toHaveLength(2))
  expect(screen.getByRole('alert', { name: '' }).textContent).toContain('Zła data urodzenia')
  fireEvent.click(screen.getByRole('button', { name: 'Importuj poprawne wiersze' }))
  expect(screen.getByTestId('entries').textContent).toBe('Anna Alpha:|Jan Nowy:|Adam Drugi:')
  // "Górnik" and "GÓRNIK" are one team.
  expect(screen.getByTestId('teams').textContent).toBe('Górnik')
})
