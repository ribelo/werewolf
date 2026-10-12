import en from './legacy/en.json' with { type: 'json' }
import pl from './legacy/pl.json' with { type: 'json' }
import * as Option from 'effect/Option'
import { useMessages } from './i18n.ts'

/**
 * The texts of the 2025 app, copied unchanged so the screens read the same. Keys are the dotted paths
 * of the old locale files; values use the old ICU subset: {name} and {count, plural, one {…} other {…}}.
 */
/** Texts of features the 2025 app did not have, in the same tree under "v2". */
const extra = {
  pl: {
    v2: {
      export: { xlsx: 'Eksport Excel (XLSX)', print: 'Drukuj tabelę' },
      columns: { team: 'Klub' },
      registrations: { import: 'Import i drużyny' },
      dns: { mark: 'Nie wystartował (DNS)', unmark: 'Cofnij DNS', short: 'DNS' },
      clock: {
        title: 'Zegar podejścia',
        start: 'Start zegara',
        stop: 'Stop zegara',
        seconds: 'Czas na podejście (s)',
        idle: 'Zegar zatrzymany',
      },
      tiles: {
        backups_title: 'Kopie zapasowe',
        backups_description: 'Pobierz lub przywróć kopię zawodów.',
        videos_title: 'Filmy na telebim',
        videos_description: 'Filmy odtwarzane na ekranie scenicznym po werdykcie.',
      },
      team: { eligible: 'Kategorie wiekowe liczone do drużynówki', count: 'Liczba zawodników' },
      videos: {
        good: 'Po zaliczonej próbie',
        bad: 'Po niezaliczonej próbie',
        upload: 'Dodaj film',
        empty: 'Brak filmów.',
        delete: 'Usuń',
        hint: 'Ekran sceniczny odtwarza losowy film z listy po każdym werdykcie, a potem wraca do próby.',
      },
      settings: {
        save: 'Zapisz ustawienia',
        saved: 'Ustawienia zapisane.',
        pending: 'Poczekaj, aż wszystkie zmiany trafią na serwer, i spróbuj ponownie.',
        failed: 'Nie udało się zapisać ustawień.',
        database_description:
          'Stan serwera i liczba zawodów. Kopie zapasowe są w każdych zawodach (Stanowisko → Kopie zapasowe).',
        name: 'Nazwa',
      },
    },
  },
  en: {
    v2: {
      export: { xlsx: 'Export Excel (XLSX)', print: 'Print table' },
      columns: { team: 'Club' },
      registrations: { import: 'Import and teams' },
      dns: { mark: 'Did not start (DNS)', unmark: 'Undo DNS', short: 'DNS' },
      clock: {
        title: 'Attempt clock',
        start: 'Start clock',
        stop: 'Stop clock',
        seconds: 'Attempt time (s)',
        idle: 'Clock stopped',
      },
      tiles: {
        backups_title: 'Backups',
        backups_description: 'Download or restore a contest backup.',
        videos_title: 'Big screen videos',
        videos_description: 'Videos played on the stage screen after a verdict.',
      },
      team: { eligible: 'Age classes counted in team results', count: 'Lifters' },
      videos: {
        good: 'After a good lift',
        bad: 'After a no lift',
        upload: 'Add video',
        empty: 'No videos.',
        delete: 'Delete',
        hint: 'The stage screen plays a random video of the list after each verdict, then returns to the attempt.',
      },
      settings: {
        save: 'Save settings',
        saved: 'Settings saved.',
        name: 'Name',
        pending: 'Wait until every change reaches the server, then try again.',
        failed: 'The settings could not be saved.',
        database_description:
          'Server state and number of contests. Backups are in each contest (Desk → Backups).',
      },
    },
  },
}
const catalogs: Readonly<Record<'pl' | 'en', unknown>> = {
  pl: { ...pl, ...extra.pl },
  en: { ...en, ...extra.en },
}
export type Values = Readonly<Record<string, string | number>>

function lookup(tree: unknown, key: string): Option.Option<string> {
  let node: unknown = tree
  for (const part of key.split('.')) {
    if (typeof node !== 'object' || !node || !Object.hasOwn(node, part)) return Option.none()
    node = Reflect.get(node, part)
  }
  return typeof node === 'string' ? Option.some(node) : Option.none()
}

/** Find the end of a balanced {…} block that starts at index start. */
function closing(text: string, start: number): number {
  let depth = 0
  for (let index = start; index < text.length; index++) {
    const char = text.charAt(index)
    if (char === '{') depth++
    else if (char === '}') {
      depth--
      if (depth === 0) return index
    }
  }
  return text.length - 1
}

export function format(template: string, values: Values, locale: 'pl' | 'en'): string {
  let out = ''
  let index = 0
  while (index < template.length) {
    const char = template.charAt(index)
    if (char !== '{') {
      out += char
      index++
      continue
    }
    const end = closing(template, index)
    const body = template.slice(index + 1, end)
    index = end + 1
    const plural = /^\s*(\w+)\s*,\s*plural\s*,(.*)$/s.exec(body)
    if (plural) {
      const name = plural[1] ?? ''
      const count = Number(values[name] ?? 0)
      const options = new Map<string, string>()
      const rest = plural[2] ?? ''
      let cursor = 0
      while (cursor < rest.length) {
        const match = /\s*(=?\w+)\s*\{/y
        match.lastIndex = cursor
        const found = match.exec(rest)
        if (!found) break
        const open = match.lastIndex - 1
        const close = closing(rest, open)
        options.set(found[1] ?? '', rest.slice(open + 1, close))
        cursor = close + 1
      }
      const category = new Intl.PluralRules(locale).select(count)
      const chosen = options.get('=' + count) ?? options.get(category) ?? options.get('other') ?? ''
      out += format(chosen, values, locale).replaceAll('#', String(count))
      continue
    }
    const name = body.trim()
    out += name in values ? String(values[name]) : '{' + body + '}'
  }
  return out
}

/** Translate with the texts of the 2025 app. Missing keys fall back to English, then to the key. */
export function legacyText(locale: 'pl' | 'en', key: string, values: Values = {}): string {
  const template = Option.getOrElse(
    Option.orElse(lookup(catalogs[locale], key), () => lookup(catalogs.en, key)),
    () => key,
  )
  return format(template, values, locale)
}

export function useLegacy() {
  const { locale } = useMessages()
  return { locale, lt: (key: string, values: Values = {}) => legacyText(locale, key, values) }
}
