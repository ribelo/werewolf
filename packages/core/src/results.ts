import * as Result from 'effect/Result'
import * as Schema from 'effect/Schema'
import { Kilograms } from './barbell.ts'
import { mcCulloughCoefficient, reshelCoefficient } from './coefficients.ts'
import type { ContestState } from './contest.ts'
import type { Entry, EntryId, Timestamp } from './entry.ts'
import { ageOnDate } from './lifter.ts'
import type {
  AgeClassId,
  ClassificationId,
  IndividualClassification,
  LiftId,
  WeightClassId,
} from './rulebook.ts'

export type LiftResult =
  | { readonly _tag: 'NoResult'; readonly liftId: LiftId }
  | {
      readonly _tag: 'GoodResult'
      readonly liftId: LiftId
      readonly weight: Kilograms
      readonly achievedAt: Timestamp
      readonly sequence: number
    }
type GoodResult = Extract<LiftResult, { readonly _tag: 'GoodResult' }>
export interface EntryResults {
  readonly entry: Entry
  readonly lifts: ReadonlyArray<LiftResult>
}
export interface RankedEntry {
  readonly entry: Entry
  readonly kilograms: Kilograms
  readonly points: number
  readonly achievedAt: Timestamp
  readonly sequence: number
}
export interface PendingEntry {
  readonly _tag: 'PendingEntry'
  readonly entryId: EntryId
  readonly reason:
    | 'noGoodLift'
    | 'incompleteLifts'
    | 'bodyweightMissing'
    | 'ageClassMissing'
    | 'weightClassMissing'
    | 'resultOutOfRange'
}
export type RankingBucket =
  | { readonly _tag: 'All' }
  | { readonly _tag: 'Age'; readonly ageClassId: AgeClassId }
  | { readonly _tag: 'Weight'; readonly weightClassId: WeightClassId }
  | {
      readonly _tag: 'AgeAndWeight'
      readonly ageClassId: AgeClassId
      readonly weightClassId: WeightClassId
    }
export interface IndividualRankingGroup {
  readonly bucket: RankingBucket
  readonly rows: ReadonlyArray<RankedEntry & { readonly place: number }>
}
export interface IndividualRanking {
  readonly classificationId: ClassificationId
  readonly groups: ReadonlyArray<IndividualRankingGroup>
  readonly pending: ReadonlyArray<PendingEntry>
}

function prefer(left: GoodResult, right: GoodResult): GoodResult {
  return right.weight > left.weight ||
    (right.weight === left.weight &&
      (right.achievedAt < left.achievedAt ||
        (right.achievedAt === left.achievedAt && right.sequence < left.sequence)))
    ? right
    : left
}

/** Best good lift, not the most recent attempt. Failed and unannounced attempts do not create results. */
export function entryResults(state: ContestState): ReadonlyArray<EntryResults> {
  const byEntry = new Map<EntryId, Map<LiftId, GoodResult>>()
  for (const attempt of state.attempts) {
    if (attempt._tag !== 'Judged' || attempt.verdict !== 'goodLift') continue
    const lifts = byEntry.get(attempt.entryId) ?? new Map<LiftId, GoodResult>()
    const candidate: GoodResult = {
      _tag: 'GoodResult',
      liftId: attempt.liftId,
      weight: attempt.weight,
      achievedAt: attempt.achievedAt,
      sequence: attempt.sequence,
    }
    const previous = lifts.get(attempt.liftId)
    lifts.set(attempt.liftId, previous ? prefer(previous, candidate) : candidate)
    byEntry.set(attempt.entryId, lifts)
  }
  return state.entries.map((entry) => ({
    entry,
    lifts: entry.lifts.map(
      (lift) =>
        byEntry.get(entry.id)?.get(lift.liftId) ?? { _tag: 'NoResult', liftId: lift.liftId },
    ),
  }))
}

function pending(entryId: EntryId, reason: PendingEntry['reason']): PendingEntry {
  return { _tag: 'PendingEntry', entryId, reason }
}

function candidate(
  state: ContestState,
  classification: IndividualClassification,
  result: EntryResults,
): Result.Result<RankedEntry, PendingEntry> {
  const good = result.lifts
    .filter((lift) => lift._tag === 'GoodResult')
    .filter((lift) => classification.liftIds.includes(lift.liftId))
  const first = good[0]
  if (!first) return Result.fail(pending(result.entry.id, 'noGoodLift'))
  if (classification.result === 'sum' && good.length !== classification.liftIds.length)
    return Result.fail(pending(result.entry.id, 'incompleteLifts'))
  let kilograms = first.weight
  let achievedAt = first.achievedAt
  let sequence = first.sequence
  if (classification.result === 'best') {
    let best = first
    for (const lift of good) best = prefer(best, lift)
    kilograms = best.weight
    achievedAt = best.achievedAt
    sequence = best.sequence
  } else {
    const total = good.reduce((grams, lift) => grams + Math.round(lift.weight * 1000), 0) / 1000
    const parsed = Schema.decodeResult(Kilograms)(total)
    if (Result.isFailure(parsed)) return Result.fail(pending(result.entry.id, 'resultOutOfRange'))
    kilograms = parsed.success
    for (const lift of good)
      if (
        lift.achievedAt > achievedAt ||
        (lift.achievedAt === achievedAt && lift.sequence > sequence)
      ) {
        achievedAt = lift.achievedAt
        sequence = lift.sequence
      }
  }
  let points: number = kilograms
  switch (classification.formula) {
    case 'kilograms':
      break
    case 'reshel':
    case 'reshelMcCullough':
      if (!result.entry.bodyweight)
        return Result.fail(pending(result.entry.id, 'bodyweightMissing'))
      points =
        kilograms *
        reshelCoefficient(result.entry.bodyweight, result.entry.lifter.sex) *
        (classification.formula === 'reshelMcCullough'
          ? mcCulloughCoefficient(result.entry.lifter.birthDate, state.date)
          : 1)
      break
  }
  return Result.succeed({ entry: result.entry, kilograms, points, achievedAt, sequence })
}

function bucket(
  state: ContestState,
  classification: IndividualClassification,
  entry: Entry,
): Result.Result<RankingBucket, PendingEntry> {
  const age = (): Result.Result<AgeClassId, PendingEntry> => {
    const years = ageOnDate(entry.lifter.birthDate, state.date)
    const matched = state.rulebook.ageClasses.find(
      (group) =>
        (!group.sex || group.sex === entry.lifter.sex) &&
        years >= group.from &&
        years <= (group.through ?? Number.POSITIVE_INFINITY),
    )
    return matched ? Result.succeed(matched.id) : Result.fail(pending(entry.id, 'ageClassMissing'))
  }
  const weight = (): Result.Result<WeightClassId, PendingEntry> => {
    const bodyweight = entry.bodyweight
    if (!bodyweight) return Result.fail(pending(entry.id, 'bodyweightMissing'))
    const matched = state.rulebook.weightClasses.find(
      (group) =>
        (!group.sex || group.sex === entry.lifter.sex) &&
        bodyweight > (group.lowerExclusive ?? 0) &&
        bodyweight <= (group.upperInclusive ?? Number.POSITIVE_INFINITY),
    )
    return matched
      ? Result.succeed(matched.id)
      : Result.fail(pending(entry.id, 'weightClassMissing'))
  }
  switch (classification.split) {
    case 'none':
      return Result.succeed({ _tag: 'All' })
    case 'age':
      return Result.map(age(), (ageClassId): RankingBucket => ({ _tag: 'Age', ageClassId }))
    case 'weight':
      return Result.map(weight(), (weightClassId): RankingBucket => ({
        _tag: 'Weight',
        weightClassId,
      }))
    case 'ageAndWeight':
      return Result.flatMap(age(), (ageClassId) =>
        Result.map(weight(), (weightClassId): RankingBucket => ({
          _tag: 'AgeAndWeight',
          ageClassId,
          weightClassId,
        })),
      )
  }
}

function compare(left: RankedEntry, right: RankedEntry): number {
  const leftWeight = left.entry.bodyweight
  const rightWeight = right.entry.bodyweight
  const bodyweightOrder =
    leftWeight && rightWeight ? leftWeight - rightWeight : leftWeight ? -1 : rightWeight ? 1 : 0
  return (
    right.points - left.points ||
    bodyweightOrder ||
    left.achievedAt - right.achievedAt ||
    left.sequence - right.sequence ||
    left.entry.lotNumber - right.entry.lotNumber
  )
}

/** A classification has its own membership. MONSTER is not an implicit member of Open. */
export function individualRankings(state: ContestState): ReadonlyArray<IndividualRanking> {
  const results = entryResults(state)
  return state.rulebook.classifications
    .filter((classification) => classification.kind === 'individual')
    .map((classification) => {
      const groups = new Map<
        string,
        { readonly bucket: RankingBucket; readonly rows: RankedEntry[] }
      >()
      const waiting: PendingEntry[] = []
      for (const result of results) {
        if (classification.sex && classification.sex !== result.entry.lifter.sex) continue
        if (
          classification.membership.kind === 'divisions' &&
          !classification.membership.ids.some((id) => result.entry.divisions.includes(id))
        )
          continue
        const ranked = candidate(state, classification, result)
        if (Result.isFailure(ranked)) {
          waiting.push(ranked.failure)
          continue
        }
        const group = bucket(state, classification, result.entry)
        if (Result.isFailure(group)) {
          waiting.push(group.failure)
          continue
        }
        const key = JSON.stringify(group.success)
        const existing = groups.get(key) ?? { bucket: group.success, rows: [] }
        existing.rows.push(ranked.success)
        groups.set(key, existing)
      }
      return {
        classificationId: classification.id,
        groups: [...groups.values()].map((group) => ({
          bucket: group.bucket,
          rows: group.rows.sort(compare).map((row, index) => ({ ...row, place: index + 1 })),
        })),
        pending: waiting,
      }
    })
}
