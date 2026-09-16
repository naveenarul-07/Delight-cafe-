import { getDb } from './db.js'
import { services as seed } from '../data/content.js'

export async function findAllServices() {
  const db = getDb()
  if (db) {
    const docs = await db.collection('services').find({}).toArray()
    if (docs.length) return docs
  }
  return seed
}
