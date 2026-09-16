import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowUp } from 'lucide-react'
import MagneticButton from './MagneticButton.jsx'

const nav = [
  { to: '/work', label: 'Work' },
  { to: '/studio', label: 'Studio' },
  { to: '/#services', label: 'Services' },
  { to: '/contact', label: 'Contact' },
]

export default function Footer() {
  const [showTop, setShowTop] = useState(false)

  useEffect(() => {
    const onScroll = () => setShowTop(window.scrollY > 600)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  const toTop = () => {
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  return (
    <footer className="border-t border-line bg-ink">
      <div className="mx-auto flex max-w-[1600px] flex-col gap-10 px-5 py-12 md:flex-row md:items-end md:justify-between md:px-10">
        <Link to="/" className="font-display tracking-[0.28em]">
          CREATIVE STUDIO
        </Link>
        <nav className="flex flex-wrap gap-6 text-[12px] tracking-[0.2em] uppercase" aria-label="Footer">
          {nav.map((item) => (
            <Link key={item.label} to={item.to}>
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="flex gap-5 text-[12px] tracking-[0.2em] uppercase text-muted">
          <a href="https://instagram.com" target="_blank" rel="noreferrer">Instagram</a>
          <a href="https://behance.net" target="_blank" rel="noreferrer">Behance</a>
          <a href="https://linkedin.com" target="_blank" rel="noreferrer">LinkedIn</a>
        </div>
      </div>
      <div className="mx-auto flex max-w-[1600px] items-center justify-between px-5 pb-8 text-xs text-muted md:px-10">
        <p>© 2026 Creative Studio</p>
        <p>Independent digital studio</p>
      </div>
      {showTop && (
        <MagneticButton
          type="button"
          onClick={toTop}
          aria-label="Back to top"
          className="fixed right-5 bottom-5 z-40 h-12 w-12 rounded-full bg-accent text-ink md:right-8 md:bottom-8"
        >
          <ArrowUp size={18} />
        </MagneticButton>
      )}
    </footer>
  )
}
