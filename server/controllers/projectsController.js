import { findAllProjects, findProjectById } from '../models/Project.js'

export async function listProjects(_req, res, next) {
  try {
    const projects = await findAllProjects()
    res.json({ success: true, data: projects })
  } catch (error) {
    next(error)
  }
}

export async function getProject(req, res, next) {
  try {
    const project = await findProjectById(req.params.id)
    if (!project) {
      return res.status(404).json({ success: false, error: 'Project not found' })
    }
    res.json({ success: true, data: project })
  } catch (error) {
    next(error)
  }
}
