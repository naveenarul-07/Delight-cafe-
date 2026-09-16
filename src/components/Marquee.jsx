import { memo, useEffect, useRef, useState } from 'react'

const items = [
  'BRANDING',
  'DIGITAL EXPERIENCES',
  'CREATIVE DEVELOPMENT',
  'MOTION',
  'STRATEGY',
  'IDENTITY',
]

function Marquee() {
  const ref = useRef(null)
  const last = useRef(0)
  const [paused, setPaused] = useState(false)

  useEffect(() => {
    const el = ref.current
    if (!el) return undefined
    const onScroll = () => {
      const y = window.scrollY
      const delta = Math.min(1.8, 1 + Math.abs(y - last.current) / 80)
      last.current = y
      el.style.setProperty('--marquee-duration', `${28 / delta}s`)
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  const row = [...items, ...items]

  return (
    <section
      aria-hidden
      className="relative overflow-hidden border-y border-line bg-ink py-6 md:py-8"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      <div
        ref={ref}
        className={`marquee-track flex w-max gap-10 whitespace-nowrap px-4 font-display text-[10vw] leading-none tracking-[-0.05em] text-paper/90 md:text-7xl ${paused ? 'is-paused scale-[1.03]' : ''} transition-transform duration-500`}
        style={{ '--marquee-duration': '28s' }}
      >
        {row.map((item, i) => (
          <span key={`${item}-${i}`} className="flex items-center gap-10">
            {item}
            <span className="text-accent">—</span>
          </span>
        ))}
        {row.map((item, i) => (
          <span key={`b-${item}-${i}`} className="flex items-center gap-10">
            {item}
            <span className="text-accent">—</span>
          </span>
        ))}
      </div>
    </section>
  )
}

export default memo(Marquee)
