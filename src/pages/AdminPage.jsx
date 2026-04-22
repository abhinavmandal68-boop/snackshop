import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, Edit2, Trash2, Check, X, LogOut, Package, MessageSquare, ShoppingBag, RefreshCw } from 'lucide-react'
import toast from 'react-hot-toast'
import {
  collection, onSnapshot, addDoc, updateDoc, deleteDoc,
  doc, orderBy, query, serverTimestamp, runTransaction
} from 'firebase/firestore'
import { signOut, onAuthStateChanged } from 'firebase/auth'
import { db, auth } from '../lib/firebase'

const CATEGORIES = ['chips', 'biscuits']

function StatCard({ label, value, color }) {
  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '16px 20px' }}>
      <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 6 }}>{label}</div>
      <div style={{ fontFamily: 'Syne', fontWeight: 800, fontSize: 26, color: color || 'var(--accent)' }}>{value}</div>
    </div>
  )
}

export default function AdminPage() {
  const navigate = useNavigate()
  const [tab, setTab] = useState('products')
  const [products, setProducts] = useState([])
  const [orders, setOrders] = useState([])
  const [requests, setRequests] = useState([])
  const [editingId, setEditingId] = useState(null)
  const [editData, setEditData] = useState({})
  const [adding, setAdding] = useState(false)
  const [newProduct, setNewProduct] = useState({ name: '', category: 'chips', price: '', stock: '' })

  useEffect(() => {
    // Auth guard
    const unsub = onAuthStateChanged(auth, user => { if (!user) navigate('/admin') })

    // Real-time products
    const pUnsub = onSnapshot(query(collection(db, 'products'), orderBy('category'), orderBy('name')), snap => {
      setProducts(snap.docs.map(d => ({ id: d.id, ...d.data() })))
    })

    // Real-time orders
    const oUnsub = onSnapshot(query(collection(db, 'orders'), orderBy('createdAt', 'desc')), snap => {
      const newOrders = snap.docs.map(d => ({ id: d.id, ...d.data() }))
      // Show toast for new utr_submitted orders
      snap.docChanges().forEach(change => {
        if (change.type === 'modified' && change.doc.data().status === 'utr_submitted') {
          toast(`Payment submitted by ${change.doc.data().customerName}!`, { icon: '💰' })
        }
        if (change.type === 'added' && change.doc.data().status === 'utr_submitted') {
          toast(`Payment submitted by ${change.doc.data().customerName}!`, { icon: '💰' })
        }
      })
      setOrders(newOrders)
    })

    // Real-time requests
    const rUnsub = onSnapshot(query(collection(db, 'requests'), orderBy('createdAt', 'desc')), snap => {
      snap.docChanges().forEach(change => {
        if (change.type === 'added' && change.doc.data().resolved === false) {
          const data = change.doc.data()
          if (data.createdAt) toast(`New request from ${data.customerName}`, { icon: '💬' })
        }
      })
      setRequests(snap.docs.map(d => ({ id: d.id, ...d.data() })))
    })

    return () => { unsub(); pUnsub(); oUnsub(); rUnsub() }
  }, [])

  const handleLogout = async () => { await signOut(auth); navigate('/admin') }

  const saveEdit = async (id) => {
    await updateDoc(doc(db, 'products', id), {
      name: editData.name,
      category: editData.category,
      price: Number(editData.price),
      stock: Number(editData.stock),
      stockMax: Number(editData.stock),
    })
    toast.success('Product updated')
    setEditingId(null)
  }

  const deleteProduct = async (id) => {
    if (!confirm('Delete this product?')) return
    await deleteDoc(doc(db, 'products', id))
    toast.success('Deleted')
  }

  const addProduct = async () => {
    if (!newProduct.name || !newProduct.price || !newProduct.stock) { toast.error('Fill all fields'); return }
    await addDoc(collection(db, 'products'), {
      name: newProduct.name,
      category: newProduct.category,
      price: Number(newProduct.price),
      stock: Number(newProduct.stock),
      stockMax: Number(newProduct.stock),
    })
    toast.success('Product added!')
    setAdding(false)
    setNewProduct({ name: '', category: 'chips', price: '', stock: '' })
  }

  const restockProduct = async (id) => {
    const val = prompt('Set new stock quantity:')
    if (val === null || isNaN(Number(val))) return
    await updateDoc(doc(db, 'products', id), { stock: Number(val), stockMax: Number(val) })
    toast.success('Stock updated')
  }

  // Mark order paid AND deduct stock atomically
  const markAsPaid = async (order) => {
    try {
      await runTransaction(db, async (transaction) => {
        // Update order status
        transaction.update(doc(db, 'orders', order.id), { status: 'paid' })
        // Deduct stock for each item
        for (const item of (order.items || [])) {
          const productRef = doc(db, 'products', item.productId)
          const productSnap = await transaction.get(productRef)
          if (productSnap.exists()) {
            const currentStock = productSnap.data().stock || 0
            const newStock = Math.max(0, currentStock - item.qty)
            transaction.update(productRef, { stock: newStock })
          }
        }
      })
      toast.success(`✓ Confirmed! Stock updated for ${order.customerName}`)
    } catch (err) {
      console.error(err)
      toast.error('Failed to confirm order')
    }
  }

  const markAsCancelled = async (orderId) => {
    await updateDoc(doc(db, 'orders', orderId), { status: 'cancelled' })
    toast('Order cancelled')
  }

  const markRequestDone = async (id) => {
    await updateDoc(doc(db, 'requests', id), { resolved: true })
  }

  const tabs = [
    { id: 'products', label: 'Products', icon: Package },
    { id: 'orders', label: 'Orders', icon: ShoppingBag },
    { id: 'requests', label: 'Requests', icon: MessageSquare },
  ]

  const totalRevenue = orders.filter(o => o.status === 'paid').reduce((s, o) => s + (o.total || 0), 0)
  const pendingReqs = requests.filter(r => !r.resolved).length
  const pendingPayments = orders.filter(o => o.status === 'utr_submitted').length

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)' }}>
      <header style={{ background: 'var(--surface)', borderBottom: '1px solid var(--border)', position: 'sticky', top: 0, zIndex: 30 }}>
        <div style={{ maxWidth: 900, margin: '0 auto', padding: '0 16px', height: 58, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 20 }}>🛒</span>
            <span style={{ fontFamily: 'Syne', fontWeight: 800, fontSize: 18 }}>SnackShop</span>
            <span style={{ fontSize: 11, color: 'var(--accent)', background: 'var(--accent-dim)', padding: '2px 8px', borderRadius: 100, fontWeight: 600 }}>ADMIN</span>
          </div>
          <button onClick={handleLogout} style={{ background: 'var(--danger-dim)', border: '1px solid rgba(255,92,92,0.2)', borderRadius: 8, padding: '6px 12px', color: 'var(--danger)', display: 'flex', alignItems: 'center', gap: 4, fontSize: 13 }}>
            <LogOut size={13} /> Logout
          </button>
        </div>
      </header>

      <div style={{ maxWidth: 900, margin: '0 auto', padding: '24px 16px' }}>
        {/* Stats */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12, marginBottom: 28 }}>
          <StatCard label="Total products" value={products.length} />
          <StatCard label="Paid orders" value={orders.filter(o => o.status === 'paid').length} color="var(--success)" />
          <StatCard label="Revenue" value={`₹${totalRevenue}`} color="var(--accent)" />
          <StatCard label="Awaiting verify" value={pendingPayments} color={pendingPayments > 0 ? 'var(--warning)' : 'var(--text-secondary)'} />
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
          {tabs.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)} style={{ padding: '8px 18px', borderRadius: 100, fontSize: 13, fontFamily: 'Syne', fontWeight: 600, background: tab === t.id ? 'var(--accent)' : 'var(--surface)', color: tab === t.id ? 'var(--accent-text)' : 'var(--text-secondary)', border: tab === t.id ? 'none' : '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 6 }}>
              <t.icon size={13} />
              {t.label}
              {t.id === 'orders' && pendingPayments > 0 && (
                <span style={{ background: 'var(--warning)', color: 'white', borderRadius: 100, width: 18, height: 18, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700 }}>{pendingPayments}</span>
              )}
              {t.id === 'requests' && pendingReqs > 0 && (
                <span style={{ background: 'var(--danger)', color: 'white', borderRadius: 100, width: 18, height: 18, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700 }}>{pendingReqs}</span>
              )}
            </button>
          ))}
        </div>

        {/* PRODUCTS TAB */}
        {tab === 'products' && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 14 }}>
              <button onClick={() => setAdding(a => !a)} style={{ padding: '9px 18px', background: 'var(--accent)', color: 'var(--accent-text)', borderRadius: 10, fontFamily: 'Syne', fontWeight: 700, fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}>
                <Plus size={14} /> Add product
              </button>
            </div>

            {adding && (
              <div style={{ background: 'var(--surface)', border: '1px solid var(--accent)', borderRadius: 'var(--radius)', padding: 16, marginBottom: 16 }}>
                <p style={{ fontFamily: 'Syne', fontWeight: 700, marginBottom: 12, fontSize: 14, color: 'var(--accent)' }}>New product</p>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 10 }}>
                  <input value={newProduct.name} onChange={e => setNewProduct(p => ({ ...p, name: e.target.value }))} placeholder="Name" />
                  <select value={newProduct.category} onChange={e => setNewProduct(p => ({ ...p, category: e.target.value }))}>
                    {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                  <input type="number" value={newProduct.price} onChange={e => setNewProduct(p => ({ ...p, price: e.target.value }))} placeholder="Price (₹)" />
                  <input type="number" value={newProduct.stock} onChange={e => setNewProduct(p => ({ ...p, stock: e.target.value }))} placeholder="Stock qty" />
                </div>
                <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                  <button onClick={addProduct} style={{ padding: '8px 20px', background: 'var(--accent)', color: 'var(--accent-text)', borderRadius: 8, fontFamily: 'Syne', fontWeight: 700, fontSize: 13, display: 'flex', alignItems: 'center', gap: 4 }}>
                    <Check size={13} /> Save
                  </button>
                  <button onClick={() => setAdding(false)} style={{ padding: '8px 14px', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text-secondary)', fontSize: 13 }}>
                    Cancel
                  </button>
                </div>
              </div>
            )}

            <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', overflow: 'hidden' }}>
              {products.length === 0 && <div style={{ padding: 32, textAlign: 'center', color: 'var(--text-hint)', fontSize: 14 }}>No products yet — add your first one!</div>}
              {products.map((p, i) => (
                <div key={p.id} style={{ padding: '14px 16px', borderBottom: i < products.length - 1 ? '1px solid var(--border)' : 'none', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                  {editingId === p.id ? (
                    <>
                      <input value={editData.name} onChange={e => setEditData(d => ({ ...d, name: e.target.value }))} style={{ flex: 2, minWidth: 100, fontSize: 13 }} />
                      <select value={editData.category} onChange={e => setEditData(d => ({ ...d, category: e.target.value }))} style={{ flex: 1, minWidth: 90 }}>
                        {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                      </select>
                      <input type="number" value={editData.price} onChange={e => setEditData(d => ({ ...d, price: e.target.value }))} style={{ width: 80 }} placeholder="₹" />
                      <input type="number" value={editData.stock} onChange={e => setEditData(d => ({ ...d, stock: e.target.value }))} style={{ width: 70 }} placeholder="Qty" />
                      <button onClick={() => saveEdit(p.id)} style={{ background: 'var(--success-dim)', border: 'none', borderRadius: 6, padding: 6, color: 'var(--success)', display: 'flex' }}><Check size={14} /></button>
                      <button onClick={() => setEditingId(null)} style={{ background: 'var(--surface2)', border: 'none', borderRadius: 6, padding: 6, color: 'var(--text-secondary)', display: 'flex' }}><X size={14} /></button>
                    </>
                  ) : (
                    <>
                      <div style={{ flex: 2, minWidth: 100 }}>
                        <div style={{ fontWeight: 500, fontSize: 14 }}>{p.name}</div>
                        <div style={{ fontSize: 11, color: 'var(--text-hint)', textTransform: 'capitalize', marginTop: 2 }}>{p.category}</div>
                      </div>
                      <div style={{ fontFamily: 'Syne', fontWeight: 700, color: 'var(--accent)', minWidth: 50 }}>₹{p.price}</div>
                      <span style={{ padding: '3px 10px', borderRadius: 100, fontSize: 12, fontWeight: 600, background: p.stock === 0 ? 'var(--danger-dim)' : p.stock <= 3 ? 'var(--warning-dim)' : 'var(--success-dim)', color: p.stock === 0 ? 'var(--danger)' : p.stock <= 3 ? 'var(--warning)' : 'var(--success)', minWidth: 60, textAlign: 'center' }}>
                        {p.stock} left
                      </span>
                      <button onClick={() => restockProduct(p.id)} style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 6, padding: '4px 10px', color: 'var(--text-secondary)', fontSize: 12 }}>Restock</button>
                      <button onClick={() => { setEditingId(p.id); setEditData(p) }} style={{ background: 'var(--surface2)', border: 'none', borderRadius: 6, padding: 6, color: 'var(--text-secondary)', display: 'flex' }}><Edit2 size={13} /></button>
                      <button onClick={() => deleteProduct(p.id)} style={{ background: 'var(--danger-dim)', border: 'none', borderRadius: 6, padding: 6, color: 'var(--danger)', display: 'flex' }}><Trash2 size={13} /></button>
                    </>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ORDERS TAB */}
        {tab === 'orders' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {orders.length === 0 && <div style={{ padding: 32, textAlign: 'center', color: 'var(--text-hint)', fontSize: 14, background: 'var(--surface)', borderRadius: 'var(--radius)', border: '1px solid var(--border)' }}>No orders yet</div>}
            {orders.map(o => {
              const needsAction = o.status === 'utr_submitted'
              return (
                <div key={o.id} style={{ background: 'var(--surface)', border: `1px solid ${needsAction ? 'rgba(245,200,66,0.35)' : 'var(--border)'}`, borderRadius: 'var(--radius)', padding: '14px 16px', position: 'relative' }}>
                  {needsAction && (
                    <div style={{ position: 'absolute', top: -9, left: 14, background: 'var(--accent)', color: 'var(--accent-text)', fontSize: 10, fontWeight: 700, padding: '2px 10px', borderRadius: 100, fontFamily: 'Syne' }}>
                      VERIFY PAYMENT
                    </div>
                  )}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 3 }}>{o.customerName}</div>
                      <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4 }}>
                        {(o.items || []).map(item => `${item.name} ×${item.qty}`).join(', ')}
                      </div>
                      {o.utr && (
                        <div style={{ fontSize: 11, background: 'var(--surface2)', borderRadius: 6, padding: '3px 8px', display: 'inline-block', fontFamily: 'monospace', color: 'var(--text-secondary)', marginBottom: 4 }}>
                          UTR: {o.utr}
                        </div>
                      )}
                      <div style={{ fontSize: 11, color: 'var(--text-hint)' }}>
                        {o.createdAt?.toDate?.()?.toLocaleString('en-IN') || '—'}
                      </div>
                    </div>
                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                      <div style={{ fontFamily: 'Syne', fontWeight: 700, fontSize: 16, marginBottom: 5 }}>₹{o.total}</div>
                      <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 100, display: 'block', background: o.status === 'paid' ? 'var(--success-dim)' : o.status === 'cancelled' ? 'var(--danger-dim)' : o.status === 'utr_submitted' ? 'var(--accent-dim)' : 'var(--warning-dim)', color: o.status === 'paid' ? 'var(--success)' : o.status === 'cancelled' ? 'var(--danger)' : o.status === 'utr_submitted' ? 'var(--accent)' : 'var(--warning)' }}>
                        {o.status === 'utr_submitted' ? 'awaiting verify' : o.status}
                      </span>
                    </div>
                  </div>
                  {needsAction && (
                    <div style={{ display: 'flex', gap: 8, marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--border)' }}>
                      <button onClick={() => markAsPaid(o)} style={{ flex: 1, padding: 9, background: 'var(--success)', border: 'none', borderRadius: 8, color: 'white', fontFamily: 'Syne', fontWeight: 700, fontSize: 13 }}>
                        ✓ Mark as Paid — deduct stock
                      </button>
                      <button onClick={() => markAsCancelled(o.id)} style={{ padding: '9px 14px', background: 'var(--danger-dim)', border: 'none', borderRadius: 8, color: 'var(--danger)', fontSize: 13 }}>
                        ✗ Reject
                      </button>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}

        {/* REQUESTS TAB */}
        {tab === 'requests' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {requests.length === 0 && <div style={{ padding: 32, textAlign: 'center', color: 'var(--text-hint)', fontSize: 14, background: 'var(--surface)', borderRadius: 'var(--radius)', border: '1px solid var(--border)' }}>No requests yet</div>}
            {requests.map(r => (
              <div key={r.id} style={{ background: 'var(--surface)', border: `1px solid ${r.resolved ? 'var(--border)' : 'rgba(245,200,66,0.2)'}`, borderRadius: 'var(--radius)', padding: '14px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', opacity: r.resolved ? 0.55 : 1 }}>
                <div>
                  <div style={{ fontWeight: 500, fontSize: 14, marginBottom: 4 }}>{r.customerName}</div>
                  <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{r.message}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-hint)', marginTop: 6 }}>
                    {r.createdAt?.toDate?.()?.toLocaleString('en-IN') || '—'}
                  </div>
                </div>
                {!r.resolved && (
                  <button onClick={() => markRequestDone(r.id)} style={{ background: 'var(--success-dim)', border: 'none', borderRadius: 8, padding: '6px 12px', color: 'var(--success)', fontSize: 12, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4, whiteSpace: 'nowrap' }}>
                    <Check size={12} /> Done
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
