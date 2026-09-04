import { describe, it, expect, mock, afterEach } from 'bun:test'
import { readFileSync, rmSync, mkdirSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { getAddress } from 'ethers'

const mockUsers = [
  {
    id: 'user-1',
    fullName: 'Alice Example',
    personalSafes: {},
  },
  {
    id: 'user-2',
    fullName: 'Bob Example',
    personalSafes: {},
  },
]

const mockAccounts = [
  {
    workspaceId: 'ws-1',
    workspaceName: 'Test Workspace',
    accounts: [
      {
        id: 'vault-1',
        type: 'SAFE',
        label: 'Treasury',
        chain: 1,
        address: '0xaaaa00000000000000000000000000000000aaaa',
        vault: true,
        spec: null,
      },
      {
        id: 'roles-1',
        type: 'ROLES',
        label: 'Ops Roles',
        chain: 1,
        address: '0xffff00000000000000000000000000000000ffff',
        vault: false,
        spec: { ref: 'ops', type: 'ROLES', chain: 1 },
      },
      // Known only by address — a Safe owner, so the codegen has no key for
      // it. `/accounts` still vouched for it holding code, so it is asked
      // about like the rest.
      {
        id: 'owner-1',
        type: 'SAFE',
        label: null,
        chain: 1,
        address: '0xdddd00000000000000000000000000000000dddd',
        vault: false,
        spec: null,
      },
      // Shares `Treasury` with the mainnet safe above, on another chain.
      {
        id: 'vault-2',
        type: 'SAFE',
        label: 'Treasury',
        chain: 100,
        address: '0x9999000000000000000000000000000000009999',
        vault: true,
        spec: null,
      },
      // Shares `Treasury` with the mainnet safe above, on the same chain.
      {
        id: 'vault-3',
        type: 'SAFE',
        label: 'Treasury',
        chain: 1,
        address: '0x8888000000000000000000000000000000008888',
        vault: true,
        spec: null,
      },
    ],
  },
]

const mockResolvedSafe = {
  type: 'SAFE',
  chain: 1,
  address: '0xaaaa00000000000000000000000000000000aaaa',
  threshold: 3,
  owners: [
    '0xbbbb00000000000000000000000000000000bbbb',
    '0xcccc00000000000000000000000000000000cccc',
    '0xdddd00000000000000000000000000000000dddd',
  ],
  modules: [],
}

let resolvedAccounts: unknown[] = []

const mockResolvedRolesMod = {
  type: 'ROLES',
  chain: 1,
  address: '0xffff00000000000000000000000000000000ffff',
  owner: '0xaaaa00000000000000000000000000000000aaaa',
  target: '0xaaaa00000000000000000000000000000000aaaa',
  avatar: '0xaaaa00000000000000000000000000000000aaaa',
  roles: [],
  allowances: [],
  multisend: [],
}

const mockResolvedOwner = {
  type: 'SAFE',
  chain: 1,
  address: '0xdddd00000000000000000000000000000000dddd',
  threshold: 1,
  owners: [],
  modules: [],
}

mock.module('../../api', () => ({
  ApiClient: class {
    listUsers() {
      return Promise.resolve(mockUsers)
    }
    listAccounts() {
      return Promise.resolve(mockAccounts)
    }
    resolveConstellation(
      _workspaceId: string,
      payload: { accounts: { chain: number; address: string }[] }
    ) {
      resolvedAccounts = payload.accounts

      return Promise.resolve({
        result: [
          mockResolvedSafe,
          mockResolvedRolesMod,
          mockResolvedOwner,
          ...payload.accounts.slice(3).map(({ chain, address }) => ({
            type: 'SAFE',
            chain,
            address,
            threshold: 1,
            owners: [],
            modules: [],
          })),
        ],
      })
    }
  },
}))

describe('pullOrg', () => {
  const tmpDir = join(tmpdir(), `zodiac-os-codegen-test-${Date.now()}`)

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true })
    resolvedAccounts = []
  })

  // An address is the whole of what `/resolve` reads, and it identifies the
  // account for every caller — unlike a spec node without one, whose address
  // the endpoint would have had to derive per API key.
  it('asks about every listed account by chain and address', async () => {
    mkdirSync(tmpDir, { recursive: true })

    const { pullOrg } = await import('./pullOrg')
    await pullOrg({ apiKey: 'zodiac_test-key', rootDir: tmpDir })

    expect(resolvedAccounts).toEqual([
      { chain: 1, address: '0xaaaa00000000000000000000000000000000aaaa' },
      { chain: 1, address: '0xffff00000000000000000000000000000000ffff' },
      { chain: 1, address: '0xdddd00000000000000000000000000000000dddd' },
      { chain: 100, address: '0x9999000000000000000000000000000000009999' },
      { chain: 1, address: '0x8888000000000000000000000000000000008888' },
    ])
  })

  // A constellation is scoped to one chain, so a label is only ambiguous
  // between accounts on that chain. Suffixing across chains would make every
  // multi-chain workspace address its accounts by address rather than by name.
  it('groups accounts by chain and only disambiguates within one', async () => {
    mkdirSync(tmpDir, { recursive: true })

    const { pullOrg } = await import('./pullOrg')
    await pullOrg({ apiKey: 'zodiac_test-key', rootDir: tmpDir })

    const { accounts } = await import(join(tmpDir, '.zodiac', 'index.js'))
    const { safes } = accounts['Test Workspace']

    expect(Object.keys(safes)).toEqual(['1', '100'])
    expect(Object.keys(safes[1]).sort()).toEqual([
      `Treasury (${getAddress('0x8888000000000000000000000000000000008888')})`,
      `Treasury (${getAddress('0xaaaa00000000000000000000000000000000aaaa')})`,
    ])
    expect(Object.keys(safes[100])).toEqual(['Treasury'])
    // The suffix keys the namespace; the label stays what the user gave it.
    expect(safes[100].Treasury.label).toBe('Treasury')
    expect(
      safes[1][
        `Treasury (${getAddress('0x8888000000000000000000000000000000008888')})`
      ].label
    ).toBe('Treasury')
  })

  it('writes JS and d.ts to .zodiac/', async () => {
    mkdirSync(tmpDir, { recursive: true })

    const { pullOrg } = await import('./pullOrg')
    await pullOrg({ apiKey: 'zodiac_test-key', rootDir: tmpDir })

    const outDir = join(tmpDir, '.zodiac')

    // package.json is written and pins CJS
    const pkg = JSON.parse(readFileSync(join(outDir, 'package.json'), 'utf-8'))
    expect(pkg.type).toBe('commonjs')
    expect(pkg.main).toBe('index.js')
    expect(pkg.types).toBe('index.d.ts')

    // JS file is written with CJS exports
    const js = readFileSync(join(outDir, 'index.js'), 'utf-8')
    expect(js).toContain('exports.users')
    expect(js).toContain('exports.accounts')
    expect(js).toContain('"Alice Example"')
    expect(js).toContain('Treasury')
    expect(js).toContain('safes:')
    expect(js).toContain('rolesMods:')
    expect(js).toContain('delays:')
    expect(js).toContain('vault: true')

    // d.ts file is written
    const dts = readFileSync(join(outDir, 'index.d.ts'), 'utf-8')
    expect(dts).toContain('export declare const users')
    expect(dts).toContain('export declare const accounts')
    expect(dts).toContain('declare global')
    expect(dts).toContain('ZodiacGeneratedCodegen')
  })
})
