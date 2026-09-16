export function notFound(req, res, next) {
  if (req.path.startsWith('/api')) {
    return res.status(404).json({ success: false, error: 'Not found' })
  }
  next()
}

export function errorHandler(err, _req, res, _next) {
  const status = err.status || 500
  const message = status === 500 ? 'Internal server error' : err.message
  if (status === 500) console.error(err)
  res.status(status).json({ success: false, error: message })
}
