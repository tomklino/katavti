import { mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import NoteCard from '@/components/NoteCard.vue'
import { createStore } from '@/store'

const api = {
  list: async () => [],
  read: async () => ({ content: '', ISODateString: '', tags: [] as Array<[string, string]> }),
  update: async () => '',
  createDaily: async () => [],
}

function mountCard(active: boolean, content = '# Compact title\nFull note body', startRaw = true) {
  const store = createStore(api, api)
  store.commit('setNote', {
    id: 'note-1',
    note: { content, ISODateString: '2026-09-25T00:00:00.000Z', tags: [] },
  })
  return mount(NoteCard, { props: { id: 'note-1', active, editable: true, startRaw }, global: { plugins: [store] } })
}

afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks() })

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

  it('activates a collapsed note with the keyboard', async () => {
    const wrapper = mountCard(false)
    expect(wrapper.get('header').attributes('tabindex')).toBe('0')
    expect(wrapper.get('header').attributes('aria-expanded')).toBe('false')
    await wrapper.get('header').trigger('keydown', { key: 'Enter' })
    await wrapper.get('header').trigger('keydown', { key: ' ' })
    expect(wrapper.emitted('activate')).toHaveLength(2)
    wrapper.unmount()
  })

  it('shows label and accurate word count without modifying the Markdown', () => {
    const wrapper = mountCard(true, '# A thought\n\nLabel: design\n\nKeep it simple.')
    expect(wrapper.get('.note-label').text()).toBe('design')
    expect(wrapper.get('.note-footer').text()).toContain('8 words')
    expect(wrapper.vm.$store.state.notes['note-1'].content).toContain('Label: design')
    wrapper.unmount()
  })

  it('focuses its editor immediately when it becomes active', async () => {
    const wrapper = mountCard(false)
    const editor = (wrapper.vm.$refs.editor as any)
    const focus = vi.spyOn(editor, 'focus')
    await wrapper.setProps({ active: true })
    await wrapper.vm.$nextTick()
    expect(focus).toHaveBeenCalledOnce()
  })

  it('waits for two seconds without typing before saving', async () => {
    vi.useFakeTimers()
    const wrapper = mountCard(true)
    const dispatch = vi.spyOn(wrapper.vm.$store, 'dispatch')
    ;(wrapper.vm as any).edit('first')
    await vi.advanceTimersByTimeAsync(1500)
    ;(wrapper.vm as any).edit('latest')
    await vi.advanceTimersByTimeAsync(1999)
    expect(dispatch).not.toHaveBeenCalledWith('saveNote', expect.anything())
    await vi.advanceTimersByTimeAsync(1)
    expect(dispatch).toHaveBeenCalledWith('saveNote', { id: 'note-1', content: 'latest' })
  })

  it('flushes a pending edit when the component is unmounted', async () => {
    vi.useFakeTimers()
    const update = vi.spyOn(api, 'update')
    const wrapper = mountCard(true)
    ;(wrapper.vm as any).edit('save before leaving')

    wrapper.unmount()
    await Promise.resolve()

    expect(update).toHaveBeenCalledWith('note-1', 'save before leaving')
  })

  it('flushes a pending edit when the page is hidden', async () => {
    vi.useFakeTimers()
    const update = vi.spyOn(api, 'update')
    const wrapper = mountCard(true)
    ;(wrapper.vm as any).edit('save before closing')

    window.dispatchEvent(new Event('pagehide'))
    await Promise.resolve()

    expect(update).toHaveBeenCalledWith('note-1', 'save before closing')
    wrapper.unmount()
  })

  it('shows an unsaved editor border until persistence finishes', async () => {
    const wrapper = mountCard(true)
    expect(wrapper.find('.markdown-editor').classes()).not.toContain('unsaved')
    wrapper.vm.$store.commit('setNoteUnsaved', { id: 'note-1', value: true })
    await wrapper.vm.$nextTick()
    expect(wrapper.find('.markdown-editor').classes()).toContain('unsaved')
    wrapper.vm.$store.commit('setNoteUnsaved', { id: 'note-1', value: false })
    await wrapper.vm.$nextTick()
    expect(wrapper.find('.markdown-editor').classes()).not.toContain('unsaved')
  })
})
