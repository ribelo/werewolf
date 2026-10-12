import { useEffect, type ReactNode } from 'react'

const sizes = { md: 'max-w-2xl', lg: 'max-w-4xl', xl: 'max-w-6xl' } as const

/** The 2025 modal: dark backdrop, a card with a title and a close button. */
export function Modal({
  title,
  size = 'lg',
  onClose,
  children,
}: {
  readonly title: string
  readonly size?: keyof typeof sizes
  readonly onClose: () => void
  readonly children: ReactNode
}) {
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [onClose])
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <button
        type="button"
        className="absolute inset-0 bg-black/70 transition-opacity duration-300"
        aria-label="Close modal"
        onClick={onClose}
      />
      <div
        className={
          'relative z-10 w-full ' +
          sizes[size] +
          ' card focus:outline-none max-h-[90vh] overflow-hidden flex flex-col'
        }
      >
        <header className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-h2 text-text-primary">{title}</h2>
          </div>
          <button
            type="button"
            className="btn-secondary px-3 py-1 transition-colors"
            onClick={onClose}
            aria-label="Close modal"
          >
            ✕
          </button>
        </header>
        <div className="flex-1 overflow-y-auto pr-2 min-h-0">{children}</div>
      </div>
    </div>
  )
}
