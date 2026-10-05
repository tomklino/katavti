import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { parse } from 'yaml'
import { ConfigError, runConfigValidators, type ConfigValidator } from './validation.js'

export { ConfigError } from './validation.js'

export type StorageConfig =
  | { module?: 'filesystem'; dataDir: string }
  | { module: 'azure'; azure: { connectionString?: string; accountName?: string; containerName: string; clientId?: string } }

export interface AppConfig {
  environmentType: 'dev' | 'prod'
  server: { host: string; port: number }
  storage: StorageConfig
  http: {
    cors: { origins: string[]; allowLoopbackInDevelopment: boolean }
    identity: { headerName: string }
  }
  api: { basePath: string }
  sessions: { module: 'filesystem'; lazy: boolean; cache: boolean; filesystem: { directory: string } }
  auth: {
    googleClientId: string
    magicLinkBaseUrl: string
    smtpUrl: string
    smtpOAuth?: { user: string; clientId: string; clientSecret: string; refreshToken: string }
    mailFrom: string
  }
  config: { files: string[]; secretFiles: string[] }
}

interface LoadConfigOptions {
  defaultsFile: string
  env?: NodeJS.ProcessEnv
  argv?: string[]
  cwd?: string
}

type ConfigObject = Record<string, unknown>

const environmentKeys: Record<string, string> = {
  KATAVTI_ENVIRONMENT_TYPE: 'environmentType',
  KATAVTI_SERVER_HOST: 'server.host',
  KATAVTI_SERVER_PORT: 'server.port',
  KATAVTI_STORAGE_MODULE: 'storage.module',
  KATAVTI_STORAGE_DATA_DIR: 'storage.dataDir',
  KATAVTI_STORAGE_AZURE_CONNECTION_STRING: 'storage.azure.connectionString',
  KATAVTI_STORAGE_AZURE_ACCOUNT_NAME: 'storage.azure.accountName',
  KATAVTI_STORAGE_AZURE_CONTAINER_NAME: 'storage.azure.containerName',
  KATAVTI_STORAGE_AZURE_CLIENT_ID: 'storage.azure.clientId',
  KATAVTI_SESSIONS_MODULE: 'sessions.module',
  KATAVTI_SESSIONS_LAZY: 'sessions.lazy',
  KATAVTI_SESSIONS_CACHE: 'sessions.cache',
  KATAVTI_SESSIONS_FILESYSTEM_DIRECTORY: 'sessions.filesystem.directory',
  KATAVTI_HTTP_CORS_ORIGINS: 'http.cors.origins',
  KATAVTI_HTTP_CORS_ALLOW_LOOPBACK_IN_DEVELOPMENT: 'http.cors.allowLoopbackInDevelopment',
  KATAVTI_HTTP_IDENTITY_HEADER_NAME: 'http.identity.headerName',
  KATAVTI_API_BASE_PATH: 'api.basePath',
  KATAVTI_AUTH_GOOGLE_CLIENT_ID: 'auth.googleClientId',
  KATAVTI_AUTH_MAGIC_LINK_BASE_URL: 'auth.magicLinkBaseUrl',
  KATAVTI_AUTH_SMTP_URL: 'auth.smtpUrl',
  KATAVTI_AUTH_MAIL_FROM: 'auth.mailFrom',
  KATAVTI_CONFIG_FILES: 'config.files',
  KATAVTI_CONFIG_SECRET_FILES: 'config.secretFiles',
}

const listKeys = new Set(['http.cors.origins', 'config.files', 'config.secretFiles'])
const numberKeys = new Set(['server.port'])
const booleanKeys = new Set(['http.cors.allowLoopbackInDevelopment', 'sessions.lazy', 'sessions.cache'])

function isObject(value: unknown): value is ConfigObject {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function merge(target: ConfigObject, source: ConfigObject): ConfigObject {
  for (const [key, value] of Object.entries(source)) {
    target[key] = isObject(value) && isObject(target[key])
      ? merge({ ...target[key] as ConfigObject }, value)
      : value
  }
  return target
}

function setValue(target: ConfigObject, key: string, value: unknown) {
  const parts = key.split('.')
  let object = target
  for (const part of parts.slice(0, -1)) {
    if (!isObject(object[part])) object[part] = {}
    object = object[part] as ConfigObject
  }
  object[parts.at(-1)!] = value
}

function getValue(target: ConfigObject, key: string): unknown {
  return key.split('.').reduce<unknown>((value, part) => isObject(value) ? value[part] : undefined, target)
}

function parseValue(key: string, value: string): unknown {
  if (listKeys.has(key)) return value ? value.split(',').map(item => item.trim()).filter(Boolean) : []
  if (numberKeys.has(key)) return Number(value)
  if (booleanKeys.has(key)) return value.toLowerCase() === 'true'
  return value
}

function cliValues(argv: string[]): ConfigObject {
  const result: ConfigObject = {}
  for (const argument of argv) {
    const match = /^--([^=]+)=(.*)$/.exec(argument)
    if (match) setValue(result, match[1], parseValue(match[1], match[2]))
  }
  return result
}

function environmentValues(env: NodeJS.ProcessEnv): ConfigObject {
  const result: ConfigObject = {}
  for (const [name, key] of Object.entries(environmentKeys)) {
    if (env[name] !== undefined) setValue(result, key, parseValue(key, env[name]!))
  }
  return result
}

function pathsAt(config: ConfigObject, key: string): string[] {
  const value = getValue(config, key)
  return Array.isArray(value) ? value.map(String) : []
}

async function readYaml(file: string): Promise<ConfigObject> {
  const value = parse(await readFile(file, 'utf8'))
  return isObject(value) ? value : {}
}

async function mergeFiles(config: ConfigObject, files: string[], cwd: string, issues: string[]) {
  for (const file of files) {
    const resolved = path.resolve(cwd, file)
    try {
      merge(config, await readYaml(resolved))
    } catch (error) {
      issues.push(`${resolved}: ${error instanceof Error ? error.message : String(error)}`)
    }
  }
}

const required = (key: string, value: unknown) => typeof value === 'string' && value.length > 0
  ? { level: 'valid' as const }
  : { level: 'fatal' as const, message: 'is required' }

const validators: ConfigValidator[] = [
  { key: 'environmentType', validate: (key, value) => value === 'dev' || value === 'prod' ? { level: 'valid' } : { level: 'fatal', message: 'must be dev or prod' } },
  { key: 'server.host', validate: required },
  { key: 'server.port', validate: (key, value) => Number.isInteger(value) && Number(value) >= 1 && Number(value) <= 65535 ? { level: 'valid' } : { level: 'error', message: 'must be an integer from 1 to 65535' } },
  { key: 'storage.module', validate: (key, value) => value === undefined || value === 'filesystem' || value === 'azure' ? { level: 'valid' } : { level: 'fatal', message: 'must be filesystem or azure' } },
  { key: 'sessions.module', validate: (key, value) => value === undefined || value === 'filesystem' ? { level: 'valid' } : { level: 'fatal', message: 'must be filesystem' } },
  { key: 'sessions.lazy', validate: (key, value) => value === undefined || typeof value === 'boolean' ? { level: 'valid' } : { level: 'error', message: 'must be a boolean' } },
  { key: 'sessions.cache', validate: (key, value) => value === undefined || typeof value === 'boolean' ? { level: 'valid' } : { level: 'error', message: 'must be a boolean' } },
  { key: 'http.cors.origins', validate: (key, value) => {
    if (!Array.isArray(value)) return { level: 'error', message: 'must be a list of URLs' }
    const invalid = value.findIndex(origin => origin !== '*' && (() => { try { new URL(String(origin)); return false } catch { return true } })())
    return invalid < 0 ? { level: 'valid' } : { level: 'error', message: `http.cors.origins[${invalid}] must be a valid URL` }
  } },
  { key: 'http.cors.allowLoopbackInDevelopment', validate: (key, value) => typeof value === 'boolean' ? { level: 'valid' } : { level: 'error', message: 'must be a boolean' } },
  { key: 'http.identity.headerName', validate: (key, value) => typeof value === 'string' && /^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/.test(value) ? { level: 'valid' } : { level: 'error', message: 'must be a valid HTTP header name' } },
  { key: 'api.basePath', validate: (key, value) => typeof value === 'string' && value.startsWith('/') ? { level: 'valid' } : { level: 'error', message: 'must start with /' } },
]

export async function loadConfig(options: LoadConfigOptions): Promise<AppConfig> {
  const env = options.env ?? process.env
  const argv = options.argv ?? process.argv.slice(2)
  const cwd = options.cwd ?? process.cwd()
  const issues: string[] = []
  let defaults: ConfigObject
  try {
    defaults = await readYaml(options.defaultsFile)
  } catch (error) {
    throw new ConfigError([`${options.defaultsFile}: ${error instanceof Error ? error.message : String(error)}`])
  }

  const envConfig = environmentValues(env)
  const cliConfig = cliValues(argv)
  const environmentType = String(getValue(cliConfig, 'environmentType') ?? getValue(envConfig, 'environmentType') ?? getValue(defaults, 'environmentType') ?? '')
  const config: ConfigObject = environmentType === 'prod' ? {} : merge({}, defaults)

  // File selectors may come from defaults, environment, or CLI, but file content cannot override selectors.
  const selectors = merge(merge(merge({}, defaults), envConfig), cliConfig)
  await mergeFiles(config, pathsAt(selectors, 'config.files'), cwd, issues)
  await mergeFiles(config, pathsAt(selectors, 'config.secretFiles'), cwd, issues)
  merge(config, envConfig)
  merge(config, cliConfig)

  const validationResults = runConfigValidators(config, validators)
  issues.push(...validationResults
    .filter(result => result.level === 'error' || result.level === 'fatal')
    .map(result => `${result.key}: ${result.message ?? 'invalid value'}`))

  const storageModule = getValue(config, 'storage.module') ?? (getValue(config, 'storage.dataDir') !== undefined ? 'filesystem' : undefined)
  const storageKeys = storageModule === 'azure'
    ? ['storage.azure.containerName']
    : ['storage.dataDir']
  if (storageModule === 'azure' && !getValue(config, 'storage.azure.connectionString') && !getValue(config, 'storage.azure.accountName')) {
    issues.push('storage.azure.accountName: accountName or connectionString is required for azure storage')
  }
  for (const key of storageKeys) {
    if (required(key, getValue(config, key)).level !== 'valid') issues.push(`${key}: is required for ${storageModule ?? 'selected'} storage`)
  }
  const sessionsModule = getValue(config, 'sessions.module')
  if (sessionsModule && required('sessions.filesystem.directory', getValue(config, 'sessions.filesystem.directory')).level !== 'valid') {
    issues.push('sessions.filesystem.directory: is required for filesystem sessions')
  }
  if (environmentType === 'prod') {
    for (const key of ['server.host', 'server.port', 'sessions.module', 'http.cors.origins', 'http.cors.allowLoopbackInDevelopment', 'http.identity.headerName', 'api.basePath']) {
      if (getValue(config, key) === undefined) issues.push(`${key}: is required in prod; config-defaults values are not used`)
    }
  }
  if (issues.length) throw new ConfigError(issues, validationResults)

  if (storageModule === 'filesystem') {
    const dataDir = getValue(config, 'storage.dataDir') as string
    setValue(config, 'storage.dataDir', path.resolve(cwd, dataDir))
  }
  if (sessionsModule === 'filesystem') {
    setValue(config, 'sessions.filesystem.directory', path.resolve(cwd, getValue(config, 'sessions.filesystem.directory') as string))
    if (getValue(config, 'sessions.lazy') === undefined) setValue(config, 'sessions.lazy', true)
    if (getValue(config, 'sessions.cache') === undefined) setValue(config, 'sessions.cache', true)
  }
  if (getValue(config, 'auth.googleClientId') === undefined) setValue(config, 'auth.googleClientId', '')
  if (getValue(config, 'auth.smtpUrl') === undefined) setValue(config, 'auth.smtpUrl', '')
  if (getValue(config, 'config.files') === undefined) setValue(config, 'config.files', [])
  if (getValue(config, 'config.secretFiles') === undefined) setValue(config, 'config.secretFiles', [])
  return config as unknown as AppConfig
}
