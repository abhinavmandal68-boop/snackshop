import { Loader2, ShieldCheck, Clock3 } from 'lucide-react'

const messages = {
  payment: {
    title: 'Opening secure payment…',
    description: 'We’re preparing your order and opening Razorpay. This may take a few moments.',
    hint: 'Complete your payment in the Razorpay window when it appears.',
  },
  confirming: {
    title: 'Confirming your order…',
    description: 'We’ve received your payment details from Razorpay. We’re verifying your payment and finalising your order.',
    hint: 'Please keep this page open. Your confirmation will appear automatically.',
  },
  verification_error: {
    title: 'Confirmation is still pending',
    description: 'We couldn’t confirm your payment just yet. Check again to verify the same payment without paying again.',
    hint: 'If this continues, contact the shop admin with your order reference below. Please don’t pay again.',
  },
  creating_cash: {
    title: 'Placing your order…',
    description: 'We’re reserving your snacks and preparing your cash order.',
    hint: 'Please keep this page open.',
  },
  cancelling_payment: {
    title: 'Returning to your cart…',
    description: 'We’re closing your payment and releasing your reservation.',
    hint: 'Your snacks will stay in your cart.',
  },
}

export default function CheckoutStatus({ step, orderId, onRetry }) {
  const message = messages[step]
  const needsRetry = step === 'verification_error'
  const Icon = needsRetry ? Clock3 : ShieldCheck

  return (
    <section className="checkout-status" role="status" aria-live="polite" aria-atomic="true">
      <div className="checkout-status-icon" aria-hidden="true">
        {!needsRetry && <Loader2 className="checkout-status-spinner" size={88} strokeWidth={1.5} />}
        <Icon size={30} />
      </div>
      <p className="checkout-status-label">SNACKSHOP CHECKOUT</p>
      <h3>{message.title}</h3>
      <p className="checkout-status-description">{message.description}</p>
      <p className="checkout-status-hint">{message.hint}</p>
      {needsRetry && (
        <>
          <button className="checkout-status-retry" onClick={onRetry}>Check payment again</button>
          <p className="checkout-status-reference">Order reference: {orderId}</p>
        </>
      )}
    </section>
  )
}
