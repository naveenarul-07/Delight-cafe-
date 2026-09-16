import { findAllServices } from '../models/Service.js'

export async function listServices(_req, res, next) {
  try {
    const services = await findAllServices()
    res.json({ success: true, data: services })
  } catch (error) {
    next(error)
  }
}
