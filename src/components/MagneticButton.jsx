import { useCallback, useRef } from 'react'
import { useCursor } from '../context/CursorContext.jsx'
import { useIsCoarsePointer, usePrefersReducedMotion } from '../hooks/useMediaQuery.js'

export default function MagneticButton({
  as: Tag = 'button',
  className = '',
  children,
  strength = 0.35,
  cursorLabel = '',
  ...props
}) {
  const ref = useRef(null)
  const { setCursor, resetCursor } = useCursor()
  const coarse = useIsCoarsePointer()
  const reduced = usePrefersReducedMotion()

  const reset = useCallback(() => {
    const el = ref.current
    if (el) el.style.transform = 'translate3d(0,0,0)'
    resetCursor()
  }, [resetCursor])

  const onMove = (event) => {
    if (coarse || reduced) return
    const el = ref.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    const x = event.clientX - rect.left - rect.width / 2
    const y = event.clientY - rect.top - rect.height / 2
    el.style.transform = `translate3d(${x * strength}px, ${y * strength}px, 0)`
    props.onMouseMove?.(event)
  }

  return (
    <Tag
      {...props}
      ref={ref}
      className={`inline-flex items-center justify-center will-change-transform transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] ${className}`}
      onMouseMove={onMove}
      onMouseEnter={(event) => {
        setCursor({ active: true, magnetic: true, label: cursorLabel })
        props.onMouseEnter?.(event)
      }}
      onMouseLeave={(event) => {
        reset()
        props.onMouseLeave?.(event)
      }}
    >
      {children}
    </Tag>
  )
}
