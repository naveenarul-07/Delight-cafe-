import { getDb } from './db.js'

const memory = []

export async function createMessage(payload) {
  const entry = {
    ...payload,
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
  }
  const db = getDb()
  if (db) {
    await db.collection('contacts').insertOne({ ...entry })
  } else {
    memory.push(entry)
  }
  return entry
}

export function getMemoryContacts() {
  return memory
}
