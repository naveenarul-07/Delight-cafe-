import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { projects as fallback } from '../data/projects.js'
import { fetchProjects } from '../utils/api.js'
import ProjectCard from './ProjectCard.jsx'
import MagneticButton from './MagneticButton.jsx'

const layout = {
  neon: 'md:col-span-7 md:row-span-2 min-h-[420px] md:min-h-[640px]',
  mono: 'md:col-span-5 min-h-[320px] md:min-h-[420px]',
  arc: 'md:col-span-5 min-h-[320px] md:min-h-[380px]',
  nova: 'md:col-span-7 min-h-[320px] md:min-h-[480px]',
  form: 'md:col-span-4 min-h-[280px] md:min-h-[420px]',
  lumen: 'md:col-span-4 min-h-[280px] md:min-h-[420px]',
  veil: 'md:col-span-4 min-h-[280px] md:min-h-[420px]',
}

export default function Work({ limit }) {
  const [items, setItems] = useState(fallback)

  useEffect(() => {
    fetchProjects().then(setItems)
  }, [])

  const shown = limit ? items.slice(0, limit) : items

  return (
    <section id="work" className="mx-auto max-w-[1600px] px-5 py-20 md:px-10 md:py-28">
      <div className="flex items-end justify-between gap-6">
        <div>
          <p className="text-[11px] tracking-[0.4em] text-muted">03 — ARCHIVE</p>
          <h2 className="display mt-4 text-[14vw] md:text-8xl">SELECTED WORK</h2>
        </div>
        {limit && (
          <MagneticButton as={Link} to="/work" className="hidden text-[12px] tracking-[0.22em] text-accent md:inline-flex">
            ALL PROJECTS →
          </MagneticButton>
        )}
      </div>

      {shown.length === 0 ? (
        <p className="mt-16 text-muted">No projects yet.</p>
      ) : (
        <div className="mt-14 grid gap-8 md:grid-cols-12">
          {shown.map((project) => (
            <ProjectCard
              key={project.id}
              project={project}
              className={layout[project.id] || 'md:col-span-6'}
            />
          ))}
        </div>
      )}
    </section>
  )
}
