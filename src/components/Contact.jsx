import { Link } from 'react-router-dom'
import MagneticButton from './MagneticButton.jsx'

const socials = [
  { label: 'Instagram', href: 'https://instagram.com' },
  { label: 'Behance', href: 'https://behance.net' },
  { label: 'LinkedIn', href: 'https://linkedin.com' },
  { label: 'Dribbble', href: 'https://dribbble.com' },
]

export default function Contact() {
  return (
    <section className="relative overflow-hidden bg-paper text-ink">
      <div className="pointer-events-none absolute -right-24 -top-24 h-[28rem] w-[28rem] rounded-full bg-accent blur-2xl" />
      <div className="relative mx-auto max-w-[1600px] px-5 py-28 md:px-10 md:py-36">
        <p className="text-[11px] tracking-[0.4em] text-ink/50">07 — CONTACT</p>
        <h2 className="display mt-6 text-[12vw] md:text-[6.4vw]">HAVE A PROJECT IN MIND?</h2>
        <p className="display mt-4 text-[8vw] text-ink/70 md:text-[3.6vw]">LET&apos;S MAKE SOMETHING REMARKABLE.</p>
        <div className="mt-12 flex flex-wrap items-center gap-6">
          <MagneticButton
            as={Link}
            to="/contact"
            className="rounded-full bg-ink px-8 py-4 text-[12px] tracking-[0.22em] text-paper"
          >
            START A PROJECT →
          </MagneticButton>
          <a href="mailto:hello@creativestudio.com" className="text-sm tracking-[0.08em]">
            hello@creativestudio.com
          </a>
        </div>
        <ul className="mt-16 flex flex-wrap gap-6 text-[12px] tracking-[0.22em] uppercase">
          {socials.map((item) => (
            <li key={item.label}>
              <a href={item.href} target="_blank" rel="noreferrer">
                {item.label}
              </a>
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}
