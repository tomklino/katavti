import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router'
import HomeView from '../views/HomeView.vue'

const routes: RouteRecordRaw[] = [
  { path: '/', name: 'home', component: HomeView },
  { path: '/daily', name: 'daily', component: () => import('../views/DailyView.vue') },
]

export default createRouter({ history: createWebHistory(import.meta.env.BASE_URL), routes })
