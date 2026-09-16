import { memo } from 'react'
import { clients } from '../data/services.js'

function Clients() {
  return (
    <section className="border-t border-line py-20 md:py-24">
      <div className="mx-auto max-w-[1600px] px-5 md:px-10">
        <p className="text-[11px] tracking-[0.4em] text-muted">TRUSTED BY</p>
        <ul className="mt-10 grid grid-cols-2 gap-px bg-line md:grid-cols-4">
          {clients.map((name) => (
            <li key={name} className="bg-ink">
              <div className="flex h-28 items-center justify-center font-display text-xl tracking-[0.2em] text-muted/50 grayscale transition duration-500 hover:scale-105 hover:text-paper hover:grayscale-0 md:text-2xl">
                {name}
              </div>
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}

export default memo(Clients)
