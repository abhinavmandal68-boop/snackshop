import { Timestamp } from 'firebase-admin/firestore'

const fail = message => { throw Object.assign(new Error(message), { status: 400 }) }
const validId = id => typeof id === 'string' && /^[A-Za-z0-9_-]{1,150}$/.test(id)

// Reserve and price a new UPI draft on the server in the checkout request.
// Drafts have no report contribution; verification/cancellation updates reports.
export function reserveUpiOrder(db, user, { firestoreOrderId, items, customerName }) {
  if (!validId(firestoreOrderId) || firestoreOrderId.length > 40) fail('Invalid order')
  if (!Array.isArray(items) || !items.length || items.length > 50 || new Set(items.map(item => item?.productId)).size !== items.length) fail('Invalid order items')
  if (items.some(item => !validId(item?.productId) || !Number.isInteger(item.qty) || item.qty <= 0 || item.qty > 1000)) fail('Invalid order quantity')
  const ref = db.collection('orders').doc(firestoreOrderId)
  return db.runTransaction(async tx => {
    const refs = items.map(item => db.collection('products').doc(item.productId))
    const [current, ...products] = await tx.getAll(ref, ...refs)
    if (current.exists) {
      const order = current.data()
      if (order.userId !== user.uid || order.paymentMethod !== 'upi') fail('Order already exists')
      if (order.status !== 'draft') fail('This order is no longer awaiting payment')
      return order
    }
    let totalPaise = 0
    const savedItems = products.map((product, index) => {
      const item = items[index], data = product.data()
      if (!product.exists || !Number.isFinite(data.price) || data.price <= 0) fail('A product is no longer available')
      if ((data.stock || 0) - (data.reserved || 0) < item.qty) fail(`${data.name} has insufficient stock`)
      totalPaise += Math.round(data.price * 100) * item.qty
      return { productId: item.productId, name: data.name, qty: item.qty, price: data.price }
    })
    if (totalPaise <= 0 || totalPaise > 5000000) fail('Invalid order total')
    const order = {
      userId: user.uid,
      customerName: String(user.name || customerName || user.email?.split('@')[0] || 'Customer').trim().slice(0, 120) || 'Customer',
      items: savedItems, total: totalPaise / 100,
      paymentMethod: 'upi', status: 'draft', createdAt: Timestamp.now(), pricingVersion: 1,
    }
    products.forEach((product, index) => tx.update(refs[index], { reserved: (product.data().reserved || 0) + items[index].qty }))
    tx.set(ref, order)
    return order
  })
}
