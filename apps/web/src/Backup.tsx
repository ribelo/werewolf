import { StoredBackups, type StoredBackup } from '@werewolf/sync'
import * as Effect from 'effect/Effect'
import * as Schema from 'effect/Schema'
import { useEffect, useState } from 'react'
import { useMessages } from './i18n.ts'

type Outcome = 'idle' | 'done' | 'failed'
const run = (work: () => Promise<void>) => () => {
  Effect.runFork(Effect.promise(work))
}

/** Send a backup file to the Worker. Only a logged-in organizer on a live connection gets through. */
export async function sendBackup(path: string, file: File): Promise<Response> {
  return fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: await file.text(),
  })
}

export function BackupPanel({ id, online }: { readonly id: string; readonly online: boolean }) {
  const { t, locale } = useMessages()
  const [outcome, setOutcome] = useState<Outcome>('idle')
  const [stored, setStored] = useState<ReadonlyArray<StoredBackup>>([])
  const [busy, setBusy] = useState(false)
  const base = '/api/contests/' + id + '/backups'
  async function refresh() {
    const response = await fetch(base)
    if (!response.ok) return
    const decoded = Schema.decodeUnknownOption(StoredBackups)(await response.json())
    if (decoded._tag === 'Some') setStored(decoded.value.backups)
  }
  useEffect(() => {
    if (online) Effect.runFork(Effect.promise(refresh))
    // refresh reads only the contest id, which keys this panel.
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [id, online])
  async function create() {
    setBusy(true)
    const response = await fetch(base, { method: 'POST' })
    setBusy(false)
    setOutcome(response.ok ? 'done' : 'failed')
    await refresh()
  }
  const when = (backup: StoredBackup) =>
    new Date(backup.savedAt).toLocaleString(locale === 'pl' ? 'pl-PL' : 'en-GB')
  async function restoreStored(backup: StoredBackup) {
    if (!confirm(t('backup.confirmOne').replace('{time}', when(backup)))) return
    const file = await fetch(base + '/' + backup.name)
    if (!file.ok) {
      setOutcome('failed')
      return
    }
    const response = await fetch('/api/contests/' + id + '/restore', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: await file.text(),
    })
    setOutcome(response.ok ? 'done' : 'failed')
  }
  async function download() {
    const response = await fetch('/api/contests/' + id + '/backup')
    if (!response.ok) {
      setOutcome('failed')
      return
    }
    const link = document.createElement('a')
    link.href = URL.createObjectURL(await response.blob())
    link.download = 'backup-' + id + '.json'
    link.click()
    URL.revokeObjectURL(link.href)
  }
  const restore = (target: 'here' | 'new') => async (file: File) => {
    if (target === 'here' && !confirm(t('backup.confirm'))) return
    const response = await sendBackup(
      target === 'here' ? '/api/contests/' + id + '/restore' : '/api/restore',
      file,
    )
    if (!response.ok) {
      setOutcome('failed')
      return
    }
    setOutcome('done')
    if (target === 'new') {
      const created: unknown = await response.json()
      const created2 =
        typeof created === 'object' && created !== null && 'definition' in created
          ? created.definition
          : created
      if (
        typeof created2 === 'object' &&
        created2 !== null &&
        'id' in created2 &&
        typeof created2.id === 'string'
      )
        location.assign('/desk/' + created2.id)
    }
  }
  const picker = (label: string, target: 'here' | 'new') => (
    <label className="mb-4 block">
      <span className="input-label">{label}</span>
      <input
        className="input-field"
        type="file"
        accept=".json,application/json"
        disabled={!online}
        onChange={(event) => {
          const file = event.target.files?.[0]
          if (file) Effect.runFork(Effect.promise(() => restore(target)(file)))
          event.target.value = ''
        }}
      />
    </label>
  )
  return (
    <section className="card">
      <h3 className="text-h3 mb-3">{t('backup.title')}</h3>
      <p className="mb-3 text-sm text-text-secondary">{t('backup.help')}</p>
      <p className="mb-6">
        <button type="button" className="btn-primary" onClick={run(download)}>
          {t('backup.download')}
        </button>
      </p>
      <h4 className="text-h3 mb-2">{t('backup.stored')}</h4>
      <p className="mb-3 text-sm text-text-secondary">{t('backup.storedHelp')}</p>
      <p className="mb-4">
        <button
          type="button"
          className="btn-primary"
          disabled={!online || busy}
          onClick={run(create)}
        >
          {t('backup.create')}
        </button>
      </p>
      {stored.length === 0 ? (
        <p className="mb-6 text-sm text-text-secondary">{t('backup.none')}</p>
      ) : (
        <ul className="mb-6 max-h-64 space-y-2 overflow-y-auto">
          {stored.map((backup) => (
            <li
              key={backup.name}
              className="flex flex-wrap items-center justify-between gap-2 rounded border border-border-color px-3 py-2"
            >
              <span className="text-sm">
                {when(backup)}{' '}
                <span className="text-text-secondary">
                  ({t('backup.changes').replace('{count}', String(backup.commands))})
                </span>
              </span>
              <span className="flex gap-2">
                <a className="btn-secondary px-3 py-1 text-xxs" href={base + '/' + backup.name}>
                  {t('backup.downloadOne')}
                </a>
                <button
                  type="button"
                  className="btn-secondary px-3 py-1 text-xxs"
                  disabled={!online}
                  onClick={run(() => restoreStored(backup))}
                >
                  {t('backup.restoreOne')}
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}
      <h4 className="text-h3 mb-2">{t('backup.restore')}</h4>
      {!online && <p className="mb-2 text-sm text-status-warning">{t('backup.needOnline')}</p>}
      {picker(t('backup.restoreHere'), 'here')}
      {picker(t('backup.restoreNew'), 'new')}
      {outcome === 'failed' && <p role="alert">{t('backup.failed')}</p>}
      {outcome === 'done' && <p role="status">{t('backup.done')}</p>}
    </section>
  )
}
