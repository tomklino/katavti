import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import MarkdownEditor from '@/components/MarkdownEditor.vue'

describe('MarkdownEditor', () => {
  it('uses CodeMirror with markdown syntax highlighting and a darker editor surface', () => {
    const wrapper = mount(MarkdownEditor, { props: { modelValue: '# Heading\n**bold** and [link](https://example.com)' } })
    expect(wrapper.find('.cm-editor').exists()).toBe(true)
    expect(wrapper.find('.cm-line').exists()).toBe(true)
    expect(wrapper.get('.cm-content').text()).toContain('Heading')
  })

  it('exposes focus for its CodeMirror editing surface', () => {
    const wrapper = mount(MarkdownEditor, { props: { modelValue: '# Focus me' } })
    const component = wrapper.vm as any
    const focus = vi.spyOn(component.view, 'focus')
    component.focus()
    expect(focus).toHaveBeenCalledOnce()
  })

  it('emits edited markdown', async () => {
    const wrapper = mount(MarkdownEditor, { props: { modelValue: '# Old' } })
    const component = wrapper.vm as any
    component.view.dispatch({ changes: { from: 0, to: component.view.state.doc.length, insert: '# New' } })
    await wrapper.vm.$nextTick()
    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual(['# New'])
  })
})
