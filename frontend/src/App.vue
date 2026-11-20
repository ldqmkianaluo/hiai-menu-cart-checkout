<script setup>
import { onMounted } from 'vue'
import { useCart } from './cart'

const { state, loadCart } = useCart()
onMounted(loadCart)
</script>

<template>
  <div class="app-shell">
    <header class="app-header">
      <div class="brand-mark">hi</div>
      <div>
        <strong>hiAi 轻量点餐</strong>
        <p>菜品 · 购物车 · 支付确认</p>
      </div>
      <span class="demo-badge">演示版</span>
    </header>
    <div v-if="state.error" class="global-error" role="alert">{{ state.error }}</div>
    <main>
      <router-view />
    </main>
  </div>
</template>
