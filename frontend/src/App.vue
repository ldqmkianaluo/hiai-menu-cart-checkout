<script setup>
import { onMounted } from 'vue'
import { useCart } from './cart'

const { state, loadCart, dismissError } = useCart()
onMounted(loadCart)
</script>

<template>
  <div class="app-shell">
    <div v-if="state.error" class="global-error" role="alert" @click="dismissError">{{ state.error }}</div>
    <router-view />
  </div>
</template>
