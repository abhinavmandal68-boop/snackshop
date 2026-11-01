import { FieldValue } from 'firebase-admin/firestore'
import { offerList } from '../src/lib/bundleOffers.mjs'

const fail = message => { throw Object.assign(new Error(message), { status: 400 }) }
const validId = id => typeof id === 'string' && /^[A-Za-z0-9_-]{1,150}$/.test(id)

export async function mutateOffer(db, action, body) {
  const input = body.offer || {}
  const id = action === 'deleteOffer' ? body.offerId : input.id
  if (!validId(id)) fail('Invalid offer')
  if (action !== 'deleteOffer') {
    if (typeof input.name !== 'string' || !input.name.trim() || input.name.trim().length > 80) fail('Enter an offer name of up to 80 characters')
    if (!validId(input.baseProductId) || !Array.isArray(input.pairedProductIds) || !input.pairedProductIds.length || input.pairedProductIds.length > 50
      || input.pairedProductIds.some(productId => !validId(productId) || productId === input.baseProductId)
      || new Set(input.pairedProductIds).size !== input.pairedProductIds.length) fail('Choose a base snack and at least one different paired snack')
    if (!Number.isFinite(input.discount) || input.discount <= 0 || input.discount > 50000 || Math.abs(input.discount * 100 - Math.round(input.discount * 100)) > 0.00001) fail('Enter a valid discount with up to two decimal places')
    if (typeof input.active !== 'boolean' || input.paymentMethod !== 'upi') fail('Offers are for prepaid Razorpay orders only')
  }
  const ref = db.collection('settings').doc('offers')
  return db.runTransaction(async tx => {
    const current = await tx.get(ref)
    const offers = offerList(current.data())
    if (action === 'deleteOffer') {
      tx.set(ref, { offers: offers.filter(offer => offer.id !== id), updatedAt: FieldValue.serverTimestamp() })
      return { success: true }
    }
    if (!offers.some(offer => offer.id === id) && offers.length >= 25) fail('You can save up to 25 offers. Remove an old offer first.')
    const ids = [input.baseProductId, ...input.pairedProductIds]
    const products = await tx.getAll(...ids.map(productId => db.collection('products').doc(productId)))
    if (input.active && products.some(product => !product.exists || !Number.isFinite(product.data().price) || product.data().price <= 0)) fail('A selected product is no longer available')
    const [base, ...companions] = products.map(product => product.data() || {})
    if (input.active && companions.some(product => Math.round((base.price + product.price) * 100) <= Math.round(input.discount * 100))) fail('The discount must be less than the price of every eligible pair')
    const previous = offers.find(offer => offer.id === id)
    const offer = { id, name: input.name.trim(), baseProductId: input.baseProductId, baseProductName: base.name || previous?.baseProductName || 'Unavailable product',
      pairedProductIds: [...input.pairedProductIds], pairedProductNames: companions.map((product, index) => product.name || previous?.pairedProductNames?.[index] || 'Unavailable product'),
      discount: input.discount, active: input.active, paymentMethod: 'upi' }
    tx.set(ref, { offers: [...offers.filter(existing => existing.id !== id), offer], updatedAt: FieldValue.serverTimestamp() })
    return { success: true, offer }
  })
}
