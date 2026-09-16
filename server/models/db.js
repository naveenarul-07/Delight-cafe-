import { MongoClient } from 'mongodb'

let client
let db

export async function connectDb() {
  const uri = process.env.MONGODB_URI
  if (!uri) return 'memory'
  try {
    client = new MongoClient(uri)
    await client.connect()
    db = client.db(process.env.MONGODB_DB || 'creative_studio')
    return 'mongodb'
  } catch (error) {
    console.warn('MongoDB unavailable, falling back to in-memory store:', error.message)
    db = null
    return 'memory'
  }
}

export function getDb() {
  return db
}
