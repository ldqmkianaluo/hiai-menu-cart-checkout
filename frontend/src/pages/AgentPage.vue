<script setup>
import { nextTick, onMounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { api } from '../api.js'
import { useCart } from '../cart.js'

const router = useRouter()
const { state, setQuantity } = useCart()

const QUICK = [
  '三个人，想吃辣的下饭菜，预算 150',
  '两个人，清淡一点，有汤最好',
  '四个人，想吃鱼，预算 200',
  '一个人随便吃点，别太贵',
]

const messages = ref([])
const draft = ref('')
const sending = ref(false)
const error = ref('')
const scroller = ref(null)

const CHINESE_NUM = { 一: 1, 两: 2, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10 }

function parseParty(text) {
  const hit = text.match(/([一两二三四五六七八九十\d]+)\s*(?:个)?人/)
  if (!hit) return 0
  const raw = hit[1]
  return /^\d+$/.test(raw) ? Number(raw) : CHINESE_NUM[raw] || 0
}

function parseBudget(text) {
  const hit = text.match(/预算\s*(\d+)/)
  return hit ? Number(hit[1]) : 0
}

function scrollDown() {
  nextTick(() => {
    if (scroller.value) scroller.value.scrollTop = scroller.value.scrollHeight
  })
}

function pushAssistant(payload) {
  messages.value.push({
    role: 'assistant',
    text: payload.text,
    engine: payload.engine || '',
    disclaimer: payload.disclaimer || '',
    note: payload.note || '',
    items: (payload.items || []).map(item => ({ ...item, quantity: Math.max(1, item.quantity) })),
    added: false,
  })
  scrollDown()
}

async function send(text) {
  const content = (text ?? draft.value).trim()
  if (!content || sending.value) return
  draft.value = ''
  error.value = ''
  messages.value.push({ role: 'user', text: content })
  scrollDown()
  sending.value = true
  try {
    const history = messages.value
      .filter(item => item.text)
      .map(item => ({ role: item.role, content: item.text }))
      .slice(-8)
    const result = await api.agentChat({
      messages: history,
      table: state.table,
      member: state.memberId,
      partySize: parseParty(content),
      budget: parseBudget(content),
    })
    pushAssistant({
      text: result.reply,
      engine: result.engine,
      disclaimer: result.disclaimer,
      note: result.note,
      items: result.items,
    })
  } catch (sendError) {
    error.value = sendError.message
  } finally {
    sending.value = false
  }
}

function lineTotal(message) {
  return message.items.reduce((sum, item) => sum + item.price * item.quantity, 0)
}

function step(message, item, delta) {
  item.quantity = Math.max(1, Math.min(9, item.quantity + delta))
}

async function addMessage(message) {
  if (message.added) return
  try {
    for (const item of message.items) {
      await setQuantity(
        { id: item.dishId, name: item.name, price: item.price, artColor: item.artColor },
        item.quantity,
      )
    }
    message.added = true
  } catch (addError) {
    error.value = addError.message
  }
}

function goCheckout() {
  router.push('/checkout')
}

onMounted(() => {
  pushAssistant({
    text: '晚上好，我是这桌的服务员助理。说清楚人数、口味、预算，我给你配一桌，不合适可以改份数或换菜。',
  })
})
</script>

<template>
  <div class="agent-page">
    <header class="simple-nav">
      <router-link to="/" class="back-button" aria-label="返回点餐">‹</router-link>
      <div class="nav-title"><span class="nav-kicker">ORDER ASSISTANT</span><strong>服务员助手</strong></div>
    </header>

    <div ref="scroller" class="chat-scroll">
      <div v-for="(message, index) in messages" :key="index" :class="['bubble', message.role]">
        <template v-if="message.role === 'user'">
          <p class="bubble-text">{{ message.text }}</p>
        </template>

        <template v-else>
          <p v-if="message.engine" class="engine-tag" :class="message.engine">
            {{ message.engine === 'llm' ? 'DEEPSEEK 在线' : '规则推荐 · 离线演示，未调用大模型' }}
          </p>
          <p class="bubble-text">{{ message.text }}</p>

          <div v-if="message.items.length" class="items-card">
            <div v-for="item in message.items" :key="item.dishId" class="item-row">
              <div class="item-info">
                <p class="item-name">{{ item.name }}</p>
                <p class="item-reason">{{ item.reason }}</p>
              </div>
              <div class="item-stepper">
                <button type="button" class="step-btn" aria-label="减一份" @click="step(message, item, -1)">−</button>
                <span class="item-qty">{{ item.quantity }}</span>
                <button type="button" class="step-btn plus" aria-label="加一份" @click="step(message, item, 1)">＋</button>
              </div>
            </div>
            <div class="items-foot">
              <span>合计 <strong>¥{{ lineTotal(message).toFixed(2) }}</strong></span>
              <button type="button" class="items-add" :disabled="message.added" @click="addMessage(message)">
                {{ message.added ? '已加入' : '加入购物车' }}
              </button>
            </div>
            <button v-if="message.added" type="button" class="items-go" @click="goCheckout">
              去结算（桌号 {{ state.table }}）
            </button>
          </div>

          <p v-if="message.disclaimer" class="bubble-note">{{ message.disclaimer }}</p>
          <p v-if="message.note" class="bubble-note">{{ message.note }}</p>
        </template>
      </div>

      <div v-if="sending" class="bubble assistant">
        <p class="bubble-text thinking">正在配菜…</p>
      </div>
      <p v-if="error" class="chat-error">{{ error }}</p>
    </div>

    <div class="chat-compose">
      <div class="quick-row">
        <button v-for="item in QUICK" :key="item" type="button" class="quick-chip" @click="send(item)">
          {{ item }}
        </button>
      </div>
      <form class="compose-row" @submit.prevent="send()">
        <input
          v-model="draft"
          class="compose-input"
          type="text"
          maxlength="120"
          placeholder="几个人、想吃什么、预算多少"
        />
        <button type="submit" class="compose-send" :disabled="sending || !draft.trim()">发送</button>
      </form>
    </div>
  </div>
</template>
