import About from '../components/About.jsx'
import Process from '../components/Process.jsx'
import Clients from '../components/Clients.jsx'
import Contact from '../components/Contact.jsx'
import PageTransition from '../components/PageTransition.jsx'
import { team } from '../data/services.js'

export default function StudioPage() {
  return (
    <PageTransition>
      <div className="h-24" />
      <section className="mx-auto max-w-[1600px] px-5 pb-10 md:px-10">
        <p className="text-[11px] tracking-[0.4em] text-muted">STUDIO</p>
        <h1 className="display mt-4 max-w-[14ch] text-[12vw] md:text-[6vw]">A HOUSE FOR TASTE, SYSTEMS AND SOFTWARE.</h1>
      </section>
      <About />
      <section className="mx-auto grid max-w-[1600px] gap-8 px-5 py-16 md:grid-cols-2 md:px-10">
        {team.map((person) => (
          <article key={person.name} className="border-t border-line pt-6">
            <h2 className="font-display text-3xl">{person.name}</h2>
            <p className="mt-2 text-[11px] tracking-[0.22em] text-accent">{person.role}</p>
            <p className="mt-4 max-w-md text-sm text-muted">{person.bio}</p>
          </article>
        ))}
      </section>
      <Process />
      <Clients />
      <Contact />
    </PageTransition>
  )
}
