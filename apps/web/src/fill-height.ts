import { useLayoutEffect, useRef } from 'react'

/**
 * A scroll box that ends at the bottom of the window, wherever it starts, so the table scrolls
 * and the page itself does not. It follows window resizes and changes of the content above it.
 */
export function useFillHeight<T extends HTMLElement>(gap = 12) {
  const ref = useRef<T>(null)
  useLayoutEffect(() => {
    const element = ref.current
    if (!element) return
    const fit = () => {
      const top = element.getBoundingClientRect().top + window.scrollY
      const height = Math.max(200, window.innerHeight - top - gap)
      element.style.maxHeight = height + 'px'
      // Padding and margins below the box still count; take whatever still overflows off too.
      const overflow = document.documentElement.scrollHeight - window.innerHeight
      if (overflow > 0) element.style.maxHeight = Math.max(200, height - overflow) + 'px'
    }
    fit()
    window.addEventListener('resize', fit)
    // Old browsers and test environments have no ResizeObserver; resize alone still works.
    const observers = typeof ResizeObserver === 'function' ? [new ResizeObserver(fit)] : []
    for (const observer of observers) observer.observe(document.body)
    return () => {
      window.removeEventListener('resize', fit)
      for (const observer of observers) observer.disconnect()
    }
  }, [gap])
  return ref
}