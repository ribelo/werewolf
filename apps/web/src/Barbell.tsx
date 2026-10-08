import type { PlateStack } from '@werewolf/core'

const colours: Readonly<Record<number, string>> = {
  25: '#c8102e',
  20: '#1d4ed8',
  15: '#eab308',
  10: '#15803d',
  5: '#f8fafc',
  2.5: '#111827',
  1.25: '#9ca3af',
}
/** One plate rectangle per plate on one side, heaviest next to the collar. Both sides are mirrored. */
export function Barbell({ plates }: { readonly plates: ReadonlyArray<PlateStack> }) {
  const flat = plates.flatMap((stack) => Array.from({ length: stack.count }, () => stack.weight))
  const height = (weight: number) => Math.max(40, Math.min(180, 40 + weight * 5.6))
  return (
    <svg
      role="img"
      aria-label="barbell"
      data-plates={flat.join(',')}
      viewBox="0 0 640 200"
      className="barbell"
    >
      <rect x="20" y="95" width="600" height="10" fill="#9ca3af" />
      {[1, -1].map((side) =>
        flat.map((weight, index) => (
          <rect
            key={side + '/' + index}
            className="plate"
            data-weight={weight}
            x={side === 1 ? 330 + index * 22 : 310 - index * 22 - 18}
            y={100 - height(weight) / 2}
            width="18"
            height={height(weight)}
            rx="3"
            fill={colours[weight] ?? '#6b7280'}
            stroke="#111827"
          />
        )),
      )}
    </svg>
  )
}
