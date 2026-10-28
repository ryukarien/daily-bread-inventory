import { useEffect, useMemo, useState } from 'react'
import { Download, Minus, Pencil, Plus, Save, Trash2, X } from 'lucide-react'
import { useAuth } from '../hooks/useAuth'
import { getDailyStock, getDaySession, getProducts, getTransactions, updateSale, voidSale } from '../services/localDb'
import { calculateDiscount, discountOptions, formatTime, money, today } from '../utils/format'

export default function ReportPage() {
  const { user } = useAuth()
  const [date, setDate] = useState(today())
  const [sales, setSales] = useState([])
  const [products, setProducts] = useState([])
  const [stock, setStock] = useState([])
  const [daySession, setDaySession] = useState(null)
  const [loading, setLoading] = useState(true)
  const [exporting, setExporting] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [editingId, setEditingId] = useState(null)
  const [editDraft, setEditDraft] = useState(null)
  const [addProductId, setAddProductId] = useState('')
  const [savingEdit, setSavingEdit] = useState(false)

  async function loadReport(targetDate = date) {
    setLoading(true)
    setError('')
    try {
      const [allSales, allProducts, dayStock, session] = await Promise.all([getTransactions(), getProducts(), getDailyStock(targetDate), getDaySession(targetDate)])
      setSales(allSales.filter((sale) => sale.date === targetDate).sort((a, b) => b.time.localeCompare(a.time)))
      setProducts(allProducts)
      setStock(dayStock)
      setDaySession(session || null)
    } catch (loadError) { setError(loadError.message || 'Could not load this report.') } finally { setLoading(false) }
  }
  useEffect(() => { loadReport(date) }, [date])

  const active = sales.filter((sale) => !sale.voided)
  const regular = active.filter((sale) => sale.type === 'Regular')
  const promos = active.filter((sale) => sale.type === 'Promotional')
  const receivables = active.filter((sale) => sale.type === 'Receivable')
  const cashTotal = regular.reduce((sum, sale) => sum + Math.min(Number(sale.cash || 0), Number(sale.total || 0)), 0)
  const gcashTotal = regular.reduce((sum, sale) => sum + sale.gcash, 0)
  const expectedCash = (daySession?.opening_cash || 0) + cashTotal
  const paidTotal = regular.reduce((sum, sale) => sum + sale.total, 0)
  const discountsTotal = regular.reduce((sum, sale) => sum + sale.discount, 0)
  const summaryRows = useMemo(() => {
    const totals = new Map()
    active.forEach((sale) => sale.items.forEach((item) => {
      const existing = totals.get(item.product_id) || { name: item.name, qty: 0, value: 0 }
      existing.qty += item.qty
      existing.value += item.qty * Number(item.price_at_sale ?? item.price ?? 0)
      totals.set(item.product_id, existing)
    }))
    const stockMap = new Map(stock.map((entry) => [entry.product_id, entry]))
    const allIds = new Set([...products.map((product) => product.id), ...stock.map((entry) => entry.product_id), ...totals.keys()])
    return [...allIds].map((id) => {
      const product = products.find((entry) => entry.id === id)
      const dayStock = stockMap.get(id)
      const sold = totals.get(id)
      return { name: dayStock?.name || product?.name || sold?.name || 'Removed item', qty: sold?.qty || 0, value: sold?.value || 0, left: dayStock?.stock_left ?? (product?.stock === null ? '—' : 'Not set') }
    }).sort((a, b) => a.name.localeCompare(b.name))
  }, [active, products, stock])
  const promoPieces = promos.reduce((sum, sale) => sum + sale.items.reduce((itemSum, item) => itemSum + item.qty, 0), 0)
  const promoValue = promos.reduce((sum, sale) => sum + sale.subtotal, 0)
  const receivablePieces = receivables.reduce((sum, sale) => sum + sale.items.reduce((itemSum, item) => itemSum + item.qty, 0), 0)
  const receivableValue = receivables.reduce((sum, sale) => sum + sale.subtotal, 0)
  const editTotals = editDraft
    ? calculateDiscount(editDraft.items, editDraft.type === 'Regular' ? editDraft.discount_type : 'None')
    : { subtotal: 0, discount: 0 }
  const editTotal = editDraft?.type === 'Regular' ? Math.max(0, editTotals.subtotal - editTotals.discount) : 0

  function startEditing(sale) {
    setEditingId(sale.id)
    setEditDraft({
      type: sale.type,
      discount_type: sale.discount_type || 'None',
      pay_method: sale.pay_method || 'Cash',
      cash: String(sale.cash || ''),
      taken_by: sale.taken_by || '',
      items: sale.items.map((item) => ({
        ...item,
        price: Number(item.price_at_sale ?? item.price),
        price_at_sale: Number(item.price_at_sale ?? item.price),
      })),
    })
    setAddProductId('')
    setError('')
    setMessage('')
  }

  function cancelEditing() {
    setEditingId(null)
    setEditDraft(null)
    setAddProductId('')
  }

  function changeEditQuantity(productId, change) {
    setEditDraft((draft) => ({
      ...draft,
      items: draft.items.map((item) => item.product_id === productId
        ? { ...item, qty: Math.max(1, item.qty + change) }
        : item),
    }))
  }

  function removeEditItem(productId) {
    setEditDraft((draft) => ({ ...draft, items: draft.items.filter((item) => item.product_id !== productId) }))
  }

  function addEditItem() {
    const product = products.find((entry) => entry.id === addProductId)
    if (!product) return
    setEditDraft((draft) => {
      const current = draft.items.find((item) => item.product_id === product.id)
      return {
        ...draft,
        items: current
          ? draft.items.map((item) => item.product_id === product.id ? { ...item, qty: item.qty + 1 } : item)
          : [...draft.items, { product_id: product.id, name: product.name, price: product.price, price_at_sale: product.price, qty: 1 }],
      }
    })
    setAddProductId('')
  }

  async function saveEdit(sale) {
    if (!editDraft || !editDraft.items.length) return setError('Keep at least one item in this order, or delete the whole sale.')
    if (editDraft.type === 'Regular') {
      const cash = editDraft.pay_method === 'GCash' ? editTotal : Number(editDraft.cash || 0)
      if (editDraft.pay_method === 'Cash' && cash < editTotal) return setError('Cash received must cover the updated total.')
      if (editDraft.pay_method === 'GCash + Cash' && !(cash > 0 && cash < editTotal)) {
        return setError('For GCash + Cash, enter cash above ₱0.00 and below the updated total.')
      }
    }
    if (editDraft.type === 'Receivable' && !editDraft.taken_by.trim()) return setError('Enter who took this receivable order.')
    setSavingEdit(true)
    setError('')
    setMessage('')
    try {
      const cash = editDraft.type !== 'Regular'
        ? 0
        : editDraft.pay_method === 'GCash'
          ? editTotal
          : Number(editDraft.cash || 0)
      const gcash = editDraft.type !== 'Regular'
        ? 0
        : editDraft.pay_method === 'Cash'
          ? 0
          : editDraft.pay_method === 'GCash'
            ? editTotal
            : editTotal - cash
      await updateSale(sale.id, {
        type: editDraft.type,
        discount_type: editDraft.type === 'Regular' ? editDraft.discount_type : 'None',
        subtotal: editTotals.subtotal,
        discount: editDraft.type === 'Regular' ? editTotals.discount : 0,
        total: editTotal,
        pay_method: editDraft.type === 'Regular' ? editDraft.pay_method : '',
        cash,
        gcash,
        taken_by: editDraft.type === 'Receivable' ? editDraft.taken_by.trim() : '',
        updated_by: user.username,
        items: editDraft.items,
      })
      cancelEditing()
      setMessage('Sale updated. Stock and report totals were adjusted.')
      await loadReport(date)
    } catch (saveError) {
      setError(saveError.message || 'Could not update this sale.')
    } finally {
      setSavingEdit(false)
    }
  }

  async function handleVoid(sale) {
    if (!window.confirm(`Delete this ${sale.type.toLowerCase()} sale for ${money(sale.total)}? It will be marked deleted for the report history and tracked stock will be returned.`)) return
    setError('')
    setMessage('')
    try {
      await voidSale(sale.id, user.username)
      if (editingId === sale.id) cancelEditing()
      setMessage('Sale deleted from totals. The report keeps an audit record and tracked stock was returned.')
      await loadReport()
    } catch (voidError) { setError(voidError.message || 'Could not delete this sale.') }
  }

  async function exportPdf() {
    setError('')
    setExporting(true)
    try {
    const [{ jsPDF }, { default: autoTable }] = await Promise.all([
      import('jspdf'),
      import('jspdf-autotable'),
    ])
    const doc = new jsPDF()
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(20)
    doc.text('DAILY BREAD', 14, 17)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(10)
    doc.text(`Daily report · ${date}`, 14, 24)
    doc.text(`Printed by ${user.username} · ${new Date().toLocaleString()}`, 14, 30)
    autoTable(doc, { startY: 36, head: [['Summary', 'Amount']], body: [
      ['Total paid sales', money(paidTotal)], ['Cash total', money(cashTotal)], ['GCash total', money(gcashTotal)],
      ['Starting change money', money(daySession?.opening_cash || 0)], ['Expected cash in drawer', money(expectedCash)],
      ...(daySession?.status === 'closed' ? [['Cash counted at close', money(daySession.closing_cash)], ['Cash difference', money(daySession.closing_cash - expectedCash)]] : []),
      ['Discounts given', money(discountsTotal)], ['Promotional', `${promoPieces} pcs · ${money(promoValue)}`],
      ['Receivable', `${receivablePieces} pcs · ${money(receivableValue)}`], ['Customers', String(active.length)],
      ['Receivable taken by', receivables.map((sale) => sale.taken_by).filter(Boolean).join(', ') || '—'],
    ], theme: 'grid', headStyles: { fillColor: [122, 92, 15] } })
    autoTable(doc, { head: [['Item', 'Sold', 'Sales value', 'Left']], body: summaryRows.map((row) => [row.name, row.qty, money(row.value), String(row.left)]), theme: 'grid', headStyles: { fillColor: [122, 92, 15] } })
    autoTable(doc, { head: [['Time', 'Staff', 'Type', 'Items', 'Discount', 'Total', 'Payment / details', 'Status']], body: sales.map((sale) => [
      formatTime(sale.time), sale.staff, sale.type, sale.items.map((item) => `${item.name} ×${item.qty}`).join(', '),
      money(sale.discount), money(sale.total), sale.type === 'Regular' ? `${sale.pay_method} · Cash ${money(sale.cash)} · GCash ${money(sale.gcash)}` : sale.taken_by || '—',
      sale.voided ? 'VOID' : 'OK',
    ]), theme: 'grid', headStyles: { fillColor: [122, 92, 15] }, styles: { fontSize: 7 } })
    doc.save(`daily-bread-report-${date}.pdf`)
    } catch (exportError) {
      setError(exportError.message || 'Could not create the PDF report.')
    } finally {
      setExporting(false)
    }
  }

  return (
    <div className="content-page">
      <div className="page-heading report-heading"><div><p className="eyebrow">SHOP SUMMARY</p><h1>Daily report</h1><p className="muted">Sales, payment totals and stock for the chosen day.</p></div><div className="report-controls"><label htmlFor="report-date">Report date</label><input id="report-date" type="date" value={date} max={today()} disabled={user.role !== 'admin'} onChange={(event) => setDate(event.target.value)} /><button className="button button-primary" type="button" onClick={exportPdf} disabled={loading || exporting}><Download size={18} /> {exporting ? 'Creating PDF…' : 'Save / print PDF'}</button></div></div>
      {message && <div className="success-banner" role="status">{message}</div>}
      {error && <div className="error-banner" role="alert">{error}</div>}
      {loading ? <div className="panel empty-state">Loading report…</div> : <>
        <section className="summary-grid">
          <SummaryCard label="Total paid sales" value={money(paidTotal)} detail={`${regular.length} regular sale${regular.length === 1 ? '' : 's'}`} />
          <SummaryCard label="Cash total" value={money(cashTotal)} detail="Cash payments" />
          <SummaryCard label="GCash total" value={money(gcashTotal)} detail="GCash payments" />
          <SummaryCard label="Starting change money" value={money(daySession?.opening_cash || 0)} detail={daySession ? `Counted by ${daySession.opened_by}` : 'No opening record'} />
          <SummaryCard label="Expected cash drawer" value={money(expectedCash)} detail="Starting float + cash payments" />
          {daySession?.status === 'closed' && <SummaryCard label="Cash counted at close" value={money(daySession.closing_cash)} detail={`Difference ${money(daySession.closing_cash - expectedCash)}`} />}
          <SummaryCard label="Discounts given" value={money(discountsTotal)} detail="Regular sales only" />
          <SummaryCard label="Promotional" value={`${promoPieces} pcs`} detail={money(promoValue)} />
          <SummaryCard label="Receivable" value={`${receivablePieces} pcs`} detail={money(receivableValue)} />
          <SummaryCard label="Customers" value={String(active.length)} detail={`${sales.filter((sale) => sale.voided).length} voided`} />
        </section>
        {receivables.length > 0 && <div className="panel takers"><strong>Receivable taken by</strong><span>{receivables.map((sale) => sale.taken_by).filter(Boolean).join(', ')}</span></div>}
        <section className="panel report-table-panel">
          <div className="panel-title"><h2>Items sold and left</h2></div>
          <div className="table-scroll"><table><thead><tr><th>Item</th><th>Sold</th><th>Sales value</th><th>Stock left</th></tr></thead><tbody>
            {summaryRows.map((row, i) => <tr key={`${row.name}-${i}`}><td>{row.name}</td><td>{row.qty}</td><td>{money(row.value)}</td><td>{row.left}</td></tr>)}
            {!summaryRows.length && <tr><td colSpan="4" className="table-empty">No menu items to report.</td></tr>}
          </tbody></table></div>
        </section>
        <section className="panel report-table-panel">
          <div className="panel-title"><h2>Transactions</h2><span>{sales.length} recorded</span></div>
          {!sales.length ? <div className="empty-state">No transactions recorded for this date.</div> :
            <div className="table-scroll"><table><thead><tr><th>Time</th><th>Type &amp; items</th><th>Discount</th><th>Total</th><th>Payment / taken by</th><th>Action</th></tr></thead><tbody>
              {sales.map((sale) => <tr key={sale.id} className={sale.voided ? 'voided-row' : ''}>
                <td>{formatTime(sale.time)}<small className="cell-sub">{sale.staff}</small></td>
                <td><strong>{sale.type}{sale.voided ? ' · VOID' : ''}</strong><small className="cell-sub">{sale.items.map((item) => `${item.name} ×${item.qty}`).join(', ')}</small></td>
                <td>{sale.discount ? `${sale.discount_type} · ${money(sale.discount)}` : '—'}</td>
                <td>{money(sale.total)}</td>
                <td>{sale.type === 'Regular' ? `${sale.pay_method} · Cash ${money(sale.cash)} · GCash ${money(sale.gcash)}` : sale.taken_by || '—'}</td>
                <td>{!sale.voided && <div className="sale-actions">
                  <button className="text-button" type="button" onClick={() => startEditing(sale)}><Pencil size={15} /> Edit</button>
                  <button className="text-button danger-text" type="button" onClick={() => handleVoid(sale)}><Trash2 size={15} /> Delete</button>
                </div>}</td>
              </tr>)}
              {sales.map((sale) => editingId === sale.id && editDraft && !sale.voided && <tr key={`${sale.id}-edit`}><td className="sale-edit-cell" colSpan="6">
                <form className="sale-edit-form" onSubmit={(event) => { event.preventDefault(); saveEdit(sale) }}>
                  <div className="sale-edit-heading"><div><strong>Edit customer order</strong><small>Correct the items or payment, then save the change.</small></div><button className="icon-button" type="button" aria-label="Cancel editing sale" onClick={cancelEditing}><X size={18} /></button></div>
                  <div className="sale-edit-grid">
                    <label>Sale type<select value={editDraft.type} onChange={(event) => setEditDraft({ ...editDraft, type: event.target.value })}><option>Regular</option><option>Promotional</option><option>Receivable</option></select></label>
                    {editDraft.type === 'Regular' && <label>Discount<select value={editDraft.discount_type} onChange={(event) => setEditDraft({ ...editDraft, discount_type: event.target.value })}>{discountOptions.map((option) => <option key={option}>{option}</option>)}</select></label>}
                    {editDraft.type === 'Regular' && <label>Payment method<select value={editDraft.pay_method} onChange={(event) => setEditDraft({ ...editDraft, pay_method: event.target.value })}><option>Cash</option><option>GCash</option><option>GCash + Cash</option></select></label>}
                    {editDraft.type === 'Regular' && editDraft.pay_method !== 'GCash' && <label>Cash received<input type="number" min="0" step="0.01" value={editDraft.cash} onChange={(event) => setEditDraft({ ...editDraft, cash: event.target.value })} /></label>}
                    {editDraft.type === 'Receivable' && <label>Taken by<input value={editDraft.taken_by} onChange={(event) => setEditDraft({ ...editDraft, taken_by: event.target.value })} required /></label>}
                  </div>
                  <div className="sale-edit-items">{editDraft.items.map((item) => <div className="sale-edit-item" key={item.product_id}>
                    <span><strong>{item.name}</strong><small>{money(item.price_at_sale)} each</small></span>
                    <div className="quantity-control"><button aria-label={`Remove one ${item.name}`} type="button" onClick={() => changeEditQuantity(item.product_id, -1)}><Minus size={15} /></button><strong>{item.qty}</strong><button aria-label={`Add one ${item.name}`} type="button" onClick={() => changeEditQuantity(item.product_id, 1)}><Plus size={15} /></button><button className="icon-button danger-icon" aria-label={`Remove ${item.name} from this sale`} type="button" onClick={() => removeEditItem(item.product_id)}><Trash2 size={15} /></button></div>
                  </div>)}</div>
                  <div className="sale-add-item"><select aria-label="Add an item to this sale" value={addProductId} onChange={(event) => setAddProductId(event.target.value)}><option value="">Choose item to add</option>{products.filter((product) => !editDraft.items.some((item) => item.product_id === product.id)).map((product) => <option key={product.id} value={product.id}>{product.name} · {money(product.price)}</option>)}</select><button className="button button-secondary" type="button" onClick={addEditItem} disabled={!addProductId}><Plus size={17} /> Add item</button></div>
                  <div className="sale-edit-footer"><div><span>Subtotal {money(editTotals.subtotal)}</span>{editDraft.type === 'Regular' && <span>Discount −{money(editTotals.discount)}</span>}<strong>Total due {money(editTotal)}</strong>{editDraft.type !== 'Regular' && <small>Free sale · still counted in stock and reports</small>}</div><div className="sale-edit-buttons"><button className="text-button" type="button" onClick={cancelEditing}>Cancel</button><button className="button button-primary" type="submit" disabled={savingEdit}><Save size={17} /> {savingEdit ? 'Saving…' : 'Save correction'}</button></div></div>
                </form>
              </td></tr>)}
            </tbody></table></div>}
        </section>
      </>}
    </div>
  )
}

function SummaryCard({ label, value, detail }) {
  return <article className="summary-card"><span>{label}</span><strong>{value}</strong><small>{detail}</small></article>
}
