import { useEffect, useRef } from 'react'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { processSteps } from '../data/services.js'
import { useMediaQuery, usePrefersReducedMotion } from '../hooks/useMediaQuery.js'

gsap.registerPlugin(ScrollTrigger)

export default function Process() {
  const pin = useRef(null)
  const track = useRef(null)
  const bar = useRef(null)
  const isDesktop = useMediaQuery('(min-width: 1024px)')
  const reduced = usePrefersReducedMotion()

  useEffect(() => {
    if (!isDesktop || reduced || !pin.current) return undefined
    const ctx = gsap.context(() => {
      const distance = () => track.current.scrollWidth - window.innerWidth
      gsap.to(track.current, {
        x: () => -distance(),
        ease: 'none',
        scrollTrigger: {
          trigger: pin.current,
          pin: true,
          scrub: 1,
          start: 'top top',
          end: () => `+=${distance()}`,
          anticipatePin: 1,
          onUpdate: (self) => {
            if (bar.current) bar.current.style.transform = `scaleX(${self.progress})`
          },
        },
      })
    }, pin)
    return () => ctx.revert()
  }, [isDesktop, reduced])

  return (
    <section ref={pin} className="relative border-t border-line bg-ink-2">
      <div className="mx-auto flex max-w-[1600px] items-end justify-between px-5 pt-16 md:px-10">
        <div>
          <p className="text-[11px] tracking-[0.4em] text-muted">05 — METHOD</p>
          <h2 className="display mt-4 text-[12vw] md:text-7xl">HOW WE WORK</h2>
        </div>
        <div className="mb-3 hidden h-px w-40 origin-left bg-line lg:block">
          <div ref={bar} className="h-px origin-left scale-x-0 bg-accent" />
        </div>
      </div>
      <div
        ref={track}
        className="flex flex-col gap-6 px-5 py-16 md:px-10 lg:w-max lg:flex-row lg:gap-10"
      >
        {processSteps.map((step) => (
          <article
            key={step.number}
            className="w-full border border-line p-8 lg:h-[52vh] lg:w-[420px] lg:shrink-0"
          >
            <p className="font-display text-accent">{step.number}</p>
            <h3 className="display mt-8 text-5xl">{step.title}</h3>
            <p className="mt-8 max-w-sm text-sm leading-relaxed text-muted">{step.copy}</p>
          </article>
        ))}
      </div>
    </section>
  )
}
