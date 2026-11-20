<script setup>
import { useCart } from '../cart'

const { state, setQuantity } = useCart()
async function change(item, delta) {
  try { await setQuantity(item.dishId, item.quantity + delta) } catch (_) {}
}
</script>

<template>
  <section class="cart-page oriental-page">
    <header class="simple-nav">
      <router-link to="/" class="back-button" aria-label="返回点餐">‹</router-link>
      <strong>确认菜品</strong>
      <span>{{ state.cart.itemCount }} 件</span>
    </header>

    <div v-if="state.loading" class="full-state"><div class="loader"></div><p>正在读取购物车…</p></div>
    <div v-else-if="!state.cart.items.length" class="empty-card">
      <div class="empty-basket">🧺</div><h1>还没有选菜</h1><p>返回菜单，挑几道喜欢的菜吧。</p><router-link to="/" class="plain-primary">去点餐</router-link>
    </div>
    <template v-else>
      <section class="cart-order-card">
        <div class="cart-card-head"><div><span class="red-mark"></span><strong>本桌菜品</strong></div><span>朱家大院 · A08桌</span></div>
        <article v-for="item in state.cart.items" :key="item.dishId" class="confirm-row">
          <div class="confirm-art" :style="{ background: item.artColor }">{{ item.icon }}</div>
          <div class="confirm-main"><strong>{{ item.name }}</strong><small>现点现做</small><b>¥{{ item.lineTotal.toFixed(2) }}</b></div>
          <div class="cart-row-qty"><button class="cart-qty-btn minus" @click="change(item, -1)">−</button><span>{{ item.quantity }}</span><button class="cart-qty-btn plus" @click="change(item, 1)">＋</button></div>
        </article>
      </section>

      <section class="order-note-card">
        <div><span>餐具数量</span><strong>按用餐人数提供</strong></div>
        <div><span>订单备注</span><span class="muted">口味、忌口等 ›</span></div>
      </section>

      <section class="price-card">
        <div><span>菜品小计</span><strong>¥{{ state.cart.total.toFixed(2) }}</strong></div>
        <div><span>餐盒费</span><strong>¥0.00</strong></div>
        <div class="price-total"><span>合计</span><strong>¥{{ state.cart.total.toFixed(2) }}</strong></div>
      </section>

      <footer class="confirm-footer">
        <div><span>合计</span><strong>¥{{ state.cart.total.toFixed(2) }}</strong></div>
        <router-link to="/checkout" class="confirm-order-button">确认下单</router-link>
      </footer>
    </template>
  </section>
</template>
