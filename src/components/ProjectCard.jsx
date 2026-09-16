import { memo, useRef, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import ProjectVisual from '../visuals/ProjectVisual.jsx'
import { useCursor } from '../context/CursorContext.jsx'
import { usePrefersReducedMotion } from '../hooks/useMediaQuery.js'

gsap.registerPlugin(ScrollTrigger)

function ProjectCard({ project, className = '' }) {
  const wrap = useRef(null)
  const media = useRef(null)
  const { setCursor, resetCursor } = useCursor()
  const reduced = usePrefersReducedMotion()
  const [imgOk, setImgOk] = useState(true)

  useEffect(() => {
    if (reduced || !wrap.current) return undefined
    const ctx = gsap.context(() => {
      gsap.fromTo(
        media.current,
        { clipPath: 'inset(100% 0 0 0)', scale: 1.12 },
        {
          clipPath: 'inset(0% 0 0 0)',
          scale: 1,
          duration: 1.3,
          ease: 'power4.out',
          scrollTrigger: { trigger: wrap.current, start: 'top 85%' },
        },
      )
      gsap.to(media.current, {
        yPercent: -8,
        ease: 'none',
        scrollTrigger: { trigger: wrap.current, start: 'top bottom', end: 'bottom top', scrub: true },
      })
    }, wrap)
    return () => ctx.revert()
  }, [reduced])

  return (
    <article ref={wrap} className={`h-full ${className}`}>
      <Link
        to={`/work/${project.id}`}
        className="group block"
        onMouseEnter={() => setCursor({ active: true, label: 'VIEW CASE STUDY' })}
        onMouseLeave={resetCursor}
      >
        <div className="relative overflow-hidden bg-ink-3">
          <div ref={media} className="relative aspect-[4/5] overflow-hidden md:aspect-auto md:h-full">
            <ProjectVisual id={project.id} className="absolute inset-0 h-full w-full" />
            {imgOk && (
              <img
                src={project.image}
                alt={`${project.name} project visual`}
                loading="lazy"
                decoding="async"
                className="absolute inset-0 h-full w-full object-cover opacity-80 mix-blend-luminosity transition-transform duration-700 ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:scale-105"
                onError={() => setImgOk(false)}
              />
            )}
            <div className="absolute inset-0 bg-ink/20" />
          </div>
        </div>
        <div className="mt-4 flex items-end justify-between gap-4">
          <div>
            <h3 className="font-display text-2xl tracking-tight">{project.name}</h3>
            <p className="mt-1 text-[11px] tracking-[0.22em] text-muted uppercase">
              {project.category} — {project.year}
            </p>
          </div>
          <p className="hidden max-w-[18ch] text-right text-xs text-muted md:block">{project.short}</p>
        </div>
      </Link>
    </article>
  )
}

export default memo(ProjectCard)
