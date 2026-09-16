import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useLoader } from '../context/LoaderContext.jsx'
import { usePrefersReducedMotion } from '../hooks/useMediaQuery.js'

export default function Loader() {
  const { loaded, setLoaded } = useLoader()
  const reduced = usePrefersReducedMotion()
  const [progress, setProgress] = useState(0)

  useEffect(() => {
    if (reduced) {
      setProgress(100)
      const t = setTimeout(() => setLoaded(true), 80)
      return () => clearTimeout(t)
    }

    const start = performance.now()
    const duration = 1400
    let frame = 0
    const tick = (now) => {
      const t = Math.min(1, (now - start) / duration)
      const eased = 1 - (1 - t) ** 3
      setProgress(Math.round(eased * 100))
      if (t < 1) frame = requestAnimationFrame(tick)
      else setTimeout(() => setLoaded(true), 220)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [reduced, setLoaded])

  return (
    <AnimatePresence>
      {!loaded && (
        <motion.div
          className="fixed inset-0 z-[90] flex flex-col items-center justify-center bg-ink text-paper"
          exit={{ y: '-100%' }}
          transition={{ duration: 0.9, ease: [0.76, 0, 0.24, 1] }}
          role="status"
          aria-live="polite"
          aria-label="Loading Creative Studio"
        >
          <p className="font-display text-[11px] tracking-[0.55em] text-muted">CREATIVE STUDIO</p>
          <p className="mt-8 font-display text-[18vw] leading-none tracking-[-0.06em] md:text-[8rem]">
            {String(progress).padStart(3, '0')}
            <span className="text-accent">%</span>
          </p>
          <div className="mt-10 h-px w-48 overflow-hidden bg-line">
            <motion.div
              className="h-full bg-accent"
              style={{ width: `${progress}%` }}
            />
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
