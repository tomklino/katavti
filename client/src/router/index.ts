import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router'
import HomeView from '../views/HomeView.vue'

const routes: RouteRecordRaw[] = [
  { path: '/', redirect: '/daily' },
  { path: '/daily', name: 'daily', component: () => import('../views/DailyView.vue') },
  { path: '/browse', name: 'home', component: HomeView },
]

export default createRouter({ history: createWebHistory(import.meta.env.BASE_URL), routes })
