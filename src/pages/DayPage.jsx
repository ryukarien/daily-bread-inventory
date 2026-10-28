import { useEffect, useMemo, useState } from 'react'
import { CheckCircle2 } from 'lucide-react'
import { useAuth } from '../hooks/useAuth'
import { closeDay, getDailyStock, getDaySession, getProducts, getTransactions, startDay } from '../services/localDb'
import { money, today } from '../utils/format'

export default function DayPage() {
  const { user } = useAuth()
  const date = today()
  const [products, setProducts] = useState([])
  const [stock, setStock] = useState([])
  const [sales, setSales] = useState([])
  const [session, setSession] = useState(null)
  const [openingCash, setOpeningCash] = useState('')
  const [closingCash, setClosingCash] = useState('')
  const [stockCounts, setStockCounts] = useState({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  async function load() {
    setLoading(true)
    setError('')
    try {
      const [items, daySession, dayStock, allSales] = await Promise.all([
        getProducts(), getDaySession(date), getDailyStock(date), getTransactions(),
      ])
      setProducts(items.sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name)))
      setSession(daySession || null)
      setStock(dayStock)
      setSales(allSales.filter((sale) => sale.date === date && !sale.voided))
      if (!daySession) setStockCounts(Object.fromEntries(items.map((item) => [item.id, ''])))
    } catch (loadError) {
      setError(loadError.message || 'Could not load today’s day setup.')
    } finally { setLoading(false) }
  }

  useEffect(() => { load() }, [date])

  const paidCash = sales.filter((sale) => sale.type === 'Regular')
    .reduce((sum, sale) => sum + Math.min(Number(sale.cash || 0), Number(sale.total || 0)), 0)
  const expectedCash = (session?.opening_cash || 0) + paidCash
  const remaining = useMemo(() => new Map(stock.map((item) => [item.product_id, item.stock_left])), [stock])

  async function openShopDay(event) {
    event.preventDefault()
    const opening = Number(openingCash)
    if (openingCash.trim() === '' || !Number.isFinite(opening) || opening < 0) {
      setError('Enter the starting change money amount. Use 0.00 if you have no starting cash.')
      return
    }
    for (const product of products) {
      const quantity = stockCounts[product.id] ?? ''
      if (quantity !== '' && (!Number.isInteger(Number(quantity)) || Number(quantity) < 0)) {
        setError(`Enter a whole-number starting count for ${product.name}, or leave it blank to keep stock untracked.`)
        return
      }
    }
    setSaving(true)
    setError('')
    try {
      await startDay({
        date,
        opening_cash: opening,
        opened_by: user.username,
        stockCounts: products.map((product) => ({
          ...product,
          stock: stockCounts[product.id] === '' || stockCounts[product.id] === undefined
            ? null
            : Number(stockCounts[product.id]),
        })),
      })
      setMessage('Shop day opened. Starting cash and bread counts are saved.')
      await load()
    } catch (openError) {
      setError(openError.message || 'Could not open the shop day.')
    } finally { setSaving(false) }
  }

  async function endShopDay(event) {
    event.preventDefault()
    if (closingCash.trim() === '' || !Number.isFinite(Number(closingCash)) || Number(closingCash) < 0) {
      setError('Enter the cash actually counted in the drawer to end the day.')
      return
    }
    if (!window.confirm('End today’s shop day? New sales will be blocked until tomorrow.')) return
    setSaving(true)
    setError('')
    try {
      await closeDay({ date, closing_cash: Number(closingCash), closed_by: user.username })
      setMessage('Day ended. Your ending cash and remaining bread are saved.')
      await load()
    } catch (closeError) {
      setError(closeError.message || 'Could not end the shop day.')
    } finally { setSaving(false) }
  }

  if (loading) return <div className="panel empty-state">Loading day setup…</div>

  return (
    <div className="content-page">
      <div className="page-heading">
        <div><p className="eyebrow">OPENING &amp; CLOSING CHECKLIST</p><h1>Shop day</h1><p className="muted">{new Date(`${date}T12:00:00`).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}</p></div>
        <span className={`status-chip ${session?.status === 'open' ? 'status-open' : session?.status === 'closed' ? 'status-closed' : ''}`}>{session?.status === 'open' ? 'Day is open' : session?.status === 'closed' ? 'Day ended' : 'Not started'}</span>
      </div>
      {message && <div className="success-banner" role="status">{message}</div>}
      {error && <div className="error-banner" role="alert">{error}</div>}

      {!session && <form className="panel day-open-form" onSubmit={openShopDay}>
        <div className="panel-title"><div><h2>Before opening</h2><p className="muted">Count the change money. Add a bread count only for items you want to track today.</p></div></div>
        <label className="opening-cash-field">Starting change money <span className="hint">Cash already in the drawer before the first customer.</span><div className="currency-input"><span>₱</span><input aria-label="Starting change money" type="number" min="0" step="0.01" value={openingCash} onChange={(event) => setOpeningCash(event.target.value)} placeholder="0.00" inputMode="decimal" /></div></label>
        <div className="panel-title stock-count-title"><div><h2>Bread ready to sell</h2><p className="muted">Enter a count to track an item today. Leave it blank to keep its stock untracked, or enter 0 if sold out.</p></div><span>{products.length} items</span></div>
        <div className="opening-stock-list">{products.map((product) => <label className="opening-stock-row" key={product.id}>
          <span><strong>{product.name}</strong><small>{product.category} · {money(product.price)}</small></span>
          <span className="quantity-entry"><input aria-label={`${product.name} starting quantity`} type="number" min="0" step="1" value={stockCounts[product.id] ?? ''} onChange={(event) => setStockCounts((counts) => ({ ...counts, [product.id]: event.target.value }))} inputMode="numeric" placeholder="Not tracked" /><span>pcs</span></span>
        </label>)}</div>
        <button className="button button-primary day-submit" type="submit" disabled={saving}>{saving ? 'Opening day…' : 'Save counts & open day'}</button>
      </form>}

      {session && <>
        <section className="day-money-grid">
          <article className="summary-card"><span>Starting change money</span><strong>{money(session.opening_cash)}</strong><small>Counted by {session.opened_by}</small></article>
          <article className="summary-card"><span>Cash sales added</span><strong>{money(paidCash)}</strong><small>Cash portion of regular sales</small></article>
          <article className="summary-card"><span>Expected cash in drawer</span><strong>{money(expectedCash)}</strong><small>Starting cash + cash payments</small></article>
          {session.status === 'closed' && <article className="summary-card"><span>Cash counted at close</span><strong>{money(session.closing_cash)}</strong><small>Difference: {money(Number(session.closing_cash) - expectedCash)}</small></article>}
        </section>
        <section className="panel report-table-panel">
          <div className="panel-title"><div><h2>Bread left today</h2><p className="muted">Counts update automatically as sales are saved.</p></div><span>{stock.length} tracked</span></div>
          <div className="opening-stock-list">{products.map((product) => {
            const count = remaining.get(product.id)
            return <div className="opening-stock-row" key={product.id}><span><strong>{product.name}</strong><small>{product.category}</small></span><span className={count === 0 ? 'stock-count sold-out' : 'stock-count'}>{count === undefined ? 'Not tracked' : `${count} pcs left`}</span></div>
          })}</div>
        </section>
        {session.status === 'open' && <form className="panel close-day-form" onSubmit={endShopDay}>
          <div><h2>End of day</h2><p className="muted">Count the cash in the drawer. Bread left is already calculated from sales.</p></div>
          <label>Cash counted at close<div className="currency-input"><span>₱</span><input aria-label="Cash counted at close" type="number" min="0" step="0.01" value={closingCash} onChange={(event) => setClosingCash(event.target.value)} placeholder="0.00" inputMode="decimal" /></div></label>
          <button type="submit" className="button button-primary" disabled={saving}>{saving ? 'Saving…' : 'End shop day'}</button>
        </form>}
        {session.status === 'closed' && <div className="success-banner"><CheckCircle2 size={18} /> Day closed by {session.closed_by} at {new Date(session.closed_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}. No new sales can be entered.</div>}
      </>}
    </div>
  )
}
