import { CalendarDate, Rulebook, type ContestState } from '@werewolf/core'
import * as Option from 'effect/Option'
import { Snapshot } from '@werewolf/sync'
import * as Result from 'effect/Result'
import * as Schema from 'effect/Schema'
import { useState } from 'react'
import { useLegacy } from './legacy-i18n.ts'
import { Modal } from './Modal.tsx'
import { RulebookEditor } from './RulebookEditor.tsx'
import { fromDraft, toDraft, type RulebookDraft } from './rulebook-draft.ts'
import { VideoLibrary } from './Videos.tsx'

/** "Edytuj zawody" of 2025: name, date and town, plus the attempt clock, team age classes and videos. */
export function ContestSettings({
  state,
  snapshot,
  pending,
  submit,
  onClose,
}: {
  readonly state: ContestState
  readonly snapshot: Snapshot
  readonly pending: number
  readonly submit: (input: object) => void
  readonly onClose: () => void
}) {
  const { lt, locale } = useLegacy()
  const definition = snapshot.definition
  const [name, setName] = useState<string>(definition.name)
  const [date, setDate] = useState<string>(definition.date)
  const [location, setLocation] = useState(definition.location ?? '')
  const [seconds, setSeconds] = useState(String(state.rulebook.clockSeconds ?? 60))
  const teams = state.rulebook.classifications.filter((item) => item.kind === 'team')
  const [eligible, setEligible] = useState<ReadonlyArray<string>>(
    () => teams[0]?.ageClassIds ?? state.rulebook.ageClasses.map((item) => item.id),
  )
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  async function save() {
    setMessage('')
    const encoded = Schema.encodeSync(Rulebook)(state.rulebook)
    const all = eligible.length === state.rulebook.ageClasses.length
    const next = Schema.decodeUnknownResult(Rulebook)({
      ...encoded,
      clockSeconds: Math.max(1, Math.round(Number(seconds) || 60)),
      classifications: encoded.classifications.map((item) => {
        if (item.kind !== 'team') return item
        const { ageClassIds: _old, ...rest } = item
        return all ? rest : { ...rest, ageClassIds: eligible }
      }),
    })
    if (Result.isFailure(next)) return setMessage(lt('v2.settings.failed'))
    if (JSON.stringify(Schema.encodeSync(Rulebook)(next.success)) !== JSON.stringify(encoded))
      submit({ _tag: 'SetRulebook', rulebook: Schema.encodeSync(Rulebook)(next.success) })
    const location_ = location.trim()
    if (
      name.trim() !== definition.name ||
      date !== definition.date ||
      location_ !== (definition.location ?? '')
    ) {
      if (pending > 0) return setMessage(lt('v2.settings.pending'))
      const parsedDate = Schema.decodeUnknownOption(CalendarDate)(date)
      if (Option.isNone(parsedDate)) return setMessage(lt('v2.settings.failed'))
      setBusy(true)
      const { location: _l, ...rest } = definition
      const body = Schema.encodeSync(Snapshot)({
        ...snapshot,
        definition: {
          ...rest,
          name: name.trim(),
          date: parsedDate.value,
          ...(location_ ? { location: location_ } : {}),
        },
      })
      const response = await fetch('/api/contests/' + definition.id + '/restore', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }).then(
        (value) => value.ok,
        () => false,
      )
      setBusy(false)
      if (!response) return setMessage(lt('v2.settings.failed'))
    }
    setMessage(lt('v2.settings.saved'))
  }
  return (
    <Modal title={lt('contest_detail.actions.edit_contest')} onClose={onClose}>
      <div className="space-y-6">
        <div className="grid gap-4 md:grid-cols-3">
          <label className="flex flex-col gap-2">
            <span className="input-label">{lt('v2.settings.name')}</span>
            <input className="input-field" value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          <label className="flex flex-col gap-2">
            <span className="input-label">{lt('general.date')}</span>
            <input
              className="input-field"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </label>
          <label className="flex flex-col gap-2">
            <span className="input-label">{lt('general.location')}</span>
            <input
              className="input-field"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
            />
          </label>
          <label className="flex flex-col gap-2">
            <span className="input-label">{lt('v2.clock.seconds')}</span>
            <input
              className="input-field"
              type="number"
              min="1"
              step="1"
              value={seconds}
              onChange={(e) => setSeconds(e.target.value)}
            />
          </label>
        </div>
        {teams.length > 0 && (
          <section className="space-y-2">
            <h3 className="text-label text-text-secondary">{lt('v2.team.eligible')}</h3>
            <div className="flex flex-wrap gap-2">
              {state.rulebook.ageClasses.map((item) => {
                const on = eligible.includes(item.id)
                return (
                  <label
                    key={item.id}
                    className={
                      'px-3 py-2 border rounded-md cursor-pointer transition ' +
                      (on
                        ? 'border-primary-red bg-primary-red/10 text-text-primary'
                        : 'border-border-color bg-element-bg text-text-secondary hover:text-text-primary')
                    }
                  >
                    <input
                      type="checkbox"
                      className="hidden"
                      checked={on}
                      onChange={() =>
                        setEligible(
                          on ? eligible.filter((id) => id !== item.id) : [...eligible, item.id],
                        )
                      }
                    />
                    {item.name[locale]}
                  </label>
                )
              })}
            </div>
          </section>
        )}
        <VideoLibrary />
        {message && (
          <p role="status" className="text-text-secondary">
            {message}
          </p>
        )}
        <div className="flex justify-end gap-3">
          <button type="button" className="btn-secondary px-4 py-2" onClick={onClose}>
            {lt('buttons.close')}
          </button>
          <button
            type="button"
            className="btn-primary px-6 py-2"
            disabled={busy}
            onClick={() => {
              save().catch(() => setMessage(lt('v2.settings.failed')))
            }}
          >
            {busy ? lt('buttons.saving') : lt('v2.settings.save')}
          </button>
        </div>
      </div>
    </Modal>
  )
}

/** "Zarządzaj kategoriami": the rulebook editor on the live contest. Saving sends new settings. */
export function CategorySettings({
  state,
  submit,
  onClose,
}: {
  readonly state: ContestState
  readonly submit: (input: object) => void
  readonly onClose: () => void
}) {
  const { lt } = useLegacy()
  const [draft, setDraft] = useState<RulebookDraft>(() => toDraft(state.rulebook))
  const book = fromDraft(draft)
  return (
    <Modal title={lt('contest_detail.registrations.manage_categories')} size="xl" onClose={onClose}>
      <div className="space-y-6">
        <RulebookEditor draft={draft} onChange={setDraft} part="classes" />
        <RulebookEditor draft={draft} onChange={setDraft} part="rulebook" />
        {Result.isFailure(book) && <p role="alert">{book.failure.detail}</p>}
        <div className="flex justify-end gap-3">
          <button type="button" className="btn-secondary px-4 py-2" onClick={onClose}>
            {lt('buttons.close')}
          </button>
          <button
            type="button"
            className="btn-primary px-6 py-2"
            disabled={Result.isFailure(book)}
            onClick={() => {
              if (Result.isFailure(book)) return
              submit({ _tag: 'SetRulebook', rulebook: Schema.encodeSync(Rulebook)(book.success) })
              onClose()
            }}
          >
            {lt('buttons.save')}
          </button>
        </div>
      </div>
    </Modal>
  )
}
