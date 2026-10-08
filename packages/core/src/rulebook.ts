import * as Data from 'effect/Data'
import * as Result from 'effect/Result'
import * as Schema from 'effect/Schema'
import { Barbell, Kilograms } from './barbell.ts'
import { Sex } from './lifter.ts'

export const LiftId = Schema.NonEmptyString.pipe(Schema.brand('LiftId'))
export type LiftId = typeof LiftId.Type
export const DivisionId = Schema.NonEmptyString.pipe(Schema.brand('DivisionId'))
export type DivisionId = typeof DivisionId.Type
export const ClassificationId = Schema.NonEmptyString.pipe(Schema.brand('ClassificationId'))
export type ClassificationId = typeof ClassificationId.Type
/** Rulebook labels carry both supported languages; person and team names do not. */
export const LocalizedName = Schema.Struct({ pl: Schema.NonEmptyString, en: Schema.NonEmptyString })
export type LocalizedName = typeof LocalizedName.Type
const Natural = Schema.Int.check(Schema.isGreaterThanOrEqualTo(0))
const PositiveInt = Schema.Int.check(Schema.isGreaterThan(0))
const Lift = Schema.Struct({
  id: LiftId,
  name: LocalizedName,
  attempts: PositiveInt,
  rackHeight: Schema.Boolean,
})
const Division = Schema.Struct({
  id: DivisionId,
  name: LocalizedName,
  policy: Schema.Literals(['warn', 'reject']),
  conditions: Schema.Struct({
    sex: Schema.optionalKey(Sex),
    minAge: Schema.optionalKey(Natural),
    maxAge: Schema.optionalKey(Natural),
    minBodyweight: Schema.optionalKey(Kilograms),
    maxBodyweight: Schema.optionalKey(Kilograms),
    allowedLifts: Schema.optionalKey(Schema.Array(LiftId)),
  }).check(
    Schema.makeFilter(
      (conditions) =>
        (conditions.minAge ?? 0) <= (conditions.maxAge ?? Number.POSITIVE_INFINITY) &&
        (conditions.minBodyweight ?? 0) <= (conditions.maxBodyweight ?? Number.POSITIVE_INFINITY),
    ),
  ),
})
export type Division = typeof Division.Type
const AgeClass = Schema.Struct({
  id: Schema.NonEmptyString,
  name: LocalizedName,
  sex: Schema.optionalKey(Sex),
  from: Natural,
  through: Schema.optionalKey(Natural),
})
const WeightClass = Schema.Struct({
  id: Schema.NonEmptyString,
  name: LocalizedName,
  sex: Schema.optionalKey(Sex),
  lowerExclusive: Schema.optionalKey(Kilograms),
  upperInclusive: Schema.optionalKey(Kilograms),
})
const Membership = Schema.Union([
  Schema.Struct({ kind: Schema.Literal('all') }),
  Schema.Struct({ kind: Schema.Literal('divisions'), ids: Schema.NonEmptyArray(DivisionId) }),
])
const Formula = Schema.Literals(['kilograms', 'reshel', 'reshelMcCullough'])
const classificationFields = {
  id: ClassificationId,
  name: LocalizedName,
  membership: Membership,
  liftIds: Schema.NonEmptyArray(LiftId),
  result: Schema.Literals(['best', 'sum']),
  formula: Formula,
  sex: Schema.optionalKey(Sex),
} as const
export const IndividualClassification = Schema.Struct({
  ...classificationFields,
  kind: Schema.Literal('individual'),
  split: Schema.Literals(['none', 'age', 'weight', 'ageAndWeight']),
})
export type IndividualClassification = typeof IndividualClassification.Type
export const TeamClassification = Schema.Struct({
  ...classificationFields,
  kind: Schema.Literal('team'),
  quota: Schema.Union([
    Schema.Struct({ kind: Schema.Literal('any'), count: PositiveInt }),
    Schema.Struct({ kind: Schema.Literal('bySex'), male: Natural, female: Natural }).check(
      Schema.makeFilter((quota) => quota.male + quota.female > 0),
    ),
  ]),
})
export type TeamClassification = typeof TeamClassification.Type

/** Version 1 declares every lift, eligibility condition, formula and quota as data. */
export const Rulebook = Schema.Struct({
  version: Schema.Literal(1),
  name: LocalizedName,
  lifts: Schema.NonEmptyArray(Lift),
  divisions: Schema.NonEmptyArray(Division),
  ageClasses: Schema.Array(AgeClass),
  weightClasses: Schema.Array(WeightClass),
  classifications: Schema.Array(Schema.Union([IndividualClassification, TeamClassification])),
  barbell: Barbell,
}).check(
  Schema.makeFilter(
    (book) => {
      const unique = (ids: ReadonlyArray<string>): boolean => new Set(ids).size === ids.length
      const lifts = new Set(book.lifts.map((lift) => lift.id))
      const divisions = new Set(book.divisions.map((division) => division.id))
      return (
        unique(book.lifts.map((lift) => lift.id)) &&
        unique(book.divisions.map((division) => division.id)) &&
        unique(book.classifications.map((classification) => classification.id)) &&
        unique(book.ageClasses.map((item) => item.id)) &&
        unique(book.weightClasses.map((item) => item.id)) &&
        book.divisions.every((division) =>
          (division.conditions.allowedLifts ?? []).every((id) => lifts.has(id)),
        ) &&
        book.classifications.every(
          (classification) =>
            unique(classification.liftIds) &&
            classification.liftIds.every((id) => lifts.has(id)) &&
            (classification.membership.kind === 'all' ||
              (unique(classification.membership.ids) &&
                classification.membership.ids.every((id) => divisions.has(id)))),
        ) &&
        book.ageClasses.every((item) => item.from <= (item.through ?? Number.POSITIVE_INFINITY)) &&
        book.weightClasses.every(
          (item) => (item.lowerExclusive ?? -1) < (item.upperInclusive ?? Number.POSITIVE_INFINITY),
        )
      )
    },
    { message: 'Rulebook identifiers, ranges and references must be consistent' },
  ),
)
export type Rulebook = typeof Rulebook.Type
export class InvalidRulebook extends Data.TaggedError('InvalidRulebook')<{
  readonly detail: string
}> {}

/** Parse an external JSON value; unknown versions and broken references return InvalidRulebook. */
export function parseRulebook(input: unknown): Result.Result<Rulebook, InvalidRulebook> {
  return Schema.decodeUnknownResult(Rulebook)(input).pipe(
    Result.mapError((error) => new InvalidRulebook({ detail: error.message })),
  )
}
