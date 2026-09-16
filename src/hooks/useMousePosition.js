import { useEffect, useRef } from 'react'

export function useMousePosition() {
  const position = useRef({ x: 0, y: 0 })

  useEffect(() => {
    const onMove = (event) => {
      position.current.x = event.clientX
      position.current.y = event.clientY
    }
    window.addEventListener('mousemove', onMove, { passive: true })
    return () => window.removeEventListener('mousemove', onMove)
  }, [])

  return position
}
