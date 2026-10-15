import { RegistryProvider } from '@effect/atom-react'
import { CalendarDate, client2026Rulebook, Command, ContestJournal } from '@werewolf/core'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import * as Option from 'effect/Option'
import * as Result from 'effect/Result'
import * as Schema from 'effect/Schema'
import { useState, type ReactNode } from 'react'
import { afterEach, expect, it } from 'vitest'
import { LiftPanel } from './LiftPanel.tsx'
import { StageScreen } from './StageScreen.tsx'
import { AnnouncerTable } from './TableScreens.tsx'
import { TeamResults } from './TeamResults.tsx'

afterEach(cleanup)
const decode = Schema.decodeUnknownSync(Command)
const add = (
  id: string,
  name: string,
  lot: number,
  weight: number,
  divisions: ReadonlyArray<string> = [],
) =>
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
  add('a', 'Alpha Anna', 1, 100, ['mundurowi']),
  add('b', 'Beta Bartek', 2, 110),
  add('c', 'Gamma Czesław', 3, 120),
]
const date = Schema.decodeSync(CalendarDate)('2026-11-07')
const journal = (commands: ReadonlyArray<Command>) =>
  Result.getOrThrow(ContestJournal.restore(client2026Rulebook, date, commands))
const wrap = (node: ReactNode) => render(<RegistryProvider>{node}</RegistryProvider>)

it('ww-widg: the stage shows the lifter, the weight and the plates of one side', () => {
  wrap(<StageScreen state={journal(base).state} title="Test" />)
  // Surname and first name on their own lines, so long names fit; weights with two decimals.
  expect(screen.getByText('ALPHA')).toBeDefined()
  expect(screen.getByText('ANNA')).toBeDefined()
  expect(screen.getAllByText('100.00').length).toBeGreaterThan(0)
  // 100 kg on a 20 kg bar with two 2.5 kg clamps is 37.5 kg per side.
  const plates = (
    screen.getByRole('img', { name: 'Sztanga z talerzami' }).getAttribute('data-plates') ?? ''
  )
    .split(',')
    .map(Number)
  expect(plates.reduce((sum, weight) => sum + weight, 0)).toBe(37.5)
})

it('every plate in the picture keeps a visible band of its colour', () => {
  wrap(<StageScreen state={journal(base).state} title="Test" />)
  for (const plate of document.querySelectorAll<HTMLElement>('.plate'))
    expect(
      Number.parseFloat(plate.style.width) - 2 * Number.parseFloat(plate.style.borderWidth),
    ).toBeGreaterThanOrEqual(12)
})

it('the attempt clock starts at the contest setting and counts down from the start command', () => {
  const idle = wrap(<StageScreen state={journal(base).state} title="Test" />)
  expect(screen.getByLabelText('Zegar podejścia').textContent).toBe('1:00')
  idle.unmount()
  const started = journal([
    ...base,
    decode({ _tag: 'StartClock', id: 'clock', at: Date.now() - 5000, seconds: 60 }),
  ])
  wrap(<StageScreen state={started.state} title="Test" />)
  expect(screen.getByLabelText('Zegar podejścia').textContent).toBe('0:55')
})

function Desk() {
  const [current, setJournal] = useState(() => journal(base))
  const submit = (input: object) => {
    const command = decode({ ...input, id: crypto.randomUUID(), at: Date.now() })
    setJournal((previous) => {
      const next = previous.append(command)
      return Result.isSuccess(next) ? next.success : previous
    })
  }
  const state = current.state
  return (
    <>
      <LiftPanel
        state={state}
        contestName="Test"
        liftId="bench"
        current={Option.none()}
        submit={submit}
        qr={{ visible: false, available: false, toggle: () => {} }}
        onEditCompetitor={() => {}}
      />
      <output data-testid="verdict">
        {state.attempts
          .filter((attempt) => attempt.entryId === 'a' && attempt.number === 1)
          .map((attempt) => (attempt._tag === 'Judged' ? attempt.verdict : attempt._tag))
          .join()}
      </output>
    </>
  )
}

it('the status button of an attempt cycles good, failed and pending as in 2025', () => {
  wrap(<Desk />)
  const row = screen.getByText('Alpha Anna').closest('tr')
  if (!row) throw new Error('row missing')
  const status = () => within(row).getAllByRole('button', { name: /Oczekuje|Udana|Nieudana/ })[0]
  const click = () => {
    const button = status()
    if (!button) throw new Error('status button missing')
    fireEvent.click(button)
  }
  click()
  expect(screen.getByTestId('verdict').textContent).toBe('goodLift')
  click()
  expect(screen.getByTestId('verdict').textContent).toBe('noLift')
  click()
  expect(screen.getByTestId('verdict').textContent).toBe('Declared')
})

it('team results have one tab per team classification of the rulebook', () => {
  wrap(<TeamResults state={journal(base).state} contestName="Test" />)
  const teams = client2026Rulebook.classifications.filter((item) => item.kind === 'team')
  expect(screen.getAllByRole('tab')).toHaveLength(teams.length)
})

it('ww-8tai ww-zpeu: the announcer table follows the filter pushed from the desk', () => {
  localStorage.clear()
  const state = journal([
    ...base,
    decode({ _tag: 'SetScoreboard', id: 'f', at: 10, filter: { divisionId: 'mundurowi' } }),
  ]).state
  wrap(<AnnouncerTable state={state} title="Test" connected />)
  expect(screen.getByText('Alpha Anna')).toBeDefined()
  expect(screen.queryByText('Beta Bartek')).toBeNull()
})
