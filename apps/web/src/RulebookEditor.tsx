import { parseRulebookJson, rulebookToJson } from '@werewolf/core'
import * as Result from 'effect/Result'
import { useState, type ReactNode } from 'react'
import { useMessages } from './i18n.ts'
import {
  fromDraft,
  toDraft,
  type ClassificationDraft,
  type DivisionDraft,
  type RulebookDraft,
} from './rulebook-draft.ts'

const box = 'input-field'
function Num({
  label,
  value,
  onChange,
  step = 'any',
}: {
  readonly label: string
  readonly value: number | string
  readonly onChange: (next: number) => void
  readonly step?: string
}) {
  return (
    <label className="block">
      <span className="input-label">{label}</span>
      <input
        className={box + ' w-24 font-mono'}
        type="number"
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </label>
  )
}
function Text({
  label,
  value,
  onChange,
  width = 'w-40',
}: {
  readonly label: string
  readonly value: string
  readonly onChange: (next: string) => void
  readonly width?: string
}) {
  return (
    <label className="block">
      <span className="input-label">{label}</span>
      <input
        className={box + ' ' + width}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  )
}
function Section({ title, children }: { readonly title: string; readonly children: ReactNode }) {
  return (
    <section className="card">
      <h3 className="text-h3 mb-3">{title}</h3>
      {children}
    </section>
  )
}
const slug = (prefix: string, existing: ReadonlyArray<{ readonly id: string }>) => {
  let index = existing.length + 1
  while (existing.some((item) => item.id === prefix + index)) index++
  return prefix + index
}
const replaceAt = <A,>(items: ReadonlyArray<A>, index: number, next: A): A[] =>
  items.map((item, position) => (position === index ? next : item))
const without = <A,>(items: ReadonlyArray<A>, index: number): A[] =>
  items.filter((_, position) => position !== index)

/** Edits every part of the rulebook; the parent checks the result with the real parser. */
export function RulebookEditor({
  draft,
  onChange,
  part,
}: {
  readonly draft: RulebookDraft
  readonly onChange: (next: RulebookDraft) => void
  /** The wizard shows lifts and equipment in one step, divisions and classifications in the next. */
  readonly part: 'rulebook' | 'classes'
}) {
  const { locale, t } = useMessages()
  const [jsonText, setJsonText] = useState('')
  const [jsonError, setJsonError] = useState('')
  const set = (patch: Partial<RulebookDraft>) => onChange({ ...draft, ...patch })
  const remove = (
    key: 'lifts' | 'divisions' | 'ageClasses' | 'weightClasses' | 'classifications',
    index: number,
  ) => {
    switch (key) {
      case 'lifts':
        return set({ lifts: without(draft.lifts, index) })
      case 'divisions':
        return set({ divisions: without(draft.divisions, index) })
      case 'ageClasses':
        return set({ ageClasses: without(draft.ageClasses, index) })
      case 'weightClasses':
        return set({ weightClasses: without(draft.weightClasses, index) })
      case 'classifications':
        return set({ classifications: without(draft.classifications, index) })
    }
  }
  const removeButton = (action: () => void) => (
    <button type="button" className="btn-secondary px-2 py-1 text-xs" onClick={action}>
      {t('rb.remove')}
    </button>
  )
  function loadJson(text: string) {
    const parsed = parseRulebookJson(text)
    if (Result.isFailure(parsed)) {
      setJsonError(parsed.failure.detail)
      return
    }
    setJsonError('')
    onChange(toDraft(parsed.success))
  }
  const current = fromDraft(draft)
  return (
    <div className="space-y-4">
      {part === 'rulebook' && (
        <>
          <Section title={t('rb.name')}>
            <div className="flex gap-3">
              <Text
                label="PL"
                value={draft.name.pl}
                onChange={(pl) => set({ name: { ...draft.name, pl } })}
                width="w-64"
              />
              <Text
                label="EN"
                value={draft.name.en}
                onChange={(en) => set({ name: { ...draft.name, en } })}
                width="w-64"
              />
            </div>
          </Section>
          <Section title={t('rb.lifts')}>
            {draft.lifts.map((lift, index) => (
              <div key={index} className="mb-2 flex flex-wrap items-end gap-3">
                <Text
                  label={t('rb.id')}
                  value={lift.id}
                  onChange={(id) => set({ lifts: replaceAt(draft.lifts, index, { ...lift, id }) })}
                  width="w-28"
                />
                <Text
                  label="PL"
                  value={lift.name.pl}
                  onChange={(pl) =>
                    set({
                      lifts: replaceAt(draft.lifts, index, { ...lift, name: { ...lift.name, pl } }),
                    })
                  }
                />
                <Text
                  label="EN"
                  value={lift.name.en}
                  onChange={(en) =>
                    set({
                      lifts: replaceAt(draft.lifts, index, { ...lift, name: { ...lift.name, en } }),
                    })
                  }
                />
                <Num
                  label={t('rb.attempts')}
                  value={lift.attempts}
                  step="1"
                  onChange={(attempts) =>
                    set({ lifts: replaceAt(draft.lifts, index, { ...lift, attempts }) })
                  }
                />
                <label className="flex items-center gap-2 pb-2 text-sm">
                  <input
                    type="checkbox"
                    checked={lift.rackHeight}
                    onChange={(event) =>
                      set({
                        lifts: replaceAt(draft.lifts, index, {
                          ...lift,
                          rackHeight: event.target.checked,
                        }),
                      })
                    }
                  />
                  {t('rb.rack')}
                </label>
                {removeButton(() => remove('lifts', index))}
              </div>
            ))}
            <button
              type="button"
              className="btn-secondary"
              onClick={() =>
                set({
                  lifts: [
                    ...draft.lifts,
                    {
                      id: slug('lift', draft.lifts),
                      name: { pl: 'Bój', en: 'Lift' },
                      attempts: 3,
                      rackHeight: false,
                    },
                  ],
                })
              }
            >
              {t('rb.add')}
            </button>
          </Section>
        </>
      )}
      {part === 'classes' && (
        <>
          <Section title={t('rb.divisions')}>
            {draft.divisions.map((division, index) => {
              const update = (next: DivisionDraft) =>
                set({ divisions: replaceAt(draft.divisions, index, next) })
              const condition = (
                key: 'minAge' | 'maxAge' | 'minBodyweight' | 'maxBodyweight',
                value: number,
              ) => {
                const { [key]: _old, ...rest } = division.conditions
                update({ ...division, conditions: value > 0 ? { ...rest, [key]: value } : rest })
              }
              return (
                <div key={index} className="mb-2 flex flex-wrap items-end gap-3">
                  <Text
                    label={t('rb.id')}
                    value={division.id}
                    onChange={(id) => update({ ...division, id })}
                    width="w-28"
                  />
                  <Text
                    label="PL"
                    value={division.name.pl}
                    onChange={(pl) => update({ ...division, name: { ...division.name, pl } })}
                  />
                  <Text
                    label="EN"
                    value={division.name.en}
                    onChange={(en) => update({ ...division, name: { ...division.name, en } })}
                  />
                  <label className="flex items-center gap-2 pb-2 text-sm">
                    <input
                      type="checkbox"
                      checked={division.byDefault === true}
                      onChange={(event) => {
                        const { byDefault: _old, ...rest } = division
                        update(event.target.checked ? { ...rest, byDefault: true } : rest)
                      }}
                    />
                    {t('rb.byDefault')}
                  </label>
                  <label className="block">
                    <span className="input-label">{t('rb.policy')}</span>
                    <select
                      className={box}
                      value={division.policy}
                      onChange={(event) =>
                        update({
                          ...division,
                          policy: event.target.value === 'warn' ? 'warn' : 'reject',
                        })
                      }
                    >
                      <option value="reject">{t('rb.policyReject')}</option>
                      <option value="warn">{t('rb.policyWarn')}</option>
                    </select>
                  </label>
                  <label className="block">
                    <span className="input-label">{t('rb.sex')}</span>
                    <select
                      className={box}
                      value={division.conditions.sex ?? ''}
                      onChange={(event) => {
                        const { sex: _old, ...rest } = division.conditions
                        update({
                          ...division,
                          conditions:
                            event.target.value === 'male' || event.target.value === 'female'
                              ? { ...rest, sex: event.target.value }
                              : rest,
                        })
                      }}
                    >
                      <option value="">—</option>
                      <option value="male">{t('desk.male')}</option>
                      <option value="female">{t('desk.female')}</option>
                    </select>
                  </label>
                  <Num
                    label={t('rb.minAge')}
                    value={division.conditions.minAge ?? ''}
                    step="1"
                    onChange={(value) => condition('minAge', value)}
                  />
                  <Num
                    label={t('rb.maxAge')}
                    value={division.conditions.maxAge ?? ''}
                    step="1"
                    onChange={(value) => condition('maxAge', value)}
                  />
                  <Num
                    label={t('rb.minWeight')}
                    value={division.conditions.minBodyweight ?? ''}
                    onChange={(value) => condition('minBodyweight', value)}
                  />
                  <Num
                    label={t('rb.maxWeight')}
                    value={division.conditions.maxBodyweight ?? ''}
                    onChange={(value) => condition('maxBodyweight', value)}
                  />
                  {removeButton(() => remove('divisions', index))}
                </div>
              )
            })}
            <button
              type="button"
              className="btn-secondary"
              onClick={() =>
                set({
                  divisions: [
                    ...draft.divisions,
                    {
                      id: slug('division', draft.divisions),
                      name: { pl: 'Nowa dywizja', en: 'New division' },
                      policy: 'reject',
                      conditions: {},
                    },
                  ],
                })
              }
            >
              {t('rb.add')}
            </button>
          </Section>
          <Section title={t('rb.ageClasses')}>
            {draft.ageClasses.map((item, index) => (
              <div key={index} className="mb-2 flex flex-wrap items-end gap-3">
                <Text
                  label={t('rb.id')}
                  value={item.id}
                  onChange={(id) =>
                    set({ ageClasses: replaceAt(draft.ageClasses, index, { ...item, id }) })
                  }
                  width="w-28"
                />
                <Text
                  label="PL"
                  value={item.name.pl}
                  onChange={(pl) =>
                    set({
                      ageClasses: replaceAt(draft.ageClasses, index, {
                        ...item,
                        name: { ...item.name, pl },
                      }),
                    })
                  }
                />
                <Text
                  label="EN"
                  value={item.name.en}
                  onChange={(en) =>
                    set({
                      ageClasses: replaceAt(draft.ageClasses, index, {
                        ...item,
                        name: { ...item.name, en },
                      }),
                    })
                  }
                />
                <Num
                  label={t('rb.from')}
                  value={item.from}
                  step="1"
                  onChange={(from) =>
                    set({ ageClasses: replaceAt(draft.ageClasses, index, { ...item, from }) })
                  }
                />
                <Num
                  label={t('rb.through')}
                  value={item.through ?? ''}
                  step="1"
                  onChange={(through) => {
                    const { through: _old, ...rest } = item
                    set({
                      ageClasses: replaceAt(
                        draft.ageClasses,
                        index,
                        through > 0 ? { ...rest, through } : rest,
                      ),
                    })
                  }}
                />
                <label className="flex items-center gap-2 pb-2 text-sm">
                  <input
                    type="checkbox"
                    checked={item.kids === true}
                    onChange={(event) => {
                      const { kids: _old, ...rest } = item
                      set({
                        ageClasses: replaceAt(
                          draft.ageClasses,
                          index,
                          event.target.checked ? { ...rest, kids: true } : rest,
                        ),
                      })
                    }}
                  />
                  {t('rb.kids')}
                </label>
                {removeButton(() => remove('ageClasses', index))}
              </div>
            ))}
            <button
              type="button"
              className="btn-secondary"
              onClick={() =>
                set({
                  ageClasses: [
                    ...draft.ageClasses,
                    {
                      id: slug('age', draft.ageClasses),
                      name: { pl: 'Kategoria', en: 'Class' },
                      from: 0,
                    },
                  ],
                })
              }
            >
              {t('rb.add')}
            </button>
          </Section>
          <Section title={t('rb.weightClasses')}>
            {draft.weightClasses.map((item, index) => (
              <div key={index} className="mb-2 flex flex-wrap items-end gap-3">
                <Text
                  label={t('rb.id')}
                  value={item.id}
                  onChange={(id) =>
                    set({ weightClasses: replaceAt(draft.weightClasses, index, { ...item, id }) })
                  }
                  width="w-28"
                />
                <Text
                  label="PL"
                  value={item.name.pl}
                  onChange={(pl) =>
                    set({
                      weightClasses: replaceAt(draft.weightClasses, index, {
                        ...item,
                        name: { ...item.name, pl },
                      }),
                    })
                  }
                />
                <Text
                  label="EN"
                  value={item.name.en}
                  onChange={(en) =>
                    set({
                      weightClasses: replaceAt(draft.weightClasses, index, {
                        ...item,
                        name: { ...item.name, en },
                      }),
                    })
                  }
                />
                <Num
                  label={t('rb.lowerExclusive')}
                  value={item.lowerExclusive ?? ''}
                  onChange={(value) => {
                    const { lowerExclusive: _old, ...rest } = item
                    set({
                      weightClasses: replaceAt(
                        draft.weightClasses,
                        index,
                        value > 0 ? { ...rest, lowerExclusive: value } : rest,
                      ),
                    })
                  }}
                />
                <Num
                  label={t('rb.upperInclusive')}
                  value={item.upperInclusive ?? ''}
                  onChange={(value) => {
                    const { upperInclusive: _old, ...rest } = item
                    set({
                      weightClasses: replaceAt(
                        draft.weightClasses,
                        index,
                        value > 0 ? { ...rest, upperInclusive: value } : rest,
                      ),
                    })
                  }}
                />
                {removeButton(() => remove('weightClasses', index))}
              </div>
            ))}
            <button
              type="button"
              className="btn-secondary"
              onClick={() =>
                set({
                  weightClasses: [
                    ...draft.weightClasses,
                    {
                      id: slug('weight', draft.weightClasses),
                      name: { pl: 'Kategoria', en: 'Class' },
                      upperInclusive: 100,
                    },
                  ],
                })
              }
            >
              {t('rb.add')}
            </button>
          </Section>
          <Section title={t('rb.classifications')}>
            {draft.classifications.map((item, index) => {
              const update = (next: ClassificationDraft) =>
                set({ classifications: replaceAt(draft.classifications, index, next) })
              const toggle = (list: ReadonlyArray<string>, id: string, on: boolean) =>
                on ? [...list, id] : list.filter((value) => value !== id)
              const ids = item.membership.kind === 'divisions' ? item.membership.ids : []
              return (
                <div key={index} className="mb-4 border-b border-border-color pb-3">
                  <div className="flex flex-wrap items-end gap-3">
                    <Text
                      label={t('rb.id')}
                      value={item.id}
                      onChange={(id) => update({ ...item, id })}
                      width="w-28"
                    />
                    <Text
                      label="PL"
                      value={item.name.pl}
                      onChange={(pl) => update({ ...item, name: { ...item.name, pl } })}
                      width="w-56"
                    />
                    <Text
                      label="EN"
                      value={item.name.en}
                      onChange={(en) => update({ ...item, name: { ...item.name, en } })}
                      width="w-56"
                    />
                    <label className="block">
                      <span className="input-label">{t('rb.kind')}</span>
                      <select
                        className={box}
                        value={item.kind}
                        onChange={(event) => {
                          const kind = event.target.value === 'team' ? 'team' : 'individual'
                          const { split: _s, quota: _q, ...rest } = item
                          update(
                            kind === 'team'
                              ? { ...rest, kind, quota: { kind: 'any', count: 5 } }
                              : { ...rest, kind, split: 'none' },
                          )
                        }}
                      >
                        <option value="individual">{t('rb.individual')}</option>
                        <option value="team">{t('rb.team')}</option>
                      </select>
                    </label>
                    <label className="block">
                      <span className="input-label">{t('rb.result')}</span>
                      <select
                        className={box}
                        value={item.result}
                        onChange={(event) =>
                          update({
                            ...item,
                            result:
                              event.target.value === 'sum' || event.target.value === 'sumDone'
                                ? event.target.value
                                : 'best',
                          })
                        }
                      >
                        <option value="best">{t('rb.best')}</option>
                        <option value="sum">{t('rb.sum')}</option>
                        <option value="sumDone">{t('rb.sumDone')}</option>
                      </select>
                    </label>
                    <label className="block">
                      <span className="input-label">{t('rb.formula')}</span>
                      <select
                        className={box}
                        value={item.formula}
                        onChange={(event) =>
                          update({
                            ...item,
                            formula:
                              event.target.value === 'kilograms'
                                ? 'kilograms'
                                : event.target.value === 'reshel'
                                  ? 'reshel'
                                  : 'reshelMcCullough',
                          })
                        }
                      >
                        <option value="kilograms">{t('rb.kg')}</option>
                        <option value="reshel">{t('rb.reshel')}</option>
                        <option value="reshelMcCullough">{t('rb.reshelMcCullough')}</option>
                      </select>
                    </label>
                    {item.kind === 'individual' && (
                      <label className="block">
                        <span className="input-label">{t('rb.split')}</span>
                        <select
                          className={box}
                          value={item.split ?? 'none'}
                          onChange={(event) =>
                            update({
                              ...item,
                              split:
                                event.target.value === 'age'
                                  ? 'age'
                                  : event.target.value === 'weight'
                                    ? 'weight'
                                    : event.target.value === 'ageAndWeight'
                                      ? 'ageAndWeight'
                                      : 'none',
                            })
                          }
                        >
                          <option value="none">{t('rb.splitNone')}</option>
                          <option value="age">{t('rb.splitAge')}</option>
                          <option value="weight">{t('rb.splitWeight')}</option>
                          <option value="ageAndWeight">{t('rb.splitAgeWeight')}</option>
                        </select>
                      </label>
                    )}
                    {item.kind === 'team' && (
                      <>
                        <label className="block">
                          <span className="input-label">{t('rb.quota')}</span>
                          <select
                            className={box}
                            value={item.quota?.kind ?? 'any'}
                            onChange={(event) =>
                              update({
                                ...item,
                                quota:
                                  event.target.value === 'bySex'
                                    ? { kind: 'bySex', male: 4, female: 1 }
                                    : { kind: 'any', count: 5 },
                              })
                            }
                          >
                            <option value="any">{t('rb.quotaAny')}</option>
                            <option value="bySex">{t('rb.quotaBySex')}</option>
                          </select>
                        </label>
                        {item.quota?.kind === 'bySex' ? (
                          <>
                            <Num
                              label={t('rb.men')}
                              value={item.quota.male}
                              step="1"
                              onChange={(male) =>
                                item.quota?.kind === 'bySex' &&
                                update({ ...item, quota: { ...item.quota, male } })
                              }
                            />
                            <Num
                              label={t('rb.women')}
                              value={item.quota.female}
                              step="1"
                              onChange={(female) =>
                                item.quota?.kind === 'bySex' &&
                                update({ ...item, quota: { ...item.quota, female } })
                              }
                            />
                          </>
                        ) : (
                          <Num
                            label={t('rb.count')}
                            value={item.quota?.kind === 'any' ? item.quota.count : 5}
                            step="1"
                            onChange={(count) => update({ ...item, quota: { kind: 'any', count } })}
                          />
                        )}
                      </>
                    )}
                    {removeButton(() => remove('classifications', index))}
                  </div>
                  <div className="mt-2 flex flex-wrap gap-4 text-sm">
                    <span className="input-label mb-0">{t('rb.membership')}:</span>
                    <label className="flex items-center gap-1">
                      <input
                        type="checkbox"
                        checked={item.membership.kind === 'all'}
                        onChange={(event) =>
                          update({
                            ...item,
                            membership: event.target.checked
                              ? { kind: 'all' }
                              : {
                                  kind: 'divisions',
                                  ids: draft.divisions.slice(0, 1).map((d) => d.id),
                                },
                          })
                        }
                      />
                      {t('rb.allDivisions')}
                    </label>
                    {item.membership.kind === 'divisions' &&
                      draft.divisions.map((division) => (
                        <label key={division.id} className="flex items-center gap-1">
                          <input
                            type="checkbox"
                            checked={ids.includes(division.id)}
                            onChange={(event) =>
                              update({
                                ...item,
                                membership: {
                                  kind: 'divisions',
                                  ids: toggle(ids, division.id, event.target.checked),
                                },
                              })
                            }
                          />
                          {division.name[locale]}
                        </label>
                      ))}
                    <span className="input-label mb-0 ml-4">{t('rb.liftIds')}:</span>
                    {draft.lifts.map((lift) => (
                      <label key={lift.id} className="flex items-center gap-1">
                        <input
                          type="checkbox"
                          checked={item.liftIds.includes(lift.id)}
                          onChange={(event) =>
                            update({
                              ...item,
                              liftIds: toggle(item.liftIds, lift.id, event.target.checked),
                            })
                          }
                        />
                        {lift.name[locale]}
                      </label>
                    ))}
                  </div>
                </div>
              )
            })}
            <button
              type="button"
              className="btn-secondary"
              onClick={() =>
                set({
                  classifications: [
                    ...draft.classifications,
                    {
                      id: slug('classification', draft.classifications),
                      name: { pl: 'Nowa klasyfikacja', en: 'New classification' },
                      kind: 'individual',
                      membership: { kind: 'all' },
                      liftIds: draft.lifts.slice(0, 1).map((lift) => lift.id),
                      result: 'best',
                      formula: 'kilograms',
                      split: 'none',
                    },
                  ],
                })
              }
            >
              {t('rb.add')}
            </button>
          </Section>
        </>
      )}
      {part === 'rulebook' && (
        <>
          <Section title={t('rb.equipment')}>
            <div className="mb-3 flex flex-wrap gap-3">
              <Num
                label={t('rb.barMale')}
                value={draft.barbell.bars.male}
                onChange={(male) =>
                  set({ barbell: { ...draft.barbell, bars: { ...draft.barbell.bars, male } } })
                }
              />
              <Num
                label={t('rb.barFemale')}
                value={draft.barbell.bars.female}
                onChange={(female) =>
                  set({ barbell: { ...draft.barbell, bars: { ...draft.barbell.bars, female } } })
                }
              />
              <Num
                label={t('rb.clamps')}
                value={draft.barbell.clampsPerSide}
                onChange={(clampsPerSide) => set({ barbell: { ...draft.barbell, clampsPerSide } })}
              />
            </div>
            {draft.barbell.plates.map((plate, index) => (
              <div key={index} className="mb-2 flex items-end gap-3">
                <Num
                  label={t('rb.plateWeight')}
                  value={plate.weight}
                  onChange={(weight) =>
                    set({
                      barbell: {
                        ...draft.barbell,
                        plates: replaceAt(draft.barbell.plates, index, { ...plate, weight }),
                      },
                    })
                  }
                />
                <Num
                  label={t('rb.platePairs')}
                  value={plate.pairs}
                  step="1"
                  onChange={(pairs) =>
                    set({
                      barbell: {
                        ...draft.barbell,
                        plates: replaceAt(draft.barbell.plates, index, { ...plate, pairs }),
                      },
                    })
                  }
                />
                {removeButton(() =>
                  set({
                    barbell: { ...draft.barbell, plates: without(draft.barbell.plates, index) },
                  }),
                )}
              </div>
            ))}
            <button
              type="button"
              className="btn-secondary"
              onClick={() =>
                set({
                  barbell: {
                    ...draft.barbell,
                    plates: [...draft.barbell.plates, { weight: 1, pairs: 1 }],
                  },
                })
              }
            >
              {t('rb.add')}
            </button>
          </Section>
          <Section title={t('rb.json')}>
            <p className="mb-2 text-sm text-text-secondary">{t('rb.importHelp')}</p>
            <textarea
              className={box + ' h-40 w-full font-mono text-xs'}
              aria-label={t('rb.json')}
              value={jsonText}
              onChange={(event) => setJsonText(event.target.value)}
            />
            <div className="mt-2 flex flex-wrap items-center gap-3">
              <button type="button" className="btn-secondary" onClick={() => loadJson(jsonText)}>
                {t('rb.import')}
              </button>
              <input
                className={box}
                type="file"
                accept=".json,application/json"
                aria-label={t('rb.importHelp')}
                onChange={(event) => {
                  const file = event.target.files?.[0]
                  if (file)
                    file.text().then(
                      (text) => {
                        setJsonText(text)
                        loadJson(text)
                      },
                      () => setJsonError('The file cannot be read.'),
                    )
                }}
              />
              <button
                type="button"
                className="btn-secondary"
                disabled={Result.isFailure(current)}
                onClick={() => {
                  if (Result.isFailure(current)) return
                  const text = rulebookToJson(current.success)
                  setJsonText(text)
                  const link = document.createElement('a')
                  link.href = URL.createObjectURL(new Blob([text], { type: 'application/json' }))
                  link.download = 'rulebook.json'
                  link.click()
                }}
              >
                {t('rb.export')}
              </button>
            </div>
            {jsonError !== '' && (
              <p role="alert" className="mt-2">
                {jsonError}
              </p>
            )}
            {Result.isFailure(current) && (
              <p role="alert" className="mt-2">
                {t('rb.invalid')}: {current.failure.detail.split('\n')[0]}
              </p>
            )}
          </Section>
        </>
      )}
    </div>
  )
}
