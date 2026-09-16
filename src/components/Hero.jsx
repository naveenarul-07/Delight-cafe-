import { useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight } from 'lucide-react'
import { motion } from 'framer-motion'
import HeroCanvas from '../visuals/HeroCanvas.jsx'
import MagneticButton from './MagneticButton.jsx'
import { useLoader } from '../context/LoaderContext.jsx'

const lines = ['WE CREATE', 'DIGITAL EXPERIENCES', 'THAT MOVE PEOPLE.']

export default function Hero() {
  const { loaded } = useLoader()
  const visual = useRef(null)

  useEffect(() => {
    if (!loaded) return undefined
    const el = visual.current
    if (!el) return undefined
    el.style.opacity = '1'
    return undefined
  }, [loaded])

  return (
    <section className="relative isolate min-h-[100svh] overflow-hidden bg-ink">
      <div ref={visual} className="pointer-events-none absolute inset-0 opacity-70 transition-opacity duration-1000">
        <HeroCanvas />
        <div className="absolute inset-0 bg-gradient-to-b from-ink/10 via-transparent to-ink" />
      </div>

      <div className="relative z-10 mx-auto flex min-h-[100svh] max-w-[1600px] flex-col justify-end px-5 pb-16 pt-32 md:px-10 md:pb-20">
        <p className="text-[11px] tracking-[0.42em] text-muted">CREATIVE DIGITAL STUDIO</p>

        <h1 className="display mt-6 max-w-[18ch] text-[12vw] md:text-[7.4vw]">
          {lines.map((line, i) => (
            <span key={line} className="block overflow-hidden">
              <motion.span
                className="block"
                initial={{ y: '110%', rotate: 6 }}
                animate={loaded ? { y: '0%', rotate: 0 } : {}}
                transition={{ duration: 1.05, delay: 0.18 + i * 0.12, ease: [0.22, 1, 0.36, 1] }}
              >
                {line}
              </motion.span>
            </span>
          ))}
        </h1>

        <motion.p
          className="mt-8 max-w-md text-sm leading-relaxed text-muted md:text-base"
          initial={{ y: 24, opacity: 0 }}
          animate={loaded ? { y: 0, opacity: 1 } : {}}
          transition={{ delay: 0.7, duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
        >
          Branding, digital products and cinematic web experiences for companies who want to feel inevitable.
        </motion.p>

        <motion.div
          className="mt-10 flex flex-wrap items-center gap-4"
          initial={{ y: 24, opacity: 0 }}
          animate={loaded ? { y: 0, opacity: 1 } : {}}
          transition={{ delay: 0.9, duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
        >
          <MagneticButton
            as={Link}
            to="/work"
            className="group rounded-full bg-accent px-7 py-4 text-[12px] font-semibold tracking-[0.22em] text-ink"
          >
            EXPLORE OUR WORK
            <ArrowRight className="ml-3 h-4 w-4 transition-transform duration-300 group-hover:translate-x-1" />
          </MagneticButton>
          <MagneticButton
            as={Link}
            to="/contact"
            className="rounded-full border border-paper/20 px-7 py-4 text-[12px] tracking-[0.22em] text-paper"
          >
            LET&apos;S TALK
          </MagneticButton>
        </motion.div>
      </div>
    </section>
  )
}
