/**
 * 本地假后端，用来在没有 Java 环境的机器上调试前端交互。
 * 接口、字段、金额规则与 backend/ 里的 Spring Boot 实现保持一致。
 *
 *   node mock-server.mjs                        # 默认 8080，零延迟
 *   $env:MOCK_DELAY=400; node mock-server.mjs   # 每个请求模拟 400ms 网络
 *   $env:MOCK_PORT=8081; node mock-server.mjs
 */
import { createServer } from 'node:http'

const PORT = Number(process.env.MOCK_PORT || 8080)
const DELAY = Number(process.env.MOCK_DELAY || 0)

const STORE = { name: '朱家大院 · 点餐演示店', notice: '现点现做，演示数据不会产生真实订单' }
const CATEGORIES = [
  { id: 'signature', name: '招牌推荐' },
  { id: 'hot', name: '热菜' },
  { id: 'staple', name: '主食' },
  { id: 'drink', name: '饮品' },
]
const DISHES = [
  { id: 'dish-001', categoryId: 'signature', name: '院子红烧肉', description: '慢火收汁，软糯入味', price: 38.0, tag: '招牌', icon: '🍖', artColor: '#FFF0E8' },
  { id: 'dish-002', categoryId: 'signature', name: '砂锅鲜鱼头', description: '鲜香微辣，适合两人分享', price: 58.0, tag: '人气', icon: '🍲', artColor: '#FFF4D8' },
  { id: 'dish-003', categoryId: 'hot', name: '小炒黄牛肉', description: '大火快炒，香辣下饭', price: 42.0, tag: '辣', icon: '🥩', artColor: '#FFE9E7' },
  { id: 'dish-004', categoryId: 'hot', name: '清炒时蔬', description: '当日新鲜蔬菜，清爽少油', price: 18.0, tag: '清爽', icon: '🥬', artColor: '#EAF7EC' },
  { id: 'dish-005', categoryId: 'staple', name: '农家炒饭', description: '鸡蛋、时蔬与米饭粒粒分明', price: 16.0, tag: '', icon: '🍚', artColor: '#FFF6DB' },
  { id: 'dish-006', categoryId: 'staple', name: '手工汤面', description: '骨汤打底，面条筋道', price: 20.0, tag: '', icon: '🍜', artColor: '#F5EDE5' },
  { id: 'dish-007', categoryId: 'drink', name: '桂花酸梅汤', description: '酸甜解腻，冰镇更佳', price: 9.0, tag: '冰饮', icon: '🥤', artColor: '#F2E7FF' },
  { id: 'dish-008', categoryId: 'drink', name: '山泉乌龙茶', description: '清香回甘，无糖饮品', price: 8.0, tag: '无糖', icon: '🍵', artColor: '#E7F4ED' },
]
const DISH_BY_ID = new Map(DISHES.map(dish => [dish.id, dish]))

// 桌子 -> 成员 -> 菜品数量，同桌所有人共享同一份。
const tables = new Map()

const round = value => Math.round(value * 100) / 100

function memberNameOf(memberId, memberName) {
  if (memberName && memberName.trim()) return memberName.trim().slice(0, 16)
  return `桌友 ${memberId.slice(-4)}`
}

function cartView(tableCode) {
  const members = tables.get(tableCode) || new Map()
  const items = []
  const memberViews = []
  for (const [memberId, member] of members) {
    let count = 0
    let sum = 0
    for (const [dishId, quantity] of member.lines) {
      const dish = DISH_BY_ID.get(dishId)
      if (!dish || quantity <= 0) continue
      const lineTotal = round(dish.price * quantity)
      items.push({
        dishId,
        name: dish.name,
        icon: dish.icon,
        artColor: dish.artColor,
        price: dish.price,
        quantity,
        lineTotal,
        memberId,
        memberName: member.name,
      })
      count += quantity
      sum += lineTotal
    }
    if (count > 0) memberViews.push({ id: memberId, name: member.name, itemCount: count, total: round(sum) })
  }
  items.sort((a, b) => a.memberId.localeCompare(b.memberId) || a.dishId.localeCompare(b.dishId))
  memberViews.sort((a, b) => a.id.localeCompare(b.id))
  return {
    table: tableCode,
    items,
    itemCount: items.reduce((sum, item) => sum + item.quantity, 0),
    total: round(items.reduce((sum, item) => sum + item.lineTotal, 0)),
    members: memberViews,
  }
}

function setQuantity(tableCode, memberId, memberName, dishId, quantity) {
  if (!DISH_BY_ID.has(dishId)) throw new BadRequest('菜品不存在或已下架')
  if (!Number.isInteger(quantity) || quantity < 0 || quantity > 99) {
    throw new BadRequest('菜品数量必须在 0 到 99 之间')
  }
  let members = tables.get(tableCode)
  if (!members) {
    members = new Map()
    tables.set(tableCode, members)
  }
  let member = members.get(memberId)
  if (!member) {
    member = { name: memberNameOf(memberId, memberName), lines: new Map() }
    members.set(memberId, member)
  }
  if (quantity === 0) member.lines.delete(dishId)
  else member.lines.set(dishId, quantity)
  if (!member.lines.size) members.delete(memberId)
  if (!members.size) tables.delete(tableCode)
  return cartView(tableCode)
}

// ===== 智能点餐（规则推荐，不调用大模型）=====
const AGENT_DISCLAIMER = '规则推荐 · 本地关键词匹配，未调用任何大模型'

function agentRecommend(body) {
  const demand = String(body.demand || '').trim().slice(0, 120)
  const party = Math.min(12, Math.max(1, Number(body.partySize) || 2))
  const budget = Math.max(0, Number(body.budget) || 0)
  const text = demand.toLowerCase()

  const signals = {
    spicy: /辣|重口|川|湘|下饭/.test(demand),
    light: /清淡|不辣|少油|养生|老人/.test(demand),
    veg: /素|青菜|蔬菜|沙拉|健康/.test(demand),
    soup: /汤|面|暖和|暖胃/.test(demand),
    drink: /饮料|喝的|茶|饮|解辣|解腻/.test(demand),
    fish: /鱼/.test(text),
    beef: /牛肉|牛/.test(demand),
    budgetLow: /便宜|实惠|省钱|人少/.test(demand),
  }

  const main = signals.fish ? DISH_BY_ID.get('dish-002')
    : signals.beef || signals.spicy ? DISH_BY_ID.get('dish-003')
      : DISH_BY_ID.get('dish-001')
  const veg = DISH_BY_ID.get('dish-004')
  const staple = signals.soup ? DISH_BY_ID.get('dish-006') : DISH_BY_ID.get('dish-005')
  const drink = signals.spicy || signals.drink
    ? (signals.spicy ? DISH_BY_ID.get('dish-007') : DISH_BY_ID.get('dish-008'))
    : null

  const picks = []
  const push = (dish, quantity, reason) => picks.push({ dish, quantity, reason })

  push(main, Math.min(3, Math.max(1, Math.ceil(party / 2))),
    signals.spicy ? '你提到想吃辣/下饭，这道是店里最扛饭的硬菜'
      : signals.fish ? '你点名要吃鱼，这锅鱼头适合多人分'
        : '荤菜里最稳的一道，大多数人第一次来都会点')
  push(veg, party >= 4 ? 2 : 1,
    signals.light || signals.veg ? '你要求清淡，这道少油现炒，中和前面的重口' : '一荤一素才像正经吃饭，解腻')
  push(staple, party,
    signals.soup ? '你说想喝汤，汤面比炒饭更合适' : '按人数配的主食，先保证吃饱')
  if (drink) {
    push(drink, Math.max(1, Math.ceil(party / 2)),
      signals.spicy ? '辣味配酸甜冰饮，解辣最快' : '无糖茶饮，不额外占预算')
  }

  const total = () => round(picks.reduce((sum, item) => sum + item.dish.price * item.quantity, 0))
  if (budget > 0) {
    let guard = 0
    while (total() > budget && picks.length > 1 && guard < 8) {
      const drinkIndex = picks.findIndex(item => item.dish.categoryId === 'drink')
      if (drinkIndex >= 0) {
        picks.splice(drinkIndex, 1)
      } else {
        const biggest = picks.reduce(
          (best, item) => (item.dish.price * item.quantity > best.dish.price * best.quantity ? item : best),
          picks[0],
        )
        if (biggest.quantity > 1) biggest.quantity -= 1
        else picks.splice(picks.indexOf(biggest), 1)
      }
      guard += 1
    }
  }

  const sum = total()
  const withinBudget = budget === 0 || sum <= budget
  const itemWord = picks.map(item => `${item.dish.name}×${item.quantity}`).join('、')
  const reply = `${party} 个人${budget ? `、预算 ¥${budget}` : ''}：给你配了 ${itemWord}，合计 ¥${sum.toFixed(2)}。`
    + (withinBudget ? '' : ` 已经超预算 ¥${(sum - budget).toFixed(2)}，要不要去掉饮料或减一份主食？`)
    + (signals.light && signals.spicy ? ' 你同时提了「辣」和「清淡」，我按辣优先，素菜用来平衡。' : '')

  return {
    reply,
    signals,
    items: picks.map(item => ({
      dishId: item.dish.id,
      name: item.dish.name,
      price: item.dish.price,
      quantity: item.quantity,
      lineTotal: round(item.dish.price * item.quantity),
      reason: item.reason,
      artColor: item.dish.artColor,
    })),
    partySize: party,
    budget,
    total: sum,
    withinBudget,
    disclaimer: AGENT_DISCLAIMER,
  }
}

// ===== 预约留座 =====
const RESERVE_SLOTS = ['11:00', '11:30', '12:00', '12:30', '13:00', '17:00', '17:30', '18:00', '18:30', '19:00', '19:30', '20:00']
const reservations = new Map()

function createReservation(body) {
  const name = String(body.name || '').trim()
  const phone = String(body.phone || '').trim()
  const date = String(body.date || '').trim()
  const time = String(body.time || '').trim()
  const partySize = Number(body.partySize)
  const note = String(body.note || '').trim().slice(0, 60)

  if (name.length < 1 || name.length > 16) throw new BadRequest('请填写 1–16 个字的用餐人称呼')
  if (!/^1\d{10}$/.test(phone)) throw new BadRequest('手机号请填 11 位，用于到店核对')
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new BadRequest('日期格式应为 YYYY-MM-DD')
  if (!RESERVE_SLOTS.includes(time)) throw new BadRequest('这个时段不在可预约范围内')
  if (!Number.isInteger(partySize) || partySize < 1 || partySize > 12) throw new BadRequest('人数请填 1–12 位')
  if (date < new Date().toISOString().slice(0, 10)) throw new BadRequest('不能预约过去的日期')

  const code = `R-${Math.random().toString(36).slice(2, 6).toUpperCase()}`
  const reservation = {
    code,
    name,
    phone,
    date,
    time,
    partySize,
    note,
    table: body.table ? String(body.table) : '',
    status: 'CONFIRMED',
    createdAt: new Date().toISOString(),
    hint: '演示预约：不占真实座位，到店请以此号核对',
  }
  reservations.set(code, reservation)
  return reservation
}

// ===== 推广活动：抽奖发券 =====
const PRIZES = [
  { id: 'free', name: '整单免单', short: '免单', weight: 1, type: 'free', value: 0, detail: '本单全免（演示用，不涉及真实收款）' },
  { id: 'r30', name: '满 100 减 30', short: '减30', weight: 3, type: 'threshold', threshold: 100, value: 30, detail: '满 100 元可用' },
  { id: 'p80', name: '整单 8 折', short: '8折', weight: 5, type: 'percent', value: 80, detail: '按实付金额 8 折' },
  { id: 'p90', name: '整单 9 折', short: '9折', weight: 9, type: 'percent', value: 90, detail: '按实付金额 9 折' },
  { id: 'p95', name: '整单 95 折', short: '95折', weight: 12, type: 'percent', value: 95, detail: '按实付金额 95 折' },
  { id: 'none', name: '谢谢参与', short: '下次再来', weight: 14, type: 'none', value: 0, detail: '这次没中，换个同事再抽一次' },
]
const PRIZE_WEIGHT = PRIZES.reduce((sum, prize) => sum + prize.weight, 0)

const coupons = new Map()   // code -> 券
const draws = new Map()     // `table/member` -> 已抽次数

function drawPrize(tableCode, memberId) {
  const key = `${tableCode}/${memberId}`
  const used = draws.get(key) || 0
  if (used >= 3) throw new BadRequest('这桌已经抽过 3 次了，留给同事试试运气')
  draws.set(key, used + 1)

  let ticket = Math.random() * PRIZE_WEIGHT
  let prize = PRIZES[PRIZES.length - 1]
  for (const item of PRIZES) {
    ticket -= item.weight
    if (ticket <= 0) {
      prize = item
      break
    }
  }

  let coupon = null
  if (prize.type !== 'none') {
    const code = `LUCKY-${Math.random().toString(36).slice(2, 7).toUpperCase()}`
    coupon = {
      code,
      table: tableCode,
      member: memberId,
      prizeId: prize.id,
      name: prize.name,
      type: prize.type,
      value: prize.value,
      threshold: prize.threshold || 0,
      expiresAt: Date.now() + 30 * 60 * 1000,
    }
    coupons.set(code, coupon)
  }
  return { prize, coupon, remaining: Math.max(0, 3 - (used + 1)) }
}

function discountOf(coupon, subtotal) {
  if (!coupon) return 0
  if (coupon.expiresAt && coupon.expiresAt < Date.now()) return 0
  if (coupon.type === 'free') return subtotal
  if (coupon.type === 'percent') return round(subtotal * (100 - coupon.value) / 100)
  if (coupon.type === 'threshold') return subtotal >= coupon.threshold ? Math.min(subtotal, coupon.value) : 0
  return 0
}

function preview(tableCode, dishIds, couponCode) {
  const cart = cartView(tableCode)
  const picked = dishIds?.length ? cart.items.filter(item => dishIds.includes(item.dishId)) : cart.items
  if (!picked.length) throw new BadRequest('购物车为空，暂时无法生成结算预览')
  const subtotal = round(picked.reduce((sum, item) => sum + item.lineTotal, 0))
  const coupon = couponCode ? coupons.get(couponCode) || null : null
  const discount = round(discountOf(coupon, subtotal))
  const suffix = tableCode.replace(/[^A-Za-z0-9]/g, '').slice(-6).toUpperCase()
  return {
    previewNo: `DEMO-${suffix}-${Math.floor(Date.now() / 1000)}`,
    items: picked,
    itemCount: picked.reduce((sum, item) => sum + item.quantity, 0),
    subtotal,
    total: subtotal,
    discount,
    payTotal: round(subtotal - discount),
    coupon: coupon && discount > 0
      ? { code: coupon.code, name: coupon.name, detail: coupon.type === 'threshold' ? `满 ${coupon.threshold} 元减 ${coupon.value} 元` : coupon.name }
      : null,
    couponNote: coupon && discount === 0 ? '这张券本单不可用（金额未达门槛或已过期）' : '',
    paymentMethods: [
      { code: 'wechat_demo', label: '微信支付', description: '仅展示，不会唤起微信支付', icon: '微' },
      { code: 'counter_demo', label: '到店付款', description: '仅展示，不会创建收款任务', icon: '店' },
    ],
    demoOnly: true,
  }
}

class BadRequest extends Error {}

function send(response, status, payload) {
  const body = JSON.stringify(payload)
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
  })
  response.end(body)
}

async function readJson(request) {
  const chunks = []
  for await (const chunk of request) chunks.push(chunk)
  if (!chunks.length) return {}
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'))
  } catch {
    throw new BadRequest('请求体不是合法的 JSON')
  }
}

// 兼容旧调用：以前只有 sessionId，现在优先用桌号。
function resolveTable(table, sessionId) {
  const value = (table && table.trim()) || (sessionId && sessionId.trim())
  if (!value) throw new BadRequest('缺少桌号，请从桌上的二维码重新扫码进入')
  return value
}

function requireMember(member) {
  if (!member || !member.trim()) throw new BadRequest('缺少有效的用餐人标识')
  return member.trim()
}

const server = createServer(async (request, response) => {
  if (request.method === 'OPTIONS') return send(response, 204, {})
  if (DELAY > 0) await new Promise(resolve => setTimeout(resolve, DELAY))

  const url = new URL(request.url, `http://localhost:${PORT}`)
  const path = url.pathname
  const started = Date.now()

  try {
    if (request.method === 'GET' && path === '/api/demo/health') {
      return send(response, 200, { status: 'UP', mode: 'DEMO_ONLY', paymentEnabled: false })
    }
    if (request.method === 'GET' && path === '/api/demo/menu') {
      return send(response, 200, { store: STORE, categories: CATEGORIES, dishes: DISHES })
    }
    if (request.method === 'GET' && path === '/api/demo/cart') {
      const table = resolveTable(url.searchParams.get('table'), url.searchParams.get('sessionId'))
      const member = url.searchParams.get('member') || ''
      return send(response, 200, cartView(table, member))
    }
    if (request.method === 'POST' && path === '/api/demo/cart/items') {
      const body = await readJson(request)
      const table = resolveTable(body.table, body.sessionId)
      const member = requireMember(body.member)
      if (!body.dishId) throw new BadRequest('缺少菜品标识')
      const quantity = Number(body.quantity)
      const cart = setQuantity(table, member, body.memberName, body.dishId, quantity)
      console.log(`  POST cart/items ${table}/${member} ${body.dishId} -> ${quantity}${DELAY ? ` (${Date.now() - started}ms)` : ''}`)
      return send(response, 200, cart)
    }
    if (request.method === 'POST' && path === '/api/demo/checkout/preview') {
      const body = await readJson(request)
      const table = resolveTable(body.table, body.sessionId)
      return send(response, 200, preview(table, body.dishIds, body.couponCode))
    }
    if (request.method === 'POST' && path === '/api/demo/agent/recommend') {
      const body = await readJson(request)
      const result = agentRecommend(body)
      console.log(`  POST agent/recommend "${String(body.demand || '').slice(0, 20)}" -> ¥${result.total}`)
      return send(response, 200, result)
    }
    if (request.method === 'POST' && path === '/api/demo/reservations') {
      const body = await readJson(request)
      const reservation = createReservation(body)
      console.log(`  POST reservations -> ${reservation.code} ${reservation.date} ${reservation.time} x${reservation.partySize}`)
      return send(response, 200, reservation)
    }
    if (request.method === 'GET' && path.startsWith('/api/demo/reservations/')) {
      const code = decodeURIComponent(path.split('/').pop())
      const reservation = reservations.get(code)
      if (!reservation) throw new BadRequest('没有找到这个预约号')
      return send(response, 200, reservation)
    }
    if (request.method === 'POST' && path === '/api/demo/promo/draw') {
      const body = await readJson(request)
      const table = resolveTable(body.table, body.sessionId)
      const member = requireMember(body.member)
      const result = drawPrize(table, member)
      console.log(`  POST promo/draw ${table}/${member} -> ${result.prize.name}${result.coupon ? ` ${result.coupon.code}` : ''}`)
      return send(response, 200, result)
    }
    return send(response, 404, { message: '没有这个演示接口' })
  } catch (error) {
    const status = error instanceof BadRequest ? 400 : 500
    if (status === 500) console.error(error)
    return send(response, status, { message: error.message || '请求参数不正确' })
  }
})

server.listen(PORT, () => {
  console.log(`假后端已启动 http://localhost:${PORT}${DELAY ? `（每个请求模拟 ${DELAY}ms 延迟）` : ''}`)
  console.log('配合前端：在另一个终端 cd frontend && npm run dev，然后打开 http://localhost:3000')
})
