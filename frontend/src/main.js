import { createApp } from 'vue'
import { createRouter, createWebHashHistory } from 'vue-router'
import App from './App.vue'
import MenuPage from './pages/MenuPage.vue'
import CheckoutPage from './pages/CheckoutPage.vue'
import './styles.css'

const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: '/', component: MenuPage },
    { path: '/cart', redirect: '/checkout' },
    { path: '/checkout', component: CheckoutPage },
  ],
  scrollBehavior: () => ({ top: 0 }),
})

createApp(App).use(router).mount('#app')
