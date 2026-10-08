// ADR 0004 requires Effect Atom. Pin its version because the API is unstable.
// @effect-diagnostics unstableApiUsage:off
import * as Atom from 'effect/reactivity/Atom'
import { useAtom } from '@effect/atom-react'

const catalogs = {
  pl: {
    'app.title': 'Werewolf',
    'auth.title': 'Logowanie organizatora',
    'auth.password': 'Hasło organizatora',
    'auth.login': 'Zaloguj',
    'auth.logout': 'Wyloguj',
    'auth.invalid': 'Nieprawidłowe hasło.',
    'auth.required': 'Zaloguj się, aby edytować.',
    'auth.origin': 'Żądanie pochodzi z innej strony.',
    'request.invalid': 'Nieprawidłowe żądanie.',
    'request.notFound': 'Nie znaleziono.',
    'request.failed': 'Brak połączenia. Spróbuj ponownie.',
    'contests.title': 'Zawody',
    'contests.empty': 'Nie ma jeszcze zawodów.',
    'language.label': 'Język',
    'auth.pending': 'Logowanie…',
  },
  en: {
    'app.title': 'Werewolf',
    'auth.title': 'Organizer login',
    'auth.password': 'Organizer password',
    'auth.login': 'Log in',
    'auth.logout': 'Log out',
    'auth.invalid': 'Incorrect password.',
    'auth.required': 'Log in to edit.',
    'auth.origin': 'Request came from a different site.',
    'request.invalid': 'Invalid request.',
    'request.notFound': 'Not found.',
    'request.failed': 'No connection. Try again.',
    'contests.title': 'Contests',
    'contests.empty': 'No contests yet.',
    'language.label': 'Language',
    'auth.pending': 'Logging in…',
  },
} as const
export type MessageKey = keyof typeof catalogs.pl
type Locale = keyof typeof catalogs
const localeAtom = Atom.make<Locale>('pl')

export function useMessages() {
  const [locale, setLocale] = useAtom(localeAtom)
  return { locale, setLocale, t: (key: MessageKey): string => catalogs[locale][key] }
}
