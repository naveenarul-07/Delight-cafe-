import { lazy, Suspense, useEffect } from 'react'
import { AnimatePresence } from 'framer-motion'
import { Route, Routes, useLocation } from 'react-router-dom'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import Navbar from './components/Navbar.jsx'
import Footer from './components/Footer.jsx'
import CustomCursor from './components/CustomCursor.jsx'
import Loader from './components/Loader.jsx'
import Grain from './components/Grain.jsx'
import SmoothScroll from './components/SmoothScroll.jsx'

const Home = lazy(() => import('./pages/Home.jsx'))
const WorkPage = lazy(() => import('./pages/WorkPage.jsx'))
const ProjectPage = lazy(() => import('./pages/ProjectPage.jsx'))
const StudioPage = lazy(() => import('./pages/StudioPage.jsx'))
const ContactPage = lazy(() => import('./pages/ContactPage.jsx'))

gsap.registerPlugin(ScrollTrigger)

function HashScroll() {
  const { pathname, hash } = useLocation()

  useEffect(() => {
    if (hash) {
      const id = hash.replace('#', '')
      const frame = requestAnimationFrame(() => {
        document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      })
      return () => cancelAnimationFrame(frame)
    }
    window.scrollTo({ top: 0, behavior: 'auto' })
    const refresh = setTimeout(() => ScrollTrigger.refresh(), 400)
    return () => clearTimeout(refresh)
  }, [pathname, hash])

  return null
}

export default function App() {
  const location = useLocation()

  return (
    <>
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <SmoothScroll />
      <HashScroll />
      <Loader />
      <Grain />
      <CustomCursor />
      <Navbar />
      <Suspense fallback={<div className="min-h-screen bg-ink" />}>
        <AnimatePresence mode="wait">
          <Routes location={location} key={location.pathname}>
            <Route path="/" element={<Home />} />
            <Route path="/work" element={<WorkPage />} />
            <Route path="/work/:id" element={<ProjectPage />} />
            <Route path="/studio" element={<StudioPage />} />
            <Route path="/contact" element={<ContactPage />} />
          </Routes>
        </AnimatePresence>
      </Suspense>
      <Footer />
    </>
  )
}
