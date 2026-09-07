import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { findProjectRoot } from './projectRoot'

const PACKAGE = '@zodiaceco/sdk'
const REGISTRY_URL = `https://registry.npmjs.org/${PACKAGE}/latest`
const TIMEOUT_MS = 2_000

type Env = Record<string, string | undefined>

type CheckForUpdateOptions = {
  cwd?: string
  env?: Env
}

/**
 * Whether a newer release of this package is out, as the notice to print — or
 * `null`, which is also the answer to every failure. The check is a courtesy
 * on the way out of a command, so nothing here may throw or block for long,
 * and a run without a terminal to read the notice skips it entirely.
 */
export const checkForUpdate = async ({
  cwd = process.cwd(),
  env = process.env,
}: CheckForUpdateOptions = {}): Promise<string | null> => {
  if (env.CI) {
    return null
  }

  try {
    const current = ownVersion()
    const latest = await fetchLatestVersion()

    if (latest == null || !isNewer(latest, current)) {
      return null
    }

    return [
      `A newer version of ${PACKAGE} is available (${current} → ${latest}). Update with:`,
      `  ${updateCommand(detectPackageManager(cwd, env))}`,
    ].join('\n')
  } catch {
    return null
  }
}

/**
 * The version of the package this module runs from. Walks up to the
 * `package.json` that names it, which holds from `src/` and from `dist/`
 * alike — and finds this package, not the caller's, when the CLI runs
 * inside another project.
 */
export const ownVersion = (): string => {
  let dir = dirname(fileURLToPath(import.meta.url))

  while (true) {
    const manifest = join(dir, 'package.json')

    if (existsSync(manifest)) {
      const { name, version } = JSON.parse(readFileSync(manifest, 'utf-8'))

      if (name === PACKAGE && typeof version === 'string') {
        return version
      }
    }

    const parent = dirname(dir)
    if (parent === dir) {
      throw new Error(`Could not find the package.json of ${PACKAGE}`)
    }
    dir = parent
  }
}

const fetchLatestVersion = async (): Promise<string | null> => {
  const response = await fetch(REGISTRY_URL, {
    signal: AbortSignal.timeout(TIMEOUT_MS),
  })

  if (!response.ok) {
    return null
  }

  const { version } = (await response.json()) as { version?: unknown }

  return typeof version === 'string' ? version : null
}

const isNewer = (latest: string, current: string): boolean => {
  const a = parseVersion(latest)
  const b = parseVersion(current)

  if (a == null || b == null) {
    return false
  }

  for (let i = 0; i < 3; i++) {
    if (a[i] !== b[i]) {
      return a[i] > b[i]
    }
  }

  return false
}

const parseVersion = (version: string): [number, number, number] | null => {
  const match = /^(\d+)\.(\d+)\.(\d+)/.exec(version)

  if (match == null) {
    return null
  }

  return [Number(match[1]), Number(match[2]), Number(match[3])]
}

type PackageManager = 'npm' | 'pnpm' | 'yarn' | 'bun'

/**
 * The package manager an update should go through: whichever one launched
 * this process, or failing that, whichever one's lockfile the project
 * carries. `npm` when neither says anything.
 */
const detectPackageManager = (cwd: string, env: Env): PackageManager => {
  const agent = env.npm_config_user_agent

  if (agent != null) {
    const fromAgent = PACKAGE_MANAGERS.find((packageManager) =>
      agent.startsWith(`${packageManager}/`)
    )

    if (fromAgent != null) {
      return fromAgent
    }
  }

  const root = findProjectRoot(cwd)
  const fromLockfile = LOCKFILES.find(([lockfile]) =>
    existsSync(join(root, lockfile))
  )

  return fromLockfile == null ? 'npm' : fromLockfile[1]
}

const PACKAGE_MANAGERS = ['pnpm', 'yarn', 'bun', 'npm'] as const

const LOCKFILES: [string, PackageManager][] = [
  ['bun.lock', 'bun'],
  ['bun.lockb', 'bun'],
  ['pnpm-lock.yaml', 'pnpm'],
  ['yarn.lock', 'yarn'],
  ['package-lock.json', 'npm'],
]

const updateCommand = (packageManager: PackageManager): string =>
  packageManager === 'npm'
    ? `npm install ${PACKAGE}@latest`
    : `${packageManager} add ${PACKAGE}@latest`
