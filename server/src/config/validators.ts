import type { ConfigValidator } from './validation.js'
import { error, fatal, requiredString, stringArray, valid } from './validator-helpers.js'

export const environmentTypeValidator: ConfigValidator = {
  key: 'environmentType',
  validate: (_key, value) => value === 'dev' || value === 'prod'
    ? valid()
    : fatal("must be either 'dev' or 'prod'"),
}

export const bootstrapValidators: ConfigValidator[] = [
  stringArray('config.files', { optional: true }),
  stringArray('config.secretFiles', { optional: true }),
]

export const appConfigValidators: ConfigValidator[] = [
  environmentTypeValidator,
  requiredString('server.host'),
  {
    key: 'server.port',
    validate: (_key, value) => Number.isInteger(value) && (value as number) >= 0 && (value as number) <= 65535
      ? valid()
      : fatal('must be an integer between 0 and 65535'),
  },
  requiredString('storage.dataDir'),
  stringArray('http.cors.origins', { nonEmpty: true }),
  {
    key: 'http.cors.allowLoopbackInDevelopment',
    validate: (_key, value) => typeof value === 'boolean'
      ? valid()
      : fatal('must be a boolean'),
  },
  {
    key: 'http.cors.origins',
    validate: (_key, value) => {
      if (!Array.isArray(value)) return valid() // The shape validator reports this failure.
      const invalid = value
        .map((origin, index) => ({ origin, index }))
        .filter(({ origin }) => {
          if (origin === '*') return false
          try { new URL(origin as string); return false } catch { return true }
        })
      return invalid.length === 0
        ? valid()
        : error(invalid.map(({ index }) => `http.cors.origins[${index}] must be '*' or a valid URL`).join('; '))
    },
  },
  requiredString('http.identity.headerName'),
  {
    key: 'http.identity.headerName',
    validate: (_key, value) => typeof value !== 'string' || value === ''
      ? valid() // The required-string validator reports this failure.
      : /^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/.test(value)
        ? valid()
        : error('must be a valid HTTP header name'),
  },
  requiredString('auth.googleClientId', { optional: true }),
  requiredString('auth.magicLinkBaseUrl', { optional: true }),
  requiredString('auth.smtpUrl', { optional: true }),
  requiredString('auth.mailFrom', { optional: true }),
  requiredString('api.basePath'),
  {
    key: 'api.basePath',
    validate: (_key, value) => typeof value !== 'string' || value === ''
      ? valid() // The required-string validator reports this failure.
      : value.startsWith('/') && (value.length === 1 || !value.endsWith('/'))
        ? valid()
        : error('must start with / and must not end with /'),
  },
  ...bootstrapValidators,
]
