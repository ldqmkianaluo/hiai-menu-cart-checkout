<script setup>
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { api } from '../api'
import { useCart } from '../cart'

const router = useRouter()
const { state, setQuantity, quantityOf, isPending, refresh } = useCart()
const menu = ref(null)
const activeCategory = ref('')
const searchKeyword = ref('')
const loading = ref(true)
const error = ref('')
const cartOpen = ref(false)
const selectedDishIds = ref([])

const filteredDishes = computed(() => {
  const keyword = searchKeyword.value.trim()
  if (!menu.value) return []
  return keyword
    ? menu.value.dishes.filter(dish => `${dish.name}${dish.description}`.includes(keyword))
    : menu.value.dishes
})
const activeDishes = computed(() => filteredDishes.value.filter(dish => dish.categoryId === activeCategory.value))
const displayedDishes = computed(() => (searchKeyword.value.trim() ? filteredDishes.value : activeDishes.value))
const currentCategoryName = computed(() => menu.value?.categories.find(item => item.id === activeCategory.value)?.name || '')
const selectedItems = computed(() => state.cart.items.filter(item => selectedDishIds.value.includes(item.dishId)))
const selectedItemCount = computed(() => selectedItems.value.reduce((sum, item) => sum + item.quantity, 0))
const selectedTotal = computed(() => selectedItems.value.reduce((sum, item) => sum + item.lineTotal, 0))
const allSelected = computed(() => state.cart.items.length > 0 && selectedItems.value.length === state.cart.items.length)

// 购物车按人分组：我的一组在最前，同桌其他人只读展示。
const cartGroups = computed(() => {
  const groups = new Map()
  for (const item of state.cart.items) {
    const isMe = item.memberId === state.memberId
    const group = groups.get(item.memberId) || {
      id: item.memberId,
      isMe,
      label: isMe ? '我点的' : item.memberName,
      avatar: isMe ? '我' : String(item.memberName || '桌').slice(0, 1),
      items: [],
      itemCount: 0,
    }
    group.items.push(item)
    group.itemCount += item.quantity
    groups.set(item.memberId, group)
  }
  return [...groups.values()].sort((a, b) => Number(b.isMe) - Number(a.isMe))
})

// 分类角标一次算好，避免每个分类在渲染时反复 filter + reduce。
const dishCategory = computed(() => {
  const map = {}
  for (const dish of menu.value?.dishes || []) map[dish.id] = dish.categoryId
  return map
})
const categoryCounts = computed(() => {
  const counts = {}
  for (const item of state.cart.items) {
    const categoryId = dishCategory.value[item.dishId]
    if (categoryId) counts[categoryId] = (counts[categoryId] || 0) + item.quantity
  }
  return counts
})

// 菜品被减到 0 后，勾选状态跟着失效。
watch(() => state.cart.items.map(item => item.dishId), ids => {
  selectedDishIds.value = selectedDishIds.value.filter(id => ids.includes(id))
})

async function loadMenu() {
  loading.value = true
  error.value = ''
  try {
    menu.value = await api.menu()
    activeCategory.value = menu.value.categories[0]?.id || ''
  } catch (err) {
    error.value = err.message
  } finally {
    loading.value = false
  }
}

async function change(dish, delta) {
  const dishId = dish.id ?? dish.dishId
  const next = quantityOf(dishId) + delta
  if (next > 0 && !selectedDishIds.value.includes(dishId)) {
    selectedDishIds.value = [...selectedDishIds.value, dishId]
  }
  try {
    await setQuantity(dish, next)
    if (next <= 0) selectedDishIds.value = selectedDishIds.value.filter(id => id !== dishId)
  } catch {
    // 本地数量已回滚，提示由顶部全局错误条给出。
  }
}

async function removeDish(item) {
  try {
    await setQuantity(item, 0)
    selectedDishIds.value = selectedDishIds.value.filter(id => id !== item.dishId)
    if (!state.cart.items.length) cartOpen.value = false
  } catch {
    // 同上。
  }
}

function selectCategory(categoryId) {
  activeCategory.value = categoryId
  searchKeyword.value = ''
}

function openCart() {
  if (!state.cart.itemCount) return
  const ids = state.cart.items.map(item => item.dishId)
  selectedDishIds.value = selectedDishIds.value.filter(id => ids.includes(id))
  cartOpen.value = true
}

function toggleSelected(dishId) {  selectedDishIds.value = selectedDishIds.value.includes(dishId)
    ? selectedDishIds.value.filter(id => id !== dishId)
    : [...selectedDishIds.value, dishId]
}

function toggleAllSelected() {
  selectedDishIds.value = allSelected.value ? [] : state.cart.items.map(item => item.dishId)
}

function checkoutSelected() {
  if (!selectedDishIds.value.length) return
  sessionStorage.setItem('hiai-demo-selected-dish-ids', JSON.stringify(selectedDishIds.value))
  router.push('/checkout')
}

onMounted(loadMenu)

// 同桌共享：每 3 秒同步一次，回到页面前台时立刻同步。
let pollTimer = null
function syncOnVisible() {
  if (document.visibilityState === 'visible') refresh()
}
onMounted(() => {
  pollTimer = setInterval(refresh, 3000)
  document.addEventListener('visibilitychange', syncOnVisible)
})
onUnmounted(() => {
  clearInterval(pollTimer)
  document.removeEventListener('visibilitychange', syncOnVisible)
})
</script>

<template>
  <section class="menu-page">
    <template v-if="menu">
      <header class="store-hero">
        <p class="hero-kicker">HI·AI ORDER SYSTEM</p>
        <div class="hero-store">
          <div class="hero-logo">{{ menu.store.name.slice(0, 1) }}</div>
          <div class="hero-main">
            <strong class="hero-name">{{ menu.store.name }}</strong>
            <span class="hero-sub">{{ menu.store.notice }}</span>
          </div>
          <div class="hero-seat">
            <span class="hero-seat-label">桌号</span>
            <strong class="hero-seat-no">{{ state.table }}</strong>
          </div>
        </div>
        <div class="hero-meta">
          <span class="hero-status">营业中</span>
          <span class="hero-sep">·</span>
          <span class="hero-meta-text">同桌 {{ state.cart.members.length }} 人 · 共 {{ state.cart.itemCount }} 件</span>
        </div>
        <div class="hero-entries">
          <button type="button" class="hero-entry" @click="router.push('/lucky')">
            <span class="hero-entry-kicker">PROMO</span>
            <span class="hero-entry-label">抽奖打折</span>
          </button>
          <button type="button" class="hero-entry hero-entry-ghost" @click="router.push('/reserve')">
            <span class="hero-entry-kicker">RESERVE</span>
            <span class="hero-entry-label">预约留座</span>
          </button>
          <button type="button" class="hero-entry hero-entry-ghost" @click="router.push('/agent')">
            <span class="hero-entry-kicker">AGENT</span>
            <span class="hero-entry-label">智能点餐</span>
          </button>
        </div>
        <label class="search-box">
          <span class="search-icon" aria-hidden="true"></span>
          <input v-model="searchKeyword" class="search-input" placeholder="搜索菜品、口味" />
          <button v-if="searchKeyword" class="search-clear" @click="searchKeyword = ''" aria-label="清空搜索">×</button>
        </label>
      </header>

      <nav class="cat-tabs" aria-label="菜品分类">
        <button
          v-for="category in menu.categories"
          :key="category.id"
          class="cat-tab"
          :class="{ active: !searchKeyword.trim() && activeCategory === category.id }"
          @click="selectCategory(category.id)"
        >
          <span class="cat-tab-name">{{ category.name }}</span>
          <span v-if="categoryCounts[category.id]" class="cat-tab-badge">{{ categoryCounts[category.id] }}</span>
        </button>
      </nav>

      <main class="dishes">
        <div class="dish-list-head">
          <strong>{{ searchKeyword.trim() ? '搜索结果' : currentCategoryName }}</strong>
          <span>{{ displayedDishes.length }} 道</span>
        </div>

        <p v-if="!displayedDishes.length" class="menu-empty">暂无相关菜品</p>

        <article v-for="(dish, index) in displayedDishes" :key="dish.id" class="dish-card">
          <div class="dish-thumb" :style="{ background: dish.artColor }">
            <span class="dish-mark">{{ dish.name.slice(0, 1) }}</span>
            <span class="dish-no">{{ String(index + 1).padStart(2, '0') }}</span>
          </div>
          <div class="dish-body">
            <div class="dish-name-row">
              <strong class="dish-name">{{ dish.name }}</strong>
              <span v-if="dish.tag" class="dish-tag">{{ dish.tag }}</span>
            </div>
            <p class="dish-desc">{{ dish.description }}</p>
            <div class="dish-footer">
              <strong class="dish-price"><small>¥</small>{{ dish.price.toFixed(2) }}</strong>
              <div class="qty-ctl">
                <button v-if="quantityOf(dish.id)" class="qty-btn minus" :aria-busy="isPending(dish.id)" @click="change(dish, -1)" aria-label="减少">−</button>
                <span v-if="quantityOf(dish.id)" class="qty-num">{{ quantityOf(dish.id) }}</span>
                <button class="qty-btn plus" :aria-busy="isPending(dish.id)" @click="change(dish, 1)" aria-label="增加">＋</button>
              </div>
            </div>
          </div>
        </article>
        <p v-if="displayedDishes.length" class="menu-foot">
          {{ searchKeyword.trim() ? '以上为搜索结果' : `以上为全部${currentCategoryName}菜品` }}
        </p>
        <div class="cart-safe-space"></div>
      </main>

      <div v-if="cartOpen" class="cart-mask" @click.self="cartOpen = false">
        <section class="sc-sheet" role="dialog" aria-label="购物车">
          <header class="sc-hd">
            <div class="sc-title-row">
              <strong class="sc-title">购物车</strong>
              <span class="sc-sub">{{ state.cart.itemCount }} 件待提交</span>
            </div>
            <button class="sc-close" aria-label="关闭购物车" @click="cartOpen = false">×</button>
          </header>
          <div class="sc-body">
            <div v-for="group in cartGroups" :key="group.id" class="sc-group">
              <div class="sc-group-hd">
                <div class="sc-who">
                  <span class="sc-who-avatar" :class="{ other: !group.isMe }">{{ group.avatar }}</span>
                  <span class="sc-group-label" :class="{ mine: group.isMe }">{{ group.label }}</span>
                </div>
                <span class="sc-group-meta">{{ group.itemCount }} 件</span>
              </div>
              <article v-for="item in group.items" :key="item.memberId + item.dishId" class="sc-row">
                <button
                  class="sc-check"
                  :class="{ on: selectedDishIds.includes(item.dishId) }"
                  :aria-pressed="selectedDishIds.includes(item.dishId)"
                  :aria-label="selectedDishIds.includes(item.dishId) ? '取消选择' + item.name : '选择' + item.name"
                  @click="toggleSelected(item.dishId)"
                >
                  <span v-if="selectedDishIds.includes(item.dishId)">✓</span>
                </button>
                <div class="sc-meta">
                  <strong class="sc-name">{{ item.name }}</strong>
                  <span class="sc-unit-price">¥{{ item.price.toFixed(2) }} / 份</span>
                  <strong class="sc-line-amount">小计 ¥{{ item.lineTotal.toFixed(2) }}</strong>
                </div>
                <div v-if="item.memberId === state.memberId" class="sc-ops" @click.stop>
                  <button class="sc-qty-btn" :aria-busy="isPending(item.dishId)" :aria-label="'减少' + item.name" @click="change(item, -1)">−</button>
                  <span class="sc-qty-num">{{ item.quantity }}</span>
                  <button class="sc-qty-btn plus" :aria-busy="isPending(item.dishId)" :aria-label="'增加' + item.name" @click="change(item, 1)">＋</button>
                </div>
                <span v-else class="sc-qty-readonly">×{{ item.quantity }}</span>
                <button
                  v-if="item.memberId === state.memberId"
                  class="sc-del"
                  :aria-busy="isPending(item.dishId)"
                  :aria-label="'移除' + item.name"
                  @click.stop="removeDish(item)"
                >×</button>
                <span v-else class="sc-del-placeholder"></span>
              </article>
            </div>
          </div>
          <div class="sc-summary">
            <div class="sc-summary-row"><strong>合计待支付</strong><strong class="sc-summary-amount">¥{{ selectedTotal.toFixed(2) }}</strong></div>
            <span class="sc-price-hint">优惠及应付金额以下单时为准</span>
          </div>
          <footer class="sc-ft">
            <div class="sc-ft-left">
              <button class="sc-sel" @click="toggleAllSelected">{{ allSelected ? '取消全选' : '全选新菜' }}</button>
              <span class="sc-sel-count">{{ selectedDishIds.length ? `已选 ${selectedDishIds.length} 项，共 ${selectedItemCount} 件` : '请选择要提交的菜品' }}</span>
            </div>
            <button class="sc-submit" :disabled="!selectedDishIds.length" @click="checkoutSelected">去支付</button>
          </footer>
        </section>
      </div>

      <footer class="cart-bar">
        <button class="cart-basket" :class="{ 'cart-basket-on': state.cart.itemCount }" @click="openCart" aria-label="打开购物车">
          <svg class="cart-basket-icon" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M5.5 8h13l-1.1 11.2a1.4 1.4 0 0 1-1.4 1.3H8a1.4 1.4 0 0 1-1.4-1.3L5.5 8Z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" />
            <path d="M9 8V6.6a3 3 0 0 1 6 0V8" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" />
          </svg>
          <span v-if="state.cart.itemCount" class="cart-basket-badge">{{ state.cart.itemCount }}</span>
        </button>
        <div class="cart-info">
          <strong class="cart-total" :class="{ 'cart-total-zero': !state.cart.itemCount }">¥{{ state.cart.total.toFixed(2) }}</strong>
          <span class="cart-count">全桌 {{ state.cart.itemCount }} 件</span>
        </div>
        <button class="checkout-btn" :class="{ 'checkout-active': state.cart.itemCount }" :disabled="!state.cart.itemCount" @click="openCart">去结算</button>
      </footer>
    </template>

    <div v-else-if="loading" class="full-state"><div class="loader"></div><p>菜单加载中…</p></div>
    <div v-else class="full-state"><strong>菜单加载失败</strong><p>{{ error }}</p><button class="plain-primary" @click="loadMenu">重新加载</button></div>
  </section>
</template>
