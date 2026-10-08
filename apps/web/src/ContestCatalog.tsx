import { client2026Rulebook } from '@werewolf/core'
import { Catalog, Snapshot } from '@werewolf/sync'
import * as Effect from 'effect/Effect'
import * as Fiber from 'effect/Fiber'
import { useEffect, useState, type FormEvent } from 'react'
import { requestJson } from './live-contest.ts'
import { useMessages, type MessageKey } from './i18n.ts'

export function ContestCatalog() {
  const { locale, t } = useMessages()
  const [catalog, setCatalog] = useState<typeof Catalog.Type>({ contests: [] })
  const [draftId, setDraftId] = useState(() => crypto.randomUUID())
  const [error, setError] = useState<MessageKey | ''>('')
  const [pending, setPending] = useState(false)
  useEffect(() => {
    const fiber = Effect.runFork(
      requestJson(Catalog, '/api/contests').pipe(
        Effect.match({ onSuccess: setCatalog, onFailure: (failure) => setError(failure.code) }),
      ),
    )
    return () => {
      Effect.runFork(Fiber.interrupt(fiber))
    }
  }, [])
  function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    setPending(true)
    setError('')
    Effect.runFork(
      requestJson(Snapshot, '/api/contests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: draftId,
          name: form.get('name'),
          date: form.get('date'),
          rulebook: client2026Rulebook,
        }),
      }).pipe(
        Effect.match({
          onFailure: (failure) => {
            setPending(false)
            setError(failure.code)
          },
          onSuccess: (snapshot) => {
            setCatalog((previous) => ({
              contests: [
                ...previous.contests.filter((contest) => contest.id !== snapshot.definition.id),
                snapshot.definition,
              ],
            }))
            location.assign('/desk/' + snapshot.definition.id)
            setDraftId(crypto.randomUUID())
            setPending(false)
          },
        }),
      ),
    )
  }
  return (
    <section>
      <h2>{t('contests.title')}</h2>
      {catalog.contests.length === 0 ? (
        <p>{t('contests.empty')}</p>
      ) : (
        <ul>
          {catalog.contests.map((contest) => (
            <li key={contest.id}>
              <button type="button" onClick={() => location.assign('/desk/' + contest.id)}>
                {contest.name} — {contest.date}
              </button>
            </li>
          ))}
        </ul>
      )}
      <form onSubmit={create}>
        <h3>{t('contests.create')}</h3>
        <label>
          {t('contests.name')}
          <input name="name" required />
        </label>
        <label>
          {t('desk.date')}
          <input
            name="date"
            type="date"
            defaultValue={new Intl.DateTimeFormat('sv-SE').format(new Date())}
            required
          />
        </label>
        <label>
          {t('desk.preset')}
          <select name="preset">
            <option>{client2026Rulebook.name[locale]}</option>
          </select>
        </label>
        <button disabled={pending} type="submit">
          {t('contests.create')}
        </button>
      </form>
      {error && <p role="alert">{t(error)}</p>}
    </section>
  )
}
