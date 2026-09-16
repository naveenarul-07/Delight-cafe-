import { useEffect, useRef } from 'react'
import { useCursor } from '../context/CursorContext.jsx'
import { useIsCoarsePointer, usePrefersReducedMotion } from '../hooks/useMediaQuery.js'

export default function CustomCursor() {
  const dot = useRef(null)
  const ring = useRef(null)
  const mouse = useRef({ x: 0, y: 0 })
  const pos = useRef({ x: 0, y: 0 })
  const { cursor } = useCursor()
  const coarse = useIsCoarsePointer()
  const reduced = usePrefersReducedMotion()
  const enabled = !coarse && !reduced

  useEffect(() => {
    if (!enabled) {
      document.body.classList.remove('custom-cursor')
      return undefined
    }
    document.body.classList.add('custom-cursor')
    const onMove = (event) => {
      mouse.current.x = event.clientX
      mouse.current.y = event.clientY
    }
    window.addEventListener('mousemove', onMove, { passive: true })

    let frame = 0
    const tick = () => {
      pos.current.x += (mouse.current.x - pos.current.x) * 0.18
      pos.current.y += (mouse.current.y - pos.current.y) * 0.18
      if (dot.current) {
        dot.current.style.transform = `translate3d(${mouse.current.x}px, ${mouse.current.y}px, 0)`
      }
      if (ring.current) {
        ring.current.style.transform = `translate3d(${pos.current.x}px, ${pos.current.y}px, 0)`
      }
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener('mousemove', onMove)
      document.body.classList.remove('custom-cursor')
    }
  }, [enabled])

  if (!enabled) return null

  const expanded = cursor.active || Boolean(cursor.label)
  const labeled = Boolean(cursor.label)

  return (
    <div className="pointer-events-none fixed inset-0 z-[80] hidden lg:block" aria-hidden>
      <div
        ref={dot}
        className="absolute top-0 left-0 h-1.5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent mix-blend-difference"
      />
      <div
        ref={ring}
        className={`absolute top-0 left-0 -translate-x-1/2 -translate-y-1/2 rounded-full border border-paper/70 mix-blend-difference transition-[width,height,background,border-color] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] ${
          labeled
            ? 'flex h-28 w-28 items-center justify-center border-accent bg-accent text-center text-[11px] font-semibold tracking-[0.18em] text-ink mix-blend-normal'
            : expanded
              ? 'h-16 w-16 border-accent'
              : 'h-8 w-8'
        }`}
      >
        {labeled ? <span className="max-w-[6.5rem] leading-tight">{cursor.label}</span> : null}
      </div>
    </div>
  )
}
