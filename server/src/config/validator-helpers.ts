import type { ConfigValidator, ValidationResult } from './validation.js'

export const valid = (): ValidationResult => ({ level: 'valid' })
export const fatal = (message: string): ValidationResult => ({ level: 'fatal', message })
export const error = (message: string): ValidationResult => ({ level: 'error', message })

export function requiredString(key: string, options: { optional?: boolean } = {}): ConfigValidator {
  return {
    key,
    validate: (_key, value) => options.optional && (value === undefined || value === '')
      ? valid()
      : typeof value === 'string' && value.trim() !== ''
        ? valid()
        : fatal('must be a non-empty string'),
  }
}

export function stringArray(key: string, options: { nonEmpty?: boolean; optional?: boolean } = {}): ConfigValidator {
  return {
    key,
    validate: (_key, value) => {
      if (options.optional && value === undefined) return valid()
      if (!Array.isArray(value) || value.some(item => typeof item !== 'string')) return fatal('must be an array of strings')
      if (options.nonEmpty && value.length === 0) return fatal('must contain at least one value')
      return valid()
    },
  }
}
