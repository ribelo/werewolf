import {
  defaultDivisions,
  entryAgeClass,
  entryWeightClass,
  Kilograms,
  mcCulloughCoefficient,
  parseDelimited,
  planImport,
  reshelCoefficient,
  suggestMapping,
  type ContestJournal,
  type ContestState,
  type Entry,
  type ImportField,
  type ImportMapping,
} from '@werewolf/core'
import * as Effect from 'effect/Effect'
import * as Option from 'effect/Option'
import * as Schema from 'effect/Schema'
import { readSheet } from 'read-excel-file/browser'
import { useMemo, useState, type FormEvent } from 'react'
import { useMessages } from './i18n.ts'

type Submit = (input: object) => void
const parseKg = Schema.decodeUnknownOption(Kilograms)

function drawLot(state: ContestState): number {
  const used = new Set(state.entries.map((entry) => entry.lotNumber as number))
  const range = Math.max(200, used.size * 4)
  const free = Array.from({ length: range }, (_, index) => index + 1).filter((n) => !used.has(n))
  return free[Math.floor(Math.random() * free.length)] ?? range + 1
}

function EntryForm({ state, submit }: { readonly state: ContestState; readonly submit: Submit }) {
  const { locale, t } = useMessages()
  const [lot, setLot] = useState(() => drawLot(state))
  function add(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const bodyweight = form.get('bodyweight')
    const team = form.get('team')
    const lifts = form.getAll('lifts').flatMap((liftId) => {
      if (typeof liftId !== 'string') return []
      const opening = form.get('opening-' + liftId)
      return [
        {
          liftId,
          ...(typeof opening === 'string' && opening !== ''
            ? { openingWeight: Number(opening) }
            : {}),
        },
      ]
    })
    submit({
      _tag: 'AddEntry',
      entry: {
        id: crypto.randomUUID(),
        lifter: {
          id: crypto.randomUUID(),
          name: form.get('name'),
          sex: form.get('sex'),
          birthDate: form.get('birthDate'),
          ...(typeof team === 'string' && team !== '' ? { teamId: team } : {}),
        },
        lotNumber: Number(form.get('lotNumber')),
        ...(bodyweight === '' ? {} : { bodyweight: Number(bodyweight) }),
        divisions: form.getAll('divisions'),
        lifts,
      },
    })
    setLot(drawLot(state))
    event.currentTarget.reset()
  }
  const field = 'input-field w-full'
  return (
    <form className="card grid max-w-3xl gap-x-6 gap-y-2 md:grid-cols-2" onSubmit={add}>
      <h3 className="text-h3 md:col-span-2">{t('desk.addEntry')}</h3>
      <label>
        <span className="input-label">{t('desk.name')}</span>
        <input className={field} name="name" required />
      </label>
      <label>
        <span className="input-label">{t('desk.birthDate')}</span>
        <input className={field} name="birthDate" type="date" required />
      </label>
      <label>
        <span className="input-label">{t('desk.sex')}</span>
        <select className={field} name="sex">
          <option value="male">{t('desk.male')}</option>
          <option value="female">{t('desk.female')}</option>
        </select>
      </label>
      <label>
        <span className="input-label">{t('entries.team')}</span>
        <select className={field} name="team" defaultValue="">
          <option value="">{t('entries.noTeam')}</option>
          {state.teams.map((team) => (
            <option key={team.id} value={team.id}>
              {team.name}
            </option>
          ))}
        </select>
      </label>
      <label>
        <span className="input-label">{t('desk.bodyweight')}</span>
        <input className={field} name="bodyweight" type="number" min="0.001" step="0.001" />
      </label>
      <label>
        <span className="input-label">{t('desk.lotNumber')}</span>
        <input
          className={field}
          name="lotNumber"
          type="number"
          min="1"
          step="1"
          value={lot}
          onChange={(event) => setLot(Number(event.target.value))}
          required
        />
      </label>
      <fieldset className="md:col-span-2">
        <legend className="input-label">{t('entries.divisions')}</legend>
        {state.rulebook.divisions.map((division) => (
          <label key={division.id} className="mr-4 inline-flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              name="divisions"
              value={division.id}
              defaultChecked={division.byDefault === true}
            />
            {division.name[locale]}
          </label>
        ))}
      </fieldset>
      <fieldset className="md:col-span-2">
        <legend className="input-label">{t('desk.lifts')}</legend>
        <div className="flex flex-wrap gap-6">
          {state.rulebook.lifts.map((lift) => (
            <div key={lift.id} className="flex items-center gap-2 text-sm">
              <label className="inline-flex items-center gap-2">
                <input type="checkbox" name="lifts" value={lift.id} defaultChecked />
                {lift.name[locale]}
              </label>
              <input
                className="input-field w-24"
                aria-label={t('entries.opening') + ' ' + lift.name[locale]}
                name={'opening-' + lift.id}
                type="number"
                min="0"
                step="0.001"
              />
            </div>
          ))}
        </div>
      </fieldset>
      <div className="md:col-span-2">
        <button className="btn-primary" type="submit">
          {t('desk.addEntry')}
        </button>
      </div>
    </form>
  )
}

function EntryRow({
  state,
  entry,
  submit,
}: {
  readonly state: ContestState
  readonly entry: Entry
  readonly submit: Submit
}) {
  const { locale, t, tx } = useMessages()
  const [weight, setWeight] = useState(
    typeof entry.bodyweight === 'number' ? String(entry.bodyweight) : '',
  )
  // The preview uses the typed weight, so the classes and coefficients move while the operator types.
  const typed = parseKg(weight === '' ? Number.NaN : Number(weight))
  const shown: Entry =
    Option.isSome(typed) && typed.value > 0 ? { ...entry, bodyweight: typed.value } : entry
  const age = entryAgeClass(state, shown)
  const weightClass = entryWeightClass(state, shown)
  const name = (
    list: ReadonlyArray<{
      readonly id: string
      readonly name: { readonly pl: string; readonly en: string }
    }>,
    id: string,
  ) => list.find((item) => item.id === id)?.name[locale] ?? '—'
  const warnings = state.warnings.filter((warning) => warning.entryId === entry.id)
  function weigh(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (Option.isSome(typed) && typed.value > 0)
      submit({ _tag: 'SetBodyweight', entryId: entry.id, bodyweight: typed.value })
  }
  function toggle(divisionId: string, on: boolean) {
    const next = on
      ? [...entry.divisions, divisionId]
      : entry.divisions.filter((id) => id !== divisionId)
    submit({ _tag: 'SetDivisions', entryId: entry.id, divisions: next })
  }
  return (
    <tr>
      <td>
        <input
          className="input-field w-20 font-mono"
          aria-label={t('desk.lotNumber')}
          type="number"
          min="1"
          defaultValue={entry.lotNumber}
          onBlur={(event) => {
            const lot = Number(event.target.value)
            if (lot !== entry.lotNumber && lot > 0)
              submit({ _tag: 'SetLotNumber', entryId: entry.id, lotNumber: lot })
          }}
        />{' '}
        <button
          type="button"
          className="btn-secondary px-2 py-1 text-xs"
          onClick={() =>
            submit({ _tag: 'SetLotNumber', entryId: entry.id, lotNumber: drawLot(state) })
          }
        >
          {t('entries.draw')}
        </button>
      </td>
      <td>
        <div className="font-semibold uppercase">{entry.lifter.name}</div>
        <div className="text-xxs text-text-secondary">
          {entry.lifter.sex === 'male' ? t('desk.male') : t('desk.female')} ·{' '}
          {entry.lifter.birthDate}
        </div>
        {warnings.map((warning) => (
          <div
            key={warning.divisionId + warning.reason}
            className="text-xxs text-status-warning"
            role="status"
          >
            {tx('warn.' + warning.reason)} ({name(state.rulebook.divisions, warning.divisionId)})
          </div>
        ))}
      </td>
      <td>
        <select
          className="input-field"
          aria-label={t('entries.team')}
          value={entry.lifter.teamId ?? ''}
          onChange={(event) =>
            submit({
              _tag: 'SetEntryTeam',
              entryId: entry.id,
              ...(event.target.value === '' ? {} : { teamId: event.target.value }),
            })
          }
        >
          <option value="">{t('entries.noTeam')}</option>
          {state.teams.map((team) => (
            <option key={team.id} value={team.id}>
              {team.name}
            </option>
          ))}
        </select>
      </td>
      <td>
        <form className="flex gap-2" onSubmit={weigh}>
          <input
            className="input-field w-24 font-mono"
            aria-label={t('desk.bodyweight')}
            type="number"
            min="0.001"
            step="0.001"
            value={weight}
            onChange={(event) => setWeight(event.target.value)}
          />
          <button className="btn-primary px-3" type="submit">
            {t('entries.weighIn')}
          </button>
        </form>
        <div className="mt-1 font-mono text-xs text-text-secondary">
          {Option.isSome(age) ? name(state.rulebook.ageClasses, age.value) : '—'} ·{' '}
          {Option.isSome(weightClass) ? name(state.rulebook.weightClasses, weightClass.value) : '—'}{' '}
          · {t('entries.reshel')}{' '}
          {typeof shown.bodyweight === 'number'
            ? reshelCoefficient(shown.bodyweight, shown.lifter.sex).toFixed(3)
            : '—'}{' '}
          · {t('entries.mcc')}{' '}
          {mcCulloughCoefficient(shown.lifter.birthDate, state.date).toFixed(3)}
        </div>
      </td>
      <td>
        {state.rulebook.divisions.map((division) => (
          <label key={division.id} className="mr-3 inline-flex items-center gap-1 text-xs">
            <input
              type="checkbox"
              checked={entry.divisions.includes(division.id)}
              onChange={(event) => toggle(division.id, event.target.checked)}
            />
            {division.name[locale]}
          </label>
        ))}
        {state.rulebook.lifts
          .filter((lift) => lift.rackHeight && entry.lifts.some((item) => item.liftId === lift.id))
          .map((lift) => (
            <label key={lift.id} className="mt-1 flex items-center gap-2 text-xs">
              {t('entries.rack')} {lift.name[locale]}
              <input
                className="input-field w-16"
                type="number"
                min="0"
                step="1"
                defaultValue={entry.lifts.find((item) => item.liftId === lift.id)?.rackHeight}
                onBlur={(event) =>
                  event.target.value !== '' &&
                  submit({
                    _tag: 'SetRackHeight',
                    entryId: entry.id,
                    liftId: lift.id,
                    rackHeight: Number(event.target.value),
                  })
                }
              />
            </label>
          ))}
      </td>
    </tr>
  )
}

export function TeamsPanel({
  state,
  submit,
}: {
  readonly state: ContestState
  readonly submit: Submit
}) {
  const { t } = useMessages()
  function add(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    submit({ _tag: 'UpsertTeam', team: { id: crypto.randomUUID(), name: form.get('name') } })
    event.currentTarget.reset()
  }
  return (
    <section className="card">
      <h3 className="text-h3 mb-3">{t('teams.title')}</h3>
      <ul className="mb-4 divide-y divide-border-color">
        {state.teams.map((team) => (
          <li key={team.id} className="flex flex-wrap items-center gap-3 py-2">
            <input
              className="input-field w-64"
              aria-label={t('teams.rename') + ' ' + team.name}
              defaultValue={team.name}
              onBlur={(event) =>
                event.target.value.trim() !== '' &&
                event.target.value !== team.name &&
                submit({
                  _tag: 'UpsertTeam',
                  team: { id: team.id, name: event.target.value.trim() },
                })
              }
            />
            <span className="text-xs text-text-secondary">
              {state.entries.filter((entry) => entry.lifter.teamId === team.id).length}{' '}
              {t('teams.entries')}
            </span>
            <select
              className="input-field"
              aria-label={t('teams.mergeInto') + ' ' + team.name}
              value=""
              onChange={(event) =>
                event.target.value !== '' &&
                submit({ _tag: 'MergeTeams', from: team.id, into: event.target.value })
              }
            >
              <option value="">{t('teams.mergeInto')}</option>
              {state.teams
                .filter((other) => other.id !== team.id)
                .map((other) => (
                  <option key={other.id} value={other.id}>
                    {other.name}
                  </option>
                ))}
            </select>
            <button
              type="button"
              className="btn-secondary px-3 py-1 text-xxs"
              onClick={() => {
                const members = state.entries.filter(
                  (entry) => entry.lifter.teamId === team.id,
                ).length
                if (
                  confirm(
                    t('teams.removeConfirm')
                      .replace('{name}', team.name)
                      .replace('{count}', String(members)),
                  )
                )
                  submit({ _tag: 'RemoveTeam', teamId: team.id })
              }}
            >
              {t('teams.remove')}
            </button>
          </li>
        ))}
      </ul>
      <form className="flex gap-3" onSubmit={add}>
        <input
          className="input-field w-64"
          name="name"
          aria-label={t('teams.name')}
          placeholder={t('teams.name')}
          required
        />
        <button className="btn-primary" type="submit">
          {t('teams.add')}
        </button>
      </form>
    </section>
  )
}

const importFields: ReadonlyArray<ImportField> = [
  'name',
  'firstName',
  'lastName',
  'sex',
  'birthDate',
  'team',
  'lifts',
  'divisions',
  'bodyweight',
  'weightClass',
  'lotNumber',
]
const cellText = (cell: unknown): string =>
  cell instanceof Date
    ? cell.toISOString().slice(0, 10)
    : typeof cell === 'string' || typeof cell === 'number' || typeof cell === 'boolean'
      ? String(cell)
      : ''

export function ImportPanel({
  state,
  journal,
  submit,
}: {
  readonly state: ContestState
  readonly journal: ContestJournal
  readonly submit: Submit
}) {
  const { locale, t, tx } = useMessages()
  const [table, setTable] = useState<ReadonlyArray<ReadonlyArray<string>>>([])
  const [mapping, setMapping] = useState<ImportMapping>({ fields: {}, openings: {} })
  const [division, setDivision] = useState<string>('')
  const [failure, setFailure] = useState('')
  const header = table[0] ?? []
  async function load(file: File) {
    setFailure('')
    try {
      const rows = file.name.toLowerCase().endsWith('.xlsx')
        ? (await readSheet(file)).map((row) => row.map(cellText))
        : parseDelimited(await file.text())
      setTable(rows)
      setMapping(suggestMapping(rows[0] ?? [], state))
    } catch {
      setFailure('storage.invalid')
    }
  }
  const plan = useMemo(
    () =>
      table.length < 2
        ? { commands: [], rows: [] }
        : planImport(
            state,
            journal,
            table.slice(1),
            mapping,
            {
              divisions: [
                ...defaultDivisions(state.rulebook),
                ...(division === '' ||
                defaultDivisions(state.rulebook).some((id) => id === division)
                  ? []
                  : [division]),
              ],
              lifts: state.rulebook.lifts.map((lift) => lift.id),
            },
            { newId: () => crypto.randomUUID(), now: Date.now(), random: Math.random },
          ),
    [table, mapping, division, state, journal],
  )
  const column = (value: number, change: (next: number) => void, label: string) => (
    <label key={label} className="block">
      <span className="input-label">{label}</span>
      <select
        className="input-field w-full"
        value={value < 0 ? '' : String(value)}
        onChange={(event) => change(event.target.value === '' ? -1 : Number(event.target.value))}
      >
        <option value="">{t('import.none')}</option>
        {header.map((title, index) => (
          // Column positions are the identity of a spreadsheet column.
          <option key={index} value={index}>
            {title || '#' + (index + 1)}
          </option>
        ))}
      </select>
    </label>
  )
  const valid = plan.rows.filter((row) => row.problems.length === 0).length
  return (
    <section className="card">
      <h3 className="text-h3 mb-3">{t('import.title')}</h3>
      <label className="block">
        <span className="input-label">{t('import.file')}</span>
        <input
          className="input-field"
          type="file"
          accept=".csv,.txt,.xlsx"
          onChange={(event) => {
            const file = event.target.files?.[0]
            if (file) Effect.runFork(Effect.promise(() => load(file)))
          }}
        />
      </label>
      {failure !== '' && <p role="alert">{t('storage.invalid')}</p>}
      {table.length > 0 && (
        <>
          <h4 className="text-h3 mt-4">{t('import.mapping')}</h4>
          <div className="grid gap-3 md:grid-cols-3">
            {importFields.map((field) =>
              column(
                mapping.fields[field] ?? -1,
                (next) => {
                  const { [field]: _removed, ...rest } = mapping.fields
                  setMapping({
                    ...mapping,
                    fields: next < 0 ? rest : { ...rest, [field]: next },
                  })
                },
                tx('field.' + field),
              ),
            )}
            {state.rulebook.lifts.map((lift) =>
              column(
                mapping.openings[lift.id] ?? -1,
                (next) => {
                  const { [lift.id]: _removed, ...rest } = mapping.openings
                  setMapping({
                    ...mapping,
                    openings: next < 0 ? rest : { ...rest, [lift.id]: next },
                  })
                },
                t('import.opening') + ' ' + lift.name[locale],
              ),
            )}
            <label className="block">
              <span className="input-label">{t('import.defaultDivision')}</span>
              <select
                className="input-field w-full"
                value={division}
                onChange={(event) => setDivision(event.target.value)}
              >
                <option value="">{t('import.none')}</option>
                {state.rulebook.divisions.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name[locale]}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <h4 className="text-h3 mt-4">{t('import.preview')}</h4>
          <div className="overflow-x-auto">
            <table className="data-table">
              <tbody>
                {table.slice(1).map((row, index) => {
                  const outcome = plan.rows[index]
                  return (
                    // Rows have no identity beyond their position in the file.
                    <tr key={index} data-valid={outcome?.problems.length === 0}>
                      <td className="font-mono text-xs">{index + 2}</td>
                      {row.map((cell, cellIndex) => (
                        <td key={cellIndex} className="text-xs">
                          {cell}
                        </td>
                      ))}
                      <td className="text-xs">
                        {outcome?.problems.length === 0 ? (
                          <span className="attempt-good">{t('import.rowOk')}</span>
                        ) : (
                          outcome?.problems.map((problem) => (
                            <span
                              key={problem.problem + problem.detail}
                              className="attempt-failed mr-1"
                              role="alert"
                            >
                              {tx('problem.' + problem.problem)} {problem.detail}
                            </span>
                          ))
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-sm">
            {t('import.summary')}: {valid} / {plan.rows.length}
          </p>
          <button
            className="btn-primary mt-2"
            type="button"
            disabled={plan.commands.length === 0}
            onClick={() => {
              for (const command of plan.commands) submit(command)
              setTable([])
            }}
          >
            {t('import.apply')}
          </button>
        </>
      )}
    </section>
  )
}

export function EntriesPanel({
  state,
  journal,
  submit,
  withTeams = true,
}: {
  readonly state: ContestState
  readonly journal: ContestJournal
  readonly submit: Submit
  readonly withTeams?: boolean
}) {
  const { t } = useMessages()
  return (
    <div className="space-y-6">
      <section className="card">
        <h3 className="text-h3 mb-3">{t('entries.title')}</h3>
        {state.entries.length === 0 ? (
          <p className="text-text-secondary">{t('entries.empty')}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="data-table">
              <thead>
                <tr>
                  <th>{t('desk.lotNumber')}</th>
                  <th>{t('desk.name')}</th>
                  <th>{t('entries.team')}</th>
                  <th>{t('entries.weighIn')}</th>
                  <th>{t('entries.divisions')}</th>
                </tr>
              </thead>
              <tbody>
                {state.entries.map((entry) => (
                  <EntryRow key={entry.id} state={state} entry={entry} submit={submit} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      <EntryForm state={state} submit={submit} />
      {withTeams && <TeamsPanel state={state} submit={submit} />}
      <ImportPanel state={state} journal={journal} submit={submit} />
    </div>
  )
}
