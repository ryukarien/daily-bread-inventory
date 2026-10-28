export const money = (value) => `₱${Number(value || 0).toFixed(2)}`
export const today = () => new Date().toLocaleDateString('en-CA')
export const formatTime = (iso) => new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })

export function calculateDiscount(items, type) {
  const subtotal = items.reduce((sum, item) => sum + item.price * item.qty, 0)
  if (!type || type === 'None') return { subtotal, discount: 0 }
  if (type === 'Buy 1 Take 1') {
    const pieces = items.flatMap((item) => Array.from({ length: item.qty }, () => item.price)).sort((a, b) => b - a)
    const discount = pieces.reduce((sum, price, index) => sum + (index % 2 === 1 ? price : 0), 0)
    return { subtotal, discount }
  }
  const percent = Number.parseInt(type, 10)
  return { subtotal, discount: Number.isFinite(percent) ? subtotal * percent / 100 : 0 }
}

export const discountOptions = ['None', 'Buy 1 Take 1', ...Array.from({ length: 10 }, (_, index) => `${(index + 1) * 10}%`)]
