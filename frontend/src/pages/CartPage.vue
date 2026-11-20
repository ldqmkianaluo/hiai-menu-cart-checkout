<script setup>
import { useCart } from '../cart'

const { state, setQuantity } = useCart()

async function change(item, delta) {
  try {
    await setQuantity(item.dishId, item.quantity + delta)
  } catch (_) {}
}
</script>

<template>
  <section class="page cart-page">
    <div class="page-nav">
      <router-link to="/" class="back-button" aria-label="返回菜品列表">‹</router-link>
      <div><span class="eyebrow">YOUR CART</span><h1>购物车</h1></div>
      <span class="nav-count">{{ state.cart.itemCount }} 件</span>
    </div>

    <div v-if="state.loading" class="state-card"><div class="loader"></div><p>正在读取购物车…</p></div>

    <div v-else-if="!state.cart.items.length" class="state-card empty-cart">
      <span class="state-icon">篮</span>
      <h2>购物车还是空的</h2>
      <p>先挑几道喜欢的菜，再回来结算。</p>
      <router-link to="/" class="primary-button compact">去选菜</router-link>
    </div>

    <template v-else>
      <div class="cart-list">
        <article v-for="item in state.cart.items" :key="item.dishId" class="cart-item">
          <div class="cart-item-art" :style="{ background: item.artColor }">{{ item.icon }}</div>
          <div class="cart-item-main">
            <h2>{{ item.name }}</h2>
            <span>单价 ¥{{ item.price.toFixed(2) }}</span>
            <strong>¥{{ item.lineTotal.toFixed(2) }}</strong>
          </div>
          <div class="stepper vertical-stepper">
            <button :disabled="state.updating" @click="change(item, -1)" aria-label="减少">−</button>
            <span>{{ item.quantity }}</span>
            <button :disabled="state.updating" @click="change(item, 1)" aria-label="增加">+</button>
          </div>
        </article>
      </div>

      <div class="summary-card">
        <div><span>菜品数量</span><strong>{{ state.cart.itemCount }} 件</strong></div>
        <div><span>餐盒费</span><strong>¥0.00</strong></div>
        <div class="summary-total"><span>合计</span><strong>¥{{ state.cart.total.toFixed(2) }}</strong></div>
      </div>

      <div class="bottom-action">
        <div><small>应付</small><strong>¥{{ state.cart.total.toFixed(2) }}</strong></div>
        <router-link to="/checkout" class="primary-button">去支付确认</router-link>
      </div>
    </template>
  </section>
</template>
