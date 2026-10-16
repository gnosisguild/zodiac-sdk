import { createHash, randomBytes } from 'node:crypto'
import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from 'node:http'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { basename, join, resolve } from 'node:path'
import open from 'open'
import { ensureConfigStub } from '../config'
import { findProjectRoot } from '../projectRoot'

const DEFAULT_APP_URL = 'https://app.zodiac.eco'
const CALLBACK_TIMEOUT_MS = 5 * 60 * 1000 // 5 minutes

type InitOptions = {
  rootDir?: string
  /** Override the Zodiac app base URL (defaults to ZODIAC_APP_URL env or app.zodiac.eco). */
  appUrl?: string
}

export const init = async (options: InitOptions = {}): Promise<string> => {
  const rootDir = options.rootDir ?? findProjectRoot()
  const appUrl = (
    options.appUrl ??
    process.env.ZODIAC_APP_URL ??
    DEFAULT_APP_URL
  ).replace(/\/$/, '')

  const label = basename(resolve(rootDir)) || 'zodiac-cli'

  // PKCE: keep `code_verifier` private to this process. Send only the
  // SHA-256 hash (`code_challenge`) over the wire.
  const codeVerifier = randomBytes(32).toString('base64url')
  const codeChallenge = createHash('sha256')
    .update(codeVerifier)
    .digest('base64url')

  // `state` binds the redirect we receive on the loopback to this CLI
  // invocation, defending against a stray local process trying to inject
  // an auth code into our callback.
  const state = randomBytes(32).toString('base64url')

  const { port, waitForCode, close } = await startCallbackServer({
    expectedState: state,
    appUrl,
  })

  const callbackUrl = `http://127.0.0.1:${port}/callback`
  const authUrl = new URL('/cli-auth', appUrl)
  authUrl.searchParams.set('callback', callbackUrl)
  authUrl.searchParams.set('state', state)
  authUrl.searchParams.set('code_challenge', codeChallenge)
  authUrl.searchParams.set('label', label)

  console.log(
    `Opening ${authUrl} in your browser. Approve the request to receive an API key.`
  )
  await open(authUrl.toString())

  let code: string
  try {
    code = await waitForCode(CALLBACK_TIMEOUT_MS)
  } finally {
    await close()
  }

  const apiKey = await exchangeCodeForKey(appUrl, code, codeVerifier)

  const envPath = join(rootDir, '.env')
  const apiUrl = `${appUrl}/api/v1`
  writeEnv(envPath, appUrl, { ZODIAC_API_KEY: apiKey, ZODIAC_API_URL: apiUrl })

  // So a same-run `pull` targets the org we just authorized, not the default.
  process.env.ZODIAC_API_KEY = apiKey
  process.env.ZODIAC_API_URL = apiUrl

  console.log(`✅ API key written to ${envPath}`)

  const configPath = join(rootDir, 'zodiac.config.ts')
  if (ensureConfigStub(configPath)) {
    console.log(`✅ Created ${configPath}`)
  }

  return apiKey
}

const exchangeCodeForKey = async (
  appUrl: string,
  code: string,
  codeVerifier: string
): Promise<string> => {
  const response = await fetch(`${appUrl}/cli-auth/exchange`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ code, code_verifier: codeVerifier }),
  })

  if (!response.ok) {
    let detail = ''
    try {
      const body = (await response.json()) as { error?: string }
      detail = body.error ? `: ${body.error}` : ''
    } catch {
      // ignore — fall through to a generic message
    }
    throw new Error(
      `Failed to exchange auth code (${response.status})${detail}`
    )
  }

  const { key } = (await response.json()) as { key: unknown }
  if (typeof key !== 'string' || !key.startsWith('zodiac_')) {
    throw new Error(
      'Exchange endpoint returned an unexpected response (missing or malformed key)'
    )
  }
  return key
}

type StartServerOptions = {
  expectedState: string
  appUrl: string
}

type StartServerResult = {
  port: number
  waitForCode: (timeoutMs: number) => Promise<string>
  close: () => Promise<void>
}

const startCallbackServer = async ({
  expectedState,
  appUrl,
}: StartServerOptions): Promise<StartServerResult> => {
  let resolveCode: (code: string) => void = () => {}
  let rejectCode: (err: Error) => void = () => {}
  const codePromise = new Promise<string>((res, rej) => {
    resolveCode = res
    rejectCode = rej
  })

  const handler = (req: IncomingMessage, res: ServerResponse) => {
    if (req.method !== 'GET' || !req.url?.startsWith('/callback')) {
      res.statusCode = 404
      res.end()
      return
    }

    const url = new URL(req.url, `http://127.0.0.1`)
    const code = url.searchParams.get('code')
    const state = url.searchParams.get('state')

    if (state !== expectedState) {
      // A stray request — could be a stale browser tab, a malicious
      // local process, etc. Silently 403 and keep waiting for the right
      // one. Don't reject the CLI promise.
      respondHtml(
        res,
        403,
        renderHtml(
          'Mismatched state',
          `<p>This callback didn't match the running <code>zodiac init</code> session. You can close this tab.</p>`
        )
      )
      return
    }

    if (typeof code !== 'string' || code.length === 0) {
      respondHtml(
        res,
        400,
        renderHtml(
          'Missing code',
          `<p>The callback URL didn't include an auth <code>code</code>. Please re-run <code>zodiac init</code>.</p>`
        )
      )
      return
    }

    respondHtml(
      res,
      200,
      renderHtml(
        'Authorized',
        `<p>Your CLI now has its API key. You can close this tab and return to your terminal.</p>
         <p><a href="${escapeHtml(appUrl)}">Back to Zodiac</a></p>`
      )
    )
    resolveCode(code)
  }

  const server = createServer(handler)
  await new Promise<void>((res) => server.listen(0, '127.0.0.1', res))
  const address = server.address()
  if (address == null || typeof address === 'string') {
    throw new Error('Failed to bind loopback callback server')
  }
  const port = address.port

  const close = (): Promise<void> =>
    new Promise<void>((resolve) => {
      server.close(() => resolve())
    })

  const waitForCode = (timeoutMs: number) =>
    Promise.race<string>([
      codePromise,
      new Promise<string>((_, rej) =>
        setTimeout(() => {
          rejectCode(new Error(`Timed out waiting for CLI auth callback`))
          rej(new Error(`Timed out waiting for CLI auth callback`))
        }, timeoutMs)
      ),
    ])

  return { port, waitForCode, close }
}

const respondHtml = (res: ServerResponse, status: number, body: string) => {
  // Force the connection to close after the response so the browser
  // doesn't keep waiting on a keep-alive socket once the CLI exits.
  // Resolve only after 'finish' (response handed to the OS) so the
  // bytes can flush before the process tears down.
  res.setHeader('Connection', 'close')
  res.setHeader('content-type', 'text/html; charset=utf-8')
  res.statusCode = status
  res.end(body)
}

const renderHtml = (title: string, bodyHtml: string) => `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(title)} — Zodiac CLI</title>
    <style>
      body { font: 16px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; max-width: 32rem; margin: 4rem auto; padding: 0 1rem; color: #1f2937; }
      h1 { font-weight: 300; font-size: 1.75rem; margin-bottom: 1rem; }
      code { background: #f3f4f6; padding: 0.125rem 0.375rem; border-radius: 0.25rem; }
      a { color: #1d4ed8; }
    </style>
  </head>
  <body>
    <h1>${escapeHtml(title)}</h1>
    ${bodyHtml}
  </body>
</html>
`

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')

const writeEnv = (
  envPath: string,
  appUrl: string,
  vars: Record<string, string>
): void => {
  let contents = existsSync(envPath) ? readFileSync(envPath, 'utf8') : ''

  contents = upsertEnvHeader(contents, appUrl)

  for (const [key, value] of Object.entries(vars)) {
    contents = upsertEnvLine(contents, key, value)
  }

  writeFileSync(envPath, contents, 'utf8')
}

// Point at the app the key was minted in, so `--app-url` users revoke it there.
const envHeader = (appUrl: string) =>
  `# Written by \`zodiac init\`. Never commit this file.\n` +
  `# Revoke keys at ${appUrl}/profile/api-keys\n`

const ENV_HEADER_PATTERN =
  /^# Written by `zodiac init`\. Never commit this file\.\r?\n# Revoke keys at .*(?:\r?\n|$)/m

// Re-runs refresh the header where it already is rather than stacking another.
const upsertEnvHeader = (contents: string, appUrl: string): string =>
  ENV_HEADER_PATTERN.test(contents)
    ? contents.replace(ENV_HEADER_PATTERN, () => envHeader(appUrl))
    : `${envHeader(appUrl)}${contents}`

const upsertEnvLine = (
  contents: string,
  key: string,
  value: string
): string => {
  const line = `${key}=${value}`
  const lines = contents.split(/\r?\n/)
  const idx = lines.findIndex((l) => new RegExp(`^\\s*${key}\\s*=`).test(l))

  if (idx >= 0) {
    lines[idx] = line
    return lines.join('\n')
  }

  return contents.length === 0 || contents.endsWith('\n')
    ? `${contents}${line}\n`
    : `${contents}\n${line}\n`
}
