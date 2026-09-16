import { getDb } from './db.js'
import { testimonials as seed } from '../data/content.js'

export async function findAllTestimonials() {
  const db = getDb()
  if (db) {
    const docs = await db.collection('testimonials').find({}).toArray()
    if (docs.length) return docs
  }
  return seed
}
