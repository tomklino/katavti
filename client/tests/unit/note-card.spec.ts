import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import NoteCard from '@/components/NoteCard.vue'
import { createStore } from '@/store'

const api = {
  list: async () => [],
  read: async () => ({ content: '', ISODateString: '', tags: [] as Array<[string, string]> }),
  update: async () => '',
  createDaily: async () => [],
  importNote: async () => ({ id: '', note: { content: '', ISODateString: '', tags: [] as Array<[string, string]> } }),
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
  it('displays the stored calendar day without shifting UTC-midnight metadata to yesterday', () => {
    const format = vi.spyOn(Date.prototype, 'toLocaleDateString')
    const wrapper = mountCard(true)
    expect(format).toHaveBeenCalledWith('en', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })
    expect(wrapper.get('time').text()).toContain('Sep 25, 2026')
    wrapper.unmount()
  })

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

  it('shows an accessible conflict warning instead of claiming the draft is saved', async () => {
    const wrapper = mountCard(true)
    wrapper.vm.$store.commit('setNoteUnsaved', { id: 'note-1', value: true })
    wrapper.vm.$store.commit('setSaveError', { id: 'note-1', error: 'Stale note: changed on another device. Your draft is not saved.' })
    await wrapper.vm.$nextTick()
    expect(wrapper.get('[role="alert"]').text()).toContain('changed on another device')
    expect(wrapper.get('.save-state').text()).toBe('Not saved')
    expect(wrapper.text()).not.toContain('All changes saved')
    expect(wrapper.vm.$store.state.notes['note-1'].content).toContain('Full note body')
    wrapper.unmount()
  })

  it('reloads only the conflicted note when clicking the warning link and cancels pending draft saves', async () => {
    vi.useFakeTimers()
    const conflict = Object.assign(new Error('Stale note conflict: this note changed on another device. Your draft was not saved.'), { status: 409 })
    const latest = { content: '# Latest from another device', ISODateString: '2026-09-25T00:00:00.000Z', tags: [], revision: 'latest-revision' }
    const remote = { ...api, read: vi.fn().mockResolvedValue(latest), update: vi.fn().mockRejectedValue(conflict), list: vi.fn() }
    const local = { ...api, update: vi.fn().mockResolvedValue('note-1') }
    const store = createStore(remote, local)
    store.commit('setUser', { email: 'alice@example.com' })
    store.commit('setNote', { id: 'note-1', note: { ...latest, content: 'Original', revision: 'stale-revision' } })
    store.commit('setNote', { id: 'note-2', note: { ...latest, content: 'Untouched note' } })
    const wrapper = mount(NoteCard, { props: { id: 'note-1', editable: true, startRaw: true }, global: { plugins: [store] } })
    try {
      await expect(store.dispatch('saveNote', { id: 'note-1', content: 'Conflicting draft' })).rejects.toThrow(conflict.message)
      ;(wrapper.vm as any).edit('More unsaved typing')
      await wrapper.vm.$nextTick()
      const reload = wrapper.find('.save-error button')
      expect(reload.exists(), 'the conflict warning must provide a clickable note reload control').toBe(true)
      expect(reload.text()).toBe('reloading the latest version')
      await reload.trigger('click')
      await flushPromises()

      expect(remote.read).toHaveBeenCalledExactlyOnceWith('note-1')
      expect(remote.list).not.toHaveBeenCalled()
      expect(local.update).toHaveBeenLastCalledWith('note-1', latest.content, latest.revision)
      expect(store.state.notes['note-1']).toEqual(latest)
      expect(store.state.notes['note-2'].content).toBe('Untouched note')
      expect(wrapper.get('.cm-content').text()).toBe(latest.content)
      expect(wrapper.find('[role="alert"]').exists()).toBe(false)
      expect(wrapper.get('.save-state').text()).toBe('All changes saved')
      expect(store.state.unsavedNotes['note-1']).toBe(false)
      expect(wrapper.emitted('activate')).toBeUndefined()
      await vi.advanceTimersByTimeAsync(2000)
      wrapper.unmount()
      expect(remote.update).toHaveBeenCalledTimes(1)
    } finally { if (wrapper.exists()) wrapper.unmount() }
  })

  it('keeps the draft and warning if fetching the latest note fails', async () => {
    const remote = { ...api, read: vi.fn().mockRejectedValue(new Error('Network unavailable')) }
    const local = { ...api, read: vi.fn(), update: vi.fn() }
    const store = createStore(remote, local)
    store.commit('setUser', { email: 'alice@example.com' })
    store.commit('setNote', { id: 'note-1', note: { content: 'Keep my draft', ISODateString: '', tags: [], revision: 'stale' } })
    store.commit('setNoteUnsaved', { id: 'note-1', value: true })
    store.commit('setSaveError', { id: 'note-1', error: 'Stale note conflict' })
    const wrapper = mount(NoteCard, { props: { id: 'note-1', editable: true }, global: { plugins: [store] } })
    try {
      await wrapper.get('.save-error button').trigger('click')
      await flushPromises()
      expect(store.state.notes['note-1'].content).toBe('Keep my draft')
      expect(store.state.notes['note-1'].revision).toBe('stale')
      expect(store.state.unsavedNotes['note-1']).toBe(true)
      expect(wrapper.get('[role="alert"]').text()).toContain('Network unavailable')
      expect(local.read).not.toHaveBeenCalled()
      expect(local.update).not.toHaveBeenCalled()
    } finally { wrapper.unmount() }
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
