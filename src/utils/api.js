import { projects } from '../data/projects.js'
import { services, testimonials } from '../data/services.js'

async function request(path, options) {
  const response = await fetch(path, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  })
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) {
    const error = new Error(payload.error || 'Request failed')
    error.status = response.status
    error.payload = payload
    throw error
  }
  return payload
}

export async function fetchProjects() {
  try {
    const payload = await request('/api/projects')
    return payload.data || projects
  } catch {
    return projects
  }
}

export async function fetchProject(id) {
  try {
    const payload = await request(`/api/projects/${id}`)
    return payload.data
  } catch {
    return projects.find((item) => item.id === id) || null
  }
}

export async function fetchServices() {
  try {
    const payload = await request('/api/services')
    return payload.data || services
  } catch {
    return services
  }
}

export async function fetchTestimonials() {
  try {
    const payload = await request('/api/testimonials')
    return payload.data || testimonials
  } catch {
    return testimonials
  }
}

export async function submitContact(body) {
  return request('/api/contact', {
    method: 'POST',
    body: JSON.stringify(body),
  })
}
