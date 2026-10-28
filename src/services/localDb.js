import bcrypt from 'bcryptjs'

const DB_NAME = 'daily-bread-local'
const DB_VERSION = 3
const stores = ['users', 'products', 'transactions', 'transaction_items', 'daily_stock', 'day_sessions']

// Passwords are stored as bcrypt hashes; the original starter credentials are not shipped in source.
const initialUsers = [
  { id: 'admin-local', username: '@admindbfaith', password_hash: '$2a$10$9/U2.zMjAgHCbc2YEjJ83ODZpRQ1lPbz7Ws8MHKB81ErRqfav7VHu', role: 'admin' },
  { id: 'staff-local', username: '@staffdb1', password_hash: '$2a$10$WNI6Y/5pCQpll9EYwAySKepzYkrIFhmeWgwd7sgJFlCGbs0HBvHQ.', role: 'staff' },
]

export const menu = [
  ['Pastry Bread', [['Cheese Roll',25],['Spanish Bread',25],['Almond Bun',57],['Almond Cream Bun',58],['Almond Coffee Bun',44],['Biscoff Cream Bread',65],['Coffee Bun',48],['Double Trouble',57],['Ube Cheese Pandesal',29],['Coffee Ball',44],['Pan de Coco',39]]],
  ['Cinnamon Roll', [['Cinnamon Plain',85],['Oreo Cinnamon',93],['Blueberry Cinnamon',110],['Biscoff Cinnamon',110],['Strawberry Cinnamon',110],['Nutella Walnut Cinnamon',93],['Almond Cinnamon',94]]],
  ['Ensaymada w/ Filling', [['Cream Cheese Ensaymada',65],['Oreo Cream Cheese Ensaymada',65],['Ube Cream Cheese Ensaymada',65]]],
  ['Savory Breads', [['Korean Garlic Bun',69],['Pork Floss Bun',57],['Ham N Cheese Bun',56],['Sausage Bun',59],['Floss Roll',55],['Tuna Bread',48]]],
  ['Pie', [['Buko Pie',289],['Bube Pie (Ube+Buko)',360]]],
  ['Loaf', [['Japanese Milk Loaf Bread',150]]],
].flatMap(([category, items]) => items.map(([name, price], index) => ({
  id: `${category.toLowerCase().replace(/[^a-z]+/g, '-')}-${index + 1}`,
  name, category, price, stock: null,
})))

let opening
function openDb() {
  if (opening) return opening
  opening = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    request.onupgradeneeded = () => {
      const db = request.result
      for (const name of stores) {
        if (!db.objectStoreNames.contains(name)) {
          const options = name === 'users' || name === 'products' ? { keyPath: 'id' } : { keyPath: 'id' }
          db.createObjectStore(name, options)
        }
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => {
      opening = undefined
      reject(request.error || new Error('Could not open local database.'))
    }
  })
  return opening
}

function requestResult(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error || new Error('Local database request failed.'))
  })
}

async function transaction(storeNames, mode, action) {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeNames, mode)
    let result
    try { result = action(tx) } catch (error) { reject(error); return }
    tx.oncomplete = () => resolve(result)
    tx.onerror = () => reject(tx.error || new Error('Could not save local data.'))
    tx.onabort = () => reject(tx.error || new Error('The local data change was cancelled.'))
  })
}

export async function initialize() {
  const db = await openDb()
  const [users, products] = await Promise.all([
    requestResult(db.transaction('users').objectStore('users').getAll()),
    requestResult(db.transaction('products').objectStore('products').getAll()),
  ])
  if (!users.length) await transaction(['users'], 'readwrite', (tx) => initialUsers.forEach((user) => tx.objectStore('users').put(user)))
  if (!products.length) await transaction(['products'], 'readwrite', (tx) => menu.forEach((product) => tx.objectStore('products').put(product)))
}

export async function authenticate(username, password) {
  const db = await openDb()
  const users = await requestResult(db.transaction('users').objectStore('users').getAll())
  const user = users.find((entry) => entry.username.toLowerCase() === username.trim().toLowerCase())
  if (!user || !(await bcrypt.compare(password, user.password_hash))) return null
  return { id: user.id, username: user.username, role: user.role }
}

export async function getProducts() {
  const db = await openDb()
  return requestResult(db.transaction('products').objectStore('products').getAll())
}

export async function saveProduct(product) {
  return transaction(['products'], 'readwrite', (tx) => tx.objectStore('products').put(product))
}

export async function setProductStock(product) {
  const day = new Date().toLocaleDateString('en-CA')
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(['products', 'daily_stock'], 'readwrite')
    tx.objectStore('products').put(product)
    if (product.stock !== null) {
      const dailyStock = tx.objectStore('daily_stock')
      const request = dailyStock.get(`${day}-${product.id}`)
      request.onsuccess = () => {
        const previous = request.result
        dailyStock.put({
          id: `${day}-${product.id}`, date: day, product_id: product.id, name: product.name,
          stock_start: previous ? Math.max(0, previous.stock_start + product.stock - previous.stock_left) : product.stock,
          stock_left: product.stock,
        })
      }
    }
    else tx.objectStore('daily_stock').delete(`${day}-${product.id}`)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error || new Error('Could not update stock.'))
    tx.onabort = () => reject(tx.error || new Error('Stock was not updated.'))
  })
}

export async function getDaySession(date) {
  const db = await openDb()
  return requestResult(db.transaction('day_sessions').objectStore('day_sessions').get(date))
}

export async function startDay({ date, opening_cash, opened_by, stockCounts }) {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(['products', 'daily_stock', 'day_sessions'], 'readwrite')
    const sessions = tx.objectStore('day_sessions')
    const existing = sessions.get(date)
    existing.onsuccess = () => {
      if (existing.result) {
        tx.abort()
        reject(new Error('The shop day has already been opened.'))
        return
      }
      const productStore = tx.objectStore('products')
      const stockStore = tx.objectStore('daily_stock')
      for (const product of stockCounts) {
        const stock = product.stock === '' || product.stock === null ? null : Number(product.stock)
        const updated = { ...product, stock }
        productStore.put(updated)
        if (stock !== null) stockStore.put({
          id: `${date}-${product.id}`, date, product_id: product.id,
          name: product.name, stock_start: stock, stock_left: stock,
        })
        else stockStore.delete(`${date}-${product.id}`)
      }
      sessions.put({
        id: date, date, opening_cash: Number(opening_cash), opened_by,
        opened_at: new Date().toISOString(), status: 'open',
        closing_cash: null, closed_by: '', closed_at: null,
      })
    }
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error || new Error('Could not open the shop day.'))
    tx.onabort = () => reject(tx.error || new Error('The shop day was not opened.'))
  })
}

export async function closeDay({ date, closing_cash, closed_by }) {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction('day_sessions', 'readwrite')
    const sessions = tx.objectStore('day_sessions')
    const request = sessions.get(date)
    request.onsuccess = () => {
      const session = request.result
      if (!session || session.status !== 'open') {
        tx.abort()
        reject(new Error('There is no open shop day to close.'))
        return
      }
      sessions.put({ ...session, status: 'closed', closing_cash: Number(closing_cash), closed_by, closed_at: new Date().toISOString() })
    }
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error || new Error('Could not close the shop day.'))
    tx.onabort = () => reject(tx.error || new Error('The shop day was not closed.'))
  })
}

export async function getDailyStock(date) {
  const db = await openDb()
  const records = await requestResult(db.transaction('daily_stock').objectStore('daily_stock').getAll())
  return records.filter((record) => record.date === date)
}

export async function removeProduct(id) {
  return transaction(['products'], 'readwrite', (tx) => tx.objectStore('products').delete(id))
}

export async function getTransactions() {
  const db = await openDb()
  const [transactions, items] = await Promise.all([
    requestResult(db.transaction('transactions').objectStore('transactions').getAll()),
    requestResult(db.transaction('transaction_items').objectStore('transaction_items').getAll()),
  ])
  return transactions.map((sale) => ({ ...sale, items: items.filter((item) => item.transaction_id === sale.id) }))
}

export async function saveSale(sale) {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(['products', 'transactions', 'transaction_items', 'daily_stock', 'day_sessions'], 'readwrite')
    const productStore = tx.objectStore('products')
    const stockStore = tx.objectStore('daily_stock')
    const saleDate = sale.date
    let settled = false
    const fail = (error) => {
      if (!settled) {
        settled = true
        reject(error)
        tx.abort()
      }
    }
    const grouped = new Map()
    sale.items.forEach((item) => {
      const current = grouped.get(item.product_id)
      grouped.set(item.product_id, { item, qty: (current?.qty || 0) + item.qty })
    })
    const rows = [...grouped.values()]
    const currentProducts = new Map()
    let remaining = rows.length + 1
    let shopDay
    const saveWithCurrentStock = () => {
      if (--remaining !== 0) return
      if (!shopDay || shopDay.status !== 'open') {
        return fail(new Error('Open the shop day and count starting cash and bread before saving a sale.'))
      }
      for (const { item, qty } of rows) {
        const product = currentProducts.get(item.product_id)
        if (!product) return fail(new Error(`${item.name} is no longer available.`))
        if (product.stock !== null && product.stock < qty) {
          return fail(new Error(`Not enough stock for ${product.name}. Only ${product.stock} left.`))
        }
      }
      const transaction = { ...sale, id: newId(), items: undefined }
      rows.forEach(({ item, qty }) => {
        const product = currentProducts.get(item.product_id)
        if (product.stock === null) return
        const remainingStock = product.stock - qty
        productStore.put({ ...product, stock: remainingStock })
        const key = `${saleDate}-${product.id}`
        const stockRequest = stockStore.get(key)
        stockRequest.onsuccess = () => {
          const record = stockRequest.result || {
            id: key, date: saleDate, product_id: product.id, name: product.name,
            stock_start: product.stock, stock_left: product.stock,
          }
          stockStore.put({ ...record, stock_left: remainingStock })
        }
      })
      tx.objectStore('transactions').put(transaction)
      sale.items.forEach((item, index) => tx.objectStore('transaction_items').put({
        ...item, price_at_sale: item.price_at_sale ?? item.price,
        id: `${transaction.id}-${index}`, transaction_id: transaction.id,
      }))
      tx.oncomplete = () => {
        if (!settled) {
          settled = true
          resolve(transaction.id)
        }
      }
    }
    if (!remaining) return fail(new Error('Add at least one item to the sale.'))
    rows.forEach(({ item }) => {
      const request = productStore.get(item.product_id)
      request.onsuccess = () => {
        currentProducts.set(item.product_id, request.result)
        saveWithCurrentStock()
      }
      request.onerror = () => fail(request.error || new Error(`Could not check stock for ${item.name}.`))
    })
    const dayRequest = tx.objectStore('day_sessions').get(saleDate)
    dayRequest.onsuccess = () => {
      shopDay = dayRequest.result
      saveWithCurrentStock()
    }
    dayRequest.onerror = () => fail(dayRequest.error || new Error('Could not check whether the shop day is open.'))
    tx.onerror = () => fail(tx.error || new Error('Could not save this sale.'))
    tx.onabort = () => {
      if (!settled) {
        settled = true
        reject(tx.error || new Error('Sale was not saved.'))
      }
    }
  })
}

export async function updateSale(saleId, updates) {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(['products', 'transactions', 'transaction_items', 'daily_stock'], 'readwrite')
    const transactions = tx.objectStore('transactions')
    const itemsStore = tx.objectStore('transaction_items')
    const productsStore = tx.objectStore('products')
    const dailyStock = tx.objectStore('daily_stock')
    const saleRequest = transactions.get(saleId)
    const itemsRequest = itemsStore.getAll()
    const productsRequest = productsStore.getAll()
    const stocksRequest = dailyStock.getAll()
    const ready = { sale: false, items: false, products: false, stocks: false }
    let settled = false
    let failed = false
    let saved = false

    const fail = (error) => {
      if (settled || failed) return
      failed = true
      try { tx.abort() } catch { reject(error) }
      reject(error)
    }

    const save = () => {
      if (failed || saved || !Object.values(ready).every(Boolean)) return
      saved = true
      const sale = saleRequest.result
      if (!sale) return fail(new Error('This sale could not be found.'))
      if (sale.voided) return fail(new Error('This sale has already been deleted.'))
      if (updates.date !== undefined && sale.date !== updates.date) return fail(new Error('The sale date cannot be changed.'))
      if (!Array.isArray(updates.items) || updates.items.length === 0) {
        return fail(new Error('A saved sale must contain at least one item. Delete the sale instead if the whole order is wrong.'))
      }

      const oldItems = itemsRequest.result.filter((item) => item.transaction_id === saleId)
      const nextItems = updates.items
      for (const item of nextItems) {
        if (!item.product_id || !Number.isInteger(item.qty) || item.qty < 1 ||
          !Number.isFinite(Number(item.price_at_sale ?? item.price)) || Number(item.price_at_sale ?? item.price) < 0) {
          return fail(new Error('Check each item and quantity before saving this correction.'))
        }
      }

      const deltas = new Map()
      oldItems.forEach((item) => deltas.set(item.product_id, (deltas.get(item.product_id) || 0) - item.qty))
      nextItems.forEach((item) => deltas.set(item.product_id, (deltas.get(item.product_id) || 0) + item.qty))
      const products = new Map(productsRequest.result.map((product) => [product.id, product]))
      const stockRecords = new Map(stocksRequest.result.map((record) => [record.id, record]))
      const isToday = sale.date === new Date().toLocaleDateString('en-CA')

      for (const [productId, delta] of deltas) {
        if (!delta) continue
        const product = products.get(productId)
        if (isToday && product?.stock !== null && product?.stock !== undefined) {
          const nextStock = product.stock - delta
          if (nextStock < 0) return fail(new Error(`Not enough stock for ${product.name}. Only ${product.stock} left to add to this sale.`))
        }
      }

      for (const [productId, delta] of deltas) {
        if (!delta) continue
        const product = products.get(productId)
        if (isToday && product?.stock !== null && product?.stock !== undefined) {
          productsStore.put({ ...product, stock: product.stock - delta })
        }
        const record = stockRecords.get(`${sale.date}-${productId}`)
        if (record) dailyStock.put({ ...record, stock_left: record.stock_left - delta })
      }

      oldItems.forEach((item) => itemsStore.delete(item.id))
      const transaction = {
        ...sale,
        ...updates,
        updated_by: updates.updated_by || '',
        updated_at: new Date().toISOString(),
        items: undefined,
      }
      delete transaction.items
      transactions.put(transaction)
      nextItems.forEach((item, index) => itemsStore.put({
        ...item,
        price: Number(item.price_at_sale ?? item.price),
        price_at_sale: Number(item.price_at_sale ?? item.price),
        id: `${saleId}-${index}`,
        transaction_id: saleId,
      }))
    }

    saleRequest.onsuccess = () => { ready.sale = true; save() }
    itemsRequest.onsuccess = () => { ready.items = true; save() }
    productsRequest.onsuccess = () => { ready.products = true; save() }
    stocksRequest.onsuccess = () => { ready.stocks = true; save() }
    saleRequest.onerror = () => fail(saleRequest.error || new Error('Could not read the sale.'))
    itemsRequest.onerror = () => fail(itemsRequest.error || new Error('Could not read the sale items.'))
    productsRequest.onerror = () => fail(productsRequest.error || new Error('Could not check item stock.'))
    stocksRequest.onerror = () => fail(stocksRequest.error || new Error('Could not read daily stock.'))
    tx.oncomplete = () => { settled = true; resolve() }
    tx.onerror = () => {
      if (!settled) {
        settled = true
        reject(tx.error || new Error('Could not update this sale.'))
      }
    }
    tx.onabort = () => {
      if (!settled) {
        settled = true
        reject(tx.error || new Error('The sale correction was cancelled.'))
      }
    }
  })
}

export async function voidSale(saleId, voidedBy = '') {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(['products', 'transactions', 'transaction_items', 'daily_stock'], 'readwrite')
    const transactions = tx.objectStore('transactions')
    const dailyStock = tx.objectStore('daily_stock')
    const itemsRequest = tx.objectStore('transaction_items').getAll()
    const productsRequest = tx.objectStore('products').getAll()
    const stocksRequest = dailyStock.getAll()
    let updated = false
    let itemsReady = false
    let productsReady = false
    let stocksReady = false
    const isToday = new Date().toLocaleDateString('en-CA')
    const restore = () => {
      if (updated || !itemsReady || !productsReady || !stocksReady) return
      updated = true
      const itemRows = itemsRequest.result.filter((item) => item.transaction_id === saleId)
      const productRows = productsRequest.result
      const saleRequest = transactions.get(saleId)
      saleRequest.onsuccess = () => {
        if (!saleRequest.result) { tx.abort(); return }
        const sale = saleRequest.result
        if (sale.voided) { tx.abort(); return }
        for (const item of itemRows) {
          const product = productRows.find((entry) => entry.id === item.product_id)
          if (sale.date === isToday && product && product.stock !== null) tx.objectStore('products').put({ ...product, stock: product.stock + item.qty })
          const record = stocksRequest.result.find((entry) => entry.id === `${sale.date}-${item.product_id}`)
          if (record) dailyStock.put({ ...record, stock_left: record.stock_left + item.qty })
        }
        transactions.put({ ...sale, voided: true, voided_by: voidedBy })
      }
    }
    itemsRequest.onsuccess = () => { itemsReady = true; restore() }
    productsRequest.onsuccess = () => { productsReady = true; restore() }
    stocksRequest.onsuccess = () => { stocksReady = true; restore() }
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error || new Error('Could not void this sale.'))
    tx.onabort = () => reject(tx.error || new Error('Sale was not voided.'))
  })
}

function newId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID()
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`
}
