// Either the verification response or the server's paid order can complete
// checkout. A late response must never undo success or affect a later checkout.
export function createPaymentConfirmation({ paymentId, razorpayOrderId, verify, watch, onComplete, onError, onConfirming }) {
  let completed = false, stopped = false, verifying = false, unsubscribe
  const stop = () => {
    stopped = true
    unsubscribe?.()
    unsubscribe = undefined
  }
  const complete = () => {
    if (completed || stopped) return
    completed = true
    stop()
    onComplete()
  }
  const listener = watch(order => {
    if (order?.status === 'paid' && order.paymentId === paymentId && order.razorpayOrderId === razorpayOrderId) complete()
  })
  // Also support an already-confirmed order delivered synchronously by watch.
  if (stopped) listener()
  else unsubscribe = listener
  return {
    stop,
    async retry() {
      if (completed || stopped || verifying) return
      verifying = true
      onConfirming()
      try {
        await verify()
        complete()
      } catch (error) {
        if (!completed && !stopped) onError(error)
      } finally {
        verifying = false
      }
    },
  }
}
