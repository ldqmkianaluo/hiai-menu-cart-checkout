const TIMEOUT_MS = 8000

function timeoutSignal() {
  if (typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function') {
    return AbortSignal.timeout(TIMEOUT_MS)
  }
  return undefined
}

async function request(path, options = {}) {
  let response
  try {
    response = await fetch(path, {
      ...options,
      signal: options.signal || timeoutSignal(),
      headers: {
        Accept: 'application/json',
        ...(options.body ? { 'Content-Type': 'application/json' } : {}),
        ...options.headers,
      },
    })
  } catch (error) {
    if (error?.name === 'TimeoutError' || error?.name === 'AbortError') {
      throw new Error('请求超时，请检查网络后重试')
    }
    throw new Error('无法连接服务，请确认后端已启动')
  }
  const body = await response.json().catch(() => null)
  if (!response.ok) {
    throw new Error(body?.message || `请求失败（${response.status}）`)
  }
  return body
}

export const api = {
  menu: () => request('/api/demo/menu'),
  cart: (table, member) => request(
    `/api/demo/cart?table=${encodeURIComponent(table)}&member=${encodeURIComponent(member || '')}`,
  ),
  setCartItem: payload => request('/api/demo/cart/items', {
    method: 'POST',
    body: JSON.stringify(payload),
  }),
  checkoutPreview: (table, dishIds = [], couponCode = '') => request('/api/demo/checkout/preview', {
    method: 'POST',
    body: JSON.stringify({ table, dishIds, couponCode }),
  }),
  promoStatus: (table, member) => request(`/api/demo/promo/status?table=${encodeURIComponent(table)}&member=${encodeURIComponent(member)}`),
  drawPromo: (table, member) => request('/api/demo/promo/draw', {
    method: 'POST',
    body: JSON.stringify({ table, member }),
  }),
  createReservation: payload => request('/api/demo/reservations', {
    method: 'POST',
    body: JSON.stringify(payload),
  }),  reservations: phone => request(`/api/demo/reservations?phone=${encodeURIComponent(phone)}`),

  agentChat: payload => request('/api/demo/agent/chat', {
    method: 'POST',
    body: JSON.stringify(payload),
  }),
  agentRecommend: payload => request('/api/demo/agent/recommend', {
    method: 'POST',
    body: JSON.stringify(payload),
  }),
}
