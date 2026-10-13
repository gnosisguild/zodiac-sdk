import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

/**
 * Where the code that defines a constellation lives, so Zodiac can point back
 * to it. In order: `ZODIAC_SOURCE`, the repository a GitHub workflow runs for,
 * and the web page of the git repository `dir` is checked out from.
 *
 * Finding none is not an error — the push goes ahead without a source and the
 * one Zodiac already holds stays.
 */
export const findSource = async (dir: string): Promise<string | undefined> => {
  const { ZODIAC_SOURCE, GITHUB_SERVER_URL, GITHUB_REPOSITORY } = process.env

  if (ZODIAC_SOURCE) {
    return ZODIAC_SOURCE
  }

  // A workflow's checkout may carry a remote that names a mirror or a token
  // rather than the repository, while these always name the repository.
  if (GITHUB_SERVER_URL && GITHUB_REPOSITORY) {
    return `${GITHUB_SERVER_URL}/${GITHUB_REPOSITORY}`
  }

  const remote = await originOf(dir)

  return remote == null ? undefined : webUrlOfRemote(remote)
}

/**
 * The page of a repository its git remote points to. A remote can carry the
 * credentials it pushes with, and those must never leave this machine, so the
 * url is rebuilt from host and path alone. A remote that is no web host — a
 * path on disk — names no page.
 */
export const webUrlOfRemote = (remote: string): string | undefined => {
  const url = parseUrl(remote.replace(/^git\+/, '')) ?? parseScpLike(remote)

  if (url == null || !WEB_PROTOCOLS.has(url.protocol) || url.hostname === '') {
    return undefined
  }

  const path = url.pathname.replace(/\/+$/, '').replace(/\.git$/, '')

  if (path === '') {
    return undefined
  }

  // An ssh remote names where git talks ssh, not where the web page is served,
  // so only a web remote keeps its scheme and port.
  const origin =
    url.protocol === 'https:' || url.protocol === 'http:'
      ? `${url.protocol}//${url.host}`
      : `https://${url.hostname}`

  return `${origin}${path}`
}

const WEB_PROTOCOLS = new Set(['https:', 'http:', 'ssh:', 'git:'])

/** `git@github.com:org/repo.git`, which git reads as an ssh remote. */
const parseScpLike = (remote: string) => {
  const match = /^(?:[^@/]+@)?([^:/]+):(?!\/)(.+)$/.exec(remote)

  if (match == null) {
    return null
  }

  const [, host, path] = match

  return parseUrl(`ssh://${host}/${path}`)
}

const parseUrl = (value: string) => {
  try {
    return new URL(value)
  } catch {
    return null
  }
}

const originOf = async (dir: string) => {
  try {
    const { stdout } = await promisify(execFile)(
      'git',
      ['remote', 'get-url', 'origin'],
      { cwd: dir }
    )

    return stdout.trim()
  } catch {
    // No git, no repository, or no remote called origin.
    return undefined
  }
}
