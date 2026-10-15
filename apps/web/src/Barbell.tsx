import type { PlateStack } from '@werewolf/core'
import { useMessages } from './i18n.ts'

/** Default plate colours follow the international colour code; the rulebook may set its own. */
const colours: Readonly<Record<number, string>> = {
  25: '#dc2626',
  20: '#1d0fb5',
  15: '#eab308',
  10: '#16a34a',
  5: '#f8fafc',
  2.5: '#000000',
  1.25: '#6b6b6b',
}
const BORDER_PX = 2
/** The thinnest plate keeps at least this much colour between its white borders. */
const MIN_FILL_PX = 12

/**
 * Plates for one side, heaviest next to the collar, as on the 2025 stage screen: wider and taller for
 * heavier plates. Unlike 2025 the border is thin and every plate keeps a visible band of its colour.
 */
export function Barbell({
  plates,
  colors = {},
  heightPx = 200,
  maxWidthPx = 40,
  animated = false,
  showBar = false,
  minFillPx = MIN_FILL_PX,
}: {
  readonly plates: ReadonlyArray<PlateStack>
  readonly colors?: Readonly<Record<number, string>>
  readonly heightPx?: number
  readonly maxWidthPx?: number
  /** Plates slide onto the bar one after another when the component mounts. */
  readonly animated?: boolean
  /** Draws the bar, the collar and the sleeve end around the plates. */
  readonly showBar?: boolean
  /** Colour band of the thinnest plate; screens far from the loaders use a wider one. */
  readonly minFillPx?: number
}) {
  const { t } = useMessages()
  const flat = plates.flatMap((stack) => Array.from({ length: stack.count }, () => stack.weight))
  const heaviest = Math.max(25, ...flat)
  const minWidth = minFillPx + 2 * BORDER_PX
  return (
    <div
      role="img"
      aria-label={t('a11y.barbell')}
      data-plates={flat.join(',')}
      className="flex items-center justify-center overflow-hidden"
      style={{ height: heightPx }}
    >
      {showBar && (
        <>
          <div className="h-[7%] w-24 shrink-0 bg-gradient-to-b from-zinc-300 to-zinc-500" />
          <div className="h-[22%] w-3 shrink-0 rounded-sm bg-gradient-to-b from-zinc-200 to-zinc-500" />
        </>
      )}
      {flat.map((weight, index) => {
        const ratio = Math.min(1, weight / heaviest)
        return (
          <div
            // The plate list is a plan, not data with identity.
            key={index}
            className={'plate shrink-0 border-white/90' + (animated ? ' animate-plate' : '')}
            data-weight={weight}
            style={{
              ...(animated ? { animationDelay: index * 55 + 'ms' } : {}),
              borderWidth: BORDER_PX,
              backgroundColor: colors[weight] ?? colours[weight] ?? '#374151',
              width: minWidth + ratio * (maxWidthPx - minWidth),
              height: (0.25 + Math.sqrt(ratio) * 0.75) * 100 + '%',
            }}
          />
        )
      })}
      {showBar && (
        <div className="h-[11%] w-16 shrink-0 rounded-r-sm bg-gradient-to-b from-zinc-300 to-zinc-600" />
      )}
    </div>
  )
}
