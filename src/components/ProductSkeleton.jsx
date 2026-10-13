export default function ProductSkeleton() {
  return <div className="product-skeleton" aria-hidden="true">
    <div className="product-image-container product-skeleton-image" />
    <div className="product-skeleton-content">
      <span className="skeleton-line skeleton-line-short" />
      <span className="skeleton-line" />
      <span className="skeleton-line skeleton-line-short" />
      <div className="product-skeleton-actions"><span className="skeleton-line" /><span className="skeleton-button" /></div>
    </div>
  </div>
}
