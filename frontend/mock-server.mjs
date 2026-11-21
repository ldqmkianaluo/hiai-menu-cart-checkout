/**
 * 本地假后端，用来在没有 Java 环境的机器上调试前端交互。
 * 接口、字段、金额规则与 backend/ 里的 Spring Boot 实现保持一致。
 *
 *   node mock-server.mjs                        # 默认 8080，零延迟
 *   $env:MOCK_DELAY=400; node mock-server.mjs   # 每个请求模拟 400ms 网络
 *   $env:MOCK_PORT=8081; node mock-server.mjs
 */
import { createServer } from 'node:http'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'

// 允许把 AI_API_KEY 放进 frontend/.env.local（已在 .gitignore 里），不必写进命令行历史。
if (!process.env.AI_API_KEY) {
  try {
    const envPath = fileURLToPath(new URL('./.env.local', import.meta.url))
    if (fs.existsSync(envPath)) {
      for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
        const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.+?)\s*$/)
        if (match && !process.env[match[1]]) process.env[match[1]] = match[2].replace(/^["']|["']$/g, '')
      }
    }
  } catch {
    // 读不到就算了，退回规则引擎
  }
}

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

function listReservations(phone) {
  const query = String(phone || '').trim()
  if (!/^1\d{10}$/.test(query)) throw new BadRequest('请填 11 位手机号再查询')
  return [...reservations.values()]
    .filter(item => item.phone === query)
    .sort((a, b) => `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`))
}

// ===== 服务员助手：有 AI_API_KEY 走 DeepSeek，没有就退回规则引擎 =====
const AI_ENDPOINT = process.env.AI_ENDPOINT || 'https://api.deepseek.com/chat/completions'
const AI_MODEL = process.env.AI_MODEL || 'deepseek-chat'
const AI_KEY = process.env.AI_API_KEY || ''

const AI_SYSTEM_PROMPT = `你是「朱家大院」这家餐厅的点餐服务员，只做一件事：根据客人的需求推荐菜品，并给出简短理由。

菜单（只能从这里选）：
dish-001 院子红烧肉 ¥38 招牌 荤菜
dish-002 砂锅鲜鱼头 ¥58 人气 鱼 微辣
dish-003 小炒黄牛肉 ¥42 辣 下饭
dish-004 清炒时蔬 ¥18 清爽少油
dish-005 农家炒饭 ¥16 主食
dish-006 手工汤面 ¥20 主食 带汤
dish-007 桂花酸梅汤 ¥9 饮品 解辣
dish-008 山泉乌龙茶 ¥8 饮品 无糖

规则：
1. 只输出 JSON，不要 markdown 代码块，不要解释；
2. 结构：{"reply":"给客人看的一句话","people":人数,"items":[{"dishId":"dish-001","quantity":2,"reason":"不超过 20 字的理由"}]}
3. items 1–6 项，quantity 1–9，必须包含足够吃饱的主食，荤素搭配；
4. 如果客人给了预算，总价必须不超过预算；超了就少点菜，宁可少一道也别超；
5. reply 用中文口语，不超过 60 字，不要提模型、不要提规则；
6. reply 里不要出现任何金额数字（总价由系统展示），也不要承诺折扣、优惠、免单；
7. 客人没提人数时按 2 人算；客人没提预算时按正常点法。`

function parseAiJson(content) {
  const text = String(content || '').replace(/```json/gi, '').replace(/```/g, '').trim()
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start < 0 || end <= start) throw new Error('AI 返回的不是 JSON')
  return JSON.parse(text.slice(start, end + 1))
}

async function callDeepSeek(messages) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 20000)
  try {
    const response = await fetch(AI_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${AI_KEY}` },
      body: JSON.stringify({
        model: AI_MODEL,
        messages: [{ role: 'system', content: AI_SYSTEM_PROMPT }, ...messages],
        temperature: 0.6,
        max_tokens: 700,
        response_format: { type: 'json_object' },
      }),
      signal: controller.signal,
    })
    if (!response.ok) {
      const detail = (await response.text()).slice(0, 200)
      throw new Error(`DeepSeek ${response.status} ${detail}`)
    }
    const data = await response.json()
    return parseAiJson(data.choices?.[0]?.message?.content)
  } finally {
    clearTimeout(timer)
  }
}

function buildAiResult(payload, budget = 0) {
  const items = []
  const seen = new Set()
  for (const raw of Array.isArray(payload.items) ? payload.items : []) {
    const dish = DISH_BY_ID.get(String(raw?.dishId || ''))
    if (!dish || seen.has(dish.id)) continue
    const quantity = Math.max(1, Math.min(9, Math.trunc(Number(raw?.quantity) || 1)))
    seen.add(dish.id)
    items.push({
      dishId: dish.id,
      name: dish.name,
      price: dish.price,
      quantity,
      lineTotal: round(dish.price * quantity),
      reason: String(raw?.reason || '').trim().slice(0, 40) || '按你的口味挑的',
      artColor: dish.artColor,
    })
    if (items.length >= 6) break
  }
  if (!items.length) throw new Error('AI 没有给出可用菜品')

  // 模型可能无视预算，这里再兜一次：先砍饮品，再砍最贵的一份，直到不超。
  let guard = 0
  const totalNow = () => round(items.reduce((sum, item) => sum + item.lineTotal, 0))
  while (budget > 0 && totalNow() > budget && items.length > 1 && guard < 8) {
    const drinkIndex = items.findIndex(item => item.dishId === 'dish-007' || item.dishId === 'dish-008')
    if (drinkIndex >= 0) {
      items.splice(drinkIndex, 1)
    } else {
      const biggest = items.reduce((best, item) => (item.lineTotal > best.lineTotal ? item : best), items[0])
      if (biggest.quantity > 1) {
        biggest.quantity -= 1
        biggest.lineTotal = round(biggest.price * biggest.quantity)
      } else {
        items.splice(items.indexOf(biggest), 1)
      }
    }
    guard += 1
  }

  const total = round(items.reduce((sum, item) => sum + item.lineTotal, 0))
  return {
    engine: 'llm',
    reply: String(payload.reply || '').trim().slice(0, 120) || '按你的需求配了这几样。',
    items,
    total,
    withinBudget: budget === 0 || total <= budget,
    disclaimer: 'DeepSeek 在线生成 · 价格与合计由后端重算，不会采用模型给的钱数',
  }
}

async function agentChat(body) {
  const rawMessages = Array.isArray(body.messages) ? body.messages : []
  const messages = rawMessages
    .filter(item => item && (item.role === 'user' || item.role === 'assistant') && typeof item.content === 'string')
    .slice(-8)
    .map(item => ({ role: item.role, content: item.content.slice(0, 300) }))
  const lastUser = [...messages].reverse().find(item => item.role === 'user')?.content || ''

  if (!AI_KEY) return fallbackToRules(lastUser, body)
  try {
    const parsed = await callDeepSeek(messages)
    return buildAiResult(parsed, Number(body.budget) || 0)
  } catch (error) {
    console.log(`  agent fallback: ${error.message}`)
    const result = fallbackToRules(lastUser, body)
    result.note = `AI 调用失败，已退回规则推荐：${error.message.slice(0, 60)}`
    return result
  }
}

function fallbackToRules(demand, body) {
  const rules = agentRecommend({
    demand,
    partySize: Number(body.partySize) || 2,
    budget: Number(body.budget) || 0,
  })
  return {
    engine: 'rules',
    reply: rules.reply,
    items: rules.items,
    total: rules.total,
    withinBudget: rules.withinBudget,
    disclaimer: '规则推荐 · 离线演示，未调用大模型',
  }
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

// 同桌人数阶梯：人越多基础折扣越高，封顶 8%，超过 5 人不再增加
const TABLE_TIERS = [
  { min: 5, rate: 8, label: '5 人及以上 8%' },
  { min: 4, rate: 5, label: '4 人 5%' },
  { min: 3, rate: 3, label: '3 人 3%' },
  { min: 1, rate: 0, label: '2 人及以下无拼桌折扣' },
]
const DRAW_BASE = 3      // 每人基础抽奖次数
const DRAW_BONUS_MAX = 2 // 拉人最多再送 2 次
const FLOOR_RATE = 0.6   // 实付不低于小计的 60%，写进规则页，避免券叠加失控

function tableTier(memberCount) {
  return TABLE_TIERS.find(tier => memberCount >= tier.min) || TABLE_TIERS[TABLE_TIERS.length - 1]
}

function drawQuota(tableCode, memberId) {
  const cart = cartView(tableCode)
  const memberCount = Math.max(1, cart.members.length)
  const bonus = Math.min(DRAW_BONUS_MAX, Math.max(0, memberCount - 1))
  const used = draws.get(`${tableCode}/${memberId}`) || 0
  return { total: DRAW_BASE + bonus, used, remaining: Math.max(0, DRAW_BASE + bonus - used), memberCount }
}

const coupons = new Map()   // code -> 券
const draws = new Map()     // `table/member` -> 已抽次数

function drawPrize(tableCode, memberId) {
  const key = `${tableCode}/${memberId}`
  const quota = drawQuota(tableCode, memberId)
  if (quota.remaining <= 0) {
    throw new BadRequest(`你在这桌已经抽满 ${quota.total} 次了，再多叫一位同事同桌还能多抽一次`)
  }
  draws.set(key, quota.used + 1)

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
  return { prize, coupon, remaining: Math.max(0, quota.total - (quota.used + 1)), quota: quota.total, memberCount: quota.memberCount }
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
  const tier = tableTier(Math.max(1, cart.members.length))
  const baseDiscount = round(subtotal * tier.rate / 100)
  const afterBase = round(subtotal - baseDiscount)
  const coupon = couponCode ? coupons.get(couponCode) || null : null
  const couponDiscount = round(discountOf(coupon, afterBase))
  const floor = round(subtotal * FLOOR_RATE)
  const capped = Math.max(floor, round(afterBase - couponDiscount))
  const discount = round(subtotal - capped)
  const suffix = tableCode.replace(/[^A-Za-z0-9]/g, '').slice(-6).toUpperCase()
  return {
    previewNo: `DEMO-${suffix}-${Math.floor(Date.now() / 1000)}`,
    items: picked,
    itemCount: picked.reduce((sum, item) => sum + item.quantity, 0),
    subtotal,
    total: subtotal,
    memberCount: Math.max(1, cart.members.length),
    baseRate: tier.rate,
    baseDiscount,
    baseLabel: tier.label,
    couponDiscount,
    discount,
    floorApplied: capped === floor && afterBase - couponDiscount < floor,
    floor,
    payTotal: capped,
    coupon: coupon && discount > 0
      ? { code: coupon.code, name: coupon.name, detail: coupon.type === 'threshold' ? `满 ${coupon.threshold} 元减 ${coupon.value} 元` : coupon.name }
      : null,
    couponNote: coupon && couponDiscount === 0 ? '这张券本单不可用（金额未达门槛或已过期）' : '',
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
      return send(response, 200, {
        status: 'UP',
        mode: 'DEMO_ONLY',
        paymentEnabled: false,
        agent: { engine: AI_KEY ? 'llm' : 'rules', model: AI_KEY ? AI_MODEL : 'rule-engine' },
      })
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
    if (request.method === 'POST' && path === '/api/demo/agent/chat') {
      const body = await readJson(request)
      const result = await agentChat(body)
      console.log(`  POST agent/chat [${result.engine}] "${String(body.messages?.at(-1)?.content || '').slice(0, 18)}" -> ¥${result.total}`)
      return send(response, 200, result)
    }
    if (request.method === 'GET' && path === '/api/demo/reservations') {
      const url = new URL(request.url, `http://${request.headers.host || 'localhost'}`)
      const list = listReservations(url.searchParams.get('phone'))
      console.log(`  GET reservations phone=${url.searchParams.get('phone')} -> ${list.length}`)
      return send(response, 200, list)
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
    if (request.method === 'GET' && path === '/api/demo/promo/status') {
      const url = new URL(request.url, `http://${request.headers.host || 'localhost'}`)
      const table = resolveTable(url.searchParams.get('table'), url.searchParams.get('sessionId'))
      const member = requireMember(url.searchParams.get('member'))
      const quota = drawQuota(table, member)
      const tier = tableTier(quota.memberCount)
      return send(response, 200, {
        ...quota,
        baseRate: tier.rate,
        baseLabel: tier.label,
        prizes: PRIZES.map(({ id, name, short, detail }) => ({ id, name, short, detail })),
      })
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
