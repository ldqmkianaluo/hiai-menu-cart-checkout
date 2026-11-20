import { reactive } from 'vue'
import { api } from './api'

const storageKey = 'hiai-demo-session-id'

function sessionId() {
  let value = localStorage.getItem(storageKey)
  if (!value) {
    value = globalThis.crypto?.randomUUID?.() || `demo-${Date.now()}-${Math.random().toString(16).slice(2)}`
    localStorage.setItem(storageKey, value)
  }
  return value
}

const state = reactive({
  sessionId: sessionId(),
  cart: { items: [], itemCount: 0, total: 0 },
  loading: false,
  updating: false,
  error: '',
})

async function loadCart() {
  state.loading = true
  state.error = ''
  try {
    state.cart = await api.cart(state.sessionId)
  } catch (error) {
    state.error = error.message
  } finally {
    state.loading = false
  }
}

async function setQuantity(dishId, quantity) {
  state.updating = true
  state.error = ''
  try {
    state.cart = await api.setCartItem({
      sessionId: state.sessionId,
      dishId,
      quantity: Math.max(0, quantity),
    })
  } catch (error) {
    state.error = error.message
    throw error
  } finally {
    state.updating = false
  }
}

function quantityOf(dishId) {
  return state.cart.items.find(item => item.dishId === dishId)?.quantity || 0
}

export function useCart() {
  return { state, loadCart, setQuantity, quantityOf }
}
