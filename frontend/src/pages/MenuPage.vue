<script setup>
import { computed, onMounted, ref } from 'vue'
import { api } from '../api'
import { useCart } from '../cart'

const { state, setQuantity, quantityOf } = useCart()
const menu = ref(null)
const activeCategory = ref('all')
const loading = ref(true)
const error = ref('')

const visibleDishes = computed(() => {
  if (!menu.value) return []
  if (activeCategory.value === 'all') return menu.value.dishes
  return menu.value.dishes.filter(dish => dish.categoryId === activeCategory.value)
})

async function loadMenu() {
  loading.value = true
  error.value = ''
  try {
    menu.value = await api.menu()
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

onMounted(loadMenu)
</script>

<template>
  <section class="page menu-page">
    <div v-if="loading" class="skeleton-list" aria-label="正在加载菜品">
      <div v-for="i in 4" :key="i" class="skeleton-card"></div>
    </div>

    <div v-else-if="error" class="state-card">
      <span class="state-icon">!</span>
      <h2>菜品加载失败</h2>
      <p>{{ error }}</p>
      <button class="primary-button compact" @click="loadMenu">重新加载</button>
    </div>

    <template v-else-if="menu">
      <div class="store-hero">
        <div>
          <span class="eyebrow">TODAY'S MENU</span>
          <h1>{{ menu.store.name }}</h1>
          <p>{{ menu.store.notice }}</p>
        </div>
        <div class="store-score"><strong>4.9</strong><span>好评</span></div>
      </div>

      <div class="category-strip" aria-label="菜品分类">
        <button :class="{ active: activeCategory === 'all' }" @click="activeCategory = 'all'">全部</button>
        <button
          v-for="category in menu.categories"
          :key="category.id"
          :class="{ active: activeCategory === category.id }"
          @click="activeCategory = category.id"
        >{{ category.name }}</button>
      </div>

      <div class="section-heading">
        <div><span class="eyebrow">精选菜品</span><h2>今天想吃点什么？</h2></div>
        <span>{{ visibleDishes.length }} 道</span>
      </div>

      <div class="dish-list">
        <article v-for="dish in visibleDishes" :key="dish.id" class="dish-card">
          <div class="dish-art" :style="{ background: dish.artColor }" aria-hidden="true">{{ dish.icon }}</div>
          <div class="dish-body">
            <div class="dish-title-row">
              <h3>{{ dish.name }}</h3>
              <span v-if="dish.tag" class="dish-tag">{{ dish.tag }}</span>
            </div>
            <p>{{ dish.description }}</p>
            <div class="dish-footer">
              <strong class="price"><small>¥</small>{{ dish.price.toFixed(2) }}</strong>
              <div v-if="quantityOf(dish.id)" class="stepper" aria-label="调整数量">
                <button :disabled="state.updating" @click="change(dish.id, -1)" aria-label="减少">−</button>
                <span>{{ quantityOf(dish.id) }}</span>
                <button :disabled="state.updating" @click="change(dish.id, 1)" aria-label="增加">+</button>
              </div>
              <button v-else class="add-button" :disabled="state.updating" @click="change(dish.id, 1)">加入</button>
            </div>
          </div>
        </article>
      </div>
    </template>

    <router-link v-if="state.cart.itemCount" to="/cart" class="cart-dock">
      <span class="cart-icon">袋</span>
      <span class="cart-count">{{ state.cart.itemCount }}</span>
      <div><small>购物车合计</small><strong>¥{{ state.cart.total.toFixed(2) }}</strong></div>
      <b>去结算</b>
    </router-link>
  </section>
</template>
