import { memo } from 'react'

const palettes = {
  neon: ['#d6ff3c', '#5b4dff', '#111'],
  mono: ['#f3efe6', '#2a2a2a', '#111'],
  arc: ['#c8b48a', '#3d4a3a', '#111'],
  nova: ['#7cf0ff', '#1b2a6b', '#070714'],
  form: ['#ff7a45', '#3a1d12', '#120c0a'],
  lumen: ['#d6ff3c', '#163022', '#07110b'],
  veil: ['#e8d5c4', '#5a3d46', '#140c10'],
}

function ProjectVisual({ id, className = '' }) {
  const [a, b, c] = palettes[id] || palettes.neon
  return (
    <div className={`relative overflow-hidden ${className}`} aria-hidden>
      <svg viewBox="0 0 800 1000" className="h-full w-full" preserveAspectRatio="xMidYMid slice">
        <rect width="800" height="1000" fill={c} />
        <circle cx="560" cy="280" r="260" fill={a} opacity="0.85" />
        <circle cx="220" cy="720" r="220" fill={b} opacity="0.9" />
        <rect x="80" y="120" width="240" height="720" fill="none" stroke={a} strokeWidth="2" opacity="0.5" />
        <text
          x="70"
          y="930"
          fill={a}
          fontFamily="Space Grotesk, sans-serif"
          fontSize="92"
          letterSpacing="-3"
        >
          {id?.toUpperCase()}
        </text>
      </svg>
    </div>
  )
}

export default memo(ProjectVisual)
