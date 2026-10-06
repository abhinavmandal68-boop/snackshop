import { auth } from './firebase'

export async function shopApi(action, data = {}) {
  const user = auth.currentUser
  if (!user) throw new Error('Please sign in again')
  const response = await fetch('/api/shop', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await user.getIdToken()}` }, body: JSON.stringify({ action, ...data }) })
  const result = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(result.error || 'The request failed. Please try again.')
  return result
}
