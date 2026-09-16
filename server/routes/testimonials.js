import { Router } from 'express'
import { listTestimonials } from '../controllers/testimonialsController.js'

const router = Router()
router.get('/', listTestimonials)

export default router
