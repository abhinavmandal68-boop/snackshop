import { collection, query, where, onSnapshot, getDocs, Timestamp } from 'firebase/firestore'
import { isActiveOrder, monthBounds, shopDateKey } from './monthlyReports.mjs'
import { mergeLiveOrders } from './razorpayHistory.mjs'

const firestore = { collection, query, where, onSnapshot, getDocs, Timestamp }

export function monthOrdersForView(month, cachedOrders, latestOrders) {
  return mergeLiveOrders(new Map([['cached', cachedOrders], ['latest', latestOrders]]))
    .filter(order => order.status !== 'draft' && shopDateKey(order.createdAt).startsWith(month))
}

// Only events occurring after this dashboard opened are watched automatically.
// Existing pending orders, history and loans are fetched explicitly and cached.
export function createAdminOrderFeed({ db, since = Date.now(), onChange, onIncoming, onError }, api = firestore) {
  const sources = new Map(), incomingIds = new Set(), notifiedIds = new Set()
  const loads = new Map(), cachedViews = new Set()
  let active = true
  const ordersQuery = (...filters) => api.query(api.collection(db, 'orders'), ...filters)
  const recordsFor = snapshot => snapshot.docs.map(doc => ({ id: doc.id, ...doc.data({ serverTimestamps: 'estimate' }) }))
  const emit = () => {
    if (active) onChange(mergeLiveOrders(sources), new Set(incomingIds))
  }
  const publish = (source, records, incoming = false) => {
    const latest = new Map(records.map(order => [order.id, order]))
    // Keep cached views consistent when a live order is accepted or paid.
    for (const [key, previous] of sources) sources.set(key, previous.map(order => latest.get(order.id) || order))
    sources.set(source, records)
    if (incoming) for (const order of records) {
      incomingIds.add(order.id)
      if (isActiveOrder(order) && !notifiedIds.has(order.id)) {
        notifiedIds.add(order.id)
        onIncoming?.(order)
      }
    }
    emit()
  }
  return {
    start() {
      active = true
      const start = api.Timestamp.fromMillis(since)
      const subscriptions = ['createdAt', 'paidAt'].map(field => api.onSnapshot(
        ordersQuery(api.where(field, '>=', start)),
        snapshot => { if (active) publish(`incoming-${field}`, recordsFor(snapshot), true) },
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
      const request = Promise.all(queries.map(orderQuery => api.getDocs(orderQuery)))
        .then(snapshots => {
          if (!active) return
          const records = mergeLiveOrders(new Map(snapshots.map((snapshot, index) => [index, recordsFor(snapshot)])))
          publish(view, records)
          cachedViews.add(view)
        })
        .finally(() => loads.delete(view))
      loads.set(view, request)
      return request
    },
    records(view) { return sources.get(view) || [] },
    patch(id, patch) {
      for (const [source, records] of sources) sources.set(source, records.map(order => order.id === id ? { ...order, ...patch } : order))
      emit()
    },
  }
}
