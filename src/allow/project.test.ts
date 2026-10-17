import { afterEach, beforeEach, describe, expect, it, spyOn } from 'bun:test'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pullContracts } from '../cli/commands/pullContracts'

const WETH = '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2'

const DEPOSIT_ABI = [
  {
    type: 'function',
    name: 'deposit',
    inputs: [],
    outputs: [],
    stateMutability: 'payable',
  },
]

const originalCwd = process.cwd()
let rootDir: string

/** `allow` as a fresh import, built for whichever project the test sets up. */
const importAllow = async () =>
  (await import(`./project?${Math.random()}`)).allow as Record<string, any>

beforeEach(() => {
  rootDir = mkdtempSync(join(tmpdir(), 'zodiac-allow-test-'))
  writeFileSync(join(rootDir, 'zodiac.config.ts'), 'export default {}\n')
  mkdirSync(join(rootDir, 'abis', 'eth'), { recursive: true })
  writeFileSync(
    join(rootDir, 'abis', 'eth', 'weth.json'),
    JSON.stringify(DEPOSIT_ABI)
  )
  spyOn(console, 'log').mockImplementation(() => {})
})

afterEach(() => {
  process.chdir(originalCwd)
})

const pull = () =>
  pullContracts({ rootDir, contracts: { eth: { weth: WETH } } })

describe('pullContracts', () => {
  it('records the contracts for the `allow` kit', async () => {
    await pull()

    expect(
      JSON.parse(
        readFileSync(join(rootDir, '.zodiac', 'contracts.json'), 'utf8')
      )
    ).toEqual({ abisDir: 'abis', contracts: { eth: { weth: WETH } } })
  })

  it('records nothing when writing the typings to a module', async () => {
    await pullContracts(
      { rootDir, contracts: { eth: { weth: WETH } } },
      { module: 'kit.d.ts' }
    )

    expect(existsSync(join(rootDir, '.zodiac', 'contracts.json'))).toBe(false)
  })
})

describe('allow', () => {
  it('builds the kit for the pulled contracts', async () => {
    await pull()
    process.chdir(rootDir)

    const allow = await importAllow()

    expect(allow.eth.weth.deposit().targetAddress).toBe(WETH.toLowerCase())
  })

  it('finds the project from a subdirectory', async () => {
    await pull()
    mkdirSync(join(rootDir, 'constellation'))
    process.chdir(join(rootDir, 'constellation'))

    const allow = await importAllow()

    expect(allow.eth.weth).toBeDefined()
  })

  it('can be imported before the contracts are pulled', async () => {
    process.chdir(rootDir)

    const allow = await importAllow()

    expect(() => allow.eth).toThrow('run `zodiac pull-contracts`')
  })

  it('names a chain without contracts', async () => {
    await pull()
    process.chdir(rootDir)

    const allow = await importAllow()

    expect(() => allow.gno).toThrow('lists no contracts on "gno"')
  })
})
