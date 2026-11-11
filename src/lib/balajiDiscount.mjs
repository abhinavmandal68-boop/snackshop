export function balajiDiscountPaise(items, subtotalPaise) {
  const units = items.reduce((count, item) => {
    return /\bbalaji\b/i.test(item.name) ? count + item.qty : count
  }, 0)

  const pairDiscount = 500 * Math.floor(units / 2)
  // Keep the payable amount at or above Razorpay's INR minimum.
  return Math.min(pairDiscount, Math.max(0, subtotalPaise - 100))
}
