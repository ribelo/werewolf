import { Rulebook, type ContestState } from '@werewolf/core'
import * as Result from 'effect/Result'
import * as Schema from 'effect/Schema'
import { useEffect, useState } from 'react'
import { useLegacy } from './legacy-i18n.ts'

export const DEFAULT_PLATE_COLOR = '#374151'
type Book = typeof Rulebook.Encoded

/** The 2025 bar, clamp and plate editor. Changes are saved as new contest settings. */
export function PlatesPanel({
  state,
  submit,
  editor,
}: {
  readonly state: ContestState
  readonly submit: (input: object) => void
  readonly editor: boolean
}) {
  const { lt } = useLegacy()
  const barbell = state.rulebook.barbell
  const [men, setMen] = useState(String(barbell.bars.male))
  const [women, setWomen] = useState(String(barbell.bars.female))
  const [clamp, setClamp] = useState(String(barbell.clampsPerSide))
  const [newWeight, setNewWeight] = useState('')
  const [newQuantity, setNewQuantity] = useState('')
  const [newColor, setNewColor] = useState('')
  const [error, setError] = useState('')
  useEffect(() => {
    setMen(String(barbell.bars.male))
    setWomen(String(barbell.bars.female))
    setClamp(String(barbell.clampsPerSide))
  }, [barbell])
  function save(change: (book: Book) => Book) {
    const encoded = Schema.encodeSync(Rulebook)(state.rulebook)
    const next = Schema.decodeUnknownResult(Rulebook)(change(encoded))
    if (Result.isFailure(next)) {
      setError(lt('v2.settings.failed'))
      return
    }
    setError('')
    submit({ _tag: 'SetRulebook', rulebook: Schema.encodeSync(Rulebook)(next.success) })
  }
  const plates = barbell.plates.toSorted((a, b) => b.weight - a.weight)
  const display = (value: number) => String(value)
  const withPlates = (
    book: Book,
    update: (plates: Book['barbell']['plates']) => Book['barbell']['plates'],
  ) => ({
    ...book,
    barbell: { ...book.barbell, plates: update(book.barbell.plates) },
  })
  return (
    <section className="space-y-4">
      <div className="card space-y-4">
        <header className="space-y-3">
          <div>
            <h3 className="text-h3 text-text-primary">{lt('contest_detail.plates.title')}</h3>
            <p className="text-body text-text-secondary">{lt('contest_detail.plates.subtitle')}</p>
          </div>
          <div className="grid gap-2 md:grid-cols-2 text-caption text-text-secondary uppercase tracking-[0.35em]">
            <span>
              {lt('contest_detail.plates.bar_weight_men', { weight: barbell.bars.male + ' kg' })}
            </span>
            <span>
              {lt('contest_detail.plates.bar_weight_women', {
                weight: barbell.bars.female + ' kg',
              })}
            </span>
          </div>
        </header>
        <div className="space-y-4">
          <div className="grid gap-4 md:grid-cols-3">
            <div>
              <label className="input-label" htmlFor="mens-bar-weight-setting">
                {lt('contest_detail.plates.bar_weight_men', { weight: '' })}
              </label>
              <input
                id="mens-bar-weight-setting"
                className="input-field"
                type="number"
                step="0.25"
                value={men}
                disabled={!editor}
                onChange={(e) => setMen(e.target.value)}
              />
            </div>
            <div>
              <label className="input-label" htmlFor="womens-bar-weight-setting">
                {lt('contest_detail.plates.bar_weight_women', { weight: '' })}
              </label>
              <input
                id="womens-bar-weight-setting"
                className="input-field"
                type="number"
                step="0.25"
                value={women}
                disabled={!editor}
                onChange={(e) => setWomen(e.target.value)}
              />
            </div>
            <div>
              <label className="input-label" htmlFor="clamp-weight-setting">
                {lt('contest_detail.plates.clamp_weight_label')}
              </label>
              <input
                id="clamp-weight-setting"
                className="input-field"
                type="number"
                step="0.25"
                value={clamp}
                disabled={!editor}
                onChange={(e) => setClamp(e.target.value)}
              />
              <p className="text-caption text-text-secondary mt-1">
                {lt('contest_detail.plates.clamp_weight_hint')}
              </p>
            </div>
            {editor && (
              <div className="md:col-span-3">
                <button
                  type="button"
                  className="btn-primary px-3 py-1 text-xxs"
                  onClick={() =>
                    save((book) => ({
                      ...book,
                      barbell: {
                        ...book.barbell,
                        bars: { male: Number(men), female: Number(women) },
                        clampsPerSide: Number(clamp),
                      },
                    }))
                  }
                >
                  {lt('buttons.save')}
                </button>
              </div>
            )}
          </div>
          {error && <p role="alert">{error}</p>}
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm text-text-secondary">
              <thead className="bg-element-bg text-label">
                <tr>
                  <th className="px-4 py-3">{lt('contest_detail.plates.columns.weight')}</th>
                  <th className="px-4 py-3">{lt('contest_detail.plates.columns.quantity')}</th>
                  <th className="px-4 py-3">{lt('contest_detail.plates.columns.color')}</th>
                  <th className="px-4 py-3 text-right">{lt('contest_table.columns.actions')}</th>
                </tr>
              </thead>
              <tbody>
                {plates.length === 0 && (
                  <tr>
                    <td className="px-4 py-3 text-text-secondary" colSpan={4}>
                      {lt('contest_detail.plates.empty')}
                    </td>
                  </tr>
                )}
                {plates.map((plate) => {
                  const replace = (patch: object) =>
                    save((book) =>
                      withPlates(book, (list) =>
                        list.map((item) =>
                          item.weight === plate.weight ? { ...item, ...patch } : item,
                        ),
                      ),
                    )
                  const color = plate.color ?? DEFAULT_PLATE_COLOR
                  return (
                    <tr key={plate.weight} className="border-b border-border-color last:border-b-0">
                      <td className="px-4 py-3">
                        <input
                          className="input-field w-28"
                          type="number"
                          min="0.25"
                          step="0.25"
                          defaultValue={display(plate.weight)}
                          disabled={!editor}
                          onBlur={(e) =>
                            Number(e.target.value) !== plate.weight &&
                            replace({ weight: Number(e.target.value) })
                          }
                        />
                      </td>
                      <td className="px-4 py-3">
                        {/* As in 2025, the quantity is the number of pairs (one plate per side). */}
                        <input
                          className="input-field w-24"
                          type="number"
                          min="0"
                          step="1"
                          defaultValue={plate.pairs}
                          disabled={!editor}
                          onBlur={(e) =>
                            Number(e.target.value) !== plate.pairs &&
                            replace({ pairs: Math.floor(Number(e.target.value)) })
                          }
                        />
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <input
                            className="h-10 w-10 cursor-pointer rounded border border-border-color bg-transparent p-0"
                            type="color"
                            value={color}
                            disabled={!editor}
                            aria-label={lt('contest_detail.plates.columns.color')}
                            onChange={(e) => replace({ color: e.target.value })}
                          />
                          <input
                            key={color}
                            className="input-field w-32 font-mono"
                            type="text"
                            defaultValue={color}
                            placeholder={DEFAULT_PLATE_COLOR}
                            disabled={!editor}
                            onBlur={(e) =>
                              e.target.value !== color && replace({ color: e.target.value })
                            }
                          />
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right">
                        {editor && (
                          <button
                            type="button"
                            className="btn-secondary px-3 py-1 text-xxs"
                            onClick={() =>
                              save((book) =>
                                withPlates(book, (list) =>
                                  list.filter((item) => item.weight !== plate.weight),
                                ),
                              )
                            }
                          >
                            {lt('buttons.delete')}
                          </button>
                        )}
                      </td>
                    </tr>
                  )
                })}
                {editor && (
                  <tr>
                    <td className="px-4 py-3">
                      <input
                        className="input-field w-28"
                        type="number"
                        step="0.25"
                        placeholder="np. 25"
                        value={newWeight}
                        onChange={(e) => setNewWeight(e.target.value)}
                      />
                    </td>
                    <td className="px-4 py-3">
                      <input
                        className="input-field w-24"
                        type="number"
                        min="0"
                        step="1"
                        placeholder="0"
                        value={newQuantity}
                        onChange={(e) => setNewQuantity(e.target.value)}
                      />
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <input
                          className="h-10 w-10 cursor-pointer rounded border border-border-color bg-transparent p-0"
                          type="color"
                          value={newColor || DEFAULT_PLATE_COLOR}
                          aria-label={lt('contest_detail.plates.columns.color')}
                          onChange={(e) => setNewColor(e.target.value)}
                        />
                        <input
                          className="input-field w-36 font-mono"
                          type="text"
                          placeholder={DEFAULT_PLATE_COLOR}
                          value={newColor}
                          onChange={(e) => setNewColor(e.target.value)}
                        />
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        type="button"
                        className="btn-primary px-3 py-1 text-xxs"
                        onClick={() => {
                          const weight = Number(newWeight)
                          if (!(weight > 0)) return
                          save((book) =>
                            withPlates(book, (list) => [
                              ...list.filter((item) => item.weight !== weight),
                              {
                                weight,
                                pairs: Math.floor(Number(newQuantity || 0)),
                                ...(newColor ? { color: newColor } : {}),
                              },
                            ]),
                          )
                          setNewWeight('')
                          setNewQuantity('')
                          setNewColor('')
                        }}
                      >
                        {lt('buttons.add')}
                      </button>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </section>
  )
}
