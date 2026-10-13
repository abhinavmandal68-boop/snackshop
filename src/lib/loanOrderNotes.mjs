const accountEmail = 'abhinavmanda68@gmail.com'
const normalizeName = name => String(name || '').trim().toLowerCase().replace(/\s+/g, ' ')

export function canEditLoanNote(order, customer = {}) {
  if (order.paymentMethod !== 'cash' || order.status !== 'loaned') return false
  const email = String(customer.email || order.customerEmail || '').trim().toLowerCase()
  return email === accountEmail
    || normalizeName(order.customerName) === 'abhinav mandal'
    || normalizeName(customer.name) === 'abhinav mandal'
}
