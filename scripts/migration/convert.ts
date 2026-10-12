import {
  CalendarDate,
  Command,
  ContestJournal,
  Rulebook,
  formatVersion,
  type ContestFailure,
} from '@werewolf/core'
import * as Option from 'effect/Option'
import * as Result from 'effect/Result'
import * as Schema from 'effect/Schema'

const OptionalNumber = Schema.NullOr(Schema.Number)
const OptionalText = Schema.NullOr(Schema.String)
/** Rows of the 2025 production database, as read from the D1 export. They are parsed where they enter. */
export const SourceData = Schema.Struct({
  contest: Schema.Struct({
    id: Schema.String,
    name: Schema.String,
    date: Schema.String,
    mens_bar_weight: Schema.Number,
    womens_bar_weight: Schema.Number,
    clamp_weight: Schema.Number,
  }),
  tags: Schema.Array(Schema.Struct({ label: Schema.String, created_at: Schema.String })),
  ageCategories: Schema.Array(
    Schema.Struct({
      code: Schema.String,
      name: Schema.String,
      min_age: OptionalNumber,
      max_age: OptionalNumber,
      sort_order: Schema.Number,
    }),
  ),
  weightClasses: Schema.Array(
    Schema.Struct({
      gender: Schema.String,
      code: Schema.String,
      name: Schema.String,
      max_weight: OptionalNumber,
      sort_order: Schema.Number,
    }),
  ),
  plates: Schema.Array(
    Schema.Struct({
      plate_weight: Schema.Number,
      quantity: Schema.Number,
      color: Schema.optionalKey(Schema.NullOr(Schema.String)),
    }),
  ),
  registrations: Schema.Array(
    Schema.Struct({
      id: Schema.String,
      competitor_id: Schema.String,
      bodyweight: OptionalNumber,
      rack_height_bench: OptionalNumber,
      flight_order: OptionalNumber,
      created_at: Schema.String,
      labels: OptionalText,
      first_name: Schema.String,
      last_name: Schema.String,
      birth_date: Schema.String,
      gender: Schema.String,
      club: OptionalText,
    }),
  ),
  lifts: Schema.Array(Schema.Struct({ registration_id: Schema.String, lift_type: Schema.String })),
  attempts: Schema.Array(
    Schema.Struct({
      id: Schema.String,
      registration_id: Schema.String,
      lift_type: Schema.String,
      attempt_number: Schema.Number,
      weight: OptionalNumber,
      status: OptionalText,
      timestamp: OptionalText,
      created_at: Schema.String,
    }),
  ),
})
export type SourceData = typeof SourceData.Type

export interface Conversion {
  /** Things changed so that the old data loads; the report lists them. */
  readonly adjustments: ReadonlyArray<string>
  /** A backup file the restore endpoint accepts. */
  readonly backup: unknown
  readonly divisions: ReadonlyArray<{ readonly id: string; readonly label: string }>
  /** Entry and lift pairs converted to DNS. */
  readonly didNotStart: number
}

const liftIds: Readonly<Record<string, string>> = { Bench: 'bench', Deadlift: 'deadlift' }
const slug = (value: string) =>
  value
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replaceAll('ł', 'l')
    .replaceAll('Ł', 'L')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
const millis = (iso: typeof OptionalText.Type, fallback: string) => {
  const parsed = Date.parse(iso ?? fallback)
  return Number.isFinite(parsed) ? parsed : Date.parse(fallback)
}
const decodeCommand = Schema.decodeUnknownSync(Command)
const clean = (text: string) => text.replace(/\s+/g, ' ').trim()

/** The 2025 scoring: each lift is best weight x Reshel x McCullough, a lifter's points add up over the lifts done. */
function buildRulebook(
  source: SourceData,
  divisions: ReadonlyArray<{ id: string; label: string }>,
  womensBar: number,
) {
  const ageClasses = source.ageCategories
    .toSorted((left, right) => left.sort_order - right.sort_order)
    .map((item, index, all) => {
      // Neighbouring 2025 classes touched at one age (up to 16, then 16-19): the later class starts a year higher.
      const before = all[index - 1]?.max_age
      const from = Math.max(item.min_age ?? 0, typeof before === 'number' ? before + 1 : 0)
      return {
        id: slug(item.code),
        name: { pl: item.name, en: item.name },
        from,
        ...(item.max_age === null ? {} : { through: item.max_age }),
      }
    })
  const weightClasses = ['Female', 'Male'].flatMap((gender) =>
    source.weightClasses
      .filter((item) => item.gender === gender)
      .toSorted((left, right) => left.sort_order - right.sort_order)
      .map((item, index, all) => {
        const lower = index === 0 ? Number.NaN : (all[index - 1]?.max_weight ?? Number.NaN)
        return {
          id: slug(item.code),
          name: { pl: item.name, en: item.name },
          sex: gender === 'Female' ? 'female' : 'male',
          ...(Number.isNaN(lower) ? {} : { lowerExclusive: lower }),
          ...(item.max_weight === null ? {} : { upperInclusive: item.max_weight }),
        }
      }),
  )
  const classification = (
    id: string,
    name: string,
    divisionIds: ReadonlyArray<string>,
    split: string,
  ) => ({
    id,
    name: { pl: name, en: name },
    kind: 'individual',
    membership: { kind: 'divisions', ids: divisionIds },
    liftIds: ['bench', 'deadlift'],
    result: 'sumDone',
    formula: 'reshelMcCullough',
    split,
  })
  const title = clean(source.contest.name)
  return Schema.decodeUnknownSync(Rulebook)({
    version: 1,
    name: { pl: title, en: title },
    lifts: [
      {
        id: 'bench',
        name: { pl: 'Wyciskanie leżąc', en: 'Bench press' },
        attempts: 3,
        rackHeight: true,
        code: 'BP',
        exportName: 'Bench',
      },
      {
        id: 'deadlift',
        name: { pl: 'Martwy ciąg', en: 'Deadlift' },
        attempts: 3,
        rackHeight: false,
        code: 'DL',
        exportName: 'Deadlift',
      },
    ],
    divisions: divisions.map((item) => ({
      id: item.id,
      name: { pl: item.label, en: item.label },
      policy: 'warn',
      conditions: {},
    })),
    ageClasses,
    weightClasses,
    classifications: [
      classification('open', 'Open', ['open'], 'none'),
      {
        ...classification('open-bench', 'Open — wyciskanie', ['open'], 'none'),
        liftIds: ['bench'],
        result: 'best',
      },
      {
        ...classification('open-deadlift', 'Open — martwy ciąg', ['open'], 'none'),
        liftIds: ['deadlift'],
        result: 'best',
      },
      classification('open-age', 'Open — kategorie wiekowe', ['open'], 'age'),
      classification('open-weight', 'Open — kategorie wagowe', ['open'], 'weight'),
      ...divisions
        .filter((item) => item.id !== 'open')
        .map((item) => classification(item.id, item.label, [item.id], 'none')),
    ],
    barbell: {
      bars: { male: source.contest.mens_bar_weight, female: womensBar },
      clampsPerSide: source.contest.clamp_weight,
      plates: source.plates.map((plate) => ({
        weight: plate.plate_weight,
        pairs: plate.quantity,
        ...(plate.color && /^#[0-9a-fA-F]{6}$/.test(plate.color) ? { color: plate.color } : {}),
      })),
    },
  })
}

const labelsOf = (raw: typeof OptionalText.Type): ReadonlyArray<string> => {
  if (!raw) return []
  const parsed = Result.try({ try: (): unknown => JSON.parse(raw), catch: () => [] })
  const value = Result.getOrElse(parsed, () => [])
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : []
}

export function convertContest(source: SourceData): Conversion {
  const labels = [
    ...source.tags
      .toSorted((a, b) => a.created_at.localeCompare(b.created_at))
      .map((tag) => tag.label),
    ...source.registrations.flatMap((registration) => labelsOf(registration.labels)),
  ]
  const divisions: Array<{ id: string; label: string }> = []
  for (const label of labels)
    if (!divisions.some((item) => item.id === slug(label)))
      divisions.push({ id: slug(label), label })
  if (!divisions.some((item) => item.id === 'open'))
    divisions.unshift({ id: 'open', label: 'Open' })
  const adjustments: Array<string> = []
  let rulebook = buildRulebook(source, divisions, source.contest.womens_bar_weight)
  const commands: Array<unknown> = []
  const teams = new Map<string, string>()
  const team = (name: typeof OptionalText.Type) => {
    if (!name || name.trim() === '') return Option.none<string>()
    const key = name.trim().normalize('NFC').toLowerCase()
    const known = teams.get(key)
    if (known) return Option.some(known)
    const id = 'team-' + slug(name)
    teams.set(key, id)
    commands.push({
      _tag: 'UpsertTeam',
      id: 'mig-' + id,
      at: Date.parse(source.contest.date),
      team: { id, name: clean(name) },
    })
    return Option.some(id)
  }
  const ordered = source.registrations.toSorted(
    (left, right) =>
      (left.flight_order ?? Number.MAX_SAFE_INTEGER) -
        (right.flight_order ?? Number.MAX_SAFE_INTEGER) ||
      left.created_at.localeCompare(right.created_at) ||
      left.id.localeCompare(right.id),
  )
  const attemptsOf = (registrationId: string, lift: string) =>
    source.attempts
      .filter((a) => a.registration_id === registrationId && a.lift_type === lift)
      .toSorted((a, b) => a.attempt_number - b.attempt_number)
  const noShows: Array<string> = []
  const noShow = (registrationId: string, lift: string) => {
    const own = attemptsOf(registrationId, lift)
    return own.length > 0 && own.every((a) => a.weight === 20 && a.status === 'Failed')
  }
  const entryCommands: Array<unknown> = []
  const later: Array<{ at: number; command: unknown }> = []
  for (const [index, registration] of ordered.entries()) {
    const lifts = [
      ...new Set([
        ...source.lifts
          .filter((l) => l.registration_id === registration.id)
          .map((l) => l.lift_type),
        ...source.attempts
          .filter((a) => a.registration_id === registration.id)
          .map((a) => a.lift_type),
      ]),
    ]
      .filter((type) => type in liftIds)
      .toSorted()
    const registered = labelsOf(registration.labels).map(slug)
    const teamId = team(registration.club)
    entryCommands.push({
      _tag: 'AddEntry',
      id: 'mig-add-' + registration.id,
      at: Date.parse(registration.created_at),
      entry: {
        id: registration.id,
        lifter: {
          id: registration.competitor_id,
          name: clean(registration.first_name + ' ' + registration.last_name),
          sex: registration.gender === 'Female' ? 'female' : 'male',
          birthDate: registration.birth_date.slice(0, 10),
          ...(Option.isSome(teamId) ? { teamId: teamId.value } : {}),
        },
        lotNumber: index + 1,
        ...(typeof registration.bodyweight === 'number' && registration.bodyweight > 0
          ? { bodyweight: registration.bodyweight }
          : {}),
        divisions: registered.length > 0 ? registered : ['open'],
        lifts: lifts.map((type) => {
          const first = attemptsOf(registration.id, type)[0]
          const rack = type === 'Bench' && typeof registration.rack_height_bench === 'number'
          return {
            liftId: liftIds[type],
            ...(first &&
            !noShow(registration.id, type) &&
            typeof first.weight === 'number' &&
            first.weight > 0
              ? { openingWeight: first.weight }
              : {}),
            ...(rack ? { rackHeight: registration.rack_height_bench } : {}),
          }
        }),
      },
    })
    for (const type of lifts) {
      const own = attemptsOf(registration.id, type)
      // Three burned 20 kg attempts were how the 2025 desk marked a lifter who did not show up.
      if (noShow(registration.id, type)) {
        const first = own[0]
        const at = first
          ? millis(first.timestamp, first.created_at)
          : Date.parse(registration.created_at)
        later.push({
          at,
          command: {
            _tag: 'SetDidNotStart',
            id: 'mig-dns-' + registration.id + '-' + type,
            at,
            entryId: registration.id,
            liftId: liftIds[type],
            value: true,
          },
        })
        noShows.push(registration.id)
        continue
      }
      for (const attempt of own) {
        if (typeof attempt.weight !== 'number' || attempt.weight <= 0) continue
        const ref = {
          entryId: registration.id,
          liftId: liftIds[type],
          number: attempt.attempt_number,
        }
        const at = millis(attempt.timestamp, attempt.created_at)
        if (attempt.attempt_number > 1)
          later.push({
            at: at - 1,
            command: {
              _tag: 'SetWeight',
              id: 'mig-w-' + attempt.id,
              at: at - 1,
              attempt: ref,
              weight: attempt.weight,
            },
          })
        if (attempt.status === 'Successful' || attempt.status === 'Failed')
          later.push({
            at,
            command: {
              _tag: 'SetVerdict',
              id: 'mig-v-' + attempt.id,
              at,
              attempt: ref,
              verdict: attempt.status === 'Successful' ? 'goodLift' : 'noLift',
            },
          })
      }
    }
  }
  commands.push(...entryCommands)
  // Time order of the real meet keeps "who reached the result first" meaningful.
  for (const item of later.toSorted((a, b) => a.at - b.at)) commands.push(item.command)
  const decoded = commands.map((command) => decodeCommand(command))
  const date = source.contest.date.slice(0, 10)
  const day = Schema.decodeSync(CalendarDate)(date)
  let restored = ContestJournal.restore(rulebook, day, decoded)
  if (Result.isFailure(restored) && restored.failure._tag === 'UnloadableWeight') {
    // The 2025 database says 20 kg for the women's bar, but the women's bar is 15 kg: with two 2.5 kg
    // clamps a woman's 20 kg opening is legal. Bar plus clamps stays the rule.
    rulebook = buildRulebook(source, divisions, 15)
    restored = ContestJournal.restore(rulebook, day, decoded)
    adjustments.push(
      "Women's bar set to 15 kg in the migrated rulebook (the database said " +
        source.contest.womens_bar_weight +
        ' kg): 20 kg is a legal weight on 15 kg + 2 clamps.',
    )
  }
  const reason = (error: ContestFailure) => ('reason' in error ? error.reason : error._tag)
  if (Result.isFailure(restored))
    throw new Error('The converted log does not replay: ' + reason(restored.failure))
  return {
    adjustments,
    backup: {
      formatVersion,
      definition: {
        id: source.contest.id,
        name: clean(source.contest.name),
        date,
        rulebook: Schema.encodeSync(Rulebook)(rulebook),
      },
      commands: restored.success.commands.map((command, index) => ({
        sequence: index + 1,
        command: Schema.encodeSync(Command)(command),
      })),
    },
    divisions,
    didNotStart: noShows.length,
  }
}
