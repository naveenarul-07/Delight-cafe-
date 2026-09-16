import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowRight } from 'lucide-react'
import PageTransition from '../components/PageTransition.jsx'
import ProjectVisual from '../visuals/ProjectVisual.jsx'
import MagneticButton from '../components/MagneticButton.jsx'
import { fetchProject } from '../utils/api.js'
import { getNextProject } from '../data/projects.js'
import { useCursor } from '../context/CursorContext.jsx'

export default function ProjectPage() {
  const { id } = useParams()
  const [project, setProject] = useState(null)
  const [status, setStatus] = useState('loading')
  const { setCursor, resetCursor } = useCursor()

  useEffect(() => {
    let live = true
    setStatus('loading')
    fetchProject(id).then((data) => {
      if (!live) return
      setProject(data)
      setStatus(data ? 'ready' : 'empty')
    })
    return () => {
      live = false
    }
  }, [id])

  if (status === 'loading') {
    return (
      <PageTransition>
        <div className="grid min-h-[70vh] place-items-center text-muted">Loading project…</div>
      </PageTransition>
    )
  }

  if (!project) {
    return (
      <PageTransition>
        <div className="grid min-h-[70vh] place-items-center">
          <div className="text-center">
            <p className="text-muted">Project not found.</p>
            <Link to="/work" className="mt-4 inline-block text-accent">
              Back to work
            </Link>
          </div>
        </div>
      </PageTransition>
    )
  }

  const next = getNextProject(project.id)

  return (
    <PageTransition>
      <article>
        <header className="relative min-h-[88svh] overflow-hidden">
          <ProjectVisual id={project.id} className="absolute inset-0 h-full w-full" />
          <img
            src={project.image}
            alt=""
            className="absolute inset-0 h-full w-full object-cover opacity-70 mix-blend-luminosity"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-ink via-ink/40 to-ink/20" />
          <div className="relative z-10 mx-auto flex min-h-[88svh] max-w-[1600px] flex-col justify-end px-5 pb-16 pt-32 md:px-10">
            <p className="text-[11px] tracking-[0.35em] text-muted">
              {project.category} — {project.year}
            </p>
            <h1 className="display mt-4 text-[16vw] md:text-[9vw]">{project.name}</h1>
            <p className="mt-4 max-w-xl text-sm text-paper/80 md:text-base">{project.short}</p>
          </div>
        </header>

        <section className="mx-auto grid max-w-[1600px] gap-12 px-5 py-20 md:grid-cols-[1.2fr_0.8fr] md:px-10">
          <p className="max-w-2xl text-lg leading-relaxed text-paper/85 md:text-2xl">{project.description}</p>
          <dl className="space-y-6 text-sm">
            <div>
              <dt className="text-[11px] tracking-[0.25em] text-muted">CLIENT</dt>
              <dd className="mt-2">{project.client}</dd>
            </div>
            <div>
              <dt className="text-[11px] tracking-[0.25em] text-muted">SERVICES</dt>
              <dd className="mt-2">{project.services?.join(' / ')}</dd>
            </div>
            <div>
              <dt className="text-[11px] tracking-[0.25em] text-muted">YEAR</dt>
              <dd className="mt-2">{project.year}</dd>
            </div>
          </dl>
        </section>

        <section className="mx-auto grid max-w-[1600px] gap-6 px-5 md:grid-cols-2 md:px-10">
          {project.gallery?.map((src) => (
            <img
              key={src}
              src={src}
              alt={`${project.name} still`}
              loading="lazy"
              className="h-[50vh] w-full object-cover"
              onMouseEnter={() => setCursor({ active: true, label: 'VIEW' })}
              onMouseLeave={resetCursor}
            />
          ))}
        </section>

        <section className="mx-auto max-w-[1600px] px-5 py-20 md:px-10">
          <p className="text-[11px] tracking-[0.3em] text-muted">PROCESS</p>
          <div className="mt-10 grid gap-10 md:grid-cols-2">
            {project.process?.map((step, i) => (
              <div key={step.title} className="border-t border-line pt-6">
                <p className="text-accent">{String(i + 1).padStart(2, '0')}</p>
                <h2 className="mt-3 font-display text-3xl">{step.title}</h2>
                <p className="mt-4 text-sm leading-relaxed text-muted">{step.copy}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="relative mx-5 overflow-hidden bg-ink-3 md:mx-10">
          <img src={project.videoPoster} alt="" className="h-[56vh] w-full object-cover opacity-70" loading="lazy" />
          <div className="absolute inset-0 grid place-items-center">
            <p className="rounded-full border border-paper/30 px-6 py-3 text-[12px] tracking-[0.25em]">FILM STILL</p>
          </div>
        </section>

        <section className="mx-auto max-w-[1600px] px-5 py-20 md:px-10">
          <p className="text-[11px] tracking-[0.3em] text-muted">RESULTS</p>
          <div className="mt-10 grid gap-8 md:grid-cols-3">
            {project.results?.map((item) => (
              <div key={item.label} className="border-t border-line pt-6">
                <p className="font-display text-5xl text-accent">{item.value}</p>
                <p className="mt-3 text-[11px] tracking-[0.22em] text-muted">{item.label}</p>
              </div>
            ))}
          </div>
        </section>

        {next && (
          <section className="border-t border-line">
            <MagneticButton
              as={Link}
              to={`/work/${next.id}`}
              className="flex w-full items-center justify-between px-5 py-16 text-left md:px-10"
              onMouseEnter={() => setCursor({ active: true, label: next.name })}
              onMouseLeave={resetCursor}
            >
              <div>
                <p className="text-[11px] tracking-[0.3em] text-muted">NEXT PROJECT</p>
                <p className="display mt-3 text-6xl md:text-8xl">{next.name}</p>
              </div>
              <ArrowRight />
            </MagneticButton>
          </section>
        )}
      </article>
    </PageTransition>
  )
}
