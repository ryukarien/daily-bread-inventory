import { useEffect, useState } from 'react'
import { Pencil, Plus, Save, Trash2 } from 'lucide-react'
import { getProducts, removeProduct, setProductStock } from '../services/localDb'
import { money } from '../utils/format'

const blankItem = { name: '', category: 'Pastry Bread', price: '', stock: '' }

export default function InventoryPage() {
  const [products, setProducts] = useState([])
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState(blankItem)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(true)
  const categories = ['Pastry Bread', 'Cinnamon Roll', 'Ensaymada w/ Filling', 'Savory Breads', 'Pie', 'Loaf']

  async function refresh() {
    setLoading(true)
    try { setProducts(await getProducts()) } catch (e) { setError(e.message) } finally { setLoading(false) }
  }
  useEffect(() => { refresh() }, [])

  function startEdit(product) {
    setEditing(product.id)
    setForm({ name: product.name, category: product.category, price: String(product.price), stock: product.stock === null ? '' : String(product.stock) })
    setError('')
    setMessage('')
  }

  function startNew() {
    setEditing('new')
    setForm(blankItem)
    setError('')
    setMessage('')
  }

  async function submit(event) {
    event.preventDefault()
    setError('')
    setMessage('')
    const price = Number(form.price)
    const stock = form.stock.trim() === '' ? null : Number(form.stock)
    if (!form.name.trim() || !Number.isFinite(price) || price < 0 || (stock !== null && (!Number.isInteger(stock) || stock < 0))) {
      setError('Enter an item name, a valid price, and a whole-number stock (or leave stock blank).')
      return
    }
    const product = { id: editing === 'new' ? newId() : editing, name: form.name.trim(), category: form.category, price, stock }
    try {
      await setProductStock(product)
      setEditing(null)
      setMessage(`${product.name} saved.`)
      await refresh()
    } catch (saveError) { setError(saveError.message || 'Could not save this item.') }
  }

  function newId() {
    if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID()
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`
  }

  async function deleteItem(product) {
    if (!window.confirm(`Delete ${product.name}? This cannot be undone. Past sales will remain in reports.`)) return
    setError('')
    try {
      await removeProduct(product.id)
      setMessage(`${product.name} deleted.`)
      if (editing === product.id) setEditing(null)
      await refresh()
    } catch (deleteError) { setError(deleteError.message || 'Could not delete this item.') }
  }

  return (
    <div className="content-page">
      <div className="page-heading"><div><p className="eyebrow">MENU &amp; INVENTORY</p><h1>Prices and stock</h1><p className="muted">Add, edit, or delete menu items. Leave stock blank to keep it untracked.</p></div><button className="button button-primary" type="button" onClick={startNew}><Plus size={19} /> Add item</button></div>
      {message && <div className="success-banner" role="status">{message}</div>}
      {error && <div className="error-banner" role="alert">{error}</div>}
      {editing && <form className="panel edit-form" onSubmit={submit}>
        <div className="panel-title"><h2>{editing === 'new' ? 'Add an item' : 'Edit item'}</h2><button className="text-button" type="button" onClick={() => setEditing(null)}>Cancel</button></div>
        <div className="edit-grid">
          <label>Item name<input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required /></label>
          <label>Category<select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>{categories.map((name) => <option key={name}>{name}</option>)}</select></label>
          <label>Price (₱)<input type="number" min="0" step="0.01" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} required /></label>
          <label>Stock baked today <small className="hint">Leave blank for untracked stock</small><input type="number" min="0" step="1" value={form.stock} onChange={(e) => setForm({ ...form, stock: e.target.value })} placeholder="Not tracked" /></label>
        </div>
        <button className="button button-primary" type="submit"><Save size={18} /> Save item</button>
      </form>}
      <section className="panel inventory-panel">
        <div className="panel-title"><h2>Menu items</h2><span>{products.length} items</span></div>
        {loading ? <div className="empty-state">Loading menu…</div> : products.length === 0 ? <div className="empty-state">No items yet. Add your first menu item.</div> :
          <div className="inventory-list">{[...products].sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name)).map((product) => <article className="inventory-row" key={product.id}>
            <div className="inventory-info"><span className="category-label">{product.category}</span><strong>{product.name}</strong><span>{money(product.price)} <span className="inventory-divider">·</span> {product.stock === null ? 'Stock not tracked' : `${product.stock} left today`}</span></div>
            <div className="inventory-actions"><button className="icon-button" aria-label={`Edit ${product.name}`} onClick={() => startEdit(product)}><Pencil size={18} /></button><button className="icon-button danger-icon" aria-label={`Delete ${product.name}`} onClick={() => deleteItem(product)}><Trash2 size={18} /></button></div>
          </article>)}</div>}
      </section>
    </div>
  )
}
