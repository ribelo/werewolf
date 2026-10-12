import {
  CalendarDate,
  Command,
  ContestJournal,
  rulebookPresets,
  Rulebook,
  type Rulebook as RulebookType,
} from '@werewolf/core'
import { ContestId } from '@werewolf/sync'
import * as Effect from 'effect/Effect'
import * as Option from 'effect/Option'
import * as Result from 'effect/Result'
import * as Schema from 'effect/Schema'
import { useState } from 'react'
import { EntriesPanel, TeamsPanel } from './EntriesPanel.tsx'
import { useMessages } from './i18n.ts'
import { useLegacy } from './legacy-i18n.ts'
import { RulebookEditor } from './RulebookEditor.tsx'
import { fromDraft, toDraft, type RulebookDraft } from './rulebook-draft.ts'

const steps = ['basics', 'rulebook', 'classes', 'teams', 'entries', 'review'] as const
type Step = (typeof steps)[number]
const post = (path: string, body: unknown) =>
  Effect.tryPromise({
    try: () =>
      fetch(path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }),
    catch: () => 'network',
  }).pipe(Effect.flatMap((response) => (response.ok ? Effect.void : Effect.fail('http'))))

/** Setup in six steps. Teams and entries are kept as commands and sent after the contest exists. */
export function Wizard() {
  const { locale, t, tx } = useMessages()
  const [step, setStep] = useState<Step>('basics')
  const { lt } = useLegacy()
  const [name, setName] = useState('')
  const [place, setPlace] = useState('')
  const [date, setDate] = useState(() => new Intl.DateTimeFormat('sv-SE').format(new Date()))
  const [presetId, setPresetId] = useState<string>(rulebookPresets[0].id)
  const [draft, setDraft] = useState<RulebookDraft>(() => toDraft(rulebookPresets[0].rulebook))
  const [commands, setCommands] = useState<ReadonlyArray<Command>>([])
  const [failed, setFailed] = useState(false)
  const [busy, setBusy] = useState(false)
  const parsedDate = Schema.decodeUnknownResult(CalendarDate)(date)
  const book = fromDraft(draft)
  const ready = Result.isSuccess(book) && Result.isSuccess(parsedDate) && name.trim() !== ''
  // A rulebook change can make old commands invalid; then the local list starts again.
  const journalOption: Option.Option<ContestJournal> =
    Result.isSuccess(book) && Result.isSuccess(parsedDate)
      ? Option.map(
          Option.orElse(
            Option.getSuccess(ContestJournal.restore(book.success, parsedDate.success, commands)),
            () => Option.getSuccess(ContestJournal.restore(book.success, parsedDate.success, [])),
          ),
          (value) => value,
        )
      : Option.none()
  const index = steps.indexOf(step)
  function submit(input: object) {
    if (!Result.isSuccess(book) || !Result.isSuccess(parsedDate)) return
    const parsed = Schema.decodeUnknownResult(Command)({
      ...input,
      id: crypto.randomUUID(),
      at: Date.now(),
    })
    if (Result.isFailure(parsed)) return
    const { rulebook, day } = { rulebook: book.success, day: parsedDate.success }
    // An import sends many commands in one tick, so each one builds on the latest list.
    setCommands((previous) => {
      const restored = ContestJournal.restore(rulebook, day, previous)
      if (Result.isFailure(restored)) return previous
      const appended = restored.success.append(parsed.success)
      return Result.isSuccess(appended) ? appended.success.commands : previous
    })
  }
  function create(rulebook: RulebookType) {
    const id = Schema.decodeSync(ContestId)(crypto.randomUUID())
    setBusy(true)
    setFailed(false)
    const send = Effect.gen(function* () {
      yield* post('/api/contests', {
        id,
        name: name.trim(),
        date,
        ...(place.trim() ? { location: place.trim() } : {}),
        rulebook: Schema.encodeSync(Rulebook)(rulebook),
      })
      for (const command of Option.isSome(journalOption) ? journalOption.value.commands : [])
        yield* post('/api/contests/' + id + '/commands', {
          _tag: 'Submit',
          command: Schema.encodeSync(Command)(command),
        })
    })
    Effect.runFork(
      send.pipe(
        Effect.match({
          onSuccess: () => location.assign('/desk/' + id),
          onFailure: () => {
            setFailed(true)
            setBusy(false)
          },
        }),
      ),
    )
  }
  const nextDisabled =
    (step === 'basics' && (name.trim() === '' || Result.isFailure(parsedDate))) ||
    (step !== 'basics' && Result.isFailure(book))
  return (
    <div className="space-y-8">
      <div className="card">
        <header className="card-header flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h2 className="text-h2 text-text-primary">{lt('contest.wizard.title')}</h2>
            <p className="text-body text-text-secondary">
              {lt('contest.wizard.step_label')} {index + 1} {lt('contest.wizard.step_connector')}{' '}
              {steps.length}
            </p>
          </div>
          <div className="flex flex-wrap gap-2 justify-end">
            <button
              className="btn-secondary"
              type="button"
              disabled={index === 0}
              onClick={() => setStep(steps[index - 1] ?? 'basics')}
            >
              {lt('contest.wizard.actions.previous')}
            </button>
            <button
              className="btn-primary"
              type="button"
              disabled={index < steps.length - 1 ? nextDisabled : !ready || busy}
              onClick={() =>
                index < steps.length - 1
                  ? setStep(steps[index + 1] ?? 'review')
                  : Result.isSuccess(book) && create(book.success)
              }
            >
              {index < steps.length - 1
                ? lt('contest.wizard.actions.next')
                : busy
                  ? lt('contest.wizard.actions.submitting')
                  : lt('contest.wizard.actions.submit')}
            </button>
          </div>
        </header>
        {failed && (
          <div
            role="alert"
            className="bg-status-error/20 border border-status-error text-status-error px-4 py-3 mb-4"
          >
            {t('wizard.failed')}
          </div>
        )}
        <section className="space-y-6">
          <div className="space-y-2">
            <h3 className="text-h3 text-text-primary">
              {step === 'basics' ? lt('contest.wizard.steps.basic') : tx('wizard.step.' + step)}
            </h3>
            {step === 'basics' && (
              <p className="text-caption text-text-secondary">
                {lt('contest.wizard.steps.basic_hint')}
              </p>
            )}
          </div>
          {step === 'basics' && (
            <form className="space-y-4" onSubmit={(event) => event.preventDefault()}>
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <label className="input-label" htmlFor="contest-name">
                    {lt('contest.wizard.fields.name.label')}
                  </label>
                  <input
                    id="contest-name"
                    className="input-field w-full"
                    value={name}
                    placeholder={lt('contest.wizard.fields.name.placeholder')}
                    onChange={(event) => setName(event.target.value)}
                    required
                  />
                </div>
                <div>
                  <label className="input-label" htmlFor="contest-date">
                    {lt('contest.wizard.fields.date.label')}
                  </label>
                  <input
                    id="contest-date"
                    className="input-field w-full"
                    type="date"
                    value={date}
                    onChange={(event) => setDate(event.target.value)}
                    required
                  />
                </div>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <label className="input-label" htmlFor="location">
                    {lt('contest.wizard.fields.location.label')}
                  </label>
                  <input
                    id="location"
                    className="input-field w-full"
                    value={place}
                    placeholder={lt('contest.wizard.fields.location.placeholder')}
                    onChange={(event) => setPlace(event.target.value)}
                  />
                </div>
                <div>
                  <label className="input-label" htmlFor="preset">
                    {t('desk.preset')}
                  </label>
                  <select
                    id="preset"
                    className="input-field w-full"
                    value={presetId}
                    onChange={(event) => {
                      const preset = rulebookPresets.find((item) => item.id === event.target.value)
                      if (!preset) return
                      setPresetId(preset.id)
                      setDraft(toDraft(preset.rulebook))
                      setCommands([])
                    }}
                  >
                    {rulebookPresets.map((preset) => (
                      <option key={preset.id} value={preset.id}>
                        {tx('rb.preset.' + preset.id)} — {preset.rulebook.name[locale]}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </form>
          )}
          {step === 'rulebook' && (
            <RulebookEditor draft={draft} onChange={setDraft} part="rulebook" />
          )}
          {step === 'classes' && (
            <RulebookEditor draft={draft} onChange={setDraft} part="classes" />
          )}
          {step === 'teams' && Option.isSome(journalOption) && (
            <TeamsPanel state={journalOption.value.state} submit={submit} />
          )}
          {step === 'entries' && Option.isSome(journalOption) && (
            <EntriesPanel
              state={journalOption.value.state}
              journal={journalOption.value}
              submit={submit}
              withTeams={false}
            />
          )}
          {step === 'review' && (
            <section className="card">
              <h3 className="text-h3 mb-2">{t('wizard.summary')}</h3>
              {Result.isSuccess(book) && (
                <ul className="mb-4 text-sm">
                  <li>
                    {name} — {date}
                  </li>
                  <li>
                    {t('rb.lifts')}:{' '}
                    {book.success.lifts.map((lift) => lift.name[locale]).join(', ')}
                  </li>
                  <li>
                    {t('rb.divisions')}:{' '}
                    {book.success.divisions.map((division) => division.name[locale]).join(', ')}
                  </li>
                  <li>
                    {t('rb.classifications')}: {book.success.classifications.length}
                  </li>
                  <li>
                    {t('teams.title')}:{' '}
                    {Option.isSome(journalOption) ? journalOption.value.state.teams.length : 0}
                  </li>
                  <li>
                    {t('entries.title')}:{' '}
                    {Option.isSome(journalOption) ? journalOption.value.state.entries.length : 0}
                  </li>
                </ul>
              )}
            </section>
          )}
        </section>
      </div>
    </div>
  )
}
