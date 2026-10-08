import * as Schema from 'effect/Schema'
import type { Sex } from './lifter.ts'

/** Kilograms have exact gram precision. Inventory arithmetic uses integer grams. */
export const Kilograms = Schema.Finite.check(
  Schema.isGreaterThanOrEqualTo(0),
  Schema.makeFilter(
    (value) =>
      Number.isSafeInteger(Math.round(value * 1000)) &&
      Math.abs(value * 1000 - Math.round(value * 1000)) < 0.000001,
  ),
).pipe(Schema.brand('Kilograms'))
export type Kilograms = typeof Kilograms.Type
const PositiveKilograms = Kilograms.check(Schema.isGreaterThan(0))
const Plate = Schema.Struct({
  weight: PositiveKilograms,
  pairs: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
})
/** clampsPerSide is one clamp's weight; pairs is the number of matched plate pairs. */
export const Barbell = Schema.Struct({
  bars: Schema.Struct({ male: PositiveKilograms, female: PositiveKilograms }),
  clampsPerSide: Kilograms,
  plates: Schema.Array(Plate),
}).check(
  Schema.makeFilter(
    (barbell) =>
      new Set(barbell.plates.map((plate) => plate.weight)).size === barbell.plates.length &&
      Number.isSafeInteger(
        Math.round(Math.max(barbell.bars.male, barbell.bars.female) * 1000) +
          Math.round(barbell.clampsPerSide * 2000) +
          barbell.plates.reduce(
            (sum, plate) => sum + Math.round(plate.weight * 2000) * plate.pairs,
            0,
          ),
      ),
  ),
)
export type Barbell = typeof Barbell.Type
export interface PlateStack {
  readonly weight: Kilograms
  readonly count: number
}
export type BarbellLoad =
  | {
      readonly _tag: 'Loadable'
      readonly weight: Kilograms
      readonly platesPerSide: ReadonlyArray<PlateStack>
    }
  | {
      readonly _tag: 'Unloadable'
      readonly requested: Kilograms
      readonly nearest: Kilograms
      readonly platesPerSide: ReadonlyArray<PlateStack>
    }

/** Find an exact bounded inventory load, or its nearest alternative; ties choose the lower load. */
export function loadBarbell(barbell: Barbell, sex: Sex, requested: Kilograms): BarbellLoad {
  const base = Math.round(barbell.bars[sex] * 1000) + Math.round(barbell.clampsPerSide * 2000)
  const requestedGrams = Math.round(requested * 1000)
  const inventory = barbell.plates.toSorted((a, b) => b.weight - a.weight)
  const maximumSide = inventory.reduce(
    (sum, plate) => sum + Math.round(plate.weight * 1000) * plate.pairs,
    0,
  )
  const maximum = base + 2 * maximumSide
  let best = base
  let stack: ReadonlyArray<PlateStack> = []
  if (requestedGrams >= maximum) {
    best = maximum
    stack = inventory
      .filter((plate) => plate.pairs > 0)
      .map((plate) => ({ weight: plate.weight, count: plate.pairs }))
  } else if (requestedGrams > base) {
    const largest = inventory.reduce(
      (size, plate) => (plate.pairs > 0 ? Math.max(size, Math.round(plate.weight * 1000)) : size),
      0,
    )
    // A first reachable sum above the target differs by at most the largest plate.
    const limit = Math.min(maximumSide, Math.ceil((requestedGrams - base) / 2) + largest)
    let reachable = new Map<number, ReadonlyArray<PlateStack>>([[0, []]])
    for (const plate of inventory) {
      const grams = Math.round(plate.weight * 1000)
      const next = new Map(reachable)
      for (const [sum, prior] of reachable) {
        const available = Math.min(plate.pairs, Math.floor((limit - sum) / grams))
        for (let count = 1; count <= available; count++) {
          const total = sum + count * grams
          if (!next.has(total)) next.set(total, [...prior, { weight: plate.weight, count }])
        }
      }
      reachable = next
    }
    for (const [side, plates] of reachable) {
      const total = base + 2 * side
      const distance = Math.abs(total - requestedGrams)
      if (
        distance < Math.abs(best - requestedGrams) ||
        (distance === Math.abs(best - requestedGrams) && total < best)
      ) {
        best = total
        stack = plates
      }
    }
  }
  // All sums are exact grams within the parsed inventory's safe integer limit.
  const weight = Schema.decodeSync(Kilograms)(best / 1000)
  return best === requestedGrams
    ? { _tag: 'Loadable', weight, platesPerSide: stack }
    : { _tag: 'Unloadable', requested, nearest: weight, platesPerSide: stack }
}
