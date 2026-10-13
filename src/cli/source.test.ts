import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { findSource, webUrlOfRemote } from './source'

describe('webUrlOfRemote', () => {
  it.each([
    ['https://github.com/gnosisguild/treasury.git'],
    ['https://github.com/gnosisguild/treasury'],
    ['https://github.com/gnosisguild/treasury/'],
    ['git@github.com:gnosisguild/treasury.git'],
    ['ssh://git@github.com/gnosisguild/treasury.git'],
    ['ssh://git@github.com:22/gnosisguild/treasury.git'],
    ['git+https://github.com/gnosisguild/treasury.git'],
  ])('reads %s as the repository page', (remote) => {
    expect(webUrlOfRemote(remote)).toBe(
      'https://github.com/gnosisguild/treasury'
    )
  })

  it('leaves out the credentials a remote carries', () => {
    expect(
      webUrlOfRemote(
        'https://x-access-token:ghs_secret@github.com/gnosisguild/treasury.git'
      )
    ).toBe('https://github.com/gnosisguild/treasury')
  })

  it('keeps the host of a self-hosted remote', () => {
    expect(webUrlOfRemote('git@gitlab.example.com:ops/treasury.git')).toBe(
      'https://gitlab.example.com/ops/treasury'
    )
  })

  it('keeps the port a web remote is served on', () => {
    expect(
      webUrlOfRemote('https://git.example.com:8443/ops/treasury.git')
    ).toBe('https://git.example.com:8443/ops/treasury')
  })

  it('leaves out the port an ssh remote is reached on', () => {
    expect(
      webUrlOfRemote('ssh://git@git.example.com:2222/ops/treasury.git')
    ).toBe('https://git.example.com/ops/treasury')
  })

  it.each([
    ['/srv/git/treasury.git'],
    ['file:///srv/git/treasury.git'],
    ['../treasury'],
    [''],
  ])('names no web page for %p', (remote) => {
    expect(webUrlOfRemote(remote)).toBeUndefined()
  })
})

describe('findSource', () => {
  const env = { ...process.env }

  beforeEach(() => {
    delete process.env.ZODIAC_SOURCE
    delete process.env.GITHUB_SERVER_URL
    delete process.env.GITHUB_REPOSITORY
  })

  afterEach(() => {
    process.env = { ...env }
  })

  const createRepository = (remote?: string) => {
    const dir = mkdtempSync(join(tmpdir(), 'zodiac-source-test-'))

    spawnSync('git', ['init', '--quiet', dir])

    if (remote != null) {
      spawnSync('git', ['-C', dir, 'remote', 'add', 'origin', remote])
    }

    return dir
  }

  it('names the repository the code is checked out from', async () => {
    const dir = createRepository('git@github.com:gnosisguild/treasury.git')

    expect(await findSource(dir)).toBe(
      'https://github.com/gnosisguild/treasury'
    )
  })

  it('finds the repository from a directory within it', async () => {
    const dir = createRepository('git@github.com:gnosisguild/treasury.git')
    const nested = join(dir, 'constellation')
    mkdirSync(nested)

    expect(await findSource(nested)).toBe(
      'https://github.com/gnosisguild/treasury'
    )
  })

  it('names nothing outside of a repository', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'zodiac-source-test-'))

    expect(await findSource(dir)).toBeUndefined()
  })

  it('names nothing for a repository without a remote', async () => {
    expect(await findSource(createRepository())).toBeUndefined()
  })

  it('names the repository a GitHub workflow runs for', async () => {
    process.env.GITHUB_SERVER_URL = 'https://github.com'
    process.env.GITHUB_REPOSITORY = 'gnosisguild/treasury'

    expect(await findSource(createRepository())).toBe(
      'https://github.com/gnosisguild/treasury'
    )
  })

  it('prefers the source the environment names', async () => {
    process.env.ZODIAC_SOURCE = 'https://example.com/treasury'
    const dir = createRepository('git@github.com:gnosisguild/treasury.git')

    expect(await findSource(dir)).toBe('https://example.com/treasury')
  })
})
