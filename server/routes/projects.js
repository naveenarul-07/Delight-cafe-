import { Router } from 'express'
import { listProjects, getProject } from '../controllers/projectsController.js'

const router = Router()
router.get('/', listProjects)
router.get('/:id', getProject)

export default router
