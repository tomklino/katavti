import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import LoginPanel from '@/components/LoginPanel.vue'

afterEach(() => vi.unstubAllEnvs())

function panel(development: boolean) {
  vi.stubEnv('DEV', development)
  const dispatch = vi.fn().mockResolvedValue(undefined)
  const wrapper = mount(LoginPanel, {
    global: { mocks: { $store: { state: { user: null }, dispatch } } },
  })
  return { wrapper, dispatch }
}

describe('fake login panel', () => {
  it('shows the dev-only button and dispatches the ordinary login completion flow', async () => {
    const { wrapper, dispatch } = panel(true)
    await wrapper.get('button').trigger('click')
    await wrapper.get('input[type="email"]').setValue('tester@example.com')
    const button = wrapper.findAll('button').find(button => button.text() === 'Fake log in (dev only)')!
    expect(button.exists()).toBe(true)
    await button.trigger('click')
    await flushPromises()
    expect(dispatch).toHaveBeenCalledWith('fakeLogin', 'tester@example.com')
    expect(wrapper.find('.popover').exists()).toBe(false)
    wrapper.unmount()
  })

  it('never renders the bypass in a production client', async () => {
    const { wrapper } = panel(false)
    await wrapper.get('button').trigger('click')
    expect(wrapper.text()).not.toContain('Fake log in')
    expect(wrapper.text()).toContain('Email me a magic link')
    wrapper.unmount()
  })

  it('displays a backend error without hiding the login form', async () => {
    const { wrapper, dispatch } = panel(true)
    dispatch.mockRejectedValueOnce(new Error('Fake login is only available in development'))
    await wrapper.get('button').trigger('click')
    await wrapper.get('input[type="email"]').setValue('tester@example.com')
    await wrapper.findAll('button').find(button => button.text() === 'Fake log in (dev only)')!.trigger('click')
    await flushPromises()
    expect(wrapper.get('.error').text()).toBe('Fake login is only available in development')
    expect(wrapper.find('.popover').exists()).toBe(true)
    wrapper.unmount()
  })
})
