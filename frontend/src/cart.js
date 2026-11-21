import { reactive } from 'vue'
import { api } from './api'

const memberKey = 'hiai-demo-member-id'
const DEFAULT_TABLE = 'A08'

function newMemberId() {
  return `m-${Math.random().toString(36).slice(2, 8)}`
}

function memberId() {
  let value = sessionStorage.getItem(memberKey)
  if (!value) {
    value = globalThis.crypto?.randomUUID?.().slice(0, 8) || newMemberId()
    sessionStorage.setItem(memberKey, value)
  }
  return value
}

// 桌号优先取 URL（?table=A08，扫码链接就是这种形式），没有就落到演示桌。
function readTable() {
  const fromSearch = new URLSearchParams(location.search).get('table')
  if (fromSearch) return fromSearch.trim().toUpperCase()
  const hash = location.hash || ''
  const queryAt = hash.indexOf('?')
  if (queryAt >= 0) {
    const fromHash = new URLSearchParams(hash.slice(queryAt + 1)).get('table')
    if (fromHash) return fromHash.trim().toUpperCase()
  }
  return DEFAULT_TABLE
}

function money(value) {
  return Math.round(value * 100) / 100
}

/**
 * 本地“意图”层：点一下就立刻生效，服务端结果回来后再校准。
 * 之前的实现是每次请求都锁住全局 updating，导致所有加减号一起禁用、连续点击被丢弃。
 */
const state = reactive({
  table: readTable(),
  memberId: memberId(),
  memberName: '',
  serverCart: { items: [], itemCount: 0, total: 0, members: [] },
  cart: { items: [], itemCount: 0, mineCount: 0, total: 0, members: [] },
  intent: {},   // dishId -> { quantity, meta }，尚未被服务端确认的本地值
  pending: {},  // dishId -> boolean，只用于无障碍提示，不再禁用按钮
  loading: false,
  error: '',
})

state.memberName = `桌友·${state.memberId.slice(-4).toUpperCase()}`

// 每个菜品一条请求链：同一个菜连续点击会合并成最后一次意图，不同菜品互不阻塞。
const chains = new Map()
const targets = new Map()

function metaOf(dish) {
  if (!dish) return null
  return {
    id: dish.id ?? dish.dishId,
    name: dish.name,
    icon: dish.icon,
    artColor: dish.artColor,
    price: Number(dish.price) || 0,
  }
}

/**
 * 合成视图：服务端给的是「全桌」的菜品行，本地意图只覆盖我自己那一行。
 * 同桌其他人的行原样保留，这样别人加的菜能实时出现在购物车里。
 */
function rebuild() {
  const mineServer = new Map()
  const others = []
  for (const item of state.serverCart.items) {
    if (item.memberId === state.memberId) mineServer.set(item.dishId, item)
    else others.push(item)
  }

  const dishIds = new Set([...mineServer.keys(), ...Object.keys(state.intent)])
  const mine = []
  for (const dishId of dishIds) {
    const entry = state.intent[dishId]
    const server = mineServer.get(dishId)
    const source = entry ? entry.meta : server
    const quantity = entry ? entry.quantity : server.quantity
    if (!source || quantity <= 0) continue
    const price = Number(source.price) || 0
    mine.push({
      dishId,
      name: source.name,
      icon: source.icon,
      artColor: source.artColor,
      price,
      quantity,
      lineTotal: money(price * quantity),
      memberId: state.memberId,
      memberName: state.memberName,
    })
  }

  const items = [...mine, ...others]
  const memberTotals = new Map()
  for (const item of items) {
    const id = item.memberId
    const entry = memberTotals.get(id) || {
      id,
      name: item.memberId === state.memberId ? state.memberName : item.memberName,
      isMe: item.memberId === state.memberId,
      itemCount: 0,
      total: 0,
    }
    entry.itemCount += item.quantity
    entry.total = money(entry.total + item.lineTotal)
    memberTotals.set(id, entry)
  }

  state.cart = {
    items,
    itemCount: items.reduce((sum, item) => sum + item.quantity, 0),
    mineCount: mine.reduce((sum, item) => sum + item.quantity, 0),
    total: money(items.reduce((sum, item) => sum + item.lineTotal, 0)),
    members: [...memberTotals.values()].sort((a, b) => Number(b.isMe) - Number(a.isMe)),
  }
}

let errorTimer = null

// 错误条不再永久挂在顶部：4 秒后自动收起，也可以手动关掉。
function showError(message) {
  state.error = message
  clearTimeout(errorTimer)
  errorTimer = setTimeout(() => { state.error = '' }, 4000)
}

function dismissError() {
  clearTimeout(errorTimer)
  state.error = ''
}

async function loadCart() {
  state.loading = true
  state.error = ''
  try {
    state.serverCart = await api.cart(state.table, state.memberId)
    state.intent = {}
    targets.clear()
  } catch (error) {
    showError(error.message)
  } finally {
    state.loading = false
    rebuild()
  }
}

/**
 * 定时同步同桌购物车：静默失败，不弹提示，也不打断正在提交的请求。
 */
async function refresh() {
  if (state.loading) return
  if (Object.keys(state.pending).length) return
  if (document.visibilityState === 'hidden') return
  try {
    state.serverCart = await api.cart(state.table, state.memberId)
    rebuild()
  } catch {
    // 轮询失败就等下一次，不打扰点餐。
  }
}

async function flush(dishId) {
  if (!targets.has(dishId)) return
  const desired = targets.get(dishId)
  targets.delete(dishId)
  state.pending[dishId] = true
  try {
    const cart = await api.setCartItem({
      table: state.table,
      member: state.memberId,
      memberName: state.memberName,
      dishId,
      quantity: desired,
    })
    state.serverCart = cart
    if (!targets.has(dishId)) delete state.intent[dishId]
    dismissError()
  } catch (error) {
    showError(error.message)
    if (!targets.has(dishId)) delete state.intent[dishId]
    rebuild()
    throw error
  } finally {
    if (!targets.has(dishId)) delete state.pending[dishId]
    rebuild()
  }
}

function setQuantity(dish, quantity) {
  const meta = metaOf(dish)
  if (!meta) return Promise.resolve()
  const dishId = meta.id
  const value = Math.max(0, Math.min(99, Math.trunc(Number(quantity) || 0)))
  state.intent[dishId] = {
    quantity: value,
    meta: state.intent[dishId]?.meta || meta,
  }
  rebuild()
  targets.set(dishId, value)

  const tail = chains.get(dishId) || Promise.resolve()
  const run = tail.then(() => flush(dishId), () => flush(dishId))
  chains.set(dishId, run.then(() => {}, () => {}))
  return run
}

// 加菜减菜的加减号只关心「我自己点了几份」，同桌别人的份数在购物车分组里看。
function quantityOf(dishId) {
  const own = state.cart.items.find(item => item.dishId === dishId && item.memberId === state.memberId)
  return own?.quantity || 0
}

function isPending(dishId) {
  return Boolean(state.pending[dishId])
}

export function useCart() {
  return { state, loadCart, refresh, setQuantity, quantityOf, isPending, dismissError }
}
