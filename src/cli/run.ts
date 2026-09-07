import { Command } from 'commander'
import { config as loadDotenv } from 'dotenv'
import { checkForUpdate, ownVersion } from './checkForUpdate'
import { init } from './commands/init'
import { loadConfig } from './config'
import { pullOrg } from './commands/pullOrg'
import { pullContracts } from './commands/pullContracts'

// Load `.env` from the current working directory before reading any env vars.
loadDotenv({ quiet: true })

const loadConfigOrInit = (configPath: string) =>
  loadConfig(configPath, {
    createIfMissing: true,
    onMissingKey: async (rootDir) => {
      console.log(
        'No ZODIAC_API_KEY found. Starting authorization to mint one for this directory…'
      )
      return init({ rootDir })
    },
  })

export const run = async (argv: string[] = process.argv) => {
  const program = new Command()

  program
    .name('zodiac')
    .description('Zodiac SDK CLI – pull org data and contract ABIs')
    .version(ownVersion())
    .option(
      '-c, --config <path>',
      'path to the config file',
      'zodiac.config.ts'
    )

  // Started before the command so the registry round trip rides along with
  // the command's own work, printed after it so the notice is the last thing
  // on screen — and not at all when the command fails, where it would only
  // distract from the error. On stderr, so piped output stays clean.
  let updateNotice: Promise<string | null> = Promise.resolve(null)

  program.hook('preAction', () => {
    updateNotice = checkForUpdate()
  })

  program.hook('postAction', async () => {
    const notice = await updateNotice

    if (notice != null) {
      console.warn(`\n${notice}`)
    }
  })

  program
    .command('pull')
    .description(
      'Fetch Zodiac org data and contract ABIs, generating typed SDK functions. Authorizes this directory automatically on first run.'
    )
    .action(async (_opts, cmd) => {
      const config = await loadConfigOrInit(cmd.optsWithGlobals().config)
      await Promise.all([pullOrg(config), pullContracts(config)])
    })

  program
    .command('pull-org')
    .description('Fetch Zodiac users and accounts, generate TypeScript types')
    .action(async (_opts, cmd) => {
      const config = await loadConfigOrInit(cmd.optsWithGlobals().config)
      await pullOrg(config)
    })

  program
    .command('pull-contracts')
    .description('Fetch contract ABIs, generate typed permissions kit')
    .action(async (_opts, cmd) => {
      const config = await loadConfigOrInit(cmd.optsWithGlobals().config)
      await pullContracts(config)
    })

  program
    .command('init')
    .description(
      'Re-authorize this directory / mint a new API key (run automatically by `pull` on first use).'
    )
    .option(
      '--app-url <url>',
      'Override the Zodiac app URL (defaults to ZODIAC_APP_URL or app.zodiac.eco)'
    )
    .action(async (opts) => {
      await init({ appUrl: opts.appUrl })
    })

  await program.parseAsync(argv)
}
