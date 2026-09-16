import { Router } from 'express'
import { listServices } from '../controllers/servicesController.js'

const router = Router()
router.get('/', listServices)

export default router
