import { mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import MessageBar from '@/components/MessageBar.vue'

afterEach(() => vi.useRealTimers())

describe('MessageBar', () => {
  it('has a dismiss control and a 30-second countdown indicator', () => {
    const wrapper = mount(MessageBar, { slots: { default: 'Saved' } })
    expect(wrapper.find('[aria-label="Dismiss message"]').exists()).toBe(true)
    expect(wrapper.find('.countdown').exists()).toBe(true)
    expect(wrapper.text()).toContain('Saved')
  })

  it('dismisses when its X is clicked', async () => {
    const wrapper = mount(MessageBar)
    await wrapper.get('[aria-label="Dismiss message"]').trigger('click')
    expect(wrapper.emitted('dismiss')).toHaveLength(1)
  })

  it('automatically dismisses after 30 seconds', () => {
    vi.useFakeTimers()
    const wrapper = mount(MessageBar)
    vi.advanceTimersByTime(29_999)
    expect(wrapper.emitted('dismiss')).toBeUndefined()
    vi.advanceTimersByTime(1)
    expect(wrapper.emitted('dismiss')).toHaveLength(1)
  })
})
