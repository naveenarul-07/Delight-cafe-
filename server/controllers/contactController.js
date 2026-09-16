import { createMessage } from '../models/Contact.js'

export async function createContact(req, res, next) {
  try {
    const saved = await createMessage(req.body)
    res.status(201).json({
      success: true,
      message: 'Thank you. We will be in touch shortly.',
      data: { id: saved.id, createdAt: saved.createdAt },
    })
  } catch (error) {
    next(error)
  }
}
