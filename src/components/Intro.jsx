import { useEffect, useRef } from 'react'
import { motion } from 'framer-motion'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { usePrefersReducedMotion } from '../hooks/useMediaQuery.js'

gsap.registerPlugin(ScrollTrigger)

const words = [
  { t: 'WE', accent: false },
  { t: 'BUILD', accent: true },
  { t: 'IDENTITIES,', accent: false },
  { t: 'PRODUCTS', accent: true },
  { t: 'AND', accent: false },
  { t: 'DIGITAL', accent: false },
  { t: 'EXPERIENCES', accent: true },
  { t: 'FOR', accent: false },
  { t: 'BRANDS', accent: false },
  { t: 'THAT', accent: false },
  { t: 'WANT', accent: false },
  { t: 'TO', accent: false },
  { t: 'MOVE', accent: true },
  { t: 'FORWARD.', accent: false },
]

export default function Intro() {
  const ref = useRef(null)
  const reduced = usePrefersReducedMotion()

  useEffect(() => {
    if (reduced) return undefined
    const ctx = gsap.context(() => {
      gsap.to(ref.current, {
        y: -40,
        ease: 'none',
        scrollTrigger: { trigger: ref.current, start: 'top bottom', end: 'bottom top', scrub: true },
      })
    }, ref)
    return () => ctx.revert()
  }, [reduced])

  return (
    <section ref={ref} className="relative mx-auto max-w-[1600px] px-5 py-28 md:px-10 md:py-40">
      <p className="text-[11px] tracking-[0.4em] text-muted">01 — WHO WE ARE</p>
      <h2 className="display mt-8 max-w-[18ch] text-[11vw] md:text-[5.6vw]">
        {words.map((word, i) => (
          <span key={`${word.t}-${i}`} className="inline-block overflow-hidden align-top">
            <motion.span
              className={`inline-block pr-[0.28em] ${word.accent ? 'text-accent' : ''}`}
              initial={{ y: '110%', opacity: 0 }}
              whileInView={{ y: '0%', opacity: 1 }}
              viewport={{ once: true, amount: 0.6 }}
              transition={{ duration: 0.8, delay: i * 0.03, ease: [0.22, 1, 0.36, 1] }}
            >
              {word.t}
            </motion.span>
          </span>
        ))}
      </h2>
    </section>
  )
}
