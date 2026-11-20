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
  try {
    await setQuantity(dishId, quantityOf(dishId) + delta)
  } catch (_) {}
}

async function clearCart() {
  for (const item of [...state.cart.items]) await setQuantity(item.dishId, 0)
  cartOpen.value = false
}

function openCart() {
  if (state.cart.itemCount) cartOpen.value = true
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
        <section class="cart-sheet" role="dialog" aria-label="购物车">
          <header class="cart-popup-hd">
            <span class="cart-popup-icon">🧺</span>
            <div class="cart-popup-title"><strong class="cart-popup-total">¥{{ state.cart.total.toFixed(2) }}</strong><span class="cart-popup-count">共 {{ state.cart.itemCount }} 件</span></div>
            <button class="cart-popup-clear" @click="clearCart">清空</button>
          </header>
          <div class="cart-popup-body">
            <article v-for="item in state.cart.items" :key="item.dishId" class="cart-row">
              <div class="cart-row-img" :style="{ background: item.artColor }">{{ item.icon }}</div>
              <div class="cart-row-meta"><strong>{{ item.name }}</strong><span>¥{{ item.price.toFixed(2) }}</span></div>
              <div class="cart-row-qty">
                <button class="cart-qty-btn minus" @click="change(item.dishId, -1)">−</button><b>{{ item.quantity }}</b><button class="cart-qty-btn plus" @click="change(item.dishId, 1)">＋</button>
              </div>
            </article>
          </div>
          <footer class="cart-popup-footer"><button class="cart-popup-checkout" @click="router.push('/checkout')">去结算</button></footer>
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
        <button class="checkout-btn" :class="{ 'checkout-active': state.cart.itemCount }" :disabled="!state.cart.itemCount" @click="router.push('/checkout')">去结算</button>
      </footer>
    </template>

    <div v-else-if="loading" class="full-state"><div class="loader"></div><p>菜单加载中…</p></div>
    <div v-else class="full-state"><strong>菜单加载失败</strong><p>{{ error }}</p><button class="plain-primary" @click="loadMenu">重新加载</button></div>
  </section>
</template>
