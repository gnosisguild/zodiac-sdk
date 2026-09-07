import { describe, it, expect, afterEach } from 'bun:test'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { checkForUpdate, ownVersion } from './checkForUpdate'

const realFetch = globalThis.fetch

const mockLatestVersion = (version: string) => {
  const calls: string[] = []
  globalThis.fetch = ((input: RequestInfo | URL) => {
    calls.push(String(input))
    return Promise.resolve({
      ok: true,
      json: () => Promise.resolve({ version }),
    } as Response)
  }) as typeof fetch
  return calls
}

const mockUnreachableRegistry = () => {
  globalThis.fetch = ((_input: RequestInfo | URL) =>
    Promise.reject(new Error('network down'))) as typeof fetch
}

let projectDir: string | null = null

const projectWith = (...files: string[]) => {
  projectDir = mkdtempSync(join(tmpdir(), 'zodiac-update-check-'))
  writeFileSync(join(projectDir, 'package.json'), '{}')
  for (const file of files) {
    writeFileSync(join(projectDir, file), '')
  }
  // Detection walks up to the nearest package.json, so the lockfile is
  // found from a nested directory the same as from the root.
  const nested = join(projectDir, 'src', 'deep')
  mkdirSync(nested, { recursive: true })
  return nested
}

afterEach(() => {
  globalThis.fetch = realFetch
  if (projectDir != null) {
    rmSync(projectDir, { recursive: true, force: true })
    projectDir = null
  }
})

describe('checkForUpdate', () => {
  it('announces a newer version together with the update command', async () => {
    mockLatestVersion('999.0.0')

    const notice = await checkForUpdate({
      cwd: projectWith(),
      env: { npm_config_user_agent: 'bun/1.3.0 npm/? node/v24.3.0 darwin' },
    })

    expect(notice).toBe(
      `A newer version of @zodiaceco/sdk is available (${ownVersion()} → 999.0.0). Update with:\n` +
        '  bun add @zodiaceco/sdk@latest'
    )
  })

  it('stays silent when already on the latest version', async () => {
    mockLatestVersion(ownVersion())

    expect(await checkForUpdate({ cwd: projectWith(), env: {} })).toBeNull()
  })

  it('stays silent when the registry answers with an older version', async () => {
    mockLatestVersion('0.0.1')

    expect(await checkForUpdate({ cwd: projectWith(), env: {} })).toBeNull()
  })

  it('compares versions numerically, not by string', async () => {
    // '2.1.10' < '2.1.9' as strings — a string comparison would stay silent.
    mockLatestVersion(ownVersion().replace(/\d+$/, '10'))

    const notice = await checkForUpdate({
      cwd: projectWith(),
      env: {},
    })

    expect(notice).toContain('Update with:')
  })

  it('stays silent when the registry is unreachable', async () => {
    mockUnreachableRegistry()

    expect(await checkForUpdate({ cwd: projectWith(), env: {} })).toBeNull()
  })

  it('does not even ask in CI', async () => {
    const calls = mockLatestVersion('999.0.0')

    expect(
      await checkForUpdate({ cwd: projectWith(), env: { CI: 'true' } })
    ).toBeNull()
    expect(calls).toHaveLength(0)
  })

  describe('the update command matches the package manager', () => {
    it.each([
      ['pnpm/9.1.0 npm/? node/v24.3.0', 'pnpm add @zodiaceco/sdk@latest'],
      ['yarn/4.1.0 npm/? node/v24.3.0', 'yarn add @zodiaceco/sdk@latest'],
      ['bun/1.3.0 npm/? node/v24.3.0', 'bun add @zodiaceco/sdk@latest'],
      ['npm/10.5.0 node/v24.3.0', 'npm install @zodiaceco/sdk@latest'],
    ])('detects the launcher from "%s"', async (agent, command) => {
      mockLatestVersion('999.0.0')

      const notice = await checkForUpdate({
        cwd: projectWith(),
        env: { npm_config_user_agent: agent },
      })

      expect(notice).toContain(command)
    })

    it.each([
      ['pnpm-lock.yaml', 'pnpm add @zodiaceco/sdk@latest'],
      ['yarn.lock', 'yarn add @zodiaceco/sdk@latest'],
      ['bun.lock', 'bun add @zodiaceco/sdk@latest'],
      ['bun.lockb', 'bun add @zodiaceco/sdk@latest'],
      ['package-lock.json', 'npm install @zodiaceco/sdk@latest'],
    ])('falls back to the project lockfile: %s', async (lockfile, command) => {
      mockLatestVersion('999.0.0')

      const notice = await checkForUpdate({
        cwd: projectWith(lockfile),
        env: {},
      })

      expect(notice).toContain(command)
    })

    it('trusts the launcher over the lockfile', async () => {
      mockLatestVersion('999.0.0')

      const notice = await checkForUpdate({
        cwd: projectWith('pnpm-lock.yaml'),
        env: { npm_config_user_agent: 'yarn/4.1.0 npm/? node/v24.3.0' },
      })

      expect(notice).toContain('yarn add @zodiaceco/sdk@latest')
    })

    it('assumes npm when nothing says otherwise', async () => {
      mockLatestVersion('999.0.0')

      const notice = await checkForUpdate({ cwd: projectWith(), env: {} })

      expect(notice).toContain('npm install @zodiaceco/sdk@latest')
    })
  })
})

describe('ownVersion', () => {
  it('reports the version this package declares', async () => {
    const manifest = await import('../../package.json')

    expect(ownVersion()).toBe(manifest.version)
  })
})
