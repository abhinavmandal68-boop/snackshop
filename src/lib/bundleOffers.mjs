export const offerList = data => Array.isArray(data?.offers) ? data.offers.slice(0, 25) : []
const cents = amount => Math.round(Number(amount) * 100)

// One offer per order: choose the largest saving, with a discount for every pair.
// Both checkout and the cart use the same calculation; prices come from the
// product documents on the server, never from customer-supplied totals.
export function priceWithOffers(items, offers = [], paymentMethod = 'cash') {
  const subtotalCents = items.reduce((sum, item) => sum + cents(item.price) * item.qty, 0)
  let best = null
  if (paymentMethod === 'upi') for (const offer of offers) {
    if (!offer.active || offer.paymentMethod !== 'upi' || !Array.isArray(offer.pairedProductIds)) continue
    const discountPerPair = cents(offer.discount)
    if (!Number.isSafeInteger(discountPerPair) || discountPerPair <= 0) continue
    const base = items.find(item => item.productId === offer.baseProductId)
    if (!base) continue
    const companionIds = new Set(offer.pairedProductIds)
    const companions = items.filter(item => item.productId !== offer.baseProductId && companionIds.has(item.productId)
      && cents(item.price) + cents(base.price) > discountPerPair)
    const pairs = Math.min(base.qty, companions.reduce((sum, item) => sum + item.qty, 0))
    const discountCents = pairs * discountPerPair
    if (discountCents > 0 && (!best || discountCents > best.discountCents || (discountCents === best.discountCents && offer.id < best.id))) {
      best = { id: offer.id, name: offer.name, pairs, discountPerPair: discountPerPair / 100, discount: discountCents / 100, discountCents }
    }
  }
  const discountCents = best?.discountCents || 0
  return { subtotal: subtotalCents / 100, discount: discountCents / 100, total: (subtotalCents - discountCents) / 100,
    appliedOffers: best ? [{ id: best.id, name: best.name, pairs: best.pairs, discountPerPair: best.discountPerPair, discount: best.discount }] : [] }
}
