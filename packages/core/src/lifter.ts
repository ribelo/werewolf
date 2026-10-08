import * as Schema from 'effect/Schema'

/** A lifter keeps the same identifier in every contest entry. */
export const LifterId = Schema.NonEmptyString.pipe(Schema.brand('LifterId'))
export type LifterId = typeof LifterId.Type
/** Sex selects the configured bar weight and classification. */
export const Sex = Schema.Literals(['male', 'female'])
export type Sex = typeof Sex.Type
/** A real calendar date, independent of device time zone. */
export const CalendarDate = Schema.String.check(
  Schema.isPattern(/^\d{4}-\d{2}-\d{2}$/),
  Schema.makeFilter((value) => {
    const date = new Date(value + 'T00:00:00Z')
    return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value
  }),
).pipe(Schema.brand('CalendarDate'))
export type CalendarDate = typeof CalendarDate.Type
/** Team membership can be absent until the organizer assigns a team. */
export const TeamId = Schema.NonEmptyString.pipe(Schema.brand('TeamId'))
export type TeamId = typeof TeamId.Type
export const Lifter = Schema.Struct({
  id: LifterId,
  name: Schema.NonEmptyString.check(Schema.makeFilter((name) => name.trim().length > 0)),
  sex: Sex,
  birthDate: CalendarDate,
  teamId: Schema.optionalKey(TeamId),
})
export type Lifter = typeof Lifter.Type

/** Completed years on the contest date, not on the device's current date. */
export function ageOnDate(birthDate: CalendarDate, contestDate: CalendarDate): number {
  const years = Number(contestDate.slice(0, 4)) - Number(birthDate.slice(0, 4))
  return years - (contestDate.slice(5) < birthDate.slice(5) ? 1 : 0)
}
