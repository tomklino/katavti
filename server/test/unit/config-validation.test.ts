import { describe, expect, it, vi } from 'vitest'
import {
  ConfigError,
  runConfigValidators,
  validateConfig,
  type ConfigValidator,
  type ValidationResult,
} from '../../src/config/validation.js'

const valid = (): ValidationResult => ({ level: 'valid' })

describe('configuration validation engine', () => {
  it('passes each configured key and value to every validator for that key', () => {
    const first = vi.fn((): ValidationResult => ({ level: 'warning', message: 'prefer a different value' }))
    const second = vi.fn(valid)
    const validators: ConfigValidator[] = [
      { key: 'server.port', validate: first },
      { key: 'server.port', validate: second },
    ]

    const results = runConfigValidators({ server: { port: 3030 } }, validators)

    expect(first).toHaveBeenCalledWith('server.port', 3030)
    expect(second).toHaveBeenCalledWith('server.port', 3030)
    expect(results).toEqual([
      { key: 'server.port', level: 'warning', message: 'prefer a different value' },
      { key: 'server.port', level: 'valid' },
    ])
  })

  it('preserves valid, warning, error, and fatal results without stopping early', () => {
    const calls: string[] = []
    const validator = (level: ValidationResult['level']): ConfigValidator => ({
      key: `settings.${level}`,
      validate(key) { calls.push(key); return { level, message: level === 'valid' ? undefined : `${level} message` } },
    })

    const results = runConfigValidators({ settings: {} }, [
      validator('fatal'), validator('error'), validator('warning'), validator('valid'),
    ])

    expect(calls).toEqual(['settings.fatal', 'settings.error', 'settings.warning', 'settings.valid'])
    expect(results.map(result => result.level)).toEqual(['fatal', 'error', 'warning', 'valid'])
  })

  it('throws one useful error containing all error and fatal reports but not warnings', () => {
    const validators: ConfigValidator[] = [
      { key: 'a', validate: () => ({ level: 'fatal', message: 'a is required' }) },
      { key: 'b', validate: () => ({ level: 'warning', message: 'b is discouraged' }) },
      { key: 'c', validate: () => ({ level: 'error', message: 'c is invalid' }) },
    ]

    try {
      validateConfig({}, validators)
      throw new Error('Expected validation to fail')
    } catch (error) {
      expect(error).toBeInstanceOf(ConfigError)
      expect((error as ConfigError).issues).toEqual(['a: a is required', 'c: c is invalid'])
      expect((error as ConfigError).results).toEqual(expect.arrayContaining([
        expect.objectContaining({ key: 'b', level: 'warning', message: 'b is discouraged' }),
      ]))
    }
  })
})
