import { useEffect, useState } from 'react'
import { Link, NavLink, useLocation } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { Menu, X } from 'lucide-react'
import { useLoader } from '../context/LoaderContext.jsx'
import MagneticButton from './MagneticButton.jsx'

const links = [
  { to: '/work', label: 'Work' },
  { to: '/studio', label: 'Studio' },
  { to: '/#services', label: 'Services' },
  { to: '/contact', label: 'Contact' },
]

export default function Navbar() {
  const { loaded } = useLoader()
  const location = useLocation()
  const [open, setOpen] = useState(false)
  const [scrolled, setScrolled] = useState(false)

  useEffect(() => {
    setOpen(false)
  }, [location.pathname])

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : ''
    return () => {
      document.body.style.overflow = ''
    }
  }, [open])

  return (
    <>
      <motion.header
        initial={{ y: -40, opacity: 0 }}
        animate={loaded ? { y: 0, opacity: 1 } : {}}
        transition={{ duration: 0.8, delay: 0.05, ease: [0.22, 1, 0.36, 1] }}
        className={`fixed inset-x-0 top-0 z-50 mix-blend-difference ${scrolled ? 'backdrop-blur-[2px]' : ''}`}
      >
        <div className="mx-auto flex max-w-[1600px] items-center justify-between px-5 py-5 md:px-10">
          <MagneticButton as={Link} to="/" className="font-display text-sm tracking-[0.28em] text-paper" strength={0.2}>
            CREATIVE STUDIO
          </MagneticButton>
          <nav className="hidden items-center gap-8 md:flex" aria-label="Primary">
            {links.map((link) =>
              link.to.includes('#') ? (
                <MagneticButton
                  key={link.label}
                  as={Link}
                  to={link.to}
                  className="text-[12px] tracking-[0.22em] uppercase text-paper/80"
                  strength={0.25}
                >
                  {link.label}
                </MagneticButton>
              ) : (
                <MagneticButton
                  key={link.label}
                  as={NavLink}
                  to={link.to}
                  className="text-[12px] tracking-[0.22em] uppercase text-paper/80"
                  strength={0.25}
                >
                  {link.label}
                </MagneticButton>
              ),
            )}
            <MagneticButton
              type="button"
              className="text-paper"
              aria-label={open ? 'Close menu' : 'Open menu'}
              onClick={() => setOpen(true)}
            >
              <Menu size={18} />
            </MagneticButton>
          </nav>
          <button
            type="button"
            className="md:hidden text-paper"
            aria-label="Open menu"
            onClick={() => setOpen(true)}
          >
            <Menu size={20} />
          </button>
        </div>
      </motion.header>

      <AnimatePresence>
        {open && (
          <motion.div
            className="fixed inset-0 z-[85] bg-ink"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <div className="flex items-center justify-between px-5 py-5 md:px-10">
              <span className="font-display text-sm tracking-[0.28em]">CREATIVE STUDIO</span>
              <button type="button" aria-label="Close menu" onClick={() => setOpen(false)}>
                <X />
              </button>
            </div>
            <nav className="flex h-[80vh] flex-col justify-center px-8 md:px-16" aria-label="Menu">
              {links.map((link, i) => (
                <motion.div
                  key={link.label}
                  initial={{ y: 40, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  transition={{ delay: 0.08 * i, duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
                >
                  <Link
                    to={link.to}
                    className="font-display block py-2 text-[12vw] leading-[0.9] tracking-[-0.05em] md:text-8xl"
                    onClick={() => setOpen(false)}
                  >
                    {link.label}
                  </Link>
                </motion.div>
              ))}
            </nav>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}
