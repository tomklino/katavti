export type ValidationLevel = 'valid' | 'warning' | 'error' | 'fatal'

export interface ValidationResult {
  level: ValidationLevel
  message?: string
}

export interface ConfigValidationResult extends ValidationResult {
  key: string
}

export interface ConfigValidator {
  key: string
  validate: (key: string, value: unknown) => ValidationResult
}

export class ConfigError extends Error {
  readonly issues: string[]
  readonly results: ConfigValidationResult[]

  constructor(issues: string[], results: ConfigValidationResult[] = []) {
    super(`Invalid configuration:\n${issues.map(issue => `- ${issue}`).join('\n')}`)
    this.name = 'ConfigError'
    this.issues = issues
    this.results = results
  }
}

function valueAt(config: unknown, key: string): unknown {
  return key.split('.').reduce<unknown>((value, part) => {
    if (!value || typeof value !== 'object') return undefined
    return (value as Record<string, unknown>)[part]
  }, config)
}

export function runConfigValidators(config: unknown, validators: ConfigValidator[]): ConfigValidationResult[] {
  return validators.map(({ key, validate }) => ({ key, ...validate(key, valueAt(config, key)) }))
}

export function validateConfig(config: unknown, validators: ConfigValidator[]): ConfigValidationResult[] {
  const results = runConfigValidators(config, validators)
  const issues = results
    .filter(result => result.level === 'error' || result.level === 'fatal')
    .map(result => `${result.key}: ${result.message ?? 'invalid value'}`)
  if (issues.length) throw new ConfigError(issues, results)
  return results
}
