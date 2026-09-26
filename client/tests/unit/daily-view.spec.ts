import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import { createStore } from '@/store'
import DailyView from '@/views/DailyView.vue'

function notesApi() {
  let count = 0
  return {
    list: vi.fn().mockResolvedValue([]),
    createDaily: vi.fn(async (requested: number) => {
      count = Math.max(count, requested)
      return Array.from({ length: count }, (_, index) => `note-${index + 1}`)
    }),
    read: vi.fn(async (id: string) => ({ content: '', ISODateString: '2026-09-26T00:00:00.000Z', tags: [], id })),
    update: vi.fn().mockResolvedValue(''),
  }
}

describe('DailyView additional notes', () => {
  it('waits for creation, renders the fifth note, and activates it', async () => {
    const api = notesApi()
    const store = createStore(api as any, api as any)
    const wrapper = mount(DailyView, { global: { plugins: [store], stubs: { NoteCard: { props: ['id', 'active'], template: '<article :data-id="id" :data-active="active" />' } } } })
    await vi.waitFor(() => expect(store.state.dailyIds).toHaveLength(4))

    await wrapper.get('[aria-label="Add note"]').trigger('click')
    await vi.waitFor(() => expect(store.state.dailyIds).toHaveLength(5))

    expect(wrapper.findAll('article')).toHaveLength(5)
    await vi.waitFor(() => expect(wrapper.find('[data-id="note-5"]').attributes('data-active')).toBe('true'))
  })
})
