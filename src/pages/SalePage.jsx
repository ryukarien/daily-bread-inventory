import { useEffect, useMemo, useState } from 'react'
import { Minus, Plus, Trash2 } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { getDaySession, getProducts, saveSale } from '../services/localDb'
import { calculateDiscount, discountOptions, money, today } from '../utils/format'

export default function SalePage() {
  const { user } = useAuth()
  const [products, setProducts] = useState([])
  const [cart, setCart] = useState([])
  const [category, setCategory] = useState('All')
  const [saleType, setSaleType] = useState('Regular')
  const [discountType, setDiscountType] = useState('None')
  const [payMethod, setPayMethod] = useState('Cash')
  const [cashEntry, setCashEntry] = useState('')
  const [takenBy, setTakenBy] = useState('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [daySession, setDaySession] = useState(undefined)
  const [dayLoading, setDayLoading] = useState(true)

  async function refresh() { setProducts(await getProducts()) }
  useEffect(() => {
    Promise.all([getProducts(), getDaySession(today())])
      .then(([items, session]) => { setProducts(items); setDaySession(session || null) })
      .catch((e) => setError(e.message))
      .finally(() => setDayLoading(false))
  }, [])

  const categories = useMemo(() => ['All', ...new Set(products.map((product) => product.category))], [products])
  const visibleProducts = products.filter((product) => category === 'All' || product.category === category)
  const { subtotal, discount } = calculateDiscount(cart, discountType)
  const total = Math.max(0, subtotal - discount)
  const amountDue = saleType === 'Regular' ? total : 0
  const cashAmount = payMethod === 'GCash' ? total : Number(cashEntry || 0)
  const gcashAmount = payMethod === 'Cash' ? 0 : payMethod === 'GCash' ? total : Math.max(0, total - cashAmount)

  function addProduct(product) {
    setError('')
    const stockTracked = product.stock !== null && product.stock !== undefined
    if (stockTracked && product.stock <= 0) return
    const existing = cart.find((item) => item.product_id === product.id)
    if (stockTracked && (existing?.qty || 0) >= product.stock) {
      setError(`Not enough stock for ${product.name}.`)
      return
    }
    setCart((items) => existing
      ? items.map((item) => item.product_id === product.id ? { ...item, qty: item.qty + 1 } : item)
      : [...items, { product_id: product.id, name: product.name, price: product.price, qty: 1 }])
  }

  function changeQty(id, delta) {
    const product = products.find((entry) => entry.id === id)
    const stockTracked = product && product.stock !== null && product.stock !== undefined
    if (delta > 0 && (!product || (stockTracked && product.stock <= 0))) {
      setError(product ? `Not enough stock for ${product.name}.` : 'This item is no longer available.')
      return
    }
    if (delta > 0 && stockTracked && cart.find((item) => item.product_id === id)?.qty >= product.stock) {
      setError(`Not enough stock for ${product.name}.`)
      return
    }
    setError('')
    setCart((items) => items.map((item) => item.product_id === id
      ? { ...item, qty: Math.max(0, Math.min(item.qty + delta, product?.stock ?? Infinity)) }
      : item).filter((item) => item.qty > 0))
  }

  async function submitSale() {
    setError('')
    setMessage('')
    if (!daySession || daySession.status !== 'open') return setError('Open the shop day before recording a sale.')
    if (!cart.length) return setError('Add at least one item to the order.')
    if (saleType === 'Regular') {
      if (payMethod === 'Cash' && cashAmount < total) return setError('Cash received must cover the total.')
      if (payMethod === 'GCash + Cash' && !(cashAmount > 0 && cashAmount < total)) return setError('Enter a cash amount above ₱0.00 and below the total.')
    }
    if (saleType === 'Receivable' && !takenBy.trim()) return setError('Enter the name of the person who took the order.')
    setSaving(true)
    try {
      await saveSale({
        date: today(), time: new Date().toISOString(), staff: user.username, type: saleType,
        discount_type: saleType === 'Regular' ? discountType : 'None',
        subtotal, discount: saleType === 'Regular' ? discount : 0,
        total: amountDue,
        pay_method: saleType === 'Regular' ? payMethod : '', cash: saleType === 'Regular' ? cashAmount : 0,
        gcash: saleType === 'Regular' ? gcashAmount : 0, taken_by: saleType === 'Receivable' ? takenBy.trim() : '',
        voided: false, items: cart,
      })
      setCart([])
      setCashEntry('')
      setTakenBy('')
      setDiscountType('None')
      setMessage('Sale saved. Ready for the next customer!')
      await refresh()
    } catch (saveError) {
      setError(saveError.message || 'Could not save this sale.')
      await refresh()
    } finally { setSaving(false) }
  }

  if (dayLoading) return <div className="panel empty-state">Checking today's opening…</div>
  if (!daySession || daySession.status !== 'open') return (
    <div className="day-required panel">
      <img src="./logo.svg" alt="" className="day-required-logo" />
      <p className="eyebrow">BEFORE THE FIRST SALE</p>
      <h1>{daySession?.status === 'closed' ? 'Today is closed' : 'Open the shop day'}</h1>
      <p className="muted">{daySession?.status === 'closed' ? 'This shop day has been closed. Sales can’t be added.' : 'Enter the starting change money and count the bread on hand. Then you can start recording sales.'}</p>
      {!daySession && <Link className="button button-primary" to="/day">Start day setup</Link>}
      {daySession?.status === 'closed' && <Link className="button button-primary" to="/report">View today’s report</Link>}
    </div>
  )

  return (
    <div className="content-page">
      <div className="page-heading"><div><p className="eyebrow">DAILY BREAD COUNTER</p><h1>New sale</h1><p className="muted">Tap a bread to add it to this customer's order.</p></div><div className="date-chip">{new Date().toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}</div></div>
      {message && <div className="success-banner" role="status">{message}</div>}
      {error && <div className="error-banner" role="alert">{error}</div>}
      <div className="sale-layout">
        <section className="panel product-panel">
          <div className="panel-title"><h2>Choose bread</h2><span>{visibleProducts.length} items</span></div>
          <div className="category-tabs" role="tablist" aria-label="Product categories">
            {categories.map((name) => <button key={name} type="button" onClick={() => setCategory(name)} className={`category-tab ${category === name ? 'selected' : ''}`}>{name}</button>)}
          </div>
          <div className="product-grid">
            {visibleProducts.map((product) => {
              const stockTracked = product.stock !== null && product.stock !== undefined
              const qtyInCart = cart.find((item) => item.product_id === product.id)?.qty || 0
              const available = stockTracked ? Math.max(0, product.stock - qtyInCart) : null
              const soldOut = available === 0
              return <button type="button" key={product.id} className="product-card" disabled={soldOut} onClick={() => addProduct(product)}>
                <span className="product-name">{product.name}</span><strong>{money(product.price)}</strong>
                <span className={soldOut ? 'stock sold-out' : 'stock'}>{stockTracked ? soldOut ? 'Sold out' : `${available} left` : 'Stock not tracked'}</span>
              </button>
            })}
            {!visibleProducts.length && <div className="empty-state">No items in this category yet.</div>}
          </div>
        </section>
        <aside className="panel order-panel">
          <div className="panel-title"><h2>Customer's order</h2><span>{cart.reduce((sum, item) => sum + item.qty, 0)} pcs</span></div>
          <div className="cart-list">
            {cart.map((item) => {
              const product = products.find((entry) => entry.id === item.product_id)
              const stockTracked = product?.stock !== null && product?.stock !== undefined
              const stockLimitReached = !product || (stockTracked && item.qty >= product.stock)
              return <div className="cart-row" key={item.product_id}>
                <div className="cart-item-name">{item.name}<span>{money(item.price)} each</span></div>
                <div className="quantity-control"><button aria-label={`Remove one ${item.name}`} type="button" onClick={() => changeQty(item.product_id, -1)}><Minus size={16} /></button><strong>{item.qty}</strong><button aria-label={`Add one ${item.name}`} type="button" disabled={stockLimitReached} onClick={() => changeQty(item.product_id, 1)}><Plus size={16} /></button></div>
              </div>
            })}
            {!cart.length && <div className="empty-state cart-empty"><div className="bread-emoji" aria-hidden="true">🥖</div>Your order is empty.<br />Choose bread to get started.</div>}
          </div>
          {!!cart.length && <button className="text-button clear-cart" type="button" onClick={() => setCart([])}><Trash2 size={16} /> Clear order</button>}
          <div className="sale-options">
            <label>Sale type<select value={saleType} onChange={(event) => { setSaleType(event.target.value); setError('') }}><option>Regular</option><option>Promotional</option><option>Receivable</option></select></label>
            {saleType === 'Regular' && <>
              <label>Discount<select value={discountType} onChange={(event) => setDiscountType(event.target.value)}>{discountOptions.map((option) => <option key={option}>{option}</option>)}</select></label>
              <label>Payment method<select value={payMethod} onChange={(event) => setPayMethod(event.target.value)}><option>Cash</option><option>GCash</option><option>GCash + Cash</option></select></label>
              {(payMethod === 'Cash' || payMethod === 'GCash + Cash') && <label>Cash received{payMethod === 'GCash + Cash' && <small className="hint">GCash remainder: {money(gcashAmount)}</small>}<input type="number" min="0" step="0.01" value={cashEntry} onChange={(event) => setCashEntry(event.target.value)} placeholder="₱0.00" inputMode="decimal" /></label>}
              {payMethod === 'Cash' && <div className="change-row">Change <strong>{money(Math.max(0, cashAmount - total))}</strong></div>}
            </>}
            {saleType === 'Receivable' && <label>Taken by<input value={takenBy} onChange={(event) => setTakenBy(event.target.value)} placeholder="Enter person's name" /></label>}
          </div>
          <div className="totals">
            <div><span>Subtotal</span><strong>{money(subtotal)}</strong></div>
            {saleType === 'Regular' && <div><span>Discount{discountType !== 'None' ? ` · ${discountType}` : ''}</span><strong className="discount-value">− {money(discount)}</strong></div>}
            {saleType !== 'Regular' && <div><span>Order value (not charged)</span><strong>{money(subtotal)}</strong></div>}
            <div className="grand-total"><span>{saleType === 'Regular' ? 'Total due' : 'Amount due'}</span><strong>{money(amountDue)}</strong></div>
          </div>
          <button className="button button-primary save-sale" type="button" onClick={submitSale} disabled={saving || !cart.length}>{saving ? 'Saving sale…' : 'Save sale'}</button>
        </aside>
      </div>
    </div>
  )
}
