import { cert, getApps, initializeApp } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'
import { getFirestore } from 'firebase-admin/firestore'

export function adminDb() {
  if (!getApps().length) initializeApp({ credential: cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)) })
  return getFirestore()
}
export async function authenticate(req, db, admin = false) {
  const header = req.headers.authorization || ''
  if (!header.startsWith('Bearer ')) throw Object.assign(new Error('Please sign in again'), { status: 401 })
  let user
  try { user = await getAuth().verifyIdToken(header.slice(7)) }
  catch { throw Object.assign(new Error('Please sign in again'), { status: 401 }) }
  if (admin && (await db.collection('users').doc(user.uid).get()).data()?.role !== 'admin') throw Object.assign(new Error('Administrator access required'), { status: 403 })
  return user
}
