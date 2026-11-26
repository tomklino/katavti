import { describe, expect, it } from 'vitest'
import router from '@/router'
import HomeView from '@/views/HomeView.vue'

describe('application routes', () => {
  it('opens Daily by default and keeps the notes feed at /browse', async () => {
    await router.push('/')
    expect(router.currentRoute.value.path).toBe('/daily')
    expect(router.currentRoute.value.name).toBe('daily')

    await router.push('/browse')
    expect(router.currentRoute.value.name).toBe('home')
    expect(router.currentRoute.value.matched[0].components?.default).toBe(HomeView)

    await router.push('/daily')
    expect(router.currentRoute.value.name).toBe('daily')
  })
})
