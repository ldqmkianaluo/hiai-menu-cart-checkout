<script setup>
import { computed, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { api } from '../api.js'
import { useCart } from '../cart.js'

const router = useRouter()
const { state } = useCart()

const SLOTS = ['11:00', '11:30', '12:00', '12:30', '13:00', '17:00', '17:30', '18:00', '18:30', '19:00', '19:30', '20:00']

function tomorrow() {
  const day = new Date()
  day.setDate(day.getDate() + 1)
  return day.toISOString().slice(0, 10)
}

const form = reactive({
  name: '',
  phone: '',
  date: tomorrow(),
  time: '18:00',
  partySize: 2,
  note: '',
})

const submitting = ref(false)
const error = ref('')
const reservation = ref(null)

const mine = ref([])
const mineError = ref('')
const mineLoading = ref(false)

async function loadMine() {
  mineError.value = ''
  if (!/^1\d{10}$/.test(form.phone.trim())) {
    mineError.value = '先在上面填 11 位手机号，才能查到你自己的预约'
    mine.value = []
    return
  }
  mineLoading.value = true
  try {
    mine.value = await api.reservations(form.phone.trim())
    if (!mine.value.length) mineError.value = '这个手机号还没有预约记录'
  } catch (queryError) {
    mineError.value = queryError.message
  } finally {
    mineLoading.value = false
  }
}

const canSubmit = computed(() => form.name.trim().length > 0 && /^1\d{10}$/.test(form.phone.trim()))

async function submit() {
  if (submitting.value) return
  error.value = ''
  if (!form.name.trim()) {
    error.value = '请填写用餐人称呼'
    return
  }
  if (!/^1\d{10}$/.test(form.phone.trim())) {
    error.value = '手机号请填 11 位'
    return
  }
  submitting.value = true
  try {
    reservation.value = await api.createReservation({
      name: form.name.trim(),
      phone: form.phone.trim(),
      date: form.date,
      time: form.time,
      partySize: Number(form.partySize),
      note: form.note.trim(),
      table: state.table,
    })
    window.scrollTo({ top: 0, behavior: 'smooth' })
  } catch (submitError) {
    error.value = submitError.message
  } finally {
    submitting.value = false
  }
}

function reset() {
  reservation.value = null
  error.value = ''
}
</script>

<template>
  <div class="reserve-page">
    <header class="simple-nav">
      <router-link to="/" class="back-button" aria-label="返回点餐">‹</router-link>
      <div class="nav-title"><span class="nav-kicker">RESERVATION</span><strong>预约留座</strong></div>
    </header>

    <div class="reserve-body">
      <template v-if="reservation">
        <section class="ticket-card">
          <p class="ticket-kicker">RESERVED</p>
          <p class="ticket-code">{{ reservation.code }}</p>
          <div class="ticket-grid">
            <div><span>用餐人</span><strong>{{ reservation.name }}</strong></div>
            <div><span>人数</span><strong>{{ reservation.partySize }} 位</strong></div>
            <div><span>日期</span><strong>{{ reservation.date }}</strong></div>
            <div><span>时段</span><strong>{{ reservation.time }}</strong></div>
          </div>
          <p class="ticket-hint">{{ reservation.hint }}</p>
        </section>
        <div class="reserve-actions">
          <button type="button" class="reserve-submit" @click="router.push('/')">回去点餐</button>
          <button type="button" class="reserve-ghost" @click="reset">再约一桌</button>
        </div>
      </template>

      <template v-else>
        <p class="reserve-lead">留个座，到店报预约号就行。演示环境只生成单号，不占真实座位。</p>

        <label class="field">
          <span class="field-label">用餐人<em>*</em></span>
          <input v-model="form.name" class="field-input" maxlength="16" placeholder="怎么称呼您" />
        </label>

        <label class="field">
          <span class="field-label">手机号<em>*</em></span>
          <input v-model="form.phone" class="field-input" inputmode="numeric" maxlength="11" placeholder="11 位手机号，到店核对用" />
        </label>

        <label class="field">
          <span class="field-label">日期<em>*</em></span>
          <input v-model="form.date" class="field-input" type="date" :min="tomorrow()" />
        </label>

        <div class="field">
          <span class="field-label">时段<em>*</em></span>
          <div class="slot-grid">
            <button
              v-for="slot in SLOTS"
              :key="slot"
              type="button"
              class="slot"
              :class="{ active: form.time === slot }"
              @click="form.time = slot"
            >
              {{ slot }}
            </button>
          </div>
        </div>

        <label class="field">
          <span class="field-label">人数<em>*</em></span>
          <input v-model.number="form.partySize" class="field-input" type="number" min="1" max="12" step="1" />
        </label>

        <label class="field">
          <span class="field-label">备注</span>
          <input v-model="form.note" class="field-input" maxlength="60" placeholder="忌口、需要靠窗或儿童座椅（选填）" />
        </label>

        <p v-if="error" class="reserve-error">{{ error }}</p>

        <button type="button" class="reserve-submit" :disabled="submitting || !canSubmit" @click="submit">
          {{ submitting ? '正在锁定座位…' : '确认预约' }}
        </button>

        <p class="reserve-note">演示预约不涉及真实座位、短信或押金；单号只存在内存里，服务重启即失效。</p>

        <section class="mine-block">
          <div class="mine-head">
            <strong>我的预约</strong>
            <button type="button" class="mine-query" :disabled="mineLoading" @click="loadMine">
              {{ mineLoading ? '查询中…' : '用上面的手机号查' }}
            </button>
          </div>
          <p v-if="mineError" class="mine-error">{{ mineError }}</p>
          <ul v-if="mine.length" class="mine-list">
            <li v-for="item in mine" :key="item.code" class="mine-item">
              <span class="mine-code">{{ item.code }}</span>
              <span class="mine-when">{{ item.date }} {{ item.time }} · {{ item.partySize }} 位</span>
              <span class="mine-who">{{ item.name }}</span>
            </li>
          </ul>
          <p v-if="mine.length" class="mine-tip">到店报预约号即可核对，演示环境不会发短信。</p>
        </section>
      </template>
    </div>
  </div>
</template>
