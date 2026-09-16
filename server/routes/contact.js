import { Router } from 'express'
import { createContact } from '../controllers/contactController.js'
import { rateLimitContact, validateContact } from '../middleware/validate.js'

const router = Router()
router.post('/', rateLimitContact, validateContact, createContact)

export default router
