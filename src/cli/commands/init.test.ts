import { afterEach, describe, expect, it, mock } from 'bun:test'
import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const APP_URL = 'https://app.example.test'
const EXCHANGE_URL = `${APP_URL}/cli-auth/exchange`

// Capture the URL `open` is called with so we can drive the callback ourselves.
let capturedUrl: string | null = null
mock.module('open', () => ({
  default: (url: string) => {
    capturedUrl = url
    return Promise.resolve()
  },
}))

const tmpDir = join(tmpdir(), `zodiac-init-test-${Date.now()}-${process.pid}`)

const originalFetch = globalThis.fetch

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true })
  capturedUrl = null
  globalThis.fetch = originalFetch
})

type ExchangeStub = (body: { code: string; code_verifier: string }) => {
  status: number
  body?: unknown
}

const stubExchange = (handler: ExchangeStub) => {
  const realFetch = originalFetch
  globalThis.fetch = (async (input, init) => {
    // Only intercept the exchange call — pass everything else (including
    // the test's own loopback fetches) through to the real fetch.
    if (input !== EXCHANGE_URL) {
      return realFetch(input as RequestInfo, init)
    }
    if (init?.method !== 'POST') {
      throw new Error('Exchange must be POST')
    }
    const body = JSON.parse(init.body as string) as {
      code: string
      code_verifier: string
    }
    const result = handler(body)
    return new Response(
      result.body == null ? null : JSON.stringify(result.body),
      { status: result.status, headers: { 'content-type': 'application/json' } }
    )
  }) as typeof fetch
}

const ENV_HEADER = `# Written by \`zodiac init\`. Never commit this file.
# Revoke keys at ${APP_URL}/profile/api-keys
`

const challengeFor = (verifier: string) =>
  createHash('sha256').update(verifier).digest('base64url')

describe('init', () => {
  it('opens cli-auth, exchanges the auth code for the API key, and writes .env', async () => {
    mkdirSync(tmpDir, { recursive: true })

    let receivedExchange: { code: string; code_verifier: string } | null = null
    stubExchange((body) => {
      receivedExchange = body
      return { status: 200, body: { key: 'zodiac_test-key-1' } }
    })

    const { init } = await import('./init')
    const initPromise = init({ rootDir: tmpDir, appUrl: APP_URL })

    const { callbackUrl, state, codeChallenge } = await waitForCapturedUrl()

    // Hit the loopback the way the browser would after the app's redirect.
    const response = await fetch(
      `${callbackUrl}?code=auth-code-1&state=${state}`
    )
    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toContain('text/html')

    const apiKey = await initPromise
    expect(apiKey).toBe('zodiac_test-key-1')

    // The CLI used the same code it received and held the verifier locally.
    expect(receivedExchange).not.toBeNull()
    expect(receivedExchange!.code).toBe('auth-code-1')
    expect(challengeFor(receivedExchange!.code_verifier)).toBe(codeChallenge)

    const envContents = readFileSync(join(tmpDir, '.env'), 'utf8')
    expect(envContents).toBe(
      `${ENV_HEADER}ZODIAC_API_KEY=zodiac_test-key-1\nZODIAC_API_URL=${APP_URL}/api/v1\n`
    )

    // First-run scaffolding: stub zodiac.config.ts dropped at rootDir.
    const configContents = readFileSync(
      join(tmpDir, 'zodiac.config.ts'),
      'utf8'
    )
    expect(configContents).toContain('defineConfig')
    expect(configContents).toContain('contracts')
  })

  it('does not overwrite an existing zodiac.config.ts', async () => {
    mkdirSync(tmpDir, { recursive: true })
    writeFileSync(
      join(tmpDir, 'zodiac.config.ts'),
      '// user-edited config',
      'utf8'
    )

    stubExchange(() => ({ status: 200, body: { key: 'zodiac_keep' } }))

    const { init } = await import('./init')
    const initPromise = init({ rootDir: tmpDir, appUrl: APP_URL })

    const { callbackUrl, state } = await waitForCapturedUrl()
    await fetch(`${callbackUrl}?code=ok&state=${state}`)
    await initPromise

    const after = readFileSync(join(tmpDir, 'zodiac.config.ts'), 'utf8')
    expect(after).toBe('// user-edited config')
  })

  it('rejects callbacks with a wrong state and keeps waiting', async () => {
    mkdirSync(tmpDir, { recursive: true })

    stubExchange(() => ({ status: 200, body: { key: 'zodiac_real' } }))

    const { init } = await import('./init')
    const initPromise = init({ rootDir: tmpDir, appUrl: APP_URL })

    const { callbackUrl, state } = await waitForCapturedUrl()

    const wrongState = await fetch(
      `${callbackUrl}?code=attacker&state=wrong-state`
    )
    expect(wrongState.status).toBe(403)

    // The right state still wins.
    const ok = await fetch(`${callbackUrl}?code=real-code&state=${state}`)
    expect(ok.status).toBe(200)

    await initPromise
    expect(readFileSync(join(tmpDir, '.env'), 'utf8')).toContain(
      'ZODIAC_API_KEY=zodiac_real'
    )
  })

  it('surfaces a useful error when the exchange endpoint rejects', async () => {
    mkdirSync(tmpDir, { recursive: true })

    stubExchange(() => ({
      status: 400,
      body: { error: 'invalid or expired code' },
    }))

    const { init } = await import('./init')
    const initPromise = init({ rootDir: tmpDir, appUrl: APP_URL })

    const { callbackUrl, state } = await waitForCapturedUrl()
    await fetch(`${callbackUrl}?code=stale&state=${state}`)

    await expect(initPromise).rejects.toThrow(
      /Failed to exchange auth code \(400\).*invalid or expired code/
    )
  })

  it('rejects an exchange response that is missing a valid key', async () => {
    mkdirSync(tmpDir, { recursive: true })

    stubExchange(() => ({ status: 200, body: { key: 'not-a-zodiac-key' } }))

    const { init } = await import('./init')
    const initPromise = init({ rootDir: tmpDir, appUrl: APP_URL })

    const { callbackUrl, state } = await waitForCapturedUrl()
    await fetch(`${callbackUrl}?code=ok&state=${state}`)

    await expect(initPromise).rejects.toThrow(
      /unexpected response.*missing or malformed key/
    )
  })

  it('preserves other lines in an existing .env when writing the key', async () => {
    mkdirSync(tmpDir, { recursive: true })
    writeFileSync(
      join(tmpDir, '.env'),
      'OTHER_VAR=foo\nZODIAC_API_KEY=zodiac_old\nZODIAC_API_URL=https://stale.example/api/v1\nMORE=bar\n',
      'utf8'
    )

    stubExchange(() => ({ status: 200, body: { key: 'zodiac_new' } }))

    const { init } = await import('./init')
    const initPromise = init({ rootDir: tmpDir, appUrl: APP_URL })

    const { callbackUrl, state } = await waitForCapturedUrl()
    await fetch(`${callbackUrl}?code=ok&state=${state}`)

    await initPromise

    const envContents = readFileSync(join(tmpDir, '.env'), 'utf8')
    expect(envContents).toContain('OTHER_VAR=foo')
    expect(envContents).toContain('MORE=bar')
    expect(envContents).toContain('ZODIAC_API_KEY=zodiac_new')
    expect(envContents).toContain(`ZODIAC_API_URL=${APP_URL}/api/v1`)
    expect(envContents).not.toContain('zodiac_old')
    expect(envContents).not.toContain('stale.example')
    expect(envContents.startsWith(ENV_HEADER)).toBe(true)
  })

  it('keeps a single, current header in .env across re-runs', async () => {
    mkdirSync(tmpDir, { recursive: true })
    writeFileSync(
      join(tmpDir, '.env'),
      '# my notes\nOTHER_VAR=foo\n' +
        '# Written by `zodiac init`. Never commit this file.\n' +
        '# Revoke keys at https://stale.example/admin/api-keys\n' +
        'ZODIAC_API_KEY=zodiac_old\n',
      'utf8'
    )

    stubExchange(() => ({ status: 200, body: { key: 'zodiac_new' } }))

    const { init } = await import('./init')
    const initPromise = init({ rootDir: tmpDir, appUrl: APP_URL })

    const { callbackUrl, state } = await waitForCapturedUrl()
    await fetch(`${callbackUrl}?code=ok&state=${state}`)

    await initPromise

    // Refreshed in place: user lines above it stay where they were.
    expect(readFileSync(join(tmpDir, '.env'), 'utf8')).toBe(
      `# my notes\nOTHER_VAR=foo\n${ENV_HEADER}ZODIAC_API_KEY=zodiac_new\nZODIAC_API_URL=${APP_URL}/api/v1\n`
    )
  })

  it('sends a SHA-256 PKCE challenge in the auth URL', async () => {
    mkdirSync(tmpDir, { recursive: true })

    stubExchange(() => ({ status: 200, body: { key: 'zodiac_done' } }))

    const { init } = await import('./init')
    const initPromise = init({ rootDir: tmpDir, appUrl: APP_URL })

    const { codeChallenge } = await waitForCapturedUrl()
    // base64url-encoded SHA-256 is 43 chars (32 bytes ⇒ 256 bits).
    expect(codeChallenge).toMatch(/^[A-Za-z0-9_-]{43}$/)

    const { callbackUrl, state } = await waitForCapturedUrl()
    await fetch(`${callbackUrl}?code=ok&state=${state}`)
    await initPromise
  })
})

const waitForCapturedUrl = async (): Promise<{
  callbackUrl: string
  state: string
  codeChallenge: string
}> => {
  for (let i = 0; i < 100 && capturedUrl == null; i++) {
    await new Promise((r) => setTimeout(r, 10))
  }
  if (capturedUrl == null) throw new Error('open was never called')
  const url = new URL(capturedUrl)
  const callbackUrl = url.searchParams.get('callback')
  const state = url.searchParams.get('state')
  const codeChallenge = url.searchParams.get('code_challenge')
  if (callbackUrl == null || state == null || codeChallenge == null) {
    throw new Error('captured url missing callback/state/code_challenge')
  }
  return { callbackUrl, state, codeChallenge }
}
