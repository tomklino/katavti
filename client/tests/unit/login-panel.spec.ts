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

function signedInPanel() {
  const dispatch = vi.fn().mockResolvedValue('monday')
  const wrapper = mount(LoginPanel, {
    attachTo: document.body,
    global: { mocks: { $store: { state: { user: { name: 'Writer' } }, dispatch } } },
  })
  return { wrapper, dispatch, profile: wrapper.get('button[aria-label="Profile"]') }
}

describe('profile settings', () => {
  it('dismisses with Escape and restores focus without saving', async () => {
    const { wrapper, dispatch, profile } = signedInPanel()
    await profile.trigger('click')
    expect(document.activeElement?.textContent).toBe('Settings')
    await wrapper.get('.profile-actions button').trigger('click')
    await flushPromises()
    const settings = wrapper.get('[role="dialog"]')
    expect(settings.attributes('aria-modal')).toBeUndefined()
    expect(document.activeElement).toBe(settings.get('h2').element)
    await settings.get('input[value="sunday"]').setValue(true)
    await settings.get('input[value="sunday"]').trigger('keydown', { key: 'Escape' })
    expect(wrapper.find('[role="dialog"]').exists()).toBe(false)
    expect(profile.attributes('aria-expanded')).toBe('false')
    expect(document.activeElement).toBe(profile.element)
    expect(dispatch).not.toHaveBeenCalledWith('setWeekStart', expect.anything())
    wrapper.unmount()
  })

  it('keeps the pending selection after a failed save and closes on retry', async () => {
    const { wrapper, dispatch, profile } = signedInPanel()
    await profile.trigger('click')
    await wrapper.get('.profile-actions button').trigger('click')
    await flushPromises()
    const settings = wrapper.get('[role="dialog"]')
    const sunday = settings.get<HTMLInputElement>('input[value="sunday"]')
    await sunday.setValue(true)
    dispatch.mockRejectedValueOnce(new Error('Offline'))
    await settings.get('form').trigger('submit')
    await flushPromises()
    expect(settings.get('[role="alert"]').text()).toContain('Unable to save settings')
    expect(sunday.element.checked).toBe(true)
    await settings.get('form').trigger('submit')
    await flushPromises()
    expect(dispatch).toHaveBeenLastCalledWith('setWeekStart', 'sunday')
    expect(wrapper.find('[role="dialog"]').exists()).toBe(false)
    wrapper.unmount()
  })
})
