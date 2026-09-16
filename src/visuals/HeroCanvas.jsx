import { memo, useEffect, useRef } from 'react'
import { useMousePosition } from '../hooks/useMousePosition.js'
import { useIsCoarsePointer, usePrefersReducedMotion } from '../hooks/useMediaQuery.js'

function HeroCanvas() {
  const canvasRef = useRef(null)
  const mouse = useMousePosition()
  const coarse = useIsCoarsePointer()
  const reduced = usePrefersReducedMotion()

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return undefined
    const ctx = canvas.getContext('2d', { alpha: true })
    let frame = 0
    let running = true
    let t = 0

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      canvas.width = canvas.offsetWidth * dpr
      canvas.height = canvas.offsetHeight * dpr
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }
    resize()
    window.addEventListener('resize', resize)

    const orbs = [
      { x: 0.62, y: 0.38, r: 180, hue: 72 },
      { x: 0.78, y: 0.62, r: 140, hue: 190 },
      { x: 0.55, y: 0.7, r: 110, hue: 48 },
    ]

    const draw = () => {
      if (!running) return
      const w = canvas.offsetWidth
      const h = canvas.offsetHeight
      t += reduced ? 0 : 0.006
      ctx.clearRect(0, 0, w, h)

      const mx = coarse ? w * 0.7 : mouse.current.x
      const my = coarse ? h * 0.4 : mouse.current.y
      const nx = (mx / window.innerWidth - 0.5) * 40
      const ny = (my / window.innerHeight - 0.5) * 40

      orbs.forEach((orb, i) => {
        const ox = orb.x * w + Math.sin(t + i) * 28 + nx
        const oy = orb.y * h + Math.cos(t * 0.8 + i) * 22 + ny
        const g = ctx.createRadialGradient(ox, oy, 0, ox, oy, orb.r)
        g.addColorStop(0, `hsla(${orb.hue}, 90%, 62%, 0.28)`)
        g.addColorStop(0.45, `hsla(${orb.hue}, 80%, 50%, 0.08)`)
        g.addColorStop(1, 'transparent')
        ctx.fillStyle = g
        ctx.beginPath()
        ctx.arc(ox, oy, orb.r, 0, Math.PI * 2)
        ctx.fill()
      })

      ctx.strokeStyle = 'rgba(243,239,230,0.08)'
      ctx.lineWidth = 1
      const cols = 16
      const rows = 10
      for (let i = 0; i <= cols; i += 1) {
        ctx.beginPath()
        for (let j = 0; j <= rows; j += 1) {
          const x = (w * i) / cols
          const y = (h * j) / rows
          const dx = x - mx
          const dy = y - my
          const dist = Math.sqrt(dx * dx + dy * dy) || 1
          const force = Math.min(46, 18000 / dist)
          const px = x + (dx / dist) * force * 0.15 + nx * 0.15
          const py = y + (dy / dist) * force * 0.15 + ny * 0.15
          if (j === 0) ctx.moveTo(px, py)
          else ctx.lineTo(px, py)
        }
        ctx.stroke()
      }

      if (!reduced) frame = requestAnimationFrame(draw)
    }

    frame = requestAnimationFrame(draw)
    const io = new IntersectionObserver(([entry]) => {
      running = entry.isIntersecting
      if (running && !reduced) frame = requestAnimationFrame(draw)
    })
    io.observe(canvas)

    return () => {
      running = false
      cancelAnimationFrame(frame)
      window.removeEventListener('resize', resize)
      io.disconnect()
    }
  }, [coarse, mouse, reduced])

  return <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" aria-hidden />
}

export default memo(HeroCanvas)
