import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import projectsRouter from './routes/projects.js'
import servicesRouter from './routes/services.js'
import contactRouter from './routes/contact.js'
import testimonialsRouter from './routes/testimonials.js'
import { errorHandler, notFound } from './middleware/errorHandler.js'
import { connectDb } from './models/db.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const app = express()
const PORT = Number(process.env.PORT) || 5000
const isProd = process.env.NODE_ENV === 'production'

app.disable('x-powered-by')
app.use(
  cors({
    origin: process.env.CLIENT_ORIGIN?.split(',') || true,
    methods: ['GET', 'POST', 'OPTIONS'],
  }),
)
app.use(express.json({ limit: '32kb' }))

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, service: 'creative-studio' })
})

app.use('/api/projects', projectsRouter)
app.use('/api/services', servicesRouter)
app.use('/api/contact', contactRouter)
app.use('/api/testimonials', testimonialsRouter)

if (isProd) {
  const dist = path.resolve(__dirname, '../dist')
  app.use(express.static(dist))
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api')) return next()
    res.sendFile(path.join(dist, 'index.html'))
  })
}

app.use(notFound)
app.use(errorHandler)

connectDb()
  .then((mode) => {
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`Creative Studio API listening on http://localhost:${PORT} (${mode})`)
    })
  })
  .catch((err) => {
    console.error('Failed to start server', err)
    process.exit(1)
  })
