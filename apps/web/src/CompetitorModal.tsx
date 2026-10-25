import {
  ageOnDate,
  CalendarDate,
  defaultDivisions,
  type ContestState,
  type Entry,
} from '@werewolf/core'
import * as Option from 'effect/Option'
import * as Schema from 'effect/Schema'
import { useState, type FormEvent } from 'react'
import { useLegacy } from './legacy-i18n.ts'
import { Modal } from './Modal.tsx'

/** Names are stored as "Surname Name", the order the 2025 desk showed. */
export function splitName(name: string): { readonly first: string; readonly last: string } {
  const words = name.trim().split(/\s+/)
  if (words.length < 2) return { first: '', last: name.trim() }
  return { first: words.at(-1) ?? '', last: words.slice(0, -1).join(' ') }
}

const chip = (active: boolean) =>
  'px-3 py-2 border rounded-md cursor-pointer transition ' +
  (active
    ? 'border-primary-red bg-primary-red/10 text-text-primary'
    : 'border-border-color bg-element-bg text-text-secondary hover:text-text-primary')

/** Add or edit one lifter and their entry, as the 2025 competitor dialog did. */
export function CompetitorModal({
  state,
  entry: found,
  submit,
  onClose,
}: {
  readonly state: ContestState
  /** None opens an empty dialog for a new lifter. */
  readonly entry: Option.Option<Entry>
  readonly submit: (input: object) => void
  readonly onClose: () => void
}) {
  return Option.match(found, {
    onNone: () => (
      <Dialog state={state} existing={Option.none()} submit={submit} onClose={onClose} />
    ),
    onSome: (entry) => (
      <Dialog state={state} existing={Option.some(entry)} submit={submit} onClose={onClose} />
    ),
  })
}

function Dialog({
  state,
  existing,
  submit,
  onClose,
}: {
  readonly state: ContestState
  readonly existing: Option.Option<Entry>
  readonly submit: (input: object) => void
  readonly onClose: () => void
}) {
  const entry = Option.getOrUndefined(existing)
  const { lt, locale } = useLegacy()
  const t = (key: string, values = {}) => lt('competitor_modal.' + key, values)
  const name = splitName(entry?.lifter.name ?? '')
  const team = state.teams.find((item) => item.id === entry?.lifter.teamId)?.name ?? ''
  const [first, setFirst] = useState(name.first)
  const [last, setLast] = useState(name.last)
  const [birthDate, setBirthDate] = useState<string>(entry?.lifter.birthDate ?? '')
  const [sex, setSex] = useState<'male' | 'female'>(entry?.lifter.sex ?? 'male')
  const [club, setClub] = useState(team)
  const [bodyweight, setBodyweight] = useState(
    typeof entry?.bodyweight === 'number' ? String(entry.bodyweight) : '',
  )
  const [tags, setTags] = useState<ReadonlyArray<string>>(
    entry?.divisions ?? defaultDivisions(state.rulebook),
  )
  const [lifts, setLifts] = useState<ReadonlyArray<string>>(
    entry?.lifts.map((item) => item.liftId) ?? [],
  )
  const rackOf = (liftId: string) => entry?.lifts.find((item) => item.liftId === liftId)?.rackHeight
  const [racks, setRacks] = useState<Readonly<Record<string, string>>>(
    Object.fromEntries(
      state.rulebook.lifts.map((lift) => [lift.id, String(rackOf(lift.id) ?? '')]),
    ),
  )
  const firstAttempt = (liftId: string) => {
    const attempt = state.attempts.find(
      (item) => item.entryId === entry?.id && item.liftId === liftId && item.number === 1,
    )
    return attempt && attempt._tag !== 'Unannounced' ? String(attempt.weight) : ''
  }
  const [openings, setOpenings] = useState<Readonly<Record<string, string>>>(
    Object.fromEntries(state.rulebook.lifts.map((lift) => [lift.id, firstAttempt(lift.id)])),
  )
  const [error, setError] = useState('')
  // The classes follow the typed values at once, as the 2025 dialog showed them (AUTO).
  const born = Schema.decodeUnknownOption(CalendarDate)(birthDate)
  const age = Option.map(born, (date) => ageOnDate(date, state.date))
  const weight = Number(bodyweight)
  const weightClass = Option.match(
    Option.fromUndefinedOr(
      weight > 0
        ? state.rulebook.weightClasses.find(
            (item) =>
              (!item.sex || item.sex === sex) &&
              weight > (item.lowerExclusive ?? 0) &&
              weight <= (item.upperInclusive ?? Number.POSITIVE_INFINITY),
          )
        : state.rulebook.weightClasses.find(() => false),
    ),
    {
      onNone: () => t('registration_fields.weight_class_pending'),
      onSome: (item) => item.name[locale],
    },
  )
  const ageClass = Option.match(
    Option.flatMap(age, (years) =>
      Option.fromUndefinedOr(
        state.rulebook.ageClasses.find(
          (item) =>
            (!item.sex || item.sex === sex) &&
            years >= item.from &&
            years <= (item.through ?? Number.POSITIVE_INFINITY),
        ),
      ),
    ),
    {
      onNone: () => t('registration_fields.age_category_pending'),
      onSome: (item) => item.name[locale],
    },
  )
  function save(event: FormEvent) {
    event.preventDefault()
    if (!first.trim() || !last.trim()) return setError(t('status.validation.name_required'))
    if (!birthDate) return setError(t('status.validation.birth_required'))
    if (bodyweight !== '' && !(Number(bodyweight) > 0))
      return setError(t('status.validation.bodyweight_positive'))
    if (lifts.length === 0) return setError(t('status.validation.lifts_required'))
    setError('')
    const fullName = last.trim() + ' ' + first.trim()
    const teamId: Option.Option<string> = club.trim()
      ? Option.some(
          state.teams.find((item) => item.name.trim().toLowerCase() === club.trim().toLowerCase())
            ?.id ?? crypto.randomUUID(),
        )
      : Option.none()
    // A new club is created; the same club typed differently (capitals, spaces) is renamed,
    // because it is matched by name regardless of case and would otherwise not change at all.
    Option.map(teamId, (value) => {
      const known = state.teams.find((item) => item.id === value)
      // Joining another existing club never renames it; only the lifter's own club is renamed.
      if (!known || (value === entry?.lifter.teamId && known.name !== club.trim()))
        submit({ _tag: 'UpsertTeam', team: { id: value, name: club.trim() } })
    })
    const team = Option.match(teamId, {
      onNone: () => ({}),
      onSome: (value) => ({ teamId: value }),
    })
    const ordered = state.rulebook.lifts
      .map((lift) => lift.id as string)
      .filter((id) => lifts.includes(id))
    const rack = (liftId: string): Option.Option<number> => {
      const lift = state.rulebook.lifts.find((item) => item.id === liftId)
      const value = Number(racks[liftId])
      return lift?.rackHeight && racks[liftId] !== '' && Number.isInteger(value) && value >= 0
        ? Option.some(value)
        : Option.none()
    }
    if (!entry) {
      const used = new Set(state.entries.map((item) => item.lotNumber as number))
      let lot = 1
      while (used.has(lot)) lot++
      submit({
        _tag: 'AddEntry',
        entry: {
          id: crypto.randomUUID(),
          lifter: { id: crypto.randomUUID(), name: fullName, sex, birthDate, ...team },
          lotNumber: lot,
          ...(bodyweight !== '' ? { bodyweight: Number(bodyweight) } : {}),
          divisions: tags,
          lifts: ordered.map((liftId) => {
            const height = rack(liftId)
            const opening = Number(openings[liftId])
            return {
              liftId,
              ...(opening > 0 ? { openingWeight: opening } : {}),
              ...Option.match(height, {
                onNone: () => ({}),
                onSome: (value) => ({ rackHeight: value }),
              }),
            }
          }),
        },
      })
      onClose()
      return
    }
    const id = entry.id
    if (
      fullName !== entry.lifter.name ||
      sex !== entry.lifter.sex ||
      birthDate !== entry.lifter.birthDate
    )
      submit({ _tag: 'SetLifter', entryId: id, name: fullName, sex, birthDate })
    if (Option.getOrElse(teamId, () => '') !== (entry.lifter.teamId ?? ''))
      submit({ _tag: 'SetEntryTeam', entryId: id, ...team })
    if (bodyweight !== '' && Number(bodyweight) !== entry.bodyweight)
      submit({ _tag: 'SetBodyweight', entryId: id, bodyweight: Number(bodyweight) })
    if (tags.join() !== entry.divisions.join())
      submit({ _tag: 'SetDivisions', entryId: id, divisions: tags })
    if (ordered.join() !== entry.lifts.map((item) => item.liftId).join())
      submit({ _tag: 'SetEntryLifts', entryId: id, liftIds: ordered })
    for (const liftId of ordered) {
      const height = rack(liftId)
      Option.map(height, (value) => {
        if (value !== rackOf(liftId))
          submit({ _tag: 'SetRackHeight', entryId: id, liftId, rackHeight: value })
      })
      const opening = Number(openings[liftId])
      const attempt = state.attempts.find(
        (item) => item.entryId === id && item.liftId === liftId && item.number === 1,
      )
      if (opening > 0 && String(opening) !== firstAttempt(liftId) && attempt?._tag !== 'Judged')
        submit({ _tag: 'SetWeight', attempt: { entryId: id, liftId, number: 1 }, weight: opening })
      // An emptied opening weight takes the declaration back, as in the lift tables.
      if (openings[liftId]?.trim() === '' && attempt?._tag === 'Declared')
        submit({ _tag: 'ClearWeight', attempt: { entryId: id, liftId, number: 1 } })
    }
    onClose()
  }
  return (
    <Modal title={t(entry ? 'title.edit' : 'title.create')} onClose={onClose}>
      <div className="space-y-6">
        {error && (
          <div
            className="bg-status-error/20 border border-status-error text-status-error px-4 py-2 text-sm"
            role="alert"
          >
            {error}
          </div>
        )}
        <form className="space-y-6" onSubmit={save}>
          <div className="grid gap-4 md:grid-cols-2">
            <label className="flex flex-col gap-2">
              <span className="input-label">{t('fields.first_name')} *</span>
              <input
                className="input-field"
                value={first}
                autoComplete="given-name"
                required
                onChange={(e) => setFirst(e.target.value)}
              />
            </label>
            <label className="flex flex-col gap-2">
              <span className="input-label">{t('fields.last_name')} *</span>
              <input
                className="input-field"
                value={last}
                autoComplete="family-name"
                required
                onChange={(e) => setLast(e.target.value)}
              />
            </label>
            <label className="flex flex-col gap-2">
              <span className="input-label">
                {t('fields.birth_date')} *
                {Option.match(age, { onNone: () => '', onSome: (years) => ' (' + years + ')' })}
              </span>
              <input
                className="input-field"
                type="date"
                value={birthDate}
                required
                onChange={(e) => setBirthDate(e.target.value)}
              />
            </label>
            <label className="flex flex-col gap-2">
              <span className="input-label">{t('fields.gender')} *</span>
              <select
                className="input-field"
                value={sex}
                onChange={(e) => setSex(e.target.value === 'female' ? 'female' : 'male')}
              >
                <option value="male">{t('gender.male')}</option>
                <option value="female">{t('gender.female')}</option>
              </select>
            </label>
            <label className="flex flex-col gap-2">
              <span className="input-label">{t('fields.club')}</span>
              <input
                className="input-field"
                value={club}
                list="werewolf-teams"
                placeholder={t('placeholders.club')}
                onChange={(e) => setClub(e.target.value)}
              />
              <datalist id="werewolf-teams">
                {state.teams.map((item) => (
                  <option key={item.id} value={item.name} />
                ))}
              </datalist>
            </label>
          </div>
          <section className="space-y-4">
            <div>
              <h3 className="text-label text-text-secondary">{t('registration.title')}</h3>
              <p className="text-caption text-text-secondary">{t('registration.subtitle')}</p>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <label className="flex flex-col gap-2">
                <span className="input-label">{t('registration_fields.bodyweight')}</span>
                <input
                  className="input-field"
                  type="number"
                  step="0.01"
                  min="0"
                  value={bodyweight}
                  onChange={(e) => setBodyweight(e.target.value)}
                />
              </label>
              <div className="flex flex-col gap-2">
                <span className="input-label flex items-center gap-2">
                  {t('registration_fields.weight_class')}
                  <span className="text-caption text-text-secondary uppercase tracking-[0.3em]">
                    {t('registration_fields.auto_chip')}
                  </span>
                </span>
                <div className="input-field bg-element-bg/60 text-text-secondary">
                  {weightClass}
                </div>
              </div>
              <div className="flex flex-col gap-2">
                <span className="input-label flex items-center gap-2">
                  {t('registration_fields.age_category')}
                  <span className="text-caption text-text-secondary uppercase tracking-[0.3em]">
                    {t('registration_fields.auto_chip')}
                  </span>
                </span>
                <div className="input-field bg-element-bg/60 text-text-secondary">{ageClass}</div>
              </div>
              <div className="flex flex-col gap-2 md:col-span-2">
                <span className="input-label flex items-center gap-2">
                  {t('registration_fields.tags')}
                  <span className="text-caption text-text-secondary uppercase tracking-[0.3em]">
                    {t('registration_fields.tags_hint')}
                  </span>
                </span>
                {state.rulebook.divisions.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {state.rulebook.divisions.map((division) => (
                      <label key={division.id} className={chip(tags.includes(division.id))}>
                        <input
                          type="checkbox"
                          className="hidden"
                          checked={tags.includes(division.id)}
                          onChange={(e) =>
                            setTags(
                              e.target.checked
                                ? [...tags, division.id]
                                : tags.filter((id) => id !== division.id),
                            )
                          }
                        />
                        {division.name[locale]}
                      </label>
                    ))}
                  </div>
                ) : (
                  <p className="text-caption text-text-secondary">
                    {t('registration_fields.tags_empty')}
                  </p>
                )}
              </div>
              <div className="flex flex-col gap-2 md:col-span-2">
                <span className="input-label">{t('registration_fields.lifts')}</span>
                <div className="flex flex-wrap gap-2">
                  {state.rulebook.lifts.map((lift) => (
                    <label key={lift.id} className={chip(lifts.includes(lift.id))}>
                      <input
                        type="checkbox"
                        className="hidden"
                        checked={lifts.includes(lift.id)}
                        onChange={() =>
                          setLifts(
                            lifts.includes(lift.id)
                              ? lifts.filter((id) => id !== lift.id)
                              : [...lifts, lift.id],
                          )
                        }
                      />
                      {lift.name[locale]}
                    </label>
                  ))}
                </div>
                <p className="text-caption text-text-secondary">
                  {t('registration_fields.lifts_hint')}
                </p>
              </div>
              {state.rulebook.lifts
                .filter((lift) => lift.rackHeight)
                .map((lift) => (
                  <label key={lift.id} className="flex flex-col gap-2">
                    <span className="input-label">
                      {lt('contest_table.columns.rack')} — {lift.name[locale]}
                    </span>
                    <input
                      className="input-field"
                      type="number"
                      step="1"
                      min="0"
                      value={racks[lift.id] ?? ''}
                      disabled={!lifts.includes(lift.id)}
                      onChange={(e) => setRacks({ ...racks, [lift.id]: e.target.value })}
                    />
                  </label>
                ))}
              <div className="grid gap-4">
                {state.rulebook.lifts
                  .filter((lift) => lifts.includes(lift.id))
                  .map((lift) => (
                    <label key={lift.id} className="flex flex-col gap-2">
                      <span className="input-label">
                        {t('registration_fields.opening_attempt', { lift: lift.name[locale] })}
                      </span>
                      <input
                        className="input-field"
                        type="number"
                        step="0.5"
                        min="0"
                        value={openings[lift.id] ?? ''}
                        onChange={(e) => setOpenings({ ...openings, [lift.id]: e.target.value })}
                      />
                    </label>
                  ))}
              </div>
            </div>
          </section>
          {entry && (
            <div className="rounded-lg border border-status-error/40 bg-status-error/10 px-4 py-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-caption text-status-error uppercase tracking-[0.3em]">
                  {t('danger_zone.title')}
                </p>
                <p className="text-body text-text-secondary">{t('danger_zone.description')}</p>
              </div>
              <button
                type="button"
                className="btn-secondary px-4 py-2"
                onClick={() => {
                  if (!window.confirm(t('actions.confirm_delete'))) return
                  submit({ _tag: 'RemoveEntry', entryId: entry.id })
                  onClose()
                }}
              >
                {t('actions.delete')}
              </button>
            </div>
          )}
          <div className="flex items-center justify-between">
            <div className="space-x-3">
              <button type="button" className="btn-secondary px-4 py-2" onClick={onClose}>
                {t('actions.cancel')}
              </button>
            </div>
            <button type="submit" className="btn-primary px-6 py-2">
              {entry ? t('actions.save') : t('actions.create')}
            </button>
          </div>
        </form>
      </div>
    </Modal>
  )
}
