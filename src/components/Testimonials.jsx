import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { testimonials as fallback } from '../data/services.js'
import { fetchTestimonials } from '../utils/api.js'

export default function Testimonials() {
  const [items, setItems] = useState(fallback)
  const [index, setIndex] = useState(0)

  useEffect(() => {
    fetchTestimonials().then(setItems)
  }, [])

  useEffect(() => {
    if (items.length < 2) return undefined
    const id = setInterval(() => setIndex((i) => (i + 1) % items.length), 6500)
    return () => clearInterval(id)
  }, [items.length])

  const current = items[index] || items[0]
  if (!current) return null

  return (
    <section className="mx-auto max-w-[1600px] px-5 py-24 md:px-10 md:py-32">
      <p className="text-[11px] tracking-[0.4em] text-muted">06 — VOICES</p>
      <div className="relative mt-10 min-h-[240px] md:min-h-[280px]">
        <AnimatePresence mode="wait">
          <motion.blockquote
            key={current.id}
            initial={{ opacity: 0, y: 20, filter: 'blur(8px)' }}
            animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
            exit={{ opacity: 0, y: -20, filter: 'blur(8px)' }}
            transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
            className="display max-w-[18ch] text-[9vw] md:text-[4.4vw]"
          >
            “{current.quote}”
          </motion.blockquote>
        </AnimatePresence>
      </div>
      <div className="mt-10 flex items-center justify-between gap-6">
        <div>
          <p className="font-medium">{current.name}</p>
          <p className="text-sm text-muted">
            {current.role}, {current.company}
          </p>
        </div>
        <div className="flex gap-2" role="tablist" aria-label="Testimonials">
          {items.map((item, i) => (
            <button
              key={item.id}
              type="button"
              aria-label={`Show testimonial ${i + 1}`}
              className={`h-2 w-8 rounded-full ${i === index ? 'bg-accent' : 'bg-line'}`}
              onClick={() => setIndex(i)}
            />
          ))}
        </div>
      </div>
    </section>
  )
}
