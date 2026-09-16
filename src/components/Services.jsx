import { memo, useEffect, useRef, useState } from 'react'
import { ArrowUpRight } from 'lucide-react'
import { motion } from 'framer-motion'
import { services as fallback } from '../data/services.js'
import { fetchServices } from '../utils/api.js'
import { useCursor } from '../context/CursorContext.jsx'
import { useIsCoarsePointer } from '../hooks/useMediaQuery.js'
import ProjectVisual from '../visuals/ProjectVisual.jsx'

const visualIds = ['neon', 'mono', 'arc', 'nova', 'form', 'lumen']

function Services() {
  const [items, setItems] = useState(fallback)
  const [active, setActive] = useState(null)
  const preview = useRef(null)
  const { setCursor, resetCursor } = useCursor()
  const coarse = useIsCoarsePointer()

  useEffect(() => {
    fetchServices().then(setItems)
  }, [])

  useEffect(() => {
    if (coarse || !active) return undefined
    const onMove = (event) => {
      const el = preview.current
      if (!el) return
      el.style.transform = `translate3d(${event.clientX + 28}px, ${event.clientY - 90}px, 0)`
    }
    window.addEventListener('mousemove', onMove, { passive: true })
    return () => window.removeEventListener('mousemove', onMove)
  }, [active, coarse])

  return (
    <section id="services" className="relative border-t border-line py-20 md:py-28">
      <div className="mx-auto max-w-[1600px] px-5 md:px-10">
        <p className="text-[11px] tracking-[0.4em] text-muted">02 — CAPABILITIES</p>
        <h2 className="display mt-4 text-[14vw] md:text-8xl">WHAT WE DO</h2>
      </div>

      <ul className="mt-12">
        {items.map((service, index) => {
          const open = active === service.id
          return (
            <li key={service.id}>
              <button
                type="button"
                className="group w-full border-t border-line text-left last:border-b"
                onMouseEnter={() => {
                  setActive(service.id)
                  setCursor({ active: true, label: '' })
                }}
                onMouseLeave={() => {
                  setActive(null)
                  resetCursor()
                }}
                onFocus={() => setActive(service.id)}
                onBlur={() => setActive(null)}
              >
                <div className="mx-auto flex max-w-[1600px] items-center justify-between gap-6 px-5 py-6 md:px-10 md:py-8">
                  <div className="flex min-w-0 items-baseline gap-6 md:gap-10">
                    <span
                      className={`font-display text-sm text-muted transition-transform duration-500 ${open ? '-translate-y-2 text-accent' : ''}`}
                    >
                      {service.number}
                    </span>
                    <span className="display truncate text-[7vw] md:text-6xl">{service.title}</span>
                  </div>
                  <ArrowUpRight
                    className={`shrink-0 transition-transform duration-500 ${open ? 'rotate-45 text-accent' : ''}`}
                  />
                </div>
                <motion.div
                  initial={false}
                  animate={{ height: open ? 'auto' : 0, opacity: open ? 1 : 0 }}
                  className="overflow-hidden"
                >
                  <div className="mx-auto grid max-w-[1600px] gap-6 px-5 pb-8 md:grid-cols-[1fr_1.2fr] md:px-10">
                    <p className="max-w-xl text-sm leading-relaxed text-muted md:pl-16">{service.description}</p>
                    <div className="flex flex-wrap gap-2 md:justify-end">
                      {service.tags?.map((tag) => (
                        <span key={tag} className="rounded-full border border-line px-3 py-1 text-[11px] tracking-[0.18em] text-muted">
                          {tag}
                        </span>
                      ))}
                    </div>
                  </div>
                </motion.div>
              </button>
              {open && !coarse && (
                <div
                  ref={preview}
                  className="pointer-events-none fixed top-0 left-0 z-40 hidden h-48 w-36 overflow-hidden rounded-sm lg:block"
                >
                  <ProjectVisual id={visualIds[index]} className="h-full w-full" />
                </div>
              )}
            </li>
          )
        })}
      </ul>
    </section>
  )
}

export default memo(Services)
