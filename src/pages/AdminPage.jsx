import { useEffect, useState } from 'react'
import { ArrowRight, ClipboardList, PackageCheck, ShoppingBasket, Tags } from 'lucide-react'
import { Link } from 'react-router-dom'
import { getDailyStock, getDaySession, getProducts, getTransactions } from '../services/localDb'
import { money, today } from '../utils/format'

export default function AdminPage() {
  const [data, setData] = useState({ session: null, sales: [], products: [], stock: [] })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    Promise.all([getDaySession(today()), getTransactions(), getProducts(), getDailyStock(today())])
      .then(([session, transactions, products, stock]) => setData({
        session: session || null,
        sales: transactions.filter((sale) => sale.date === today() && !sale.voided),
        products, stock,
      }))
      .catch((loadError) => setError(loadError.message || 'Could not load the admin board.'))
      .finally(() => setLoading(false))
  }, [])

  const regular = data.sales.filter((sale) => sale.type === 'Regular')
  const paidTotal = regular.reduce((sum, sale) => sum + sale.total, 0)
  const cashTotal = regular.reduce((sum, sale) => sum + Math.min(sale.cash || 0, sale.total || 0), 0)
  const expectedCash = (data.session?.opening_cash || 0) + cashTotal
  const stockMap = new Map(data.stock.map((item) => [item.product_id, item.stock_left]))
  const remainingPieces = data.stock.reduce((sum, item) => sum + item.stock_left, 0)

  if (loading) return <div className="panel empty-state">Loading admin board…</div>

  return (
    <div className="content-page">
      <div className="page-heading"><div><p className="eyebrow">ADMIN OVERVIEW</p><h1>Admin board</h1><p className="muted">A quick view of today’s shop and the shortcuts you need.</p></div><span className={`status-chip ${data.session?.status === 'open' ? 'status-open' : data.session?.status === 'closed' ? 'status-closed' : ''}`}>{data.session?.status === 'open' ? 'Day is open' : data.session?.status === 'closed' ? 'Day ended' : 'Not started'}</span></div>
      {error && <div className="error-banner" role="alert">{error}</div>}
      {!data.session && <div className="info-banner"><PackageCheck size={20} /> Start with the opening checklist: record change money and count the bread available today.</div>}
      <section className="summary-grid admin-summary-grid">
        <SummaryCard label="Paid sales" value={money(paidTotal)} detail={`${regular.length} regular customers`} />
        <SummaryCard label="All customers" value={String(data.sales.length)} detail="Includes promotional and receivable" />
        <SummaryCard label="Expected cash drawer" value={money(expectedCash)} detail={`Starting float ${money(data.session?.opening_cash || 0)} + net cash after change`} />
        <SummaryCard label="Bread left" value={`${remainingPieces} pcs`} detail={`${data.stock.length} stock-counted items`} />
      </section>
      <section className="admin-shortcuts">
        <Link className="shortcut-card" to="/day"><span className="shortcut-icon"><PackageCheck /></span><strong>Open / close day</strong><small>Count starting cash and bread. See live stock left.</small><ArrowRight className="shortcut-arrow" size={19} /></Link>
        <Link className="shortcut-card" to="/sale"><span className="shortcut-icon"><ShoppingBasket /></span><strong>New sale</strong><small>Record a customer order and update stock.</small><ArrowRight className="shortcut-arrow" size={19} /></Link>
        <Link className="shortcut-card" to="/report"><span className="shortcut-icon"><ClipboardList /></span><strong>Daily report</strong><small>Review transactions and export a PDF.</small><ArrowRight className="shortcut-arrow" size={19} /></Link>
        <Link className="shortcut-card" to="/inventory"><span className="shortcut-icon"><Tags /></span><strong>Prices and stock</strong><small>Manage products, prices, and stock counts.</small><ArrowRight className="shortcut-arrow" size={19} /></Link>
      </section>
      <section className="panel report-table-panel">
        <div className="panel-title"><div><h2>Today’s stock</h2><p className="muted">Remaining quantities update after every saved order.</p></div><span>{data.products.length} menu items</span></div>
        <div className="opening-stock-list">{data.products.map((product) => {
          const count = stockMap.get(product.id)
          return <div className="opening-stock-row" key={product.id}><span><strong>{product.name}</strong><small>{product.category} · {money(product.price)}</small></span><span className={count === 0 ? 'stock-count sold-out' : 'stock-count'}>{count === undefined ? 'Not counted today' : `${count} pcs left`}</span></div>
        })}</div>
      </section>
    </div>
  )
}

function SummaryCard({ label, value, detail }) {
  return <article className="summary-card"><span>{label}</span><strong>{value}</strong><small>{detail}</small></article>
}
