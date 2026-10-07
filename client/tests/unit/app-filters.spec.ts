import { mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createMemoryHistory, createRouter } from 'vue-router'
import App from '@/App.vue'
import { createStore } from '@/store'

vi.mock('@/api/auth', () => ({ authApi: { session: vi.fn().mockResolvedValue({ user: null }) } }))

beforeEach(() => {
  localStorage.clear()
  vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() })))
})
afterEach(() => vi.unstubAllGlobals())

async function mountApp(path = '/') {
  const api = { list: vi.fn().mockResolvedValue([]), read: vi.fn(), update: vi.fn(), createDaily: vi.fn() }
  const store = createStore(api as any, api as any)
  const router = createRouter({ history: createMemoryHistory(), routes: [
    { path: '/', name: 'home', component: { template: '<main />' } },
    { path: '/daily', name: 'daily', component: { template: '<main />' } },
  ] })
  await router.push(path)
  await router.isReady()
  const wrapper = mount(App, { global: { plugins: [store, router], stubs: { LoginPanel: true } } })
  return { wrapper, api, store, router }
}

async function selectRange(wrapper: Awaited<ReturnType<typeof mountApp>>['wrapper'], label: string) {
  await wrapper.get('[aria-label="Look back period"]').trigger('click')
  await wrapper.findAll('[role="menuitemradio"]').find(option => option.text() === label)!.trigger('click')
}

describe('top bar filters', () => {
  it('shows filters only in All Notes, keeping the navigation intact', async () => {
    const { wrapper, router } = await mountApp('/daily')
    expect(wrapper.find('.filters').exists()).toBe(false)
    expect(wrapper.get('.brand').text()).toBe('k·katavti')
    expect(wrapper.get('.primary-nav').text()).toBe('DailyAll notes')
    expect(wrapper.find('[aria-label="Color theme"]').exists()).toBe(true)
    await router.push('/')
    expect(wrapper.find('.filters').exists()).toBe(true)
    wrapper.unmount()
  })

  it('highlights only the applied label, not an unsubmitted draft', async () => {
    const { wrapper, store, api } = await mountApp()
    const input = wrapper.get('[aria-label="Search label"]')
    expect(wrapper.get('.days-filter').classes()).toContain('is-active')
    expect(wrapper.find('.label-chip').exists()).toBe(false)
    await input.setValue('  planning  ')
    expect(wrapper.get('.days-filter').classes()).toContain('is-active')
    await wrapper.get('form').trigger('submit')
    expect(api.list).toHaveBeenLastCalledWith({ bug: 'planning' })
    expect(store.state.bug).toBe('planning')
    expect(wrapper.get('.days-filter').classes()).not.toContain('is-active')
    expect(wrapper.get('[aria-label="Look back period"]').text()).toBe('Look back')
    expect(wrapper.get('.label-chip-text').text()).toBe('planning')
    expect(wrapper.find('.label-chip .filter-dot').exists()).toBe(false)
    expect(wrapper.get('#filter-status').text()).toBe('Filtering by label: planning')
    await input.setValue('journal')
    expect(wrapper.get('.label-chip-text').text()).toBe('planning')
    await wrapper.get('form').trigger('submit')
    expect(wrapper.get('.label-chip-text').text()).toBe('journal')
    wrapper.unmount()
  })

  it('switches back to days even when reselecting the previous range', async () => {
    const { wrapper, store, api } = await mountApp()
    store.commit('setFilter', { bug: 'planning' })
    await wrapper.vm.$nextTick()
    await selectRange(wrapper, '5 days')
    expect(api.list).toHaveBeenLastCalledWith({ days: 5 })
    expect(wrapper.get('.days-filter').classes()).toContain('is-active')
    expect(wrapper.find('.label-chip').exists()).toBe(false)
    expect(store.state.bug).toBe('')
    expect(wrapper.get('#filter-status').text()).toBe('Filtering by the last 5 days')
    await selectRange(wrapper, '4 weeks')
    expect(api.list).toHaveBeenLastCalledWith({ days: 28 })
    wrapper.unmount()
  })

  it('removes a label back to the remembered range and preserves filters across views', async () => {
    const { wrapper, store, api, router } = await mountApp()
    await selectRange(wrapper, '3 months')
    store.commit('setFilter', { bug: 'engineering' })
    await wrapper.vm.$nextTick()
    await router.push('/daily')
    expect(wrapper.find('.filters').exists()).toBe(false)
    await router.push('/')
    expect(wrapper.get('.label-chip-text').text()).toBe('engineering')
    await wrapper.get('[aria-label="Clear label filter"]').trigger('click')
    expect(api.list).toHaveBeenLastCalledWith({ days: 90 })
    expect(wrapper.get('.days-filter').classes()).toContain('is-active')
    expect(wrapper.find('.label-chip').exists()).toBe(false)
    wrapper.unmount()
  })

  it('toggles themes accessibly, persists the choice, and retains the applied label', async () => {
    const { wrapper, store } = await mountApp()
    store.commit('setFilter', { bug: 'ABC' })
    await wrapper.vm.$nextTick()
    expect(wrapper.get('[aria-label="System theme"]').attributes('aria-pressed')).toBe('true')
    await wrapper.get('[aria-label="Dark theme"]').trigger('click')
    expect(wrapper.attributes('data-theme')).toBe('dark')
    expect(wrapper.get('[aria-label="Dark theme"]').attributes('aria-pressed')).toBe('true')
    expect(localStorage.getItem('katavti.theme')).toBe('dark')
    expect(wrapper.get('.label-chip-text').text()).toBe('ABC')
    await wrapper.get('[aria-label="Light theme"]').trigger('click')
    expect(wrapper.attributes('data-theme')).toBe('light')
    expect(wrapper.findAll('.theme-toggle [aria-pressed="true"]')).toHaveLength(1)
    wrapper.unmount()
  })

  it('ignores empty searches without changing the active filter', async () => {
    const { wrapper, api } = await mountApp()
    await wrapper.get('[aria-label="Search label"]').setValue('  ')
    expect(wrapper.get('.search-submit').attributes('disabled')).toBeDefined()
    await wrapper.get('form').trigger('submit')
    expect(api.list).not.toHaveBeenCalled()
    expect(wrapper.get('.days-filter').classes()).toContain('is-active')
    wrapper.unmount()
  })
})
