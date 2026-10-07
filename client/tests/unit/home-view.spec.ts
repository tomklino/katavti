import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import HomeView from '@/views/HomeView.vue'
import { createStore } from '@/store'

const api = {
  list: vi.fn().mockResolvedValue(['one', 'two', 'three']),
  read: vi.fn(async () => ({ content: '# A note\n\nFull body.', ISODateString: '2026-09-26T00:00:00.000Z', tags: [] })),
  update: vi.fn(),
  createDaily: vi.fn(),
}

describe('All Notes reading feed', () => {
  it('expands every note and keeps them expanded after filtering', async () => {
    const store = createStore(api as any, api as any)
    const wrapper = mount(HomeView, { global: { plugins: [store], stubs: { RouterLink: true, NoteCard: { props: { id: String, active: Boolean, browsing: Boolean }, template: '<article :data-id="id" :data-active="active" :data-browsing="browsing" />' } } } })
    await vi.waitFor(() => expect(wrapper.findAll('article')).toHaveLength(3))
    expect(wrapper.findAll('article').every(note => note.attributes('data-active') === 'true' && note.attributes('data-browsing') === 'true')).toBe(true)
    store.commit('setIds', ['three'])
    await wrapper.vm.$nextTick()
    expect(wrapper.get('article').attributes('data-active')).toBe('true')
    expect(wrapper.get('.notes').classes()).toContain('browsing-notes')
    wrapper.unmount()
  })
})
