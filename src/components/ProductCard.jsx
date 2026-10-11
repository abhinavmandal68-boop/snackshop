import { motion, AnimatePresence, useIsPresent } from 'framer-motion'
import { Plus, Minus } from 'lucide-react'
import { useCart } from '../lib/CartContext'
import { press } from '../lib/motion'
import ProductArtwork from './ProductArtwork'
import { money } from '../lib/orderPayments.mjs'

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
        <ProductArtwork product={product} />
        {soldOut && <span className="sold-out-label">Out of stock</span>}
      </div>
      <div className="product-card-content">
        <div className="product-meta"><span>{product.category || 'snacks'}</span>{product.packSize && <span>{product.packSize}</span>}</div>
        <h3 className="product-name">{product.name}</h3>
        <div className={`product-stock ${!soldOut && available > 0 && available <= 5 ? 'is-low-stock' : ''}`}>{soldOut ? 'Currently out of stock' : available === 0 ? 'All available units in your bag' : available <= 5 ? `Only ${available} left` : 'Ready for pickup'}</div>
        <div className="product-actions">
          <span className="product-price">{money(product.price)}</span>
          <div className="product-control">
            <AnimatePresence initial={false}>
              <ProductCartControl key={inCart ? 'quantity' : 'add'} product={product} inCart={inCart} available={available} soldOut={soldOut} addToCart={addToCart} decrementFromCart={decrementFromCart} />
            </AnimatePresence>
          </div>
        </div>
      </div>
    </article>
  )
}

function ProductCartControl({ product, inCart, available, soldOut, addToCart, decrementFromCart }) {
  const present = useIsPresent()
  const animation = { initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 }, transition: { duration: 0.12 } }
  return inCart ? <motion.div className="quantity-selector" {...animation}>
    <motion.button className="icon-button" whileTap={press} disabled={!present} onClick={() => decrementFromCart(product.id)} aria-label={`Decrease ${product.name} quantity`}><Minus size={15} /></motion.button>
    <span aria-live="polite" aria-label={`${inCart} in cart`}>{inCart}</span>
    <motion.button className="icon-button" whileTap={press} disabled={!present || available === 0} onClick={() => { if (present && available > 0) addToCart(product, 1) }} aria-label={`Increase ${product.name} quantity`}><Plus size={15} /></motion.button>
  </motion.div> : <motion.button className="product-add-button" {...animation} whileTap={press} disabled={!present || soldOut} aria-label={soldOut ? `${product.name} is sold out` : `Add ${product.name} to cart`} onClick={() => { if (present && available > 0) addToCart(product, 1) }}>{soldOut ? 'Sold out' : <><Plus size={14} aria-hidden="true" /> Add</>}</motion.button>
}
