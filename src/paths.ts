import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'

/**
 * Resolve the project's `.zodiac/` directory — the shared home for SDK
 * codegen (`pull-org` emits the importable module here, `pull-contracts`
 * writes `allow.d.ts` alongside it).
 *
 * Pass `rootDir` to anchor explicitly (CLI commands do this using the
 * directory of the loaded `zodiac.config.ts`). Without a `rootDir`, walks
 * up from `cwd` to the nearest `zodiac.config.{ts,js,mjs,cjs}` so runtime
 * callers like `constellation()` work even when invoked from a subdirectory.
 */
export function resolveZodiacDir(rootDir?: string): string {
  return join(rootDir ?? findProjectRoot(), '.zodiac')
}

/**
 * Extensions of `zodiac.config`, in the order they are probed when no
 * `--config` path is given. Mirrors what vite / vitest / tailwind accept.
 */
export const CONFIG_EXTENSIONS = [
  '.ts',
  '.mts',
  '.cts',
  '.js',
  '.mjs',
  '.cjs',
] as const

const CONFIG_FILENAMES = CONFIG_EXTENSIONS.map((ext) => `zodiac.config${ext}`)

/** The nearest directory up from `cwd` holding a `zodiac.config.*` file. */
export function findProjectRoot(): string {
  let dir = process.cwd()
  while (dir !== dirname(dir)) {
    if (CONFIG_FILENAMES.some((name) => existsSync(join(dir, name)))) return dir
    dir = dirname(dir)
  }
  return process.cwd()
}
