import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createMemoryHistory, createRouter } from 'vue-router'
import App from '@/App.vue'
import DailyView from '@/views/DailyView.vue'
import { createStore } from '@/store'

vi.mock('@/api/auth', () => ({ authApi: { session: vi.fn().mockResolvedValue({ user: null }) } }))
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals() })

async function setup() {
  vi.useFakeTimers()
  vi.setSystemTime(new Date(2026, 0, 1, 23, 59))
  vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: false, addEventListener() {}, removeEventListener() {} })))
  sessionStorage.setItem('katavti.storage-warning-dismissed', '1')
  const api = {
    list: vi.fn().mockResolvedValue([]),
    createDaily: vi.fn(async (count: number, date: string) => Array.from({ length: count }, (_, i) => `${date}-${i}`)),
    read: vi.fn().mockResolvedValue({ content: '', ISODateString: '2026-01-01T00:00:00Z', tags: [] }),
    update: vi.fn().mockResolvedValue('saved'), importNote: vi.fn(),
  }
  const store = createStore(api, api)
  const router = createRouter({ history: createMemoryHistory(), routes: [
    { path: '/', name: 'home', component: { template: '<main />' } },
    { path: '/daily', name: 'daily', component: DailyView },
  ] })
  await router.push('/daily')
  const wrapper = mount(App, { global: { plugins: [store, router], stubs: {
    LoginPanel: true,
    MarkdownEditor: { props: ['modelValue'], emits: ['update:modelValue'], methods: { focus() {} }, template: '<textarea :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)" />' },
  } } })
  await flushPromises()
  return { wrapper, store, api }
}

describe('page-wide previous-day warning', () => {
  it('starts today with the first note active even if a later old note was selected', async () => {
    const { wrapper } = await setup()
    try {
      await wrapper.findAll('.note header')[2].trigger('click')
      vi.setSystemTime(new Date(2026, 0, 2, 0, 1))
      await wrapper.findAll('textarea')[2].setValue('Late third note')
      await wrapper.get('.previous-day-warning a').trigger('click')
      await flushPromises()
      expect(wrapper.findAll('.note')[0].classes()).toContain('active')
    } finally { wrapper.unmount() }
  })

  it('keeps the old notes and warning if loading today fails, and allows a retry', async () => {
    const { wrapper, store, api } = await setup()
    try {
      vi.setSystemTime(new Date(2026, 0, 2, 0, 1))
      await wrapper.get('textarea').setValue('Keep this draft')
      api.read.mockRejectedValueOnce(new Error('offline'))
      await wrapper.get('.previous-day-warning a').trigger('click')
      await flushPromises()
      expect(store.state.dailyDate).toBe('2026-01-01')
      expect(store.state.dailyIds[0]).toBe('2026-01-01-0')
      expect(wrapper.get('.previous-day-warning [role="alert"]').text()).toContain('Please try again')
      expect(wrapper.get('textarea').element.value).toBe('Keep this draft')
      await wrapper.get('.previous-day-warning a').trigger('click')
      await flushPromises()
      expect(store.state.dailyDate).toBe('2026-01-02')
      expect(wrapper.find('.previous-day-warning').exists()).toBe(false)
    } finally { wrapper.unmount() }
  })

  it('uses a yellow MessageBar above the header and opens today on click while preserving the pending old draft', async () => {
    const { wrapper, store, api } = await setup()
    try {
      expect(wrapper.find('.previous-day-warning').exists()).toBe(false)
      vi.setSystemTime(new Date(2026, 0, 2, 0, 1))
      await wrapper.get('textarea').setValue('My late-night draft')
      const warning = wrapper.get('.previous-day-warning')
      expect(warning.classes()).toContain('warning')
      expect(warning.element.parentElement).toBe(wrapper.element)
      expect(warning.element.compareDocumentPosition(wrapper.get('.app-header').element) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
      expect(warning.text()).toContain("You're editing notes of a previous day. start a new day")
      expect(warning.find('.countdown').exists()).toBe(false)
      await warning.get('a').trigger('click')
      await flushPromises()
      expect(api.createDaily).toHaveBeenLastCalledWith(4, '2026-01-02')
      expect(store.state.dailyIds).toEqual(['2026-01-02-0', '2026-01-02-1', '2026-01-02-2', '2026-01-02-3'])
      expect(wrapper.find('.previous-day-warning').exists()).toBe(false)
      expect(api.update).toHaveBeenCalledWith('2026-01-01-0', 'My late-night draft')
      expect(wrapper.get('textarea').element.value).toBe('')
    } finally { wrapper.unmount() }
  })
})
