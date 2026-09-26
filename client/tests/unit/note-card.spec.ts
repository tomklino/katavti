import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import NoteCard from '@/components/NoteCard.vue'
import { createStore } from '@/store'

const api = {
  list: async () => [],
  read: async () => ({ content: '', ISODateString: '', tags: [] as Array<[string, string]> }),
  update: async () => '',
  createDaily: async () => [],
}

function mountCard(active: boolean, content = '# Compact title\nFull note body', startRaw = true) {
  const store = createStore(api)
  store.commit('setNote', {
    id: 'note-1',
    note: { content, ISODateString: '2026-09-25T00:00:00.000Z', tags: [] },
  })
  return mount(NoteCard, { props: { id: 'note-1', active, editable: true, startRaw }, global: { plugins: [store] } })
}

describe('NoteCard focus states', () => {
  it('shows only the title while compacted', () => {
    const wrapper = mountCard(false)
    expect(wrapper.classes()).not.toContain('active')
    expect(wrapper.find('strong').text()).toBe('Compact title')
    expect(wrapper.find('time').exists()).toBe(false)
    expect(wrapper.find('.actions').exists()).toBe(false)
    expect(wrapper.find('.note-body').attributes('aria-hidden')).toBe('true')
  })

  it('shows controls and editor while active', () => {
    const wrapper = mountCard(true)
    expect(wrapper.classes()).toContain('active')
    expect(wrapper.find('time').exists()).toBe(true)
    expect(wrapper.find('.actions').exists()).toBe(true)
    expect(wrapper.find('.markdown-editor').exists()).toBe(true)
    expect(wrapper.find('.note-body').attributes('aria-hidden')).toBe('false')
  })

  it('renders full Markdown headings, bullet lists, and task lists', () => {
    const wrapper = mountCard(true, '## Second level\n\n* Bullet\n* [x] Done\n* [ ] Todo', false)
    expect(wrapper.get('.rendered h2').text()).toBe('Second level')
    expect(wrapper.find('.rendered ul').exists()).toBe(true)
    expect(wrapper.findAll('.rendered li')).toHaveLength(3)
    expect(wrapper.findAll('.rendered input[type="checkbox"]')).toHaveLength(2)
    expect((wrapper.findAll('.rendered input[type="checkbox"]')[0].element as HTMLInputElement).checked).toBe(true)
  })

  it('requests focus when clicked', async () => {
    const wrapper = mountCard(false)
    await wrapper.trigger('click')
    expect(wrapper.emitted('activate')).toHaveLength(1)
  })

  it('focuses its editor immediately when it becomes active', async () => {
    const wrapper = mountCard(false)
    const editor = (wrapper.vm.$refs.editor as any)
    const focus = vi.spyOn(editor, 'focus')
    await wrapper.setProps({ active: true })
    await wrapper.vm.$nextTick()
    expect(focus).toHaveBeenCalledOnce()
  })
})
