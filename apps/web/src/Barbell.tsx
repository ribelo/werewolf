import type { PlateStack } from '@werewolf/core'
import { useMessages } from './i18n.ts'

/** Plate colours follow the international plate colour code. */
const colours: Readonly<Record<number, string>> = {
  25: '#dc2626',
  20: '#1d0fb5',
  15: '#eab308',
  10: '#16a34a',
  5: '#f8fafc',
  2.5: '#d1d5db',
  1.25: '#9ca3af',
}
const heaviest = 25
/** Plates for one side, heaviest next to the collar; wider and taller for heavier plates, as on the 2025 stage screen. */
export function Barbell({ plates }: { readonly plates: ReadonlyArray<PlateStack> }) {
  const { t } = useMessages()
  const flat = plates.flatMap((stack) => Array.from({ length: stack.count }, () => stack.weight))
  return (
    <div
      role="img"
      aria-label={t('a11y.barbell')}
      data-plates={flat.join(',')}
      className="flex h-32 items-center justify-start overflow-hidden"
    >
      {flat.map((weight, index) => (
        <div
          // The plate list is a plan, not data with identity.
          key={index}
          className="plate shrink-0 border-4 border-white/90"
          data-weight={weight}
          style={{
            backgroundColor: colours[weight] ?? '#6b7280',
            width: 6 + Math.min(1, weight / heaviest) * 22,
            height: (0.25 + Math.sqrt(Math.min(1, weight / heaviest)) * 0.75) * 100 + '%',
          }}
        />
      ))}
    </div>
  )
}
