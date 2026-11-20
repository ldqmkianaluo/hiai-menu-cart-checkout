<script setup>
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { api } from '../api'
import { useCart } from '../cart'

const router = useRouter()
const { state, setQuantity, quantityOf } = useCart()
const menu = ref(null)
const activeCategory = ref('')
const searchKeyword = ref('')
const loading = ref(true)
const error = ref('')
const cartOpen = ref(false)
const selectedDishIds = ref([])

const categoryIcons = { signature: '荐', hot: '热', staple: '食', drink: '饮' }
const filteredDishes = computed(() => {
  const keyword = searchKeyword.value.trim()
  if (!menu.value) return []
  return keyword
    ? menu.value.dishes.filter(dish => `${dish.name}${dish.description}`.includes(keyword))
    : menu.value.dishes
})
const categoryDishes = categoryId => filteredDishes.value.filter(dish => dish.categoryId === categoryId)
const activeDishes = computed(() => categoryDishes(activeCategory.value))
const selectedItems = computed(() => state.cart.items.filter(item => selectedDishIds.value.includes(item.dishId)))
const selectedItemCount = computed(() => selectedItems.value.reduce((sum, item) => sum + item.quantity, 0))
const selectedTotal = computed(() => selectedItems.value.reduce((sum, item) => sum + item.lineTotal, 0))
const allSelected = computed(() => state.cart.items.length > 0 && selectedItems.value.length === state.cart.items.length)

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

async function change(dishId, delta) {
  const nextQuantity = quantityOf(dishId) + delta
  try {
    await setQuantity(dishId, nextQuantity)
    if (nextQuantity <= 0) selectedDishIds.value = selectedDishIds.value.filter(id => id !== dishId)
  } catch (_) {}
}

async function removeDish(dishId) {
  try {
    await setQuantity(dishId, 0)
    selectedDishIds.value = selectedDishIds.value.filter(id => id !== dishId)
    if (!state.cart.items.length) cartOpen.value = false
  } catch (_) {}
}

function openCart() {
  if (!state.cart.itemCount) return
  selectedDishIds.value = state.cart.items.map(item => item.dishId)
  cartOpen.value = true
}

function toggleSelected(dishId) {
  selectedDishIds.value = selectedDishIds.value.includes(dishId)
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
</script>

<template>
  <section class="menu-page oriental-menu">
    <template v-if="menu">
      <header class="order-hero">
        <div class="hero-store-card">
          <div class="hero-logo placeholder">{{ menu.store.name.slice(0, 1) }}</div>
          <div class="hero-main">
            <div class="hero-title-row">
              <strong class="hero-name">{{ menu.store.name }}</strong>
              <span class="hero-status">营业中</span>
            </div>
            <span class="hero-sub">2 人用餐 · 已点 {{ state.cart.itemCount }} 件</span>
          </div>
          <button class="hero-seat-card" aria-label="当前桌号">
            <span class="hero-seat-label">当前桌</span>
            <strong class="hero-seat-no">A08</strong>
          </button>
        </div>

        <div class="oriental-actions">
          <button class="oriental-action"><span class="oriental-action-icon">铃</span><strong>呼叫服务</strong><small>加水 · 餐具 · 结账</small></button>
          <button class="oriental-action ai"><span class="oriental-action-icon">AI</span><strong>问AI</strong><small>按口味帮你点菜</small></button>
        </div>

        <label class="search-box">
          <span class="search-icon" aria-hidden="true"></span>
          <input v-model="searchKeyword" class="search-input" placeholder="搜索菜品、套餐、口味" />
          <button v-if="searchKeyword" class="search-clear" @click="searchKeyword = ''" aria-label="清空搜索">×</button>
        </label>
      </header>

      <div class="tab-bar"><span class="tab tab-on">点餐</span></div>

      <div class="menu-body">
        <aside class="cats" aria-label="菜品分类">
          <button
            v-for="category in menu.categories"
            :key="category.id"
            class="cat-item"
            :class="{ active: activeCategory === category.id }"
            @click="activeCategory = category.id"
          >
            <span class="cat-icon">{{ categoryIcons[category.id] || '菜' }}</span>
            <span class="cat-name">{{ category.name }}</span>
            <span v-if="menu.dishes.filter(d => d.categoryId === category.id).reduce((sum, d) => sum + quantityOf(d.id), 0)" class="cat-badge">
              {{ menu.dishes.filter(d => d.categoryId === category.id).reduce((sum, d) => sum + quantityOf(d.id), 0) }}
            </span>
          </button>
        </aside>

        <main class="dishes">
          <div v-if="searchKeyword" class="cat-title">
            <div class="cat-title-label"><span class="cat-title-icon">搜</span><strong>搜索结果</strong></div>
            <span class="cat-count">{{ filteredDishes.length }} 道</span>
          </div>
          <div v-else class="cat-title">
            <div class="cat-title-label"><span class="cat-title-icon">{{ categoryIcons[activeCategory] || '菜' }}</span><strong>{{ menu.categories.find(c => c.id === activeCategory)?.name }}</strong></div>
            <span class="cat-count">{{ activeDishes.length }} 道</span>
          </div>

          <div v-if="!(searchKeyword ? filteredDishes : activeDishes).length" class="menu-empty">暂无相关菜品</div>
          <article v-for="dish in (searchKeyword ? filteredDishes : activeDishes)" :key="dish.id" class="dish-card">
            <div class="dish-img-wrap" :style="{ background: dish.artColor }">
              <span class="dish-art">{{ dish.icon }}</span>
              <span v-if="dish.tag" class="badge-corner-tl">{{ dish.tag }}</span>
            </div>
            <div class="dish-name-row"><strong class="dish-name">{{ dish.name }}</strong></div>
            <div class="dish-chip-row"><span class="dish-chip gold">月售 {{ 36 + Number(dish.id.slice(-1)) * 7 }}</span></div>
            <p class="dish-selling-point">{{ dish.description }}</p>
            <div class="dish-footer">
              <strong class="dish-price">¥{{ dish.price.toFixed(2) }}</strong>
              <div class="qty-ctl">
                <button v-if="quantityOf(dish.id)" class="qty-btn minus" :disabled="state.updating" @click="change(dish.id, -1)" aria-label="减少">−</button>
                <span v-if="quantityOf(dish.id)" class="qty-num">{{ quantityOf(dish.id) }}</span>
                <button class="qty-btn plus" :disabled="state.updating" @click="change(dish.id, 1)" aria-label="增加">＋</button>
              </div>
            </div>
          </article>
          <div class="cart-safe-space"></div>
        </main>
      </div>

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
            <div class="sc-group">
              <div class="sc-group-hd">
                <div class="sc-who"><span class="sc-who-avatar">我</span><span class="sc-group-label mine">我点的</span></div>
                <span class="sc-group-meta">{{ state.cart.items.length }} 项</span>
              </div>
            <article v-for="item in state.cart.items" :key="item.dishId" class="sc-row" @click="toggleSelected(item.dishId)">
              <button class="sc-check" :class="{ on: selectedDishIds.includes(item.dishId) }" :aria-label="selectedDishIds.includes(item.dishId) ? '取消选择' + item.name : '选择' + item.name">
                <span v-if="selectedDishIds.includes(item.dishId)">✓</span>
              </button>
              <div class="sc-meta">
                <strong class="sc-name">{{ item.name }}</strong>
                <span class="sc-qty">×{{ item.quantity }}</span>
                <span class="sc-unit-price">单价 ¥{{ item.price.toFixed(2) }}</span>
                <strong class="sc-line-amount">小计 ¥{{ item.lineTotal.toFixed(2) }}</strong>
              </div>
              <div class="sc-ops" @click.stop>
                <button class="sc-qty-btn" :disabled="state.updating" :aria-label="'减少' + item.name" @click="change(item.dishId, -1)">−</button>
                <span class="sc-qty-num">{{ item.quantity }}</span>
                <button class="sc-qty-btn" :disabled="state.updating" :aria-label="'增加' + item.name" @click="change(item.dishId, 1)">＋</button>
              </div>
              <button class="sc-del" :disabled="state.updating" :aria-label="'移除' + item.name" @click.stop="removeDish(item.dishId)">×</button>
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
          <span class="cart-basket-icon">🧺</span><span v-if="state.cart.itemCount" class="cart-basket-badge">{{ state.cart.itemCount }}</span>
        </button>
        <div class="cart-info">
          <strong class="cart-total" :class="{ 'cart-total-zero': !state.cart.itemCount }">¥{{ state.cart.total.toFixed(2) }}</strong>
          <span class="cart-count">已选 {{ state.cart.itemCount }} 件</span>
        </div>
        <button class="checkout-btn" :class="{ 'checkout-active': state.cart.itemCount }" :disabled="!state.cart.itemCount" @click="openCart">去结算</button>
      </footer>
    </template>

    <div v-else-if="loading" class="full-state"><div class="loader"></div><p>菜单加载中…</p></div>
    <div v-else class="full-state"><strong>菜单加载失败</strong><p>{{ error }}</p><button class="plain-primary" @click="loadMenu">重新加载</button></div>
  </section>
</template>
