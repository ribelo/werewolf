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
  /** Short code of the lift in federation exports, such as BP for bench press. */
  code: Schema.optionalKey(Schema.NonEmptyString),
  /** Title word of a single-lift federation file, such as Bench; the English name when absent. */
  exportName: Schema.optionalKey(Schema.NonEmptyString),
})
const Division = Schema.Struct({
  id: DivisionId,
  name: LocalizedName,
  /** Ticked for a new entry (Open); the organizer can untick it for a lifter who starts only elsewhere. */
  byDefault: Schema.optionalKey(Schema.Boolean),
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
export const AgeClassId = Schema.NonEmptyString.pipe(Schema.brand('AgeClassId'))
export type AgeClassId = typeof AgeClassId.Type
export const WeightClassId = Schema.NonEmptyString.pipe(Schema.brand('WeightClassId'))
export type WeightClassId = typeof WeightClassId.Type
const AgeClass = Schema.Struct({
  id: AgeClassId,
  name: LocalizedName,
  sex: Schema.optionalKey(Sex),
  from: Natural,
  through: Schema.optionalKey(Natural),
  /**
   * Children: no weight class, and no classification counts them unless it lists this age class
   * in ageClassIds, so they never rank next to adults.
   */
  kids: Schema.optionalKey(Schema.Boolean),
})
const WeightClass = Schema.Struct({
  id: WeightClassId,
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
  /** sum needs every lift of the classification; sumDone adds up the lifts the lifter completed (the 2025 rule). */
  result: Schema.Literals(['best', 'sum', 'sumDone']),
  formula: Formula,
  sex: Schema.optionalKey(Sex),
  /** Only entries in these age classes count; absent means every adult entry (kids classes must be listed). */
  ageClassIds: Schema.optionalKey(Schema.Array(AgeClassId)),
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
  /** Length of the attempt clock in seconds; 60 when absent. */
  clockSeconds: Schema.optionalKey(PositiveInt),
}).check(
  Schema.makeFilter(
    (book) => {
      const unique = (ids: ReadonlyArray<string>): boolean => new Set(ids).size === ids.length
      const lifts = new Set(book.lifts.map((lift) => lift.id))
      const divisions = new Set(book.divisions.map((division) => division.id))
      const ageClasses = new Set(book.ageClasses.map((item) => item.id))
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
            (classification.ageClassIds ?? []).every((id) => ageClasses.has(id)) &&
            (classification.membership.kind === 'all' ||
              (unique(classification.membership.ids) &&
                classification.membership.ids.every((id) => divisions.has(id)))),
        ) &&
        book.ageClasses.every(
          (item, index) =>
            item.from <= (item.through ?? Number.POSITIVE_INFINITY) &&
            book.ageClasses
              .slice(index + 1)
              .every(
                (other) =>
                  (item.sex && other.sex && item.sex !== other.sex) ||
                  Math.max(item.from, other.from) >
                    Math.min(
                      item.through ?? Number.POSITIVE_INFINITY,
                      other.through ?? Number.POSITIVE_INFINITY,
                    ),
              ),
        ) &&
        book.weightClasses.every(
          (item, index) =>
            (item.lowerExclusive ?? 0) < (item.upperInclusive ?? Number.POSITIVE_INFINITY) &&
            book.weightClasses
              .slice(index + 1)
              .every(
                (other) =>
                  (item.sex && other.sex && item.sex !== other.sex) ||
                  Math.max(item.lowerExclusive ?? 0, other.lowerExclusive ?? 0) >=
                    Math.min(
                      item.upperInclusive ?? Number.POSITIVE_INFINITY,
                      other.upperInclusive ?? Number.POSITIVE_INFINITY,
                    ),
              ),
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
/** Divisions ticked for a new entry. */
export function defaultDivisions(book: Rulebook): ReadonlyArray<DivisionId> {
  return book.divisions
    .filter((division) => division.byDefault === true)
    .map((division) => division.id)
}
