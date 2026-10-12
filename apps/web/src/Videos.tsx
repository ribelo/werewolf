import { useCallback, useEffect, useState } from 'react'
import { useLegacy } from './legacy-i18n.ts'

export type VideoKind = 'good' | 'bad'
export interface VideoList {
  readonly good: ReadonlyArray<{ readonly name: string }>
  readonly bad: ReadonlyArray<{ readonly name: string }>
}
const empty: VideoList = { good: [], bad: [] }

export const videoUrl = (kind: VideoKind, name: string) =>
  '/api/videos/' + kind + '/' + encodeURIComponent(name)

/** The video library of this deployment; refreshes on demand. */
export function useVideos(): readonly [VideoList, () => void] {
  const [list, setList] = useState<VideoList>(empty)
  const refresh = useCallback(() => {
    fetch('/api/videos')
      .then((response): Promise<Partial<VideoList>> =>
        response.ok ? response.json() : Promise.resolve(empty),
      )
      .then((value) => setList({ good: value.good ?? [], bad: value.bad ?? [] }))
      .catch(() => setList(empty))
  }, [])
  useEffect(refresh, [refresh])
  return [list, refresh]
}

const safeName = (file: File) =>
  Date.now() +
  '-' +
  file.name
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[^A-Za-z0-9._-]+/g, '_')

/** Upload and delete the clips that the stage screen plays after good and failed lifts. */
export function VideoLibrary() {
  const { lt } = useLegacy()
  const [list, refresh] = useVideos()
  const [busy, setBusy] = useState(false)
  async function upload(kind: VideoKind, file: File) {
    setBusy(true)
    await fetch(videoUrl(kind, safeName(file)), {
      method: 'PUT',
      headers: { 'Content-Type': file.type || 'video/mp4' },
      body: file,
    }).then(
      () => {},
      () => {},
    )
    setBusy(false)
    refresh()
  }
  async function remove(kind: VideoKind, name: string) {
    await fetch(videoUrl(kind, name), { method: 'DELETE' }).then(
      () => {},
      () => {},
    )
    refresh()
  }
  return (
    <section className="space-y-3">
      <div>
        <h3 className="text-label text-text-secondary">{lt('v2.tiles.videos_title')}</h3>
        <p className="text-caption text-text-secondary">{lt('v2.videos.hint')}</p>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        {(['good', 'bad'] as const).map((kind) => (
          <div key={kind} className="rounded border border-border-color p-3 space-y-2">
            <p className="text-label text-text-secondary">{lt('v2.videos.' + kind)}</p>
            {list[kind].length === 0 ? (
              <p className="text-caption text-text-secondary">{lt('v2.videos.empty')}</p>
            ) : (
              <ul className="space-y-1">
                {list[kind].map((item) => (
                  <li
                    key={item.name}
                    className="flex items-center justify-between gap-2 text-caption"
                  >
                    <a
                      className="truncate text-text-primary underline"
                      href={videoUrl(kind, item.name)}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {item.name.replace(/^\d+-/, '')}
                    </a>
                    <button
                      type="button"
                      className="btn-secondary px-2 py-0.5 text-xxs"
                      onClick={() => {
                        remove(kind, item.name).catch(() => {})
                      }}
                    >
                      {lt('v2.videos.delete')}
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <label className="btn-secondary inline-block cursor-pointer px-3 py-1 text-xxs">
              {busy ? lt('buttons.saving') : lt('v2.videos.upload')}
              <input
                type="file"
                accept="video/*"
                className="hidden"
                disabled={busy}
                onChange={(event) => {
                  const file = event.target.files?.[0]
                  if (file) upload(kind, file).catch(() => setBusy(false))
                  event.target.value = ''
                }}
              />
            </label>
          </div>
        ))}
      </div>
    </section>
  )
}
