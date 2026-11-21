import { createApp } from 'vue'
import { createRouter, createWebHashHistory } from 'vue-router'
import App from './App.vue'
import MenuPage from './pages/MenuPage.vue'
import CheckoutPage from './pages/CheckoutPage.vue'
import LuckyPage from './pages/LuckyPage.vue'
import ReservePage from './pages/ReservePage.vue'
import AgentPage from './pages/AgentPage.vue'
import './styles.css'

const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: '/', component: MenuPage },
    { path: '/cart', redirect: '/checkout' },
    { path: '/checkout', component: CheckoutPage },
    { path: '/lucky', component: LuckyPage },
    { path: '/reserve', component: ReservePage },
    { path: '/agent', component: AgentPage },
  ],
  scrollBehavior: () => ({ top: 0 }),
})

createApp(App).use(router).mount('#app')


