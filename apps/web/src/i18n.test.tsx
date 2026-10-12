import { rulebookPresets } from '@werewolf/core'
import { expect, it } from 'vitest'
import { catalogs } from './i18n.ts'

const sources = import.meta.glob('./*.{ts,tsx}', { query: '?raw', import: 'default', eager: true })
const polish = new Set(Object.keys(catalogs.pl))
const english = new Set(Object.keys(catalogs.en))

it('ww-dh53: Polish and English catalogs have identical key sets and no empty text', () => {
  expect([...polish].filter((key) => !english.has(key))).toEqual([])
  expect([...english].filter((key) => !polish.has(key))).toEqual([])
  for (const text of [...Object.values(catalogs.pl), ...Object.values(catalogs.en)])
    expect(text.trim()).not.toBe('')
})

it('ww-dh53: every message key used in a screen exists in both catalogs', () => {
  const families = [
    'auth',
    'contests',
    'desk',
    'sync',
    'storage',
    'request',
    'meet',
    'stage',
    'announcer',
    'board',
    'tab',
    'plates',
    'status',
    'view',
    'entries',
    'warn',
    'teams',
    'import',
    'field',
    'problem',
    'wizard',
    'rb',
    'res',
    'backup',
    'a11y',
    'language',
    'app',
  ]
  const literal = new RegExp("'((?:" + families.join('|') + ")\\.[A-Za-z0-9.-]*[A-Za-z0-9])'", 'g')
  const used = new Set<string>()
  for (const [file, source] of Object.entries(sources))
    if (typeof source === 'string' && !file.includes('.test.') && !file.endsWith('i18n.ts'))
      for (const match of source.matchAll(literal)) used.add(match[1] ?? '')
  expect(used.size).toBeGreaterThan(100)
  expect([...used].filter((key) => !polish.has(key) || !english.has(key))).toEqual([])
})

it('ww-dh53: keys built at run time exist for every value the code can produce', () => {
  const families: Readonly<Record<string, ReadonlyArray<string>>> = {
    warn: ['sex', 'age', 'bodyweight', 'bodyweightMissing', 'lifts'],
    problem: [
      'nameMissing',
      'sexInvalid',
      'birthDateInvalid',
      'unknownLift',
      'unknownDivision',
      'liftMissing',
      'bodyweightInvalid',
      'lotInvalid',
      'openingInvalid',
      'entryRejected',
    ],
    field: [
      'name',
      'firstName',
      'lastName',
      'sex',
      'birthDate',
      'team',
      'lifts',
      'divisions',
      'bodyweight',
      'lotNumber',
    ],
    'wizard.step': ['basics', 'rulebook', 'classes', 'teams', 'entries', 'review'],
    'rb.preset': rulebookPresets.map((preset) => preset.id),
  }
  const missing = Object.entries(families).flatMap(([prefix, values]) =>
    values
      .map((value) => prefix + '.' + value)
      .filter((key) => !polish.has(key) || !english.has(key)),
  )
  expect(missing).toEqual([])
})
