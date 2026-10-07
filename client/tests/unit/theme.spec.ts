import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { initialTheme, isTheme, rememberTheme, resolveTheme, themeStorageKey } from '@/theme'

beforeEach(() => localStorage.clear())
afterEach(() => vi.restoreAllMocks())

describe('color theme', () => {
  it('defaults to the system and validates stored choices', () => {
    expect(initialTheme()).toBe('system')
    expect(isTheme('dark')).toBe(true)
    expect(isTheme('ink')).toBe(false)
    localStorage.setItem(themeStorageKey, 'ink')
    expect(initialTheme()).toBe('system')
  })

  it('remembers explicit themes in production as well as development', () => {
    rememberTheme('dark')
    expect(initialTheme()).toBe('dark')
    rememberTheme('light')
    expect(initialTheme()).toBe('light')
  })

  it('follows system changes only in system mode', () => {
    expect(resolveTheme('system', true)).toBe('dark')
    expect(resolveTheme('system', false)).toBe('light')
    expect(resolveTheme('light', true)).toBe('light')
    expect(resolveTheme('dark', false)).toBe('dark')
  })

  it('works without browser storage', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('Unavailable') })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('Unavailable') })
    expect(initialTheme()).toBe('system')
    expect(() => rememberTheme('dark')).not.toThrow()
  })
})
