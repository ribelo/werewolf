import * as Result from 'effect/Result'
import * as Schema from 'effect/Schema'
import clientInput from './data/client-2026.json' with { type: 'json' }
import { InvalidRulebook, parseRulebook, Rulebook } from './rulebook.ts'

/** Starting 2026 rules. Equipment and individual rankings remain editable; kids rules are not set. */
export const client2026Rulebook = Schema.decodeUnknownSync(Rulebook)(clientInput)

const lift = (
  id: string,
  pl: string,
  en: string,
  rackHeight: boolean,
  code: string,
  exportName: string,
) => ({
  id,
  name: { pl, en },
  attempts: 3,
  rackHeight,
  code,
  exportName,
})
const open = {
  id: 'open',
  name: { pl: 'Open', en: 'Open' },
  policy: 'reject',
  conditions: {},
}
const individual = (
  id: string,
  pl: string,
  en: string,
  liftIds: ReadonlyArray<string>,
  result: 'best' | 'sum',
) => ({
  id,
  name: { pl, en },
  kind: 'individual',
  membership: { kind: 'divisions', ids: ['open'] },
  liftIds,
  result,
  formula: 'reshelMcCullough',
  split: 'none',
})
const base = {
  version: 1,
  divisions: [open],
  ageClasses: [],
  weightClasses: [],
  barbell: client2026Rulebook.barbell,
}
const decode = Schema.decodeUnknownSync(Rulebook)

/** Rulebooks that ship with the app. The organizer edits a copy before the contest is created. */
export const rulebookPresets = [
  { id: 'client-2026', rulebook: client2026Rulebook },
  {
    id: 'powerlifting',
    rulebook: decode({
      ...base,
      name: { pl: 'Trójbój siłowy', en: 'Powerlifting' },
      lifts: [
        lift('squat', 'Przysiad', 'Squat', true, 'SQ', 'Squat'),
        lift('bench', 'Wyciskanie leżąc', 'Bench press', true, 'BP', 'Bench'),
        lift('deadlift', 'Martwy ciąg', 'Deadlift', false, 'DL', 'Deadlift'),
      ],
      classifications: [
        individual(
          'open-total',
          'Open — suma',
          'Open — total',
          ['squat', 'bench', 'deadlift'],
          'sum',
        ),
      ],
    }),
  },
  {
    id: 'bench-deadlift',
    rulebook: decode({
      ...base,
      name: { pl: 'Wyciskanie i martwy ciąg', en: 'Bench press and deadlift' },
      lifts: [
        lift('bench', 'Wyciskanie leżąc', 'Bench press', true, 'BP', 'Bench'),
        lift('deadlift', 'Martwy ciąg', 'Deadlift', false, 'DL', 'Deadlift'),
      ],
      classifications: [
        individual('open-bench', 'Open — wyciskanie', 'Open — bench', ['bench'], 'best'),
        individual('open-deadlift', 'Open — martwy ciąg', 'Open — deadlift', ['deadlift'], 'best'),
        individual('open-total', 'Open — suma', 'Open — total', ['bench', 'deadlift'], 'sum'),
      ],
    }),
  },
  {
    id: 'single-lift',
    rulebook: decode({
      ...base,
      name: { pl: 'Jeden bój', en: 'Single lift' },
      lifts: [lift('lift', 'Bój', 'Lift', false, 'LF', 'Lift')],
      classifications: [individual('open-lift', 'Open', 'Open', ['lift'], 'best')],
    }),
  },
] as const

/** The portable text of a rulebook: stable, indented JSON that parseRulebookJson reads back unchanged. */
export function rulebookToJson(book: Rulebook): string {
  return JSON.stringify(Schema.encodeSync(Rulebook)(book), (_key, value: unknown) => value, 2)
}

/** Read exported or hand-written JSON; the failure carries one readable sentence. */
export function parseRulebookJson(text: string): Result.Result<Rulebook, InvalidRulebook> {
  const json = Result.try({
    try: (): unknown => JSON.parse(text),
    catch: () => new InvalidRulebook({ detail: 'The text is not valid JSON.' }),
  })
  return Result.flatMap(json, (value) =>
    Result.mapError(
      parseRulebook(value),
      (failure) =>
        new InvalidRulebook({
          detail: 'The rulebook is not valid: ' + failure.detail.split('\n')[0],
        }),
    ),
  )
}
