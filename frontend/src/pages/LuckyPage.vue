<script setup>
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { api } from '../api.js'
import { useCart } from '../cart.js'

const router = useRouter()
const { state } = useCart()

const SLICES = [
  { id: 'free', label: '免单', tone: 'red' },
  { id: 'r30', label: '减30', tone: 'ink' },
  { id: 'p80', label: '8折', tone: 'red' },
  { id: 'p90', label: '9折', tone: 'ink' },
  { id: 'p95', label: '95折', tone: 'red' },
  { id: 'none', label: '下次再来', tone: 'ink' },
]

const COUPON_KEY = 'hiai-demo-coupon'

const rotation = ref(0)
const spinning = ref(false)
const prize = ref(null)
const coupon = ref(null)
const remaining = ref(3)
const error = ref('')
const done = ref(false)

const couponSaved = computed(() => Boolean(coupon.value?.code))

function pickRotation(prizeId) {
  const index = Math.max(0, SLICES.findIndex(slice => slice.id === prizeId))
  const target = 360 - (index * 60 + 30)
  const base = rotation.value - (rotation.value % 360)
  return base + 360 * 4 + target
}

async function draw() {
  if (spinning.value || remaining.value <= 0) return
  spinning.value = true
  error.value = ''
  done.value = false
  try {
    const result = await api.drawPromo(state.table, state.memberId)
    prize.value = result.prize
    remaining.value = result.remaining
    rotation.value = pickRotation(result.prize.id)
    setTimeout(() => {
      spinning.value = false
      done.value = true
      if (result.coupon) {
        coupon.value = result.coupon
        try {
          sessionStorage.setItem(COUPON_KEY, JSON.stringify(result.coupon))
        } catch (_) {
          /* 隐私模式下写不进去，忽略 */
        }
      } else {
        coupon.value = null
      }
    }, 3300)
  } catch (drawError) {
    spinning.value = false
    error.value = drawError.message
  }
}

function goCheckout() {
  router.push('/checkout')
}
</script>

<template>
  <div class="lucky-page">
    <header class="simple-nav">
      <router-link to="/" class="back-button" aria-label="返回点餐">‹</router-link>
      <div class="nav-title"><span class="nav-kicker">LUCKY DRAW</span><strong>桌面抽奖</strong></div>
    </header>

    <div class="lucky-body">
      <p class="lucky-lead">
        扫码即得 <strong>3</strong> 次抽奖机会，中奖的券会自动存到本次点单，结算时抵扣。
      </p>

      <div class="wheel-stage">
        <div class="wheel-pointer" aria-hidden="true"></div>
        <div
          class="wheel"
          :class="{ spinning }"
          :style="{ transform: `rotate(${rotation}deg)` }"
        >
          <div
            v-for="(slice, index) in SLICES"
            :key="slice.id"
            class="wheel-label"
            :style="{ transform: `rotate(${index * 60 + 30}deg) translateY(-88px) rotate(${-(index * 60 + 30)}deg)` }"
          >
            {{ slice.label }}
          </div>
        </div>
        <div class="wheel-hub">抽</div>
      </div>

      <p v-if="error" class="lucky-error">{{ error }}</p>

      <div v-if="done && prize" class="lucky-result" :class="{ 'is-empty': !coupon }">
        <p class="result-kicker">{{ coupon ? 'CONGRATULATIONS' : 'TRY AGAIN' }}</p>
        <p class="result-name">{{ prize.name }}</p>
        <p class="result-detail">{{ prize.detail }}</p>
        <p v-if="coupon" class="result-code">券码 {{ coupon.code }} · 30 分钟内结算可用</p>
        <div class="result-actions">
          <button v-if="coupon" type="button" class="lucky-cta" @click="goCheckout">
            去结算用掉它
          </button>
          <button
            v-if="remaining > 0"
            type="button"
            class="lucky-ghost"
            @click="draw"
          >
            再抽一次（剩 {{ remaining }} 次）
          </button>
        </div>
      </div>

      <button
        v-if="!done"
        type="button"
        class="lucky-cta lucky-main"
        :disabled="spinning || remaining <= 0"
        @click="draw"
      >
        {{ remaining > 0 ? (spinning ? '转动中…' : `开始抽奖（剩 ${remaining} 次）`) : '本轮次数已用完' }}
      </button>

      <p class="lucky-note">
        演示活动：奖品与券只在内存里，不涉及真实兑奖、收款或营销合规。同一桌每位用餐人各 3 次。
        <span v-if="couponSaved">这张券已保存，结算页会自动带上。</span>
      </p>
    </div>
  </div>
</template>
