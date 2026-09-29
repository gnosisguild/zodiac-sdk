import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import {
  existsSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { ensureConfigStub, loadConfig } from './config'

const ENV_KEY = 'ZODIAC_API_KEY'

let tmpDir: string
let originalEnv: string | undefined
let originalCwd: string

beforeEach(() => {
  tmpDir = join(tmpdir(), `zodiac-config-test-${Date.now()}-${Math.random()}`)
  mkdirSync(tmpDir, { recursive: true })
  // Anchor findProjectRoot here so loadConfig resolves against tmpDir.
  writeFileSync(join(tmpDir, 'package.json'), '{}')
  originalEnv = process.env[ENV_KEY]
  delete process.env[ENV_KEY]
  originalCwd = process.cwd()
  process.chdir(tmpDir)
})

afterEach(() => {
  process.chdir(originalCwd)
  rmSync(tmpDir, { recursive: true, force: true })
  if (originalEnv == null) {
    delete process.env[ENV_KEY]
  } else {
    process.env[ENV_KEY] = originalEnv
  }
})

const writeConfig = (body: string) => {
  writeFileSync(
    join(tmpDir, 'zodiac.config.ts'),
    `export default ${body}\n`,
    'utf8'
  )
}

describe('loadConfig', () => {
  it('uses ZODIAC_API_KEY from the environment when config omits apiKey', async () => {
    process.env[ENV_KEY] = 'zodiac_from-env'
    writeConfig('{}')

    const config = await loadConfig('zodiac.config.ts')

    expect(config.apiKey).toBe('zodiac_from-env')
  })

  it("reads the API key from the project root's .env when run from a subdirectory", async () => {
    writeConfig('{}')
    writeFileSync(join(tmpDir, '.env'), 'ZODIAC_API_KEY=zodiac_from-dotenv\n')
    mkdirSync(join(tmpDir, 'constellation'))
    process.chdir(join(tmpDir, 'constellation'))

    await expect(loadConfig('zodiac.config.ts')).resolves.toHaveProperty(
      'apiKey',
      'zodiac_from-dotenv'
    )
  })

  it("prefers a set ZODIAC_API_KEY over the project root's .env", async () => {
    process.env[ENV_KEY] = 'zodiac_from-env'
    writeConfig('{}')
    writeFileSync(join(tmpDir, '.env'), 'ZODIAC_API_KEY=zodiac_from-dotenv\n')

    await expect(loadConfig('zodiac.config.ts')).resolves.toHaveProperty(
      'apiKey',
      'zodiac_from-env'
    )
  })

  it('prefers an explicit apiKey in the config over the env var', async () => {
    process.env[ENV_KEY] = 'zodiac_from-env'
    writeConfig(`{ apiKey: 'zodiac_from-config' }`)

    const config = await loadConfig('zodiac.config.ts')

    expect(config.apiKey).toBe('zodiac_from-config')
  })

  it('throws a helpful error when the env var is set but malformed', async () => {
    process.env[ENV_KEY] = 'not-a-zodiac-key'
    writeConfig('{}')

    await expect(loadConfig('zodiac.config.ts')).rejects.toThrow(
      /ZODIAC_API_KEY is set but malformed/
    )
  })

  it('throws a helpful error when the config apiKey is malformed', async () => {
    writeConfig(`{ apiKey: 'oops' }`)

    await expect(loadConfig('zodiac.config.ts')).rejects.toThrow(
      /apiKey.*malformed/
    )
  })

  it('throws a "run zodiac init" hint when neither source has a key', async () => {
    writeConfig('{}')

    await expect(loadConfig('zodiac.config.ts')).rejects.toThrow(
      /No Zodiac API key found.*zodiac init/
    )
  })

  it('invokes onMissingKey when no key is set, and uses the returned key', async () => {
    writeConfig('{}')

    const config = await loadConfig('zodiac.config.ts', {
      onMissingKey: async () => 'zodiac_minted',
    })

    expect(config.apiKey).toBe('zodiac_minted')
  })

  it('rejects an onMissingKey return value that is not a valid api key', async () => {
    writeConfig('{}')

    await expect(
      loadConfig('zodiac.config.ts', {
        onMissingKey: async () => 'definitely-not-a-key',
      })
    ).rejects.toThrow(/onMissingKey returned an invalid/)
  })

  it('throws when the config file does not exist and createIfMissing is off', async () => {
    await expect(loadConfig('zodiac.config.ts')).rejects.toThrow(
      /Config file not found/
    )
  })

  it('discovers `zodiac.config.mjs` when no `.ts` exists', async () => {
    process.env[ENV_KEY] = 'zodiac_from-env'
    writeFileSync(
      join(tmpDir, 'zodiac.config.mjs'),
      `export default { /* mjs */ }\n`,
      'utf8'
    )

    const config = await loadConfig()

    expect(config.apiKey).toBe('zodiac_from-env')
  })

  it('prefers `.ts` over other extensions when both are present', async () => {
    process.env[ENV_KEY] = 'zodiac_from-env'
    writeConfig(`{ apiKey: 'zodiac_from-ts' }`)
    writeFileSync(
      join(tmpDir, 'zodiac.config.mjs'),
      `export default { apiKey: 'zodiac_from-mjs' }\n`,
      'utf8'
    )

    const config = await loadConfig()

    expect(config.apiKey).toBe('zodiac_from-ts')
  })

  it('discovers `zodiac.config.js`', async () => {
    process.env[ENV_KEY] = 'zodiac_from-env'
    writeFileSync(
      join(tmpDir, 'zodiac.config.js'),
      `export default { /* js */ }\n`,
      'utf8'
    )

    const config = await loadConfig()

    expect(config.apiKey).toBe('zodiac_from-env')
  })

  it('resolves the default config path against the nearest package.json ancestor', async () => {
    process.env[ENV_KEY] = 'zodiac_from-env'
    writeConfig('{}')
    const nested = join(tmpDir, 'apps', 'web')
    mkdirSync(nested, { recursive: true })
    process.chdir(nested)

    const config = await loadConfig()

    // macOS: tmpdir() lives under /var (symlink), process.cwd() canonicalizes
    // to /private/var; compare via realpath so we don't get false negatives.
    expect(config.rootDir).toBe(realpathSync(tmpDir))
  })
})

describe('ensureConfigStub', () => {
  it('writes a starter config when the file is missing', () => {
    const path = join(tmpDir, 'zodiac.config.ts')
    expect(existsSync(path)).toBe(false)

    const created = ensureConfigStub(path)

    expect(created).toBe(true)
    expect(existsSync(path)).toBe(true)
    const contents = readFileSync(path, 'utf8')
    expect(contents).toContain('defineConfig')
    expect(contents).toContain('contracts')
  })

  it('does not overwrite an existing config', () => {
    const path = join(tmpDir, 'zodiac.config.ts')
    writeFileSync(path, '// existing', 'utf8')

    const created = ensureConfigStub(path)

    expect(created).toBe(false)
    expect(readFileSync(path, 'utf8')).toBe('// existing')
  })
})
