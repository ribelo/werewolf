import * as Schema from 'effect/Schema'
import maleInput from './data/reshel-men.json' with { type: 'json' }
import femaleInput from './data/reshel-women.json' with { type: 'json' }
import ageInput from './data/mccullough.json' with { type: 'json' }
import type { Kilograms } from './barbell.ts'
import { ageOnDate, type CalendarDate, type Sex } from './lifter.ts'

const Positive = Schema.Finite.check(Schema.isGreaterThan(0))
const ReshelTable = Schema.Struct({
  incrementKg: Positive,
  entries: Schema.NonEmptyArray(Schema.Struct({ bodyweightKg: Positive, coefficient: Positive })),
})
const AgeTable = Schema.Struct({
  entries: Schema.NonEmptyArray(
    Schema.Struct({
      age: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
      coefficient: Positive,
    }),
  ),
})
// These bundled source datasets are programmer-owned. A malformed dataset is a defect.
const tables = {
  male: Schema.decodeUnknownSync(ReshelTable)(maleInput),
  female: Schema.decodeUnknownSync(ReshelTable)(femaleInput),
}
const masters = Schema.decodeUnknownSync(AgeTable)(ageInput).entries

function closest<A>(
  entries: readonly [A, ...ReadonlyArray<A>],
  target: number,
  key: (entry: A) => number,
): A {
  let winner = entries[0]
  for (const entry of entries)
    if (Math.abs(key(entry) - target) < Math.abs(key(winner) - target)) winner = entry
  return winner
}

/** The 2025 lookup rounds to a quarter kilogram, clamps to the table and picks the nearest listed row. */
export function reshelCoefficient(bodyweight: Kilograms, sex: Sex): number {
  if (bodyweight === 0) return 1
  const table = tables[sex]
  const rounded = Number(
    (Math.round(bodyweight / table.incrementKg) * table.incrementKg).toFixed(2),
  )
  return closest(table.entries, rounded, (entry) => entry.bodyweightKg).coefficient
}

/** Completed years at the supplied contest date; under 40 stays at 1.0 and ages above 90 use the last row. */
export function mcCulloughCoefficient(birthDate: CalendarDate, contestDate: CalendarDate): number {
  return closest(masters, ageOnDate(birthDate, contestDate), (entry) => entry.age).coefficient
}
