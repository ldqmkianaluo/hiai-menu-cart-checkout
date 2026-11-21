<script setup>
import { onMounted, ref } from 'vue'
import { api } from '../api'
import { useCart } from '../cart'

const { state } = useCart()
const preview = ref(null)
const selectedMethod = ref('wechat_demo')
const loading = ref(true)
const error = ref('')
const demoEnded = ref(false)
const itemsExpanded = ref(true)
const coupon = ref(null)

const money = value => Number(value || 0).toFixed(2)

async function loadPreview() {
  loading.value = true
  error.value = ''
  try {
    const selectedDishIds = JSON.parse(sessionStorage.getItem('hiai-demo-selected-dish-ids') || '[]')
    let stored = null
    try {
      stored = JSON.parse(sessionStorage.getItem('hiai-demo-coupon') || 'null')
    } catch (_) {
      stored = null
    }
    preview.value = await api.checkoutPreview(state.table, selectedDishIds, stored?.code || '')
    coupon.value = preview.value.coupon || null
    selectedMethod.value = preview.value.paymentMethods[0]?.code || ''
  } catch (err) {
    error.value = err.message
  } finally {
    loading.value = false
  }
}

function finishDemo() {
  demoEnded.value = true
  window.scrollTo({ top: 0, behavior: 'smooth' })
}

onMounted(loadPreview)
</script>

<template>
  <section class="pay-page">
    <header class="simple-nav pay-nav">
      <router-link to="/" class="back-button" aria-label="返回点餐">‹</router-link>
      <div class="nav-title"><span class="nav-kicker">CHECKOUT</span><strong>支付订单</strong></div>
      <span></span>
    </header>

    <div v-if="loading" class="full-state"><div class="loader"></div><p>正在核对订单金额…</p></div>
    <div v-else-if="error" class="empty-card">
      <div class="state-sign">!</div>
      <h1>暂时无法结算</h1>
      <p>{{ error }}</p>
      <div class="empty-actions">
        <button class="plain-primary" @click="loadPreview">重新加载</button>
        <router-link to="/" class="plain-ghost">返回点餐</router-link>
      </div>
    </div>
    <div v-else-if="demoEnded" class="empty-card demo-complete"><div class="state-sign success">✓</div><h1>流程演示到这里结束</h1><p>没有创建真实支付单，也没有调用微信或其他扣款接口。</p><router-link to="/" class="plain-primary">返回点餐</router-link></div>

    <template v-else-if="preview">
      <section class="pay-amount-card">
        <span class="pay-amount-label">本次待付</span>
        <div class="pay-amount-value"><span>¥</span>{{ money(preview.payTotal ?? preview.total) }}</div>
        <span class="pay-amount-context">
          共 {{ preview.itemCount }} 件菜品<template v-if="preview.discount > 0"> · 已优惠 ¥{{ money(preview.discount) }}</template>
        </span>
      </section>

      <section class="demo-boundary"><span>演示环境</span><p>页面保留至付款确认，不会发起真实交易。</p></section>

      <section class="items-card">
        <header class="items-hd"><strong>本次结账菜品</strong><span>共 {{ preview.itemCount }} 件</span></header>
        <template v-if="itemsExpanded">
          <div v-for="item in preview.items" :key="item.dishId" class="items-row">
            <span class="items-name">{{ item.name }}</span><span class="items-qty">×{{ item.quantity }}</span><strong>¥{{ money(item.lineTotal) }}</strong>
          </div>
          <div v-if="preview.baseDiscount > 0" class="items-row discount-row">
            <span class="items-name">拼桌折扣 · {{ preview.memberCount }} 人同桌（{{ preview.baseRate }}%）</span><span class="items-qty" />
            <strong>-¥{{ money(preview.baseDiscount) }}</strong>
          </div>
          <div v-if="preview.discount > 0" class="items-row discount-row">
            <span class="items-name">抽奖券 · {{ coupon?.name || '已核销' }}</span><span class="items-qty" />
            <strong>-¥{{ money(preview.discount) }}</strong>
          </div>
        </template>
        <p v-if="preview.floorApplied" class="coupon-note">已按「实付不低于小计 60%」封顶，优惠没有全部生效。</p>
        <p v-if="preview.couponNote" class="coupon-note">{{ preview.couponNote }}</p>
        <router-link v-if="!coupon" to="/lucky" class="coupon-link">还没用券？去抽一张 →</router-link>
        <button class="items-toggle" @click="itemsExpanded = !itemsExpanded">{{ itemsExpanded ? '收起菜品明细' : '查看菜品明细' }} <span>{{ itemsExpanded ? '⌃' : '⌄' }}</span></button>
      </section>

      <section class="payment-methods">
        <header class="payment-section-head"><div><strong>支付方式</strong><span>请选择本次支付方式</span></div></header>
        <div class="payment-options">
          <label v-for="method in preview.paymentMethods" :key="method.code" class="method-select">
            <span class="method-icon" :class="{ wechat: method.code === 'wechat_demo' }">{{ method.code === 'wechat_demo' ? '微' : '店' }}</span>
            <span class="method-copy"><strong>{{ method.label }}</strong><small>{{ method.description }}</small></span>
            <input v-model="selectedMethod" :value="method.code" type="radio" />
            <i class="selection-indicator" :class="{ selected: selectedMethod === method.code }">✓</i>
          </label>
        </div>
      </section>

      <footer class="pay-footer">
        <div class="footer-total"><span>本次合计</span><strong>¥{{ money(preview.payTotal ?? preview.total) }}</strong></div>
        <button class="pay-btn" @click="finishDemo">确认支付 ¥{{ money(preview.payTotal ?? preview.total) }}</button>
      </footer>
    </template>
  </section>
</template>
