import Hero from '../components/Hero.jsx'
import Marquee from '../components/Marquee.jsx'
import Intro from '../components/Intro.jsx'
import Services from '../components/Services.jsx'
import Work from '../components/Work.jsx'
import About from '../components/About.jsx'
import Process from '../components/Process.jsx'
import Clients from '../components/Clients.jsx'
import Testimonials from '../components/Testimonials.jsx'
import Contact from '../components/Contact.jsx'
import PageTransition from '../components/PageTransition.jsx'

export default function Home() {
  return (
    <PageTransition>
      <Hero />
      <Marquee />
      <Intro />
      <Services />
      <Work limit={7} />
      <About />
      <Process />
      <Clients />
      <Testimonials />
      <Contact />
    </PageTransition>
  )
}
