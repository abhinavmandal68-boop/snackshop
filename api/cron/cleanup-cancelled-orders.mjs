import { timingSafeEqual } from 'node:crypto'
import { adminDb } from '../../server/firebaseAdmin.mjs'
import { cleanupCancelledOrders } from '../../server/cancelledOrderCleanup.mjs'

export function createCleanupHandler({ getDb = adminDb, cleanup = cleanupCancelledOrders, getSecret = () => process.env.CRON_SECRET } = {}) {
  return async function handler(req, res) {
    res.setHeader('Cache-Control', 'no-store')
    if (req.method !== 'GET') {
      res.setHeader('Allow', 'GET')
      return res.status(405).json({ error: 'Method not allowed' })
    }
    const secret = getSecret()
    if (!secret) return res.status(503).json({ error: 'Scheduled cleanup is not configured' })
    const header = req.headers.authorization
    const received = Buffer.from(typeof header === 'string' ? header : '')
    const expected = Buffer.from(`Bearer ${secret}`)
    if (received.length !== expected.length || !timingSafeEqual(received, expected)) {
      return res.status(401).json({ error: 'Unauthorized' })
    }
    try {
      const result = await cleanup(getDb())
      console.info('Cancelled order cleanup completed', result)
      return res.status(200).json({ success: true, ...result })
    } catch (error) {
      console.error('Cancelled order cleanup failed', { code: error.code || 'cleanup-failed' })
      return res.status(500).json({ error: 'Scheduled cleanup failed' })
    }
  }
}

export default createCleanupHandler()
