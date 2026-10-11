import { useState } from 'react'
import { ShoppingBag } from 'lucide-react'

export default function ProductArtwork({ product, eager = false }) {
  const source = product.imageUrl || product.image
  const [failedSource, setFailedSource] = useState(null)
  const showImage = source && source !== failedSource

  return <>
    {showImage ? <img
      src={source}
      alt={product.name}
      className="product-image"
      loading={eager ? 'eager' : 'lazy'}
      decoding="async"
      onError={() => setFailedSource(source)}
    /> : product.demoLabel ? <div className="demo-package" style={{ '--pack-color': product.packColor || 'var(--brand-orange)' }}>
      <span className="pack-brand">{product.demoBrand}</span>
      <strong>{product.demoLabel}</strong>
      <span className="pack-circle" />
      <span className="pack-flavour">{product.demoFlavour}</span>
    </div> : <div className="product-image-fallback" aria-label={`No photo available for ${product.name}`}>
      <span className="product-fallback-icon"><ShoppingBag size={32} strokeWidth={1.3} aria-hidden="true" /></span>
      <span className="product-fallback-wordmark" aria-hidden="true">snackshop.</span>
      <small>Photo coming soon</small>
    </div>}
    {product.demoLabel && !showImage && <span className="demo-art-label">ILLUSTRATION</span>}
  </>
}
