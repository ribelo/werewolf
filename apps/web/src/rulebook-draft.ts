import { parseRulebook, Rulebook, type InvalidRulebook } from '@werewolf/core'
import * as Result from 'effect/Result'
import * as Schema from 'effect/Schema'

/** The editable text-and-number form of a rulebook. It becomes a Rulebook only through parseRulebook. */
type Name = { pl: string; en: string }
interface LiftDraft {
  id: string
  name: Name
  attempts: number
  rackHeight: boolean
  code?: string
  exportName?: string
}
export interface DivisionDraft {
  id: string
  name: Name
  policy: 'reject' | 'warn'
  conditions: {
    sex?: 'male' | 'female'
    minAge?: number
    maxAge?: number
    minBodyweight?: number
    maxBodyweight?: number
    allowedLifts?: ReadonlyArray<string>
  }
}
interface AgeClassDraft {
  id: string
  name: Name
  sex?: 'male' | 'female'
  from: number
  through?: number
}
interface WeightClassDraft {
  id: string
  name: Name
  sex?: 'male' | 'female'
  lowerExclusive?: number
  upperInclusive?: number
}
export interface ClassificationDraft {
  id: string
  name: Name
  kind: 'individual' | 'team'
  membership: { kind: 'all' } | { kind: 'divisions'; ids: ReadonlyArray<string> }
  liftIds: ReadonlyArray<string>
  result: 'best' | 'sum' | 'sumDone'
  formula: 'kilograms' | 'reshel' | 'reshelMcCullough'
  sex?: 'male' | 'female'
  split?: 'none' | 'age' | 'weight' | 'ageAndWeight'
  quota?: { kind: 'any'; count: number } | { kind: 'bySex'; male: number; female: number }
}
export interface RulebookDraft {
  name: Name
  lifts: ReadonlyArray<LiftDraft>
  divisions: ReadonlyArray<DivisionDraft>
  ageClasses: ReadonlyArray<AgeClassDraft>
  weightClasses: ReadonlyArray<WeightClassDraft>
  classifications: ReadonlyArray<ClassificationDraft>
  barbell: {
    bars: { male: number; female: number }
    clampsPerSide: number
    plates: ReadonlyArray<{ weight: number; pairs: number }>
  }
}

export function toDraft(book: Rulebook): RulebookDraft {
  const encoded = Schema.encodeSync(Rulebook)(book)
  // Structured copy: the encoded value is read-only and may share arrays with the preset.
  return structuredClone({
    name: encoded.name,
    lifts: [...encoded.lifts],
    divisions: [...encoded.divisions],
    ageClasses: [...encoded.ageClasses],
    weightClasses: [...encoded.weightClasses],
    classifications: [...encoded.classifications],
    barbell: encoded.barbell,
  })
}
export function fromDraft(draft: RulebookDraft): Result.Result<Rulebook, InvalidRulebook> {
  return parseRulebook({ version: 1, ...draft })
}
