import { collection, doc, query, where, onSnapshot, getDoc, getDocs, Timestamp } from 'firebase/firestore'
import { isActiveOrder, monthBounds, shopDateKey } from './monthlyReports.mjs'
import { mergeLiveOrders, timestampMillis } from './razorpayHistory.mjs'

const firestore = { collection, doc, query, where, onSnapshot, getDoc, getDocs, Timestamp }

export function monthOrdersForView(month, cachedOrders, latestOrders) {
  return mergeLiveOrders(new Map([['cached', cachedOrders], ['latest', latestOrders]]))
    .filter(order => order.status !== 'draft' && shopDateKey(order.createdAt).startsWith(month))
}

// Keep unresolved orders live across refreshes. Completed history and loans
// are still fetched explicitly and cached.
export function createAdminOrderFeed({ db, since = Date.now(), onChange, onIncoming, onError }, api = firestore) {
  const sources = new Map(), incomingIds = new Set(), notifiedIds = new Set()
  const loads = new Map(), cachedViews = new Set()
  const confirmedPatches = new Map(), revisions = new Map()
  let revision = 0
  let active = true
  const ordersQuery = (...filters) => api.query(api.collection(db, 'orders'), ...filters)
  const recordsFor = snapshot => snapshot.docs.map(doc => ({ id: doc.id, ...doc.data({ serverTimestamps: 'estimate' }) }))
  const emit = () => {
    if (active) onChange(mergeLiveOrders(sources), new Set(incomingIds))
  }
  // A delayed query snapshot must not undo a successful admin action.
  const preserveAction = order => isActiveOrder(order) && confirmedPatches.has(order.id)
    ? { ...order, ...confirmedPatches.get(order.id) } : order
  const patchOrder = (id, patch) => {
    const previous = mergeLiveOrders(sources).find(order => order.id === id)
    if (!previous) return
    const updated = { ...previous, ...patch }
    revisions.set(id, ++revision)
    if (!isActiveOrder(updated)) {
      confirmedPatches.set(id, patch)
      incomingIds.delete(id)
    } else {
      confirmedPatches.delete(id)
      incomingIds.add(id)
    }
    for (const [source, records] of sources) sources.set(source, records.map(order => order.id === id ? updated : order))
    emit()
  }
  const publish = (source, records, incomingRecords = []) => {
    records = records.map(preserveAction)
    const latest = new Map(records.map(order => [order.id, order]))
    // Keep cached views consistent when a live order is accepted or paid.
    for (const [key, previous] of sources) sources.set(key, previous.map(order => latest.get(order.id) || order))
    sources.set(source, records)
    for (const record of incomingRecords) {
      const order = preserveAction(record)
      if (!isActiveOrder(order)) continue
      incomingIds.add(order.id)
      if (isActiveOrder(order) && !notifiedIds.has(order.id)) {
        notifiedIds.add(order.id)
        if (Math.max(timestampMillis(order.createdAt) || 0, timestampMillis(order.paidAt) || 0) >= since) onIncoming?.(order)
      }
    }
    emit()
  }
  return {
    start() {
      active = true
      const subscriptions = [
        ['cash', ordersQuery(api.where('status', 'in', ['pending', 'utr_submitted']))],
        ['razorpay', ordersQuery(api.where('status', '==', 'paid'), api.where('accepted', '==', false))],
      ].map(([name, orderQuery]) => api.onSnapshot(
        orderQuery,
        snapshot => {
          if (!active) return
          const source = `incoming-${name}`
          const current = recordsFor(snapshot)
          current.forEach(order => revisions.set(order.id, ++revision))
          // Removed query documents contain their OLD data. Remove the card
          // from incoming immediately without restoring that stale status.
          const removed = (snapshot.docChanges?.() || []).filter(change => change.type === 'removed').map(change => change.doc.id)
          removed.forEach(id => incomingIds.delete(id))
          publish(source, mergeLiveOrders(new Map([
            ['cached', sources.get(source) || []], ['current', current],
          ])), current)
          // Changes made on another device also need their final history data.
          const cached = new Map(mergeLiveOrders(sources).map(order => [order.id, order]))
          for (const id of removed) {
            if (!isActiveOrder(cached.get(id) || {})) continue
            const beforeRead = revisions.get(id)
            api.getDoc(api.doc(db, 'orders', id)).then(snapshot => {
              if (!active || revisions.get(id) !== beforeRead) return
              if (snapshot.exists()) {
                const order = { id, ...snapshot.data({ serverTimestamps: 'estimate' }) }
                if (isActiveOrder(order)) incomingIds.add(id)
                patchOrder(id, order)
              } else {
                for (const [key, records] of sources) sources.set(key, records.filter(order => order.id !== id))
                emit()
              }
            }).catch(error => { if (active) onError?.(error) })
          }
        },
        error => { if (active) onError?.(error) },
      ))
      return () => { active = false; subscriptions.forEach(unsubscribe => unsubscribe()) }
    },
    load(view, force = false) {
      if (loads.has(view)) return loads.get(view)
      if (cachedViews.has(view) && !force) return Promise.resolve()
      let queries
      if (view === 'pending') queries = [
        ordersQuery(api.where('status', 'in', ['pending', 'utr_submitted'])),
        ordersQuery(api.where('status', '==', 'paid'), api.where('accepted', '==', false)),
      ]
      else if (view === 'history') queries = [ordersQuery(api.where('createdAt', '>=', api.Timestamp.fromMillis(Date.now() - 24 * 3600000)))]
      else if (view === 'loans') queries = [ordersQuery(api.where('status', 'in', ['partially_paid', 'loaned']))]
      else if (view.startsWith('month:')) {
        const [start, end] = monthBounds(view.slice(6))
        queries = [ordersQuery(api.where('createdAt', '>=', api.Timestamp.fromMillis(start.getTime())), api.where('createdAt', '<', api.Timestamp.fromMillis(end.getTime())))]
      }
      else return Promise.reject(new Error('Unknown order view'))
      const beforeRead = revision
      const request = Promise.all(queries.map(orderQuery => api.getDocs(orderQuery)))
        .then(snapshots => {
          if (!active) return
          const latest = new Map(mergeLiveOrders(sources).map(order => [order.id, order]))
          const records = mergeLiveOrders(new Map(snapshots.map((snapshot, index) => [index, recordsFor(snapshot)])))
            .map(order => revisions.get(order.id) > beforeRead ? latest.get(order.id) || order : order)
          publish(view, records)
          cachedViews.add(view)
        })
        .finally(() => loads.delete(view))
      loads.set(view, request)
      return request
    },
    records(view) { return sources.get(view) || [] },
    patch: patchOrder,
  }
}
