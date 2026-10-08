import { RegistryProvider } from '@effect/atom-react'
import { CalendarDate, client2026Rulebook, Command, ContestJournal } from '@werewolf/core'
import { cleanup, render, screen } from '@testing-library/react'
import * as Result from 'effect/Result'
import * as Schema from 'effect/Schema'
import { afterEach, expect, it } from 'vitest'
import { Announcer, Stage } from './LiveScreens.tsx'

afterEach(cleanup)
const decode = Schema.decodeUnknownSync(Command)
const add = (id: string, name: string, lot: number, weight: number, divisions: string[]) =>
  decode({
    _tag: 'AddEntry',
    id: 'add-' + id,
    at: lot,
    entry: {
      id,
      lifter: { id: 'lifter-' + id, name, sex: 'male', birthDate: '1990-01-01' },
      bodyweight: 90,
      lotNumber: lot,
      divisions,
      lifts: [{ liftId: 'bench', openingWeight: weight }],
    },
  })
const base = [
  add('a', 'Anna Alpha', 1, 100, ['open', 'monster']),
  add('b', 'Bartek Beta', 2, 110, ['open']),
  add('c', 'Czesław Gamma', 3, 120, ['open']),
]
const journal = (commands: ReadonlyArray<Command>) =>
  Result.getOrThrow(
    ContestJournal.restore(
      client2026Rulebook,
      Schema.decodeSync(CalendarDate)('2026-10-08'),
      commands,
    ),
  )
const wrap = (node: React.ReactNode) => render(<RegistryProvider>{node}</RegistryProvider>)
const judged = decode({
  _tag: 'SetVerdict',
  id: 'v1',
  at: 50,
  attempt: { entryId: 'a', liftId: 'bench', number: 1 },
  verdict: 'goodLift',
})

it('ww-widg: the stage shows the lifter, weight and a barbell matching the plate plan', () => {
  const state = journal(base).state
  wrap(<Stage state={state} title="Test" />)
  expect(screen.getByRole('heading', { name: 'Anna Alpha' })).toBeDefined()
  expect(screen.getByText(/^100\.00/)).toBeDefined()
  // 100 kg on a 20 kg bar is 40 kg per side; the drawing has the same plates on one side.
  const plates = (
    screen.getByRole('img', { name: 'Sztanga z talerzami' }).getAttribute('data-plates') ?? ''
  )
    .split(',')
    .map(Number)
  expect(plates.reduce((sum, weight) => sum + weight, 0)).toBe(40)
  expect(document.querySelectorAll('.plate')).toHaveLength(plates.length)
})

it('ww-ufi7 ww-6pk1: both screens show the verdict and the new current attempt as soon as it is recorded', () => {
  const state = journal([...base, judged]).state
  wrap(
    <>
      <Stage state={state} title="Test" />
      <Announcer state={state} />
    </>,
  )
  expect(screen.getAllByText(/Zaliczone/).length).toBe(2)
  expect(screen.getByRole('heading', { name: 'Bartek Beta' })).toBeDefined()
  expect(screen.getByRole('heading', { name: /Bartek Beta — .* 110 kg/ })).toBeDefined()
})

it('ww-6pk1: the announcer lists the next lifters and the places in the lifter divisions', () => {
  const state = journal([
    ...base,
    judged,
    decode({
      _tag: 'SetCurrent',
      id: 's',
      at: 60,
      attempt: { entryId: 'b', liftId: 'bench', number: 1 },
    }),
  ]).state
  wrap(<Announcer state={state} />)
  expect(
    screen.getAllByRole('listitem').some((item) => /Czesław Gamma/.test(item.textContent)),
  ).toBe(true)
  expect(screen.getByText(/Open/)).toBeDefined()
})
