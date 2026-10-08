import { individualRankings, type Attempt, type ContestState } from '@werewolf/core'
import { ReadLinks, type ContestId } from '@werewolf/sync'
import * as Effect from 'effect/Effect'
import * as Fiber from 'effect/Fiber'
import * as Option from 'effect/Option'
import { useEffect, useState, type FormEvent } from 'react'
import { useMessages, rejectionText, type MessageKey } from './i18n.ts'
import { requestJson, useLiveContest, type Access } from './live-contest.ts'

function AttemptEditor({
  attempt,
  submit,
}: {
  readonly attempt: Attempt
  readonly submit: (input: object) => void
}) {
  const { t } = useMessages()
  function declare(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    submit({
      _tag: 'SetWeight',
      attempt: { entryId: attempt.entryId, liftId: attempt.liftId, number: attempt.number },
      weight: Number(new FormData(event.currentTarget).get('weight')),
    })
  }
  const ref = { entryId: attempt.entryId, liftId: attempt.liftId, number: attempt.number }
  return (
    <div className="attempt-editor">
      <form onSubmit={declare}>
        <input
          key={attempt._tag === 'Unannounced' ? '' : attempt.weight}
          aria-label={t('desk.weight')}
          name="weight"
          type="number"
          min="0"
          step="0.001"
          defaultValue={attempt._tag === 'Unannounced' ? '' : attempt.weight}
          required
        />
        <button type="submit">{t('desk.declare')}</button>
      </form>
      <button
        type="button"
        disabled={attempt._tag === 'Unannounced'}
        onClick={() => submit({ _tag: 'SetVerdict', attempt: ref, verdict: 'goodLift' })}
      >
        {t('desk.goodLift')}
      </button>
      <button
        type="button"
        disabled={attempt._tag === 'Unannounced'}
        onClick={() => submit({ _tag: 'SetVerdict', attempt: ref, verdict: 'noLift' })}
      >
        {t('desk.noLift')}
      </button>
    </div>
  )
}
function EntryForm({
  state,
  submit,
}: {
  readonly state: ContestState
  readonly submit: (input: object) => void
}) {
  const { locale, t } = useMessages()
  function add(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const bodyweight = form.get('bodyweight')
    submit({
      _tag: 'AddEntry',
      entry: {
        id: crypto.randomUUID(),
        lifter: {
          id: crypto.randomUUID(),
          name: form.get('name'),
          sex: form.get('sex'),
          birthDate: form.get('birthDate'),
        },
        lotNumber: Number(form.get('lotNumber')),
        ...(bodyweight === '' ? {} : { bodyweight: Number(bodyweight) }),
        divisions: [form.get('division')],
        lifts: form.getAll('lifts').map((liftId) => ({ liftId })),
      },
    })
  }
  return (
    <form onSubmit={add}>
      <h3>{t('desk.addEntry')}</h3>
      <label>
        {t('desk.name')}
        <input name="name" required />
      </label>
      <label>
        {t('desk.sex')}
        <select name="sex">
          <option value="male">{t('desk.male')}</option>
          <option value="female">{t('desk.female')}</option>
        </select>
      </label>
      <label>
        {t('desk.birthDate')}
        <input name="birthDate" type="date" required />
      </label>
      <label>
        {t('desk.bodyweight')}
        <input name="bodyweight" type="number" min="0.001" step="0.001" />
      </label>
      <label>
        {t('desk.lotNumber')}
        <input
          key={state.entries.length}
          name="lotNumber"
          type="number"
          min="1"
          step="1"
          defaultValue={Math.max(0, ...state.entries.map((entry) => entry.lotNumber)) + 1}
          required
        />
      </label>
      <label>
        {t('desk.division')}
        <select name="division">
          {state.rulebook.divisions.map((division) => (
            <option key={division.id} value={division.id}>
              {division.name[locale]}
            </option>
          ))}
        </select>
      </label>
      <fieldset>
        <legend>{t('desk.lifts')}</legend>
        {state.rulebook.lifts.map((lift) => (
          <label key={lift.id}>
            <input name="lifts" type="checkbox" value={lift.id} defaultChecked />
            {lift.name[locale]}
          </label>
        ))}
      </fieldset>
      <button type="submit">{t('desk.addEntry')}</button>
    </form>
  )
}
export function ContestDesk({ id, access }: { readonly id: ContestId; readonly access: Access }) {
  const { locale, t } = useMessages()
  const live = useLiveContest(id, access)
  const [links, setLinks] = useState<Option.Option<ReadLinks>>(Option.none())
  const [error, setError] = useState<MessageKey | ''>('')
  const editor = access._tag === 'Editor'
  useEffect(() => {
    if (!editor) return
    const fiber = Effect.runFork(
      requestJson(ReadLinks, '/api/contests/' + id + '/links').pipe(
        Effect.match({
          onSuccess: (value) => setLinks(Option.some(value)),
          onFailure: (failure) => setError(failure.code),
        }),
      ),
    )
    return () => {
      Effect.runFork(Fiber.interrupt(fiber))
    }
  }, [id, editor])
  if (live.view._tag !== 'Ready')
    return (
      <section>
        <p role="status">
          {t(live.view._tag === 'Invalid' ? 'request.invalid' : 'desk.connecting')}
        </p>
        {live.error && <p role="alert">{t(live.error)}</p>}
      </section>
    )
  const { replica } = live.view
  const { definition } = replica.state.snapshot
  const { journal } = replica
  const state = journal.state
  return (
    <section>
      <h2>
        {definition.name} — {definition.date}
      </h2>
      <p role="status">
        {t(live.connected ? 'desk.connected' : 'desk.disconnected')} · {t('desk.sequence')}:{' '}
        {replica.state.snapshot.commands.length} · {t('sync.pending')}:{' '}
        {replica.state.pending.length} · {t('sync.peers')}: {live.peers}
        {!editor && ' · ' + t('auth.readOnly')}
      </p>
      {live.error && <p role="alert">{t(live.error)}</p>}
      {live.rejection && (
        <p role="alert">
          {t('desk.rejected')} {rejectionText(live.rejection, locale)}
        </p>
      )}
      {(replica.state.rejected.length > 0 || replica.conflicts.length > 0) && (
        <aside role="status">
          <h3>{t('sync.review')}</h3>
          <ul>
            {[...replica.state.rejected, ...replica.conflicts].map((item) => (
              <li key={item.command.id}>{rejectionText(item.reason, locale)}</li>
            ))}
          </ul>
        </aside>
      )}
      {error && <p role="alert">{t(error)}</p>}
      {Option.isSome(links) && (
        <nav className="read-links">
          {Object.entries(links.value).map(([role, url]) => (
            <a key={role} href={url} target="_blank" rel="noreferrer">
              {t(
                role === 'stage'
                  ? 'desk.stage'
                  : role === 'announcer'
                    ? 'desk.announcer'
                    : 'desk.results',
              )}
            </a>
          ))}
        </nav>
      )}
      {editor && <EntryForm state={state} submit={live.submit} />}
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>{t('desk.lotNumber')}</th>
              <th>{t('desk.name')}</th>
              <th>{t('desk.lift')}</th>
              <th>{t('desk.attempt')}</th>
              <th>{t('desk.weight')}</th>
              <th>{t('desk.verdict')}</th>
              {editor && <th>{t('desk.actions')}</th>}
            </tr>
          </thead>
          <tbody>
            {state.attempts.map((attempt) => {
              const entry = state.entries.find((item) => item.id === attempt.entryId)
              const lift = state.rulebook.lifts.find((item) => item.id === attempt.liftId)
              return (
                <tr key={attempt.entryId + '/' + attempt.liftId + '/' + attempt.number}>
                  <td>{entry?.lotNumber}</td>
                  <td>{entry?.lifter.name}</td>
                  <td>{lift?.name[locale]}</td>
                  <td>{attempt.number}</td>
                  <td>{attempt._tag === 'Unannounced' ? '—' : attempt.weight}</td>
                  <td>
                    {attempt._tag === 'Judged'
                      ? t(attempt.verdict === 'goodLift' ? 'desk.goodLift' : 'desk.noLift')
                      : '—'}
                  </td>
                  {editor && (
                    <td>
                      <AttemptEditor attempt={attempt} submit={live.submit} />
                    </td>
                  )}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      {individualRankings(state).map((ranking) => (
        <section key={ranking.classificationId}>
          <h3>
            {
              state.rulebook.classifications.find((item) => item.id === ranking.classificationId)
                ?.name[locale]
            }
          </h3>
          {ranking.groups.map((group) => (
            <ol key={JSON.stringify(group.bucket)}>
              {group.rows.map((row) => (
                <li key={row.entry.id} value={row.place}>
                  {row.entry.lifter.name} — {row.points}
                </li>
              ))}
            </ol>
          ))}
          <p>
            {t('desk.pending')}: {ranking.pending.length}
          </p>
        </section>
      ))}
    </section>
  )
}
