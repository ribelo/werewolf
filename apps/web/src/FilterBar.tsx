import * as Option from 'effect/Option'
import { ChevronDown } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useLegacy } from './legacy-i18n.ts'
import type { FilterOption, FilterOptions, Filters } from './contest-table.ts'

export const filterButtonClass = (active: boolean) =>
  'px-3 py-1 text-xxs ' + (active ? 'btn-primary text-black' : 'btn-secondary')

type Target = 'weight' | 'age' | 'labels'

/** The weight, age and label dropdowns of the 2025 registration and lift tables. */
export function FilterBar({
  options,
  filters,
  onChange,
}: {
  readonly options: FilterOptions
  readonly filters: Filters
  readonly onChange: (filters: Filters) => void
}) {
  const { lt } = useLegacy()
  const [opened, setOpen] = useState<Option.Option<Target>>(Option.none())
  const open = Option.getOrElse(opened, () => 'none')
  useEffect(() => {
    if (Option.isNone(opened)) return
    const close = () => setOpen(Option.none())
    window.addEventListener('click', close)
    return () => window.removeEventListener('click', close)
  }, [opened])
  const female = lt('contest_detail.registrations.filters.sex_female')
  const male = lt('contest_detail.registrations.filters.sex_male')
  const weightLabel = (() => {
    if (filters.weight === 'ALL')
      return lt('contest_detail.registrations.filters.weight_button_all')
    if (filters.weight === 'FEMALE_OPEN')
      return female + ' ' + lt('contest_detail.registrations.filters.open')
    if (filters.weight === 'MALE_OPEN')
      return male + ' ' + lt('contest_detail.registrations.filters.open')
    const f = options.female.find((item) => item.id === filters.weight)
    if (f) return female + ' ' + f.label
    const m = options.male.find((item) => item.id === filters.weight)
    if (m) return male + ' ' + m.label
    return lt('contest_detail.registrations.filters.weight_button_all')
  })()
  const ageLabel =
    options.age.find((item) => item.id === filters.age)?.label ??
    lt('contest_detail.registrations.filters.age_button_all')
  const labelLabel =
    options.label.find((item) => item.id === filters.label)?.label ??
    lt('contest_detail.registrations.filters.labels_button_all')
  const active = filters.weight !== 'ALL' || filters.age !== 'ALL' || filters.label !== 'ALL'
  const toggle = (target: Target) => (event: React.MouseEvent) => {
    event.stopPropagation()
    setOpen(open === target ? Option.none() : Option.some(target))
  }
  const choose = (patch: Partial<Filters>) => {
    onChange({ ...filters, ...patch })
    setOpen(Option.none())
  }
  const grid = (items: ReadonlyArray<FilterOption>, selected: string, key: 'age' | 'label') => (
    <div className="grid max-h-52 grid-cols-2 gap-2 overflow-y-auto pr-1">
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          className={filterButtonClass(selected === item.id) + ' w-full'}
          onClick={() => choose({ [key]: item.id })}
        >
          {item.label}
        </button>
      ))}
    </div>
  )
  const trigger = (
    target: Target,
    title: string,
    value: string,
    width: string,
    isActive: boolean,
  ) => (
    <button
      type="button"
      className={
        filterButtonClass(isActive) + ' flex ' + width + ' items-center justify-between gap-3'
      }
      onClick={toggle(target)}
    >
      <div className="flex flex-col text-left leading-tight">
        <span className="font-semibold">{title}</span>
        <span className="text-text-secondary">{value}</span>
      </div>
      <ChevronDown
        className={'h-3.5 w-3.5 transition-transform ' + (open === target ? 'rotate-180' : '')}
        aria-hidden="true"
      />
    </button>
  )
  return (
    <div className="flex flex-wrap items-center gap-2">
      {(options.female.length > 0 || options.male.length > 0) && (
        <div className="relative" onClick={(event) => event.stopPropagation()}>
          {trigger(
            'weight',
            lt('contest_detail.registrations.filters.weight_button'),
            weightLabel,
            'min-w-[190px]',
            filters.weight !== 'ALL',
          )}
          {open === 'weight' && (
            <div className="absolute left-0 top-full z-40 mt-2 w-72 rounded border border-border-color bg-element-bg px-3 py-3 shadow-lg">
              <div className="space-y-4">
                <button
                  type="button"
                  className={filterButtonClass(filters.weight === 'ALL') + ' w-full justify-start'}
                  onClick={() => choose({ weight: 'ALL' })}
                >
                  {lt('contest_detail.results.filters.all')}
                </button>
                {(
                  [
                    ['FEMALE_OPEN', 'weights_female', options.female],
                    ['MALE_OPEN', 'weights_male', options.male],
                  ] as const
                ).map(([open, key, items]) =>
                  items.length === 0 ? (
                    <span key={key} />
                  ) : (
                    <div key={key}>
                      <p className="mb-2 text-xxs uppercase tracking-[0.3em] text-text-secondary">
                        {lt('contest_detail.registrations.filters.' + key)}
                      </p>
                      <div className="grid grid-cols-2 gap-2">
                        {[
                          { id: open, label: lt('contest_detail.registrations.filters.open') },
                          ...items,
                        ].map((item) => (
                          <button
                            key={item.id}
                            type="button"
                            className={filterButtonClass(filters.weight === item.id) + ' w-full'}
                            onClick={() => choose({ weight: item.id })}
                          >
                            {item.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  ),
                )}
              </div>
            </div>
          )}
        </div>
      )}
      <div className="relative" onClick={(event) => event.stopPropagation()}>
        {trigger(
          'age',
          lt('contest_detail.registrations.filters.age_button'),
          ageLabel,
          'min-w-[170px]',
          filters.age !== 'ALL',
        )}
        {open === 'age' && (
          <div className="absolute left-0 top-full z-40 mt-2 w-60 rounded border border-border-color bg-element-bg px-3 py-3 shadow-lg">
            {grid(options.age, filters.age, 'age')}
          </div>
        )}
      </div>
      <div className="relative" onClick={(event) => event.stopPropagation()}>
        {trigger(
          'labels',
          lt('contest_detail.registrations.filters.labels_button'),
          labelLabel,
          'min-w-[170px]',
          filters.label !== 'ALL',
        )}
        {open === 'labels' && (
          <div className="absolute left-0 top-full z-40 mt-2 w-60 rounded border border-border-color bg-element-bg px-3 py-3 shadow-lg">
            {grid(options.label, filters.label, 'label')}
          </div>
        )}
      </div>
      {active && (
        <button
          type="button"
          className="ml-auto text-xxs text-text-secondary underline decoration-dotted decoration-1 underline-offset-4"
          onClick={() => onChange({ weight: 'ALL', age: 'ALL', label: 'ALL' })}
        >
          {lt('contest_detail.registrations.filters.clear')}
        </button>
      )}
    </div>
  )
}
