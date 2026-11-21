<script setup>
import { reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { api } from '../api.js'
import { useCart } from '../cart.js'

const router = useRouter()
const { state, setQuantity } = useCart()

const QUICK = [
  '三个人，想吃辣的下饭菜',
  '两位老人，清淡少油一点',
  '四个人，想吃鱼，预算 200',
  '一个人随便吃点，别太贵',
]

const form = reactive({ demand: '', partySize: 2, budget: 0 })
const asking = ref(false)
const error = ref('')
const result = ref(null)
const added = ref(false)

const CHINESE_NUM = { 一: 1, 两: 2, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10 }

function syncNumbers(text) {
  const party = text.match(/([一两二三四五六七八九十\d]+)\s*个人/)
  if (party) {
    const raw = party[1]
    const value = /^\d+$/.test(raw) ? Number(raw) : CHINESE_NUM[raw] || Number(form.partySize)
    form.partySize = Math.min(12, Math.max(1, value))
  }
  const budget = text.match(/预算\s*(\d+)/)
  if (budget) form.budget = Number(budget[1])
}

async function ask(text) {
  const demand = (text ?? form.demand).trim()
  if (!demand) {
    error.value = '先说一句想吃什么，比如「三个想吃辣的下饭菜」'
    return
  }
  form.demand = demand
  if (text) syncNumbers(demand)
  asking.value = true
  error.value = ''
  added.value = false
  try {
    result.value = await api.agentRecommend({
      demand,
      partySize: Number(form.partySize) || 2,
      budget: Number(form.budget) || 0,
    })
  } catch (askError) {
    error.value = askError.message
  } finally {
    asking.value = false
  }
}

async function addAll() {
  if (!result.value || added.value) return
  try {
    for (const item of result.value.items) {
      await setQuantity(
        { id: item.dishId, name: item.name, price: item.price, artColor: item.artColor },
        item.quantity,
      )
    }
    added.value = true
  } catch (addError) {
    error.value = addError.message
  }
}

function goCheckout() {
  sessionStorage.removeItem('hiai-demo-selected-dish-ids')
  router.push('/checkout')
}
</script>

<template>
  <div class="agent-page">
    <header class="simple-nav">
      <router-link to="/" class="back-button" aria-label="返回点餐">‹</router-link>
      <div class="nav-title"><span class="nav-kicker">ORDER AGENT</span><strong>智能点餐</strong></div>
    </header>

    <div class="agent-body">
      <p class="agent-badge">规则推荐 · 本地关键词匹配，未调用任何大模型</p>

      <section class="agent-say">
        <p class="agent-question">想吃什么？说人话就行。</p>
        <textarea
          v-model="form.demand"
          class="agent-demand"
          rows="3"
          maxlength="120"
          placeholder="例如：三个人，想吃辣的下饭菜，预算 180"
        ></textarea>
        <div class="agent-quick">
          <button v-for="item in QUICK" :key="item" type="button" class="quick-chip" @click="ask(item)">
            {{ item }}
          </button>
        </div>
        <div class="agent-row">
          <label class="agent-mini">
            <span>人数</span>
            <input v-model.number="form.partySize" type="number" min="1" max="12" />
          </label>
          <label class="agent-mini">
            <span>预算（0 = 不限）</span>
            <input v-model.number="form.budget" type="number" min="0" max="2000" step="10" />
          </label>
        </div>
        <p v-if="error" class="agent-error">{{ error }}</p>
        <button type="button" class="agent-submit" :disabled="asking" @click="ask()">
          {{ asking ? '正在配菜…' : '让助手配一桌' }}
        </button>
      </section>

      <template v-if="result">
        <section class="agent-reply">
          <p class="reply-kicker">ASSISTANT</p>
          <p class="reply-text">{{ result.reply }}</p>
        </section>

        <section class="agent-picks">
          <article v-for="item in result.items" :key="item.dishId" class="pick-card">
            <div class="pick-thumb" :style="{ background: item.artColor }">
              <span>{{ item.name.slice(0, 1) }}</span>
            </div>
            <div class="pick-body">
              <div class="pick-head">
                <strong>{{ item.name }}</strong>
                <span class="pick-price">¥{{ item.price.toFixed(2) }} × {{ item.quantity }}</span>
              </div>
              <p class="pick-reason">{{ item.reason }}</p>
            </div>
          </article>
          <div class="pick-total">
            <span>建议合计</span>
            <strong>¥{{ result.total.toFixed(2) }}</strong>
          </div>
        </section>

        <div class="agent-actions">
          <button type="button" class="agent-submit" :disabled="added" @click="addAll">
            {{ added ? '已加入购物车' : '一键加入购物车' }}
          </button>
          <button v-if="added" type="button" class="agent-ghost" @click="goCheckout">
            直接去结算（桌号 {{ state.table }}）
          </button>
        </div>

        <p class="agent-note">
          这套推荐来自固定规则：识别「辣 / 清淡 / 鱼 / 汤 / 饮料 / 人数 / 预算」再按菜单搭配，和你聊天的不是大模型。
          想要真模型接话，需要配置 API key。
        </p>
      </template>
    </div>
  </div>
</template>
