import { getDb } from './db.js'
import { projects as seed } from '../data/content.js'

export async function findAllProjects() {
  const db = getDb()
  if (db) {
    const docs = await db.collection('projects').find({}).toArray()
    if (docs.length) return docs
  }
  return seed
}

export async function findProjectById(id) {
  const db = getDb()
  if (db) {
    const doc = await db.collection('projects').findOne({
      $or: [{ id }, { slug: id }],
    })
    if (doc) return doc
  }
  return seed.find((p) => p.id === id) || null
}
