import { useState } from 'react'
import { submitContact } from '../utils/api.js'
import MagneticButton from '../components/MagneticButton.jsx'
import PageTransition from '../components/PageTransition.jsx'

const empty = { name: '', email: '', company: '', message: '' }

export default function ContactPage() {
  const [form, setForm] = useState(empty)
  const [errors, setErrors] = useState({})
  const [status, setStatus] = useState('idle')
  const [note, setNote] = useState('')

  const onChange = (event) => {
    const { name, value } = event.target
    setForm((prev) => ({ ...prev, [name]: value }))
  }

  const onSubmit = async (event) => {
    event.preventDefault()
    setStatus('loading')
    setErrors({})
    try {
      const result = await submitContact(form)
      setStatus('success')
      setNote(result.message)
      setForm(empty)
    } catch (error) {
      setStatus('error')
      setErrors(error.payload?.errors || {})
      setNote(error.payload?.error || error.message)
    }
  }

  const fieldClass =
    'w-full border-b border-ink/20 bg-transparent py-4 text-base outline-none transition placeholder:text-ink/40 focus:border-ink'

  return (
    <PageTransition>
      <section className="bg-paper text-ink">
        <div className="mx-auto grid min-h-[100svh] max-w-[1600px] gap-16 px-5 py-32 md:grid-cols-2 md:px-10">
          <div>
            <p className="text-[11px] tracking-[0.4em] text-ink/50">CONTACT</p>
            <h1 className="display mt-4 text-[14vw] md:text-7xl">START A PROJECT</h1>
            <p className="mt-6 max-w-md text-sm leading-relaxed text-ink/70">
              Tell us about the brand, the ambition, and the constraint. We typically reply within two working days.
            </p>
            <a href="mailto:hello@creativestudio.com" className="mt-8 inline-block text-sm tracking-[0.08em]">
              hello@creativestudio.com
            </a>
          </div>
          <form onSubmit={onSubmit} className="flex flex-col gap-2" noValidate>
            <label className="text-[11px] tracking-[0.22em]">
              NAME
              <input
                name="name"
                value={form.name}
                onChange={onChange}
                className={fieldClass}
                autoComplete="name"
                required
              />
            </label>
            {errors.name && <p className="text-xs text-red-700">{errors.name}</p>}
            <label className="text-[11px] tracking-[0.22em]">
              EMAIL
              <input
                name="email"
                type="email"
                value={form.email}
                onChange={onChange}
                className={fieldClass}
                autoComplete="email"
                required
              />
            </label>
            {errors.email && <p className="text-xs text-red-700">{errors.email}</p>}
            <label className="text-[11px] tracking-[0.22em]">
              COMPANY
              <input name="company" value={form.company} onChange={onChange} className={fieldClass} autoComplete="organization" />
            </label>
            {errors.company && <p className="text-xs text-red-700">{errors.company}</p>}
            <label className="text-[11px] tracking-[0.22em]">
              MESSAGE
              <textarea
                name="message"
                value={form.message}
                onChange={onChange}
                className={`${fieldClass} min-h-32 resize-y`}
                required
              />
            </label>
            {errors.message && <p className="text-xs text-red-700">{errors.message}</p>}
            <MagneticButton
              type="submit"
              disabled={status === 'loading'}
              className="mt-8 self-start rounded-full bg-ink px-8 py-4 text-[12px] tracking-[0.22em] text-paper disabled:opacity-60"
            >
              {status === 'loading' ? 'SENDING…' : 'SEND MESSAGE →'}
            </MagneticButton>
            {note && (
              <p className={`mt-4 text-sm ${status === 'success' ? 'text-ink' : 'text-red-700'}`} role="status">
                {note}
              </p>
            )}
          </form>
        </div>
      </section>
    </PageTransition>
  )
}
