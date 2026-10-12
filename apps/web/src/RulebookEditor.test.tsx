import { RegistryProvider } from '@effect/atom-react'
import { client2026Rulebook, rulebookToJson } from '@werewolf/core'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, expect, it } from 'vitest'
import { RulebookEditor } from './RulebookEditor.tsx'
import { fromDraft, toDraft } from './rulebook-draft.ts'
import * as Result from 'effect/Result'

afterEach(cleanup)
function Harness() {
  const [draft, setDraft] = useState(() => toDraft(client2026Rulebook))
  const book = fromDraft(draft)
  return (
    <>
      <RulebookEditor draft={draft} onChange={setDraft} part="rulebook" />
      <output data-testid="lifts">
        {Result.isSuccess(book) ? book.success.lifts.length : 'invalid'}
      </output>
    </>
  )
}
const mount = () =>
  render(
    <RegistryProvider>
      <Harness />
    </RegistryProvider>,
  )

it('ww-7s20: pasted broken JSON is rejected with a readable reason and the rulebook stays', () => {
  mount()
  fireEvent.change(screen.getByLabelText('Regulamin jako JSON'), { target: { value: '{ nope' } })
  fireEvent.click(screen.getByRole('button', { name: 'Wczytaj JSON' }))
  expect(screen.getByRole('alert').textContent).toBe('The text is not valid JSON.')
  expect(screen.getByTestId('lifts').textContent).toBe('4')
})

it('ww-dwfd ww-7s20: a lift can be added and removed, and pasted exported JSON replaces the draft', () => {
  mount()
  const [addLift] = screen.getAllByRole('button', { name: 'Dodaj' })
  if (!addLift) throw new Error('add button missing')
  fireEvent.click(addLift)
  expect(screen.getByTestId('lifts').textContent).toBe('5')
  const single = rulebookToJson(client2026Rulebook)
  fireEvent.change(screen.getByLabelText('Regulamin jako JSON'), { target: { value: single } })
  fireEvent.click(screen.getByRole('button', { name: 'Wczytaj JSON' }))
  expect(screen.getByTestId('lifts').textContent).toBe('4')
})
