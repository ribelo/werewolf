import * as Schema from 'effect/Schema'
import { Kilograms } from './barbell.ts'
import { Lifter, TeamId } from './lifter.ts'
import { DivisionId, LiftId } from './rulebook.ts'

/** UTC Unix milliseconds supplied by the command issuer, never by the core clock. */
export const Timestamp = Schema.Int.check(
  Schema.isGreaterThanOrEqualTo(0),
  Schema.isLessThanOrEqualTo(Number.MAX_SAFE_INTEGER),
).pipe(Schema.brand('Timestamp'))
export type Timestamp = typeof Timestamp.Type
export const EntryId = Schema.NonEmptyString.pipe(Schema.brand('EntryId'))
export type EntryId = typeof EntryId.Type
export const LotNumber = Schema.Int.check(Schema.isGreaterThan(0)).pipe(Schema.brand('LotNumber'))
export type LotNumber = typeof LotNumber.Type
export const AttemptNumber = Schema.Int.check(Schema.isGreaterThan(0)).pipe(
  Schema.brand('AttemptNumber'),
)
export type AttemptNumber = typeof AttemptNumber.Type
export const RackHeight = Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)).pipe(
  Schema.brand('RackHeight'),
)
export type RackHeight = typeof RackHeight.Type

/** Missing bodyweight means that weigh-in is not complete. Membership is always explicit. */
export const Entry = Schema.Struct({
  id: EntryId,
  lifter: Lifter,
  lotNumber: LotNumber,
  bodyweight: Schema.optionalKey(Kilograms.check(Schema.isGreaterThan(0))),
  divisions: Schema.NonEmptyArray(DivisionId),
  lifts: Schema.NonEmptyArray(
    Schema.Struct({
      liftId: LiftId,
      openingWeight: Schema.optionalKey(Kilograms),
      rackHeight: Schema.optionalKey(RackHeight),
    }),
  ),
}).check(
  Schema.makeFilter(
    (entry) =>
      new Set(entry.divisions).size === entry.divisions.length &&
      new Set(entry.lifts.map((lift) => lift.liftId)).size === entry.lifts.length,
  ),
)
export type Entry = typeof Entry.Type
export const Team = Schema.Struct({
  id: TeamId,
  name: Schema.NonEmptyString.check(Schema.makeFilter((name) => name.trim().length > 0)),
})
export type Team = typeof Team.Type
export const AttemptRef = Schema.Struct({ entryId: EntryId, liftId: LiftId, number: AttemptNumber })
export type AttemptRef = typeof AttemptRef.Type
export const Verdict = Schema.Literals(['goodLift', 'noLift'])
export type Verdict = typeof Verdict.Type
/** A judged result keeps the time and log position of its first verdict, including after corrections. */
export type Attempt = AttemptRef &
  (
    | { readonly _tag: 'Unannounced' }
    | { readonly _tag: 'Declared'; readonly weight: Kilograms }
    | {
        readonly _tag: 'Judged'
        readonly weight: Kilograms
        readonly verdict: Verdict
        readonly sequence: number
        readonly achievedAt: Timestamp
      }
  )
