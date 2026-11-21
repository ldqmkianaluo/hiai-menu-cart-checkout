import { mkdir, readFile, writeFile } from 'node:fs/promises'

// cart.js 现在跑在浏览器里，用到了这几个 Web API，测试里给最小实现。
globalThis.sessionStorage = {
  store: new Map(),
  getItem(key) { return this.store.has(key) ? this.store.get(key) : null },
  setItem(key, value) { this.store.set(key, String(value)) },
}
globalThis.localStorage = globalThis.sessionStorage
globalThis.location = { search: '?table=A08', hash: '#/' }

const CATALOG = {
  d1: { name: '招牌红烧肉', price: 38, icon: '🍖', artColor: '#FFF0E8' },
  d2: { name: '清蒸鲈鱼', price: 68, icon: '🐟', artColor: '#E8F4FF' },
}

// 假服务端：桌号 -> 成员 -> 菜品数量，和真后端结构一致。
const tables = new Map()
const items = new Map()   // 当前测试成员的菜品
let calls = 0
let failNext = false
const delay = ms => new Promise(resolve => setTimeout(resolve, ms))

function snapshot(memberId) {
  const lines = [...items.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([dishId, quantity]) => {
    const dish = CATALOG[dishId]
    return {
      dishId,
      name: dish.name,
      icon: dish.icon,
      artColor: dish.artColor,
      price: dish.price,
      quantity,
      lineTotal: Math.round(dish.price * quantity * 100) / 100,
      memberId,
      memberName: '桌友·测试',
    }
  })
  return {
    table: 'A08',
    items: lines,
    itemCount: lines.reduce((sum, line) => sum + line.quantity, 0),
    total: Math.round(lines.reduce((sum, line) => sum + line.lineTotal, 0) * 100) / 100,
    members: [],
  }
}

let currentMember = ''

globalThis.__fake = {
  cart: (_table, member) => {
    currentMember = member
    return snapshot(member)
  },
  post: async ({ member, dishId, quantity }) => {
    calls += 1
    await delay(40)
    if (failNext) {
      failNext = false
      throw new Error('模拟服务端失败')
    }
    if (quantity === 0) items.delete(dishId)
    else items.set(dishId, quantity)
    return snapshot(member)
  },
  // 模拟同桌另一个人往桌上加了一份鱼：我的行保持不动，只多一行别人的
  addTeammateLine: () => {
    const view = snapshot(currentMember)
    view.items.push({
      dishId: 'd2', name: CATALOG.d2.name, icon: CATALOG.d2.icon, artColor: CATALOG.d2.artColor,
      price: 68, quantity: 1, lineTotal: 68, memberId: 'm-teammate', memberName: '桌友·同桌',
    })
    view.itemCount = view.items.reduce((sum, line) => sum + line.quantity, 0)
    view.total = view.items.reduce((sum, line) => sum + line.lineTotal, 0)
    return view
  },
}

await mkdir('.tmp-cart-test', { recursive: true })
await writeFile('.tmp-cart-test/api.js', `
export const api = {
  cart: async (table, member) => globalThis.__fake.cart(table, member),
  setCartItem: async payload => globalThis.__fake.post(payload),
}
`)
const source = await readFile('src/cart.js', 'utf8')
await writeFile('.tmp-cart-test/cart.js', source.replace("from './api'", "from './api.js'"))

const { useCart } = await import('./.tmp-cart-test/cart.js')
const { state, loadCart, refresh, setQuantity, quantityOf } = useCart()

// vue 的 runtime-dom 会检测 document 是否存在，所以等它加载完再补一个假的。
globalThis.document = { visibilityState: 'visible', addEventListener() {}, removeEventListener() {} }

const results = []
function check(name, ok, detail) {
  results.push({ name, ok, detail })
  if (!ok) console.log(`  ✗ ${name} -> ${detail}`)
}

await loadCart()
check('桌号从 URL 读取', state.table === 'A08', state.table)

// 1. 连点五次：界面立刻跟手，网络只发 1~2 次
const burst = []
const trail = []
for (let i = 1; i <= 5; i += 1) {
  burst.push(setQuantity({ id: 'd1', ...CATALOG.d1 }, i))
  trail.push(quantityOf('d1'))
}
check('连点时本地数量立刻跟手', trail.join(',') === '1,2,3,4,5', `实际 ${trail.join(',')}`)
await Promise.all(burst)
check('连点被合并为极少请求', calls <= 2, `发了 ${calls} 次`)
check('服务端最终数量正确', items.get('d1') === 5, `实际 ${items.get('d1')}`)
check('结算数量正确', state.cart.itemCount === 5, `实际 ${state.cart.itemCount}`)
check('结算金额正确', state.cart.total === 190, `实际 ${state.cart.total}`)

// 2. 两个菜同时点：不同菜品互不阻塞，也不会互相覆盖
calls = 0
await Promise.all([
  setQuantity({ id: 'd1', ...CATALOG.d1 }, 3),
  setQuantity({ id: 'd2', ...CATALOG.d2 }, 2),
])
check('并发菜品都落到服务端', items.get('d1') === 3 && items.get('d2') === 2, `d1=${items.get('d1')} d2=${items.get('d2')}`)
check('并发后本地与服务端一致', state.cart.total === Math.round((38 * 3 + 68 * 2) * 100) / 100, `实际 ${state.cart.total}`)
check('并发时每菜各一次请求', calls === 2, `发了 ${calls} 次`)

// 3. 减到 0 就是移除
await setQuantity({ id: 'd1', ...CATALOG.d1 }, 0)
check('减到 0 后本地移除', quantityOf('d1') === 0 && !state.cart.items.some(i => i.dishId === 'd1'), JSON.stringify(state.cart.items.map(i => i.dishId)))
check('减到 0 后服务端移除', !items.has('d1'), [...items.keys()].join(','))

// 4. 服务端失败：本地回滚，不留幽灵数量
failNext = true
let rejected = false
try {
  await setQuantity({ id: 'd2', ...CATALOG.d2 }, 9)
} catch {
  rejected = true
}
check('失败会抛给调用方', rejected, '没有抛出')
check('失败后数量回滚', quantityOf('d2') === 2, `实际 ${quantityOf('d2')}`)
check('失败后错误可展示', state.error.includes('模拟服务端失败'), state.error)

// 5. 同桌共享：别人加的行会进视图，但不会算成我点的
globalThis.__fake.cart = () => globalThis.__fake.addTeammateLine()
await refresh()
check('同桌的菜出现在购物车', state.cart.items.some(item => item.memberId === 'm-teammate'), JSON.stringify(state.cart.items.map(i => i.memberId)))
check('我的加减号只反映自己的份数', quantityOf('d2') === 2, `实际 ${quantityOf('d2')}`)
check('全桌合计包含同桌份数', state.cart.itemCount === 3, `实际 ${state.cart.itemCount}`)
check('购物车按人分组', state.cart.members.length === 2, `实际 ${state.cart.members.length}`)

const failed = results.filter(r => !r.ok)
console.log(`\n通过 ${results.length - failed.length}/${results.length}`)
process.exit(failed.length ? 1 : 0)
