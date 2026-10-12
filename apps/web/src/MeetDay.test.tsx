import { RegistryProvider } from '@effect/atom-react'
import {
  CalendarDate,
  client2026Rulebook,
  Command,
  ContestJournal,
  loadBarbell,
  Kilograms,
} from '@werewolf/core'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import * as Result from 'effect/Result'
import * as Schema from 'effect/Schema'
import { useState } from 'react'
import { afterEach, expect, it } from 'vitest'
import { MeetDay } from './MeetDay.tsx'

afterEach(cleanup)
function must<T>(value: T): NonNullable<T> {
  if (!value) throw new Error('Expected the screen to contain the element')
  return value
}
const firstButton = (name: string) => must(screen.getAllByRole('button', { name }).at(0))
const nextPanel = () =>
  must(screen.getByRole('heading', { name: 'Następne podejście zawodnika' }).parentElement)
const currentLine = () => must(document.querySelector('.current-line')).textContent
const decode = Schema.decodeUnknownSync(Command)
const entry = (id: string, name: string, lot: number, opening: number) =>
  decode({
    _tag: 'AddEntry',
    id: 'add-' + id,
    at: lot,
    entry: {
      id,
      lifter: { id: 'lifter-' + id, name, sex: 'male', birthDate: '1990-01-01' },
      bodyweight: 90,
      lotNumber: lot,
      divisions: [],
      lifts: [{ liftId: 'bench', openingWeight: opening }],
    },
  })
const start = Result.getOrThrow(
  ContestJournal.restore(client2026Rulebook, Schema.decodeSync(CalendarDate)('2026-10-08'), [
    entry('a', 'Anna Alpha', 1, 100),
    entry('b', 'Bartek Beta', 2, 110),
    entry('c', 'Czesław Gamma', 3, 120),
  ]),
)
let clock = 1_000
function Harness() {
  const [journal, setJournal] = useState(start)
  const submit = (input: object) => {
    const command = decode({ ...input, id: 'cmd-' + clock, at: clock++ })
    const next = journal.append(command)
    if (Result.isSuccess(next)) setJournal(next.success)
  }
  return <MeetDay state={journal.state} commands={journal.commands} submit={submit} editor />
}
const mount = () =>
  render(
    <RegistryProvider>
      <Harness />
    </RegistryProvider>,
  )
const queue = () =>
  within(screen.getByRole('table'))
    .getAllByRole('row')
    .slice(1)
    .map((row) => within(row).getAllByRole('cell')[1]?.textContent)

it('ww-adgy ww-u0ni: one click records the verdict and the next attempt becomes current', () => {
  mount()
  expect(currentLine()).toContain('Anna Alpha')
  fireEvent.click(firstButton('Zaliczone'))
  expect(currentLine()).toContain('Bartek Beta')
  expect(queue()).toEqual(['Bartek Beta', 'Czesław Gamma'])
})

it('ww-adgy: the G and N keys judge the current attempt without the mouse', () => {
  mount()
  fireEvent.keyDown(window, { key: 'g' })
  fireEvent.keyDown(window, { key: 'n' })
  expect(currentLine()).toContain('Czesław Gamma')
})

it('ww-z7vp ww-mq50: next attempt is declared after the verdict and impossible weights offer the nearest load', () => {
  mount()
  fireEvent.click(firstButton('Zaliczone'))
  const panel = nextPanel()
  expect(panel.textContent).toContain('Anna Alpha')
  const input = within(panel).getByLabelText('Ciężar (kg)')
  expect(input).toHaveProperty('value', '100')
  const barbell = client2026Rulebook.barbell
  const wanted = Schema.decodeSync(Kilograms)(102.3)
  const load = loadBarbell(barbell, 'male', wanted)
  expect(load._tag).toBe('Unloadable')
  fireEvent.change(input, { target: { value: '102.3' } })
  expect(within(panel).getByRole('alert').textContent).toContain(
    String(load._tag === 'Unloadable' ? load.nearest : ''),
  )
  expect(within(panel).getByRole('button', { name: 'Zgłoś ciężar' })).toHaveProperty(
    'disabled',
    true,
  )
  fireEvent.click(within(panel).getByRole('button', { name: 'Użyj tego ciężaru' }))
  fireEvent.click(within(panel).getByRole('button', { name: 'Zgłoś ciężar' }))
  expect(queue()).toContain('Anna Alpha')
})

it('ww-tds3 ww-8ta6: a lifter moves down the queue by hand and undo restores the order', () => {
  mount()
  fireEvent.click(firstButton('Niżej'))
  expect(queue()).toEqual(['Bartek Beta', 'Anna Alpha', 'Czesław Gamma'])
  fireEvent.click(screen.getByRole('button', { name: 'Cofnij ostatnią zmianę' }))
  expect(queue()).toEqual(['Anna Alpha', 'Bartek Beta', 'Czesław Gamma'])
})

it('ww-9jq6: one click marks the current lifter as did not start and the queue moves on', () => {
  mount()
  fireEvent.click(screen.getByRole('button', { name: 'Nie wystartował (DNS)' }))
  expect(currentLine()).toContain('Bartek Beta')
  expect(queue()).toEqual(['Bartek Beta', 'Czesław Gamma'])
  fireEvent.click(screen.getByRole('button', { name: 'Cofnij ostatnią zmianę' }))
  expect(queue()).toEqual(['Anna Alpha', 'Bartek Beta', 'Czesław Gamma'])
})
