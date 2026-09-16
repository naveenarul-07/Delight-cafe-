const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function field(value, { required, min, max, pattern, label }) {
  const str = String(value ?? '').trim()
  if (required && !str) return `${label} is required`
  if (str && min && str.length < min) return `${label} must be at least ${min} characters`
  if (max && str.length > max) return `${label} must be at most ${max} characters`
  if (str && pattern && !pattern.test(str)) return `${label} is invalid`
  return null
}

export function validateContact(req, res, next) {
  const body = req.body || {}
  const errors = {}

  const nameErr = field(body.name, { required: true, min: 2, max: 80, label: 'Name' })
  const emailErr = field(body.email, {
    required: true,
    max: 120,
    pattern: EMAIL_RE,
    label: 'Email',
  })
  const companyErr = field(body.company, { required: false, max: 120, label: 'Company' })
  const messageErr = field(body.message, { required: true, min: 10, max: 2000, label: 'Message' })

  if (nameErr) errors.name = nameErr
  if (emailErr) errors.email = emailErr
  if (companyErr) errors.company = companyErr
  if (messageErr) errors.message = messageErr

  if (Object.keys(errors).length) {
    return res.status(400).json({ success: false, errors })
  }

  req.body = {
    name: String(body.name).trim(),
    email: String(body.email).trim().toLowerCase(),
    company: String(body.company || '').trim(),
    message: String(body.message).trim(),
  }
  next()
}

const hits = new Map()

export function rateLimitContact(req, res, next) {
  const ip = req.headers['x-forwarded-for']?.toString().split(',')[0].trim() || req.socket.remoteAddress
  const now = Date.now()
  const windowMs = 15 * 60 * 1000
  const record = hits.get(ip) || []
  const recent = record.filter((t) => now - t < windowMs)
  if (recent.length >= 8) {
    return res.status(429).json({ success: false, error: 'Too many requests. Please try again later.' })
  }
  recent.push(now)
  hits.set(ip, recent)
  next()
}
