import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { ConfigError, loadConfig } from '../../src/config/index.js'

const directories: string[] = []

async function tempFiles(files: Record<string, string>) {
  const directory = await mkdtemp(path.join(tmpdir(), 'katavti-config-'))
  directories.push(directory)
  await Promise.all(Object.entries(files).map(([name, content]) => writeFile(path.join(directory, name), content)))
  return directory
}

afterEach(async () => Promise.all(directories.splice(0).map(directory => rm(directory, { recursive: true, force: true }))))

describe('configuration loading', () => {
  it('loads Azure storage configuration without requiring a filesystem data directory', async () => {
    const directory = await tempFiles({
      'defaults.yaml': `environmentType: dev\nserver:\n  host: localhost\n  port: 3030\nstorage:\n  module: azure\n  azure:\n    connectionString: UseDevelopmentStorage=true\n    containerName: notes\nhttp:\n  cors:\n    origins: [http://localhost:8080]\n    allowLoopbackInDevelopment: true\n  identity:\n    headerName: x-user-id\napi:\n  basePath: /api\nconfig:\n  files: []\n  secretFiles: []\n`,
    })

    const config = await loadConfig({ defaultsFile: path.join(directory, 'defaults.yaml'), env: {}, argv: [], cwd: directory })

    expect(config.storage).toEqual({
      module: 'azure',
      azure: { connectionString: 'UseDevelopmentStorage=true', containerName: 'notes' },
    })
  })

  it('overwrites defaults with config files, secret files, environment, then CLI arguments', async () => {
    const directory = await tempFiles({
      'defaults.yaml': `environmentType: dev\nserver:\n  host: default-host\n  port: 1000\nstorage:\n  dataDir: ./default-data\nhttp:\n  cors:\n    origins: [http://default.test]\n    allowLoopbackInDevelopment: true\n  identity:\n    headerName: x-default-user\napi:\n  basePath: /default-api\nconfig:\n  files: []\n  secretFiles: []\n`,
      'config.yaml': `server:\n  host: config-host\n  port: 2000\nstorage:\n  dataDir: ./config-data\n`,
      'secret.yaml': `server:\n  port: 3000\nstorage:\n  dataDir: ./secret-data\n`,
    })

    const config = await loadConfig({
      defaultsFile: path.join(directory, 'defaults.yaml'),
      env: {
        KATAVTI_CONFIG_FILES: path.join(directory, 'config.yaml'),
        KATAVTI_CONFIG_SECRET_FILES: path.join(directory, 'secret.yaml'),
        KATAVTI_SERVER_PORT: '4000',
        KATAVTI_STORAGE_DATA_DIR: './environment-data',
      },
      argv: ['--server.port=5000', '--storage.dataDir=./cli-data'],
      cwd: directory,
    })

    expect(config.server).toEqual({ host: 'config-host', port: 5000 })
    expect(config.storage.dataDir).toBe(path.join(directory, 'cli-data'))
  })

  it('allows every setting to be supplied through environment variables', async () => {
    const directory = await tempFiles({ 'defaults.yaml': '{}\n' })
    const config = await loadConfig({
      defaultsFile: path.join(directory, 'defaults.yaml'), cwd: directory, argv: [],
      env: {
        KATAVTI_ENVIRONMENT_TYPE: 'dev', KATAVTI_SERVER_HOST: '0.0.0.0', KATAVTI_SERVER_PORT: '4321',
        KATAVTI_STORAGE_DATA_DIR: './notes', KATAVTI_HTTP_CORS_ORIGINS: 'https://one.test,https://two.test',
        KATAVTI_HTTP_CORS_ALLOW_LOOPBACK_IN_DEVELOPMENT: 'false',
        KATAVTI_HTTP_IDENTITY_HEADER_NAME: 'x-person', KATAVTI_API_BASE_PATH: '/v2',
        KATAVTI_CONFIG_FILES: '', KATAVTI_CONFIG_SECRET_FILES: '',
      },
    })
    expect(config).toMatchObject({
      server: { host: '0.0.0.0', port: 4321 }, storage: { dataDir: path.join(directory, 'notes') },
      http: { cors: { origins: ['https://one.test', 'https://two.test'] }, identity: { headerName: 'x-person' } },
      api: { basePath: '/v2' },
    })
  })

  it('reports every validation failure together', async () => {
    const directory = await tempFiles({
      'defaults.yaml': `environmentType: dev\nserver:\n  host: ''\n  port: 70000\nstorage:\n  dataDir: ''\nhttp:\n  cors:\n    origins: [not-a-url]\n  identity:\n    headerName: 'Bad Header'\napi:\n  basePath: api\nconfig:\n  files: []\n  secretFiles: []\n`,
    })
    await expect(loadConfig({ defaultsFile: path.join(directory, 'defaults.yaml'), env: {}, argv: [], cwd: directory }))
      .rejects.toEqual(expect.objectContaining<Partial<ConfigError>>({
        name: 'ConfigError',
        issues: expect.arrayContaining([
          expect.stringContaining('server.host'), expect.stringContaining('server.port'),
          expect.stringContaining('storage.dataDir'), expect.stringContaining('http.cors.origins[0]'),
          expect.stringContaining('http.identity.headerName'), expect.stringContaining('api.basePath'),
        ]),
      }))
  })

  it('does not use default values in prod and explains resulting missing values', async () => {
    const directory = await tempFiles({
      'defaults.yaml': `environmentType: dev\nserver:\n  host: default-host\n  port: 3000\nstorage:\n  dataDir: ./default-data\nhttp:\n  cors:\n    origins: [http://default.test]\n  identity:\n    headerName: x-user-id\napi:\n  basePath: /api\nconfig:\n  files: []\n  secretFiles: []\n`,
    })

    try {
      await loadConfig({
        defaultsFile: path.join(directory, 'defaults.yaml'), cwd: directory, argv: [],
        env: { KATAVTI_ENVIRONMENT_TYPE: 'prod', KATAVTI_CONFIG_FILES: '', KATAVTI_CONFIG_SECRET_FILES: '' },
      })
      throw new Error('Expected production configuration to fail')
    } catch (error) {
      expect(error).toBeInstanceOf(ConfigError)
      expect((error as ConfigError).issues).toEqual(expect.arrayContaining([
        expect.stringContaining('server.host'),
        expect.stringContaining('config-defaults'),
      ]))
    }
  })

  it('loads prod entirely from non-default sources', async () => {
    const directory = await tempFiles({
      'defaults.yaml': `environmentType: dev\nserver:\n  host: forbidden-default\n  port: 1000\n`,
      'prod.yaml': `environmentType: prod\nserver:\n  host: prod-host\n  port: 4000\nstorage:\n  dataDir: ./prod-data\nhttp:\n  cors:\n    origins: [https://prod.test]\n    allowLoopbackInDevelopment: false\n  identity:\n    headerName: x-user-id\napi:\n  basePath: /api/v1\nconfig:\n  files: []\n  secretFiles: []\n`,
    })
    const config = await loadConfig({
      defaultsFile: path.join(directory, 'defaults.yaml'), cwd: directory,
      env: { KATAVTI_CONFIG_FILES: path.join(directory, 'prod.yaml') }, argv: [],
    })

    expect(config.environmentType).toBe('prod')
    expect(config.server).toEqual({ host: 'prod-host', port: 4000 })
  })

  it('rejects unsupported environment types', async () => {
    const directory = await tempFiles({ 'defaults.yaml': `environmentType: staging\nconfig:\n  files: []\n  secretFiles: []\n` })
    await expect(loadConfig({ defaultsFile: path.join(directory, 'defaults.yaml'), cwd: directory, env: {}, argv: [] }))
      .rejects.toThrow(/environmentType.*dev.*prod/)
  })

  it('reports all missing and malformed optional files with useful paths', async () => {
    const directory = await tempFiles({
      'defaults.yaml': `environmentType: dev\nconfig:\n  files: []\n  secretFiles: []\n`,
      'broken-secret.yaml': 'server: [unterminated',
    })
    try {
      await loadConfig({
        defaultsFile: path.join(directory, 'defaults.yaml'), cwd: directory, env: {},
        argv: [
          `--config.files=${path.join(directory, 'missing-one.yaml')},${path.join(directory, 'missing-two.yaml')}`,
          `--config.secretFiles=${path.join(directory, 'broken-secret.yaml')}`,
        ],
      })
      throw new Error('Expected configuration loading to fail')
    } catch (error) {
      expect(error).toBeInstanceOf(ConfigError)
      expect((error as ConfigError).issues).toEqual(expect.arrayContaining([
        expect.stringContaining('missing-one.yaml'),
        expect.stringContaining('missing-two.yaml'),
        expect.stringContaining('broken-secret.yaml'),
      ]))
    }
  })
})
