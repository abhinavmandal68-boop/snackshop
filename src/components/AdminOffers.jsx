import { useRef, useState } from 'react'
import { Plus, Pencil, Pause, Play, Trash2, Tag } from 'lucide-react'
import toast from 'react-hot-toast'
import useOffers from '../hooks/useOffers'
import { shopApi } from '../lib/shopApi'
import { money } from '../lib/orderPayments.mjs'

const newOffer = () => ({ id: crypto.randomUUID(), name: '', baseProductId: '', pairedProductIds: [], discount: '5', active: false, paymentMethod: 'upi' })

export default function AdminOffers({ products, productLoadStatus, loadProducts }) {
  const { offers, status, retry } = useOffers()
  const [form, setForm] = useState(null)
  const [search, setSearch] = useState('')
  const [busy, setBusy] = useState(false)
  const lock = useRef(false)
  const sortedProducts = [...products].sort((a, b) => a.name.localeCompare(b.name))
  const selectable = sortedProducts.filter(product => product.id !== form?.baseProductId && product.name.toLowerCase().includes(search.trim().toLowerCase()))

  const mutate = async (action, data, message, onSuccess) => {
    if (lock.current) return
    lock.current = true; setBusy(true)
    try { await shopApi(action, data); toast.success(message); onSuccess?.() }
    catch (err) { toast.error(err.message) }
    finally { lock.current = false; setBusy(false) }
  }
  const edit = offer => { setForm({ ...offer, pairedProductIds: [...offer.pairedProductIds], discount: String(offer.discount) }); setSearch('') }

  return <section className="admin-offers">
    <div className="monthly-reports-toolbar"><div><h2>Offers</h2><p>Create combo discounts for prepaid Razorpay orders. Cash orders pay regular prices.</p></div>
      <button type="button" className="monthly-report-button" disabled={busy || status !== 'ready' || productLoadStatus !== 'ready'} onClick={() => { setForm(newOffer()); setSearch('') }}><Plus size={15} /> Create offer</button>
    </div>
    <p className="offer-policy">Each pair uses 1 base snack + 1 eligible companion. The discount repeats for every matching pair. The best offer applies per order; offers do not stack.</p>
    {status === 'loading' && <p role="status">Loading offers…</p>}
    {status === 'error' && <p role="alert">Could not load offers. <button type="button" className="monthly-report-button" onClick={retry}>Retry</button></p>}
    {productLoadStatus === 'loading' && <p role="status">Loading products…</p>}
    {productLoadStatus === 'error' && <p role="alert">Could not load products. <button type="button" className="monthly-report-button" onClick={() => loadProducts(true)}>Retry products</button></p>}
    {form && <form className="offer-form" onSubmit={event => {
      event.preventDefault()
      mutate('saveOffer', { offer: { ...form, discount: Number(form.discount) } }, 'Offer saved', () => setForm(null))
    }}>
      <h3>{offers.some(offer => offer.id === form.id) ? 'Edit offer' : 'New combo offer'}</h3>
      <fieldset disabled={busy}>
        <label>Offer name<input required maxLength={80} value={form.name} onChange={event => setForm({ ...form, name: event.target.value })} placeholder="Kurkure + chocolate combo" /></label>
        <div className="offer-form-row">
          <label>Buy 1 of this snack<select required value={form.baseProductId} onChange={event => setForm({ ...form, baseProductId: event.target.value, pairedProductIds: form.pairedProductIds.filter(id => id !== event.target.value) })}>
            <option value="">Choose base snack</option>{sortedProducts.map(product => <option key={product.id} value={product.id}>{product.name} · {money(product.price)}</option>)}
          </select></label>
          <label>Discount per pair (₹)<input required type="number" min="0.01" max="50000" step="0.01" value={form.discount} onChange={event => setForm({ ...form, discount: event.target.value })} /></label>
        </div>
        <div className="offer-companions"><strong>Pair with any 1 of these snacks</strong><p>Select every eligible alternative, for example Chocopie, Chocobakes and Bon V Bon.</p>
          <input type="search" aria-label="Search companion snacks" placeholder="Search products…" value={search} onChange={event => setSearch(event.target.value)} />
          <div className="offer-product-picker">{selectable.map(product => <label key={product.id} className="offer-checkbox"><input type="checkbox" checked={form.pairedProductIds.includes(product.id)} disabled={!form.pairedProductIds.includes(product.id) && form.pairedProductIds.length >= 50} onChange={event => setForm({ ...form, pairedProductIds: event.target.checked ? [...form.pairedProductIds, product.id] : form.pairedProductIds.filter(id => id !== product.id) })} /><span>{product.name}</span><small>{money(product.price)}</small></label>)}
            {!selectable.length && <p>No matching products.</p>}
          </div><small>{form.pairedProductIds.length} companion{form.pairedProductIds.length === 1 ? '' : 's'} selected</small>
        </div>
        <label className="offer-checkbox"><input type="checkbox" checked={form.active} onChange={event => setForm({ ...form, active: event.target.checked })} /><span>Enable this offer now</span></label>
        <div className="offer-actions"><button type="submit" className="monthly-report-button" disabled={!form.baseProductId || !form.pairedProductIds.length}>{busy ? 'Saving…' : 'Save offer'}</button><button type="button" className="monthly-report-button" onClick={() => setForm(null)}>Cancel</button></div>
      </fieldset>
    </form>}
    <div className="offer-list">{offers.map(offer => <article className="offer-card" key={offer.id}>
      <div className="offer-card-heading"><h3><Tag size={17} aria-hidden="true" /> {offer.name}</h3><span className={`offer-status ${offer.active ? 'is-active' : ''}`}>{offer.active ? 'Active' : 'Paused'} · Prepaid only</span></div>
      <p>Buy 1 <strong>{offer.baseProductName}</strong> + 1 <strong>{offer.pairedProductNames.join(' / ')}</strong></p>
      <strong className="offer-saving">Save {money(offer.discount)} per pair</strong>
      <div className="offer-actions">
        <button type="button" className="monthly-report-button" disabled={busy || productLoadStatus !== 'ready'} onClick={() => edit(offer)}><Pencil size={13} /> Edit</button>
        <button type="button" className="monthly-report-button" disabled={busy} onClick={() => mutate('saveOffer', { offer: { ...offer, active: !offer.active } }, offer.active ? 'Offer paused' : 'Offer enabled')}>{offer.active ? <Pause size={13} /> : <Play size={13} />} {offer.active ? 'Pause' : 'Enable'}</button>
        <button type="button" className="order-delete-button" disabled={busy} onClick={() => { if (confirm(`Delete “${offer.name}”? Existing orders keep their saved discount.`)) mutate('deleteOffer', { offerId: offer.id }, 'Offer deleted', () => { if (form?.id === offer.id) setForm(null) }) }}><Trash2 size={13} /> Delete</button>
      </div>
    </article>)}</div>
    {status === 'ready' && !offers.length && !form && <div className="loans-empty">No offers yet. Choose Create offer to set up your first prepaid combo.</div>}
  </section>
}
