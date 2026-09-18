import { motion } from 'framer-motion'
import { Plus, Minus } from 'lucide-react'
import { useCart } from '../lib/CartContext'
import { press } from '../lib/motion'

export default function ProductCard({ product }) {
  const { items, addToCart, decrementFromCart } = useCart()
  if (!product) return null
  const inCart = items[product.id] || 0
  const stock = product.visibleStock ?? product.stock ?? 0
  const available = Math.max(0, stock - inCart)
  const soldOut = stock <= 0
  return (
    <article className={`product-card ${soldOut ? 'is-sold-out' : ''}`}>
      <div className="product-image-container" style={{ background: product.demoColor || 'var(--surface2)' }}>
        {product.imageUrl || product.image ? <img src={product.imageUrl || product.image} alt={product.name} className="product-image" onError={e => { e.currentTarget.style.display = 'none'; e.currentTarget.nextElementSibling.hidden = false }} /> : null}
        <div hidden={Boolean(product.imageUrl || product.image)} className={product.demoLabel ? 'demo-package' : 'product-image-fallback'} style={{ '--pack-color': product.packColor || '#bd4630' }}>
          {product.demoLabel ? <><span className="pack-brand">{product.demoBrand}</span><strong>{product.demoLabel}</strong><span className="pack-circle" /><span className="pack-flavour">{product.demoFlavour}</span></> : <><ShoppingPlaceholder /><span>{product.name}</span><small>Image coming soon</small></>}
        </div>
        {soldOut && <span className="sold-out-label">Back soon</span>}
        {product.demoLabel && <span className="demo-art-label">ILLUSTRATED PREVIEW</span>}
      </div>
      <div className="product-card-content">
        <div className="product-meta"><span>{product.category || 'snacks'}</span>{product.packSize && <span>{product.packSize}</span>}</div>
        <h3 className="product-name">{product.name}</h3>
        <div className="product-stock">{soldOut ? 'Currently out of stock' : available === 0 ? 'All available units in your bag' : available <= 5 ? `Only ${available} left` : 'Ready for pickup'}</div>
        <div className="product-actions"><span className="product-price">₹{product.price}</span>{inCart ? <div className="quantity-selector"><motion.button whileTap={press} onClick={() => decrementFromCart(product.id)} aria-label={`Decrease ${product.name} quantity`}><Minus size={15} /></motion.button><span aria-live="polite">{inCart}</span><motion.button whileTap={press} disabled={available === 0} onClick={() => { if (available > 0) addToCart(product, 1) }} aria-label={`Increase ${product.name} quantity`}><Plus size={15} /></motion.button></div> : <motion.button className="product-add-button" whileTap={press} disabled={soldOut} onClick={() => { if (available > 0) addToCart(product, 1) }}>{soldOut ? 'Sold out' : 'Add'}</motion.button>}</div>
      </div>
    </article>
  )
}

function ShoppingPlaceholder() {
  return <svg width="40" height="48" viewBox="0 0 40 48" fill="none" aria-hidden="true"><path d="M7 15H33L36 44H4L7 15Z" stroke="currentColor" strokeWidth="1.5" /><path d="M13 18V10A7 7 0 0 1 27 10V18" stroke="currentColor" strokeWidth="1.5" /></svg>
}
