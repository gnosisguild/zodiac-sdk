import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import open from 'open'
import { ConstellationRejectedError, push } from '../../push'
import { loadConfig } from '../config'

const DEFAULT_ENTRYPOINT = 'constellation/index.ts'

type PushEntrypointOptions = {
  /** The module whose named exports are the nodes to push, relative to the
   * working directory. @default constellation/index.ts in the project root */
  entrypoint?: string
  /** Open every pushed constellation's review page. @default true */
  openInBrowser?: boolean
  /** The config file whose API key to push with, as for `zodiac pull`. */
  config?: string
}

/**
 * Pushes every node an entrypoint exports — each export name becomes the
 * node's ref — and prints where each constellation can be reviewed.
 *
 * A constellation Zodiac refuses is printed as the list of what it refused,
 * and the process exits with code 1. Projects that set up globals the
 * entrypoint relies on run their setup first and call this afterwards.
 */
export const pushEntrypoint = async ({
  entrypoint,
  openInBrowser = true,
  config: configPath,
}: PushEntrypointOptions = {}) => {
  const { apiKey, rootDir } = await loadConfig(configPath)
  const entrypointPath =
    entrypoint == null
      ? resolve(rootDir, DEFAULT_ENTRYPOINT)
      : resolve(process.cwd(), entrypoint)
  const { default: defaultExport, ...nodes } = await import(
    pathToFileURL(entrypointPath).href
  )

  if (defaultExport !== undefined) {
    console.warn(
      `warning: ${entrypointPath} has a default export which will be ignored. ` +
        `Use named exports — each export becomes a ref in the pushed spec.`
    )
  }

  try {
    const results = await push(nodes, { apiKey })

    for (const { url } of results) {
      console.log(`Pushed constellation to: ${url}`)

      if (openInBrowser) {
        await open(url)
      }
    }
  } catch (error) {
    if (!(error instanceof ConstellationRejectedError)) {
      throw error
    }

    console.error(error.message)
    process.exitCode = 1
  }
}
