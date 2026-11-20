async function request(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: {
      Accept: 'application/json',
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...options.headers,
    },
  })
  const body = await response.json().catch(() => null)
  if (!response.ok) {
    throw new Error(body?.message || `请求失败（${response.status}）`)
  }
  return body
}

export const api = {
  menu: () => request('/api/demo/menu'),
  cart: sessionId => request(`/api/demo/cart?sessionId=${encodeURIComponent(sessionId)}`),
  setCartItem: payload => request('/api/demo/cart/items', {
    method: 'POST',
    body: JSON.stringify(payload),
  }),
  checkoutPreview: sessionId => request('/api/demo/checkout/preview', {
    method: 'POST',
    body: JSON.stringify({ sessionId }),
  }),
}
