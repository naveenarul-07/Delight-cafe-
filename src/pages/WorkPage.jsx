import Work from '../components/Work.jsx'
import Contact from '../components/Contact.jsx'
import PageTransition from '../components/PageTransition.jsx'

export default function WorkPage() {
  return (
    <PageTransition>
      <div className="h-24" />
      <Work />
      <Contact />
    </PageTransition>
  )
}
