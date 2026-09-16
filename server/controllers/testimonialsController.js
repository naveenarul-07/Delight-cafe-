import { findAllTestimonials } from '../models/Testimonial.js'

export async function listTestimonials(_req, res, next) {
  try {
    const testimonials = await findAllTestimonials()
    res.json({ success: true, data: testimonials })
  } catch (error) {
    next(error)
  }
}
