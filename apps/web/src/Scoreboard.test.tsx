import { RegistryProvider } from '@effect/atom-react'
import { CalendarDate, client2026Rulebook, Command, ContestJournal } from '@werewolf/core'
import { cleanup, render, screen } from '@testing-library/react'
import * as Result from 'effect/Result'
import * as Schema from 'effect/Schema'
import { afterEach, expect, it } from 'vitest'
import { Scoreboard } from './Scoreboard.tsx'

afterEach(cleanup)
const decode = Schema.decodeUnknownSync(Command)
const add = (id: string, name: string, lot: number, divisions: string[]) =>
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
      lifts: [{ liftId: 'bench', openingWeight: 100 }],
    },
  })
const base = [
  add('a', 'Open Only', 1, ['open']),
  add('b', 'Monster Only', 2, ['monster']),
  add('c', 'Both Divisions', 3, ['open', 'monster']),
]
const show = (commands: ReadonlyArray<Command>) =>
  render(
    <RegistryProvider>
      <Scoreboard
        title="Test"
        state={
          Result.getOrThrow(
            ContestJournal.restore(
              client2026Rulebook,
              Schema.decodeSync(CalendarDate)('2026-10-08'),
              [...base, ...commands],
            ),
          ).state
        }
      />
    </RegistryProvider>,
  )

it('ww-8tai ww-zpeu: only members of the chosen division appear on the scoreboard', () => {
  show([decode({ _tag: 'SetScoreboard', id: 'f', at: 10, filter: { divisionId: 'monster' } })])
  expect(screen.queryByText('Open Only')).toBeNull()
  expect(screen.getByText('Monster Only')).toBeDefined()
  expect(screen.getByText('Both Divisions')).toBeDefined()
})

it('ww-l06a: a pushed QR code is drawn from the replayed log', () => {
  show([
    decode({
      _tag: 'SetScoreboard',
      id: 'f',
      at: 10,
      filter: {},
      qrUrl: 'https://example.test/view/x/results?token=t',
    }),
  ])
  expect(screen.getByRole('img', { name: 'Kod QR' }).getAttribute('data-url')).toBe(
    'https://example.test/view/x/results?token=t',
  )
})
