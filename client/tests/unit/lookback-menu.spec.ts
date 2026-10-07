import { mount } from '@vue/test-utils'
import { afterEach, describe, expect, it } from 'vitest'
import LookbackMenu from '@/components/LookbackMenu.vue'

afterEach(() => { document.body.innerHTML = '' })

describe('themed lookback menu', () => {
  it('marks only an active range and emits even the remembered range in label mode', async () => {
    const wrapper = mount(LookbackMenu, { props: { modelValue: 5, active: false } })
    expect(wrapper.get('button').text()).toBe('Look back')
    await wrapper.get('button').trigger('click')
    expect(wrapper.get('[role="menu"]').attributes('id')).toBe(wrapper.get('.lookback-trigger').attributes('aria-controls'))
    expect(wrapper.findAll('[aria-checked="true"]')).toHaveLength(0)
    await wrapper.get('[role="menuitemradio"]').trigger('click')
    expect(wrapper.emitted('update:modelValue')).toEqual([[5]])
    expect(wrapper.find('[role="menu"]').exists()).toBe(false)
    await wrapper.setProps({ active: true })
    await wrapper.get('button').trigger('click')
    expect(wrapper.get('[aria-checked="true"]').text()).toBe('5 days')
    wrapper.unmount()
  })

  it('supports arrows, Home, End, Escape and restores trigger focus', async () => {
    const wrapper = mount(LookbackMenu, { props: { modelValue: 28, active: true }, attachTo: document.body })
    const trigger = wrapper.get('.lookback-trigger')
    await trigger.trigger('keydown', { key: 'ArrowDown' })
    expect(document.activeElement?.textContent?.trim()).toBe('4 weeks')
    const menu = wrapper.get('[role="menu"]')
    await menu.trigger('keydown', { key: 'ArrowDown' })
    expect(document.activeElement?.textContent?.trim()).toBe('3 months')
    await menu.trigger('keydown', { key: 'End' })
    expect(document.activeElement?.textContent?.trim()).toBe('1 year')
    await menu.trigger('keydown', { key: 'Home' })
    expect(document.activeElement?.textContent?.trim()).toBe('5 days')
    await menu.trigger('keydown', { key: 'ArrowUp' })
    expect(document.activeElement?.textContent?.trim()).toBe('1 year')
    await menu.trigger('keydown', { key: 'Escape' })
    expect(trigger.attributes('aria-expanded')).toBe('false')
    expect(document.activeElement).toBe(trigger.element)
    wrapper.unmount()
  })

  it('closes on outside pointer or focus without stealing focus', async () => {
    const wrapper = mount(LookbackMenu, { props: { modelValue: 5 }, attachTo: document.body })
    const outside = document.createElement('button')
    document.body.append(outside)
    await wrapper.get('.lookback-trigger').trigger('click')
    outside.dispatchEvent(new Event('pointerdown', { bubbles: true }))
    await wrapper.vm.$nextTick()
    expect(wrapper.find('[role="menu"]').exists()).toBe(false)
    await wrapper.get('.lookback-trigger').trigger('click')
    outside.focus()
    await wrapper.vm.$nextTick()
    expect(wrapper.find('[role="menu"]').exists()).toBe(false)
    expect(document.activeElement).toBe(outside)
    wrapper.unmount()
  })
})
