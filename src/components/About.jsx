import { useEffect, useRef } from 'react'
import { motion, useInView } from 'framer-motion'
import gsap from 'gsap'
import { team } from '../data/services.js'
import ProjectVisual from '../visuals/ProjectVisual.jsx'

const stats = [
  { value: 12, suffix: '+', label: 'YEARS' },
  { value: 80, suffix: '+', label: 'PROJECTS' },
  { value: 25, suffix: '+', label: 'CLIENTS' },
  { value: 14, suffix: '', label: 'COUNTRIES' },
]

function Counter({ value, suffix }) {
  const ref = useRef(null)
  const inView = useInView(ref, { once: true, amount: 0.6 })

  useEffect(() => {
    if (!inView || !ref.current) return undefined
    const obj = { n: 0 }
    const tween = gsap.to(obj, {
      n: value,
      duration: 1.6,
      ease: 'power3.out',
      onUpdate: () => {
        ref.current.textContent = `${Math.round(obj.n)}${suffix}`
      },
    })
    return () => tween.kill()
  }, [inView, suffix, value])

  return (
    <span ref={ref} className="font-display text-5xl tracking-tight md:text-6xl">
      0{suffix}
    </span>
  )
}

export default function About() {
  return (
    <section id="studio" className="relative overflow-hidden border-t border-line py-24 md:py-32">
      <div className="pointer-events-none absolute -right-20 top-20 h-64 w-64 rounded-full bg-accent/10 blur-3xl" />
      <div className="mx-auto grid max-w-[1600px] gap-16 px-5 md:grid-cols-[1.1fr_0.9fr] md:px-10">
        <div>
          <p className="text-[11px] tracking-[0.4em] text-muted">04 — STUDIO</p>
          <h2 className="display mt-6 max-w-[14ch] text-[11vw] md:text-[4.6vw]">
            WE ARE A SMALL STUDIO WITH A BIG DIGITAL MINDSET.
          </h2>
          <p className="mt-8 max-w-xl text-sm leading-relaxed text-muted md:text-base">
            Independent since 2014. We partner with ambitious brands to make identities, products and
            digital worlds that feel alive. Less noise, more signal. Less templates, more authorship.
          </p>
          <div className="mt-12 grid grid-cols-2 gap-8 md:grid-cols-4">
            {stats.map((stat) => (
              <div key={stat.label}>
                <Counter value={stat.value} suffix={stat.suffix} />
                <p className="mt-2 text-[11px] tracking-[0.22em] text-muted">{stat.label}</p>
              </div>
            ))}
          </div>
        </div>
        <div className="relative min-h-[360px]">
          <motion.div
            className="absolute inset-0 overflow-hidden"
            animate={{ y: [0, -12, 0] }}
            transition={{ duration: 8, repeat: Infinity, ease: 'easeInOut' }}
          >
            <ProjectVisual id="lumen" className="h-full w-full" />
            <img
              src="https://images.unsplash.com/photo-1521737604893-d14cc237f11d?auto=format&fit=crop&w=1400&q=80"
              alt="Studio collaborators around a table"
              className="absolute inset-0 h-full w-full object-cover opacity-70 mix-blend-luminosity"
              loading="lazy"
            />
          </motion.div>
        </div>
      </div>

      <div className="mx-auto mt-24 grid max-w-[1600px] gap-10 px-5 md:grid-cols-3 md:px-10">
        <div>
          <h3 className="text-[11px] tracking-[0.3em] text-accent">PHILOSOPHY</h3>
          <p className="mt-4 text-sm leading-relaxed text-muted">
            Taste is a process. We believe the most memorable digital work comes from reduction, rhythm
            and a stubborn attention to how something feels in the body — not just how it looks in a deck.
          </p>
        </div>
        <div>
          <h3 className="text-[11px] tracking-[0.3em] text-accent">CAPABILITIES</h3>
          <p className="mt-4 text-sm leading-relaxed text-muted">
            Strategy, identity, art direction, product design, motion, and full-stack web. We stay small
            so the people in the room are the people making the work.
          </p>
        </div>
        <div>
          <h3 className="text-[11px] tracking-[0.3em] text-accent">TEAM</h3>
          <ul className="mt-4 space-y-3">
            {team.map((person) => (
              <li key={person.name} className="flex justify-between gap-4 text-sm">
                <span>{person.name}</span>
                <span className="text-muted">{person.role}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  )
}
