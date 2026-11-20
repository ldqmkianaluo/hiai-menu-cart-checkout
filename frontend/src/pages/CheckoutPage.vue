<script setup>
import { onMounted, ref } from 'vue'
import { useCart } from '../cart'
import { api } from '../api'

const { state } = useCart()
const preview = ref(null)
const selectedMethod = ref('wechat_demo')
const loading = ref(true)
const error = ref('')
const demoEnded = ref(false)

async function loadPreview() {
  loading.value = true
  error.value = ''
  try {
    preview.value = await api.checkoutPreview(state.sessionId)
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
  <section class="page checkout-page">
    <div class="page-nav">
      <router-link to="/cart" class="back-button" aria-label="返回购物车">‹</router-link>
      <div><span class="eyebrow">CHECKOUT</span><h1>支付确认</h1></div>
      <span class="safe-label">安全演示</span>
    </div>

    <div v-if="loading" class="state-card"><div class="loader"></div><p>正在核对订单金额…</p></div>
    <div v-else-if="error" class="state-card">
      <span class="state-icon">!</span><h2>无法生成结算预览</h2><p>{{ error }}</p>
      <div class="inline-actions"><router-link to="/cart" class="secondary-button">返回购物车</router-link><button class="primary-button compact" @click="loadPreview">重试</button></div>
    </div>

    <div v-else-if="demoEnded" class="state-card success-card">
      <span class="success-check">✓</span>
      <span class="eyebrow">DEMO COMPLETE</span>
      <h2>演示流程到这里结束</h2>
      <p>没有创建真实支付单，也没有调用微信、余额或银行卡接口。</p>
      <router-link to="/" class="primary-button compact">返回菜品列表</router-link>
    </div>

    <template v-else-if="preview">
      <div class="amount-card">
        <span>本次应付</span>
        <strong><small>¥</small>{{ preview.total.toFixed(2) }}</strong>
        <p>预览号 {{ preview.previewNo }}</p>
      </div>

      <div class="checkout-card">
        <div class="card-heading"><h2>订单明细</h2><span>{{ preview.itemCount }} 件</span></div>
        <div v-for="item in preview.items" :key="item.dishId" class="checkout-line">
          <span>{{ item.name }} × {{ item.quantity }}</span><strong>¥{{ item.lineTotal.toFixed(2) }}</strong>
        </div>
      </div>

      <div class="checkout-card">
        <div class="card-heading"><h2>支付方式</h2><span>仅界面演示</span></div>
        <label v-for="method in preview.paymentMethods" :key="method.code" class="payment-method">
          <span class="payment-logo">{{ method.icon }}</span>
          <span><strong>{{ method.label }}</strong><small>{{ method.description }}</small></span>
          <input v-model="selectedMethod" type="radio" :value="method.code" />
          <i></i>
        </label>
      </div>

      <div class="demo-notice">
        <strong>演示边界</strong>
        <p>点击下方按钮后只展示结束提示，不会创建交易、扣款或改变订单状态。</p>
      </div>

      <div class="bottom-action checkout-action">
        <div><small>确认金额</small><strong>¥{{ preview.total.toFixed(2) }}</strong></div>
        <button class="primary-button" @click="finishDemo">确认信息（演示到此）</button>
      </div>
    </template>
  </section>
</template>
