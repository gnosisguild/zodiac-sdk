import { describe, it, expect, beforeEach, afterEach } from 'bun:test'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { id } from 'ethers'
import { generateAllowTypes } from '../allow/codegen'
import { buildAllowKit } from '../allow/runtime'

const selector = (signature: string) => id(signature).slice(0, 10)

// sUSDS-shaped: `deposit` is overloaded, `redeem` is not.
const ABI = [
  {
    type: 'function',
    name: 'deposit',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'assets', type: 'uint256' },
      { name: 'receiver', type: 'address' },
    ],
    outputs: [],
  },
  {
    type: 'function',
    name: 'deposit',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'assets', type: 'uint256' },
      { name: 'receiver', type: 'address' },
      { name: 'referral', type: 'uint16' },
    ],
    outputs: [],
  },
  {
    type: 'function',
    name: 'redeem',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'shares', type: 'uint256' }],
    outputs: [],
  },
  {
    type: 'function',
    name: 'balanceOf',
    stateMutability: 'view',
    inputs: [{ name: 'owner', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
]

const ADDRESS = '0xa3931d71877C0E7a3148CB7Eb4463524FEc27fbD'
const CONTRACTS = { eth: { susds: ADDRESS } }

let abisDir: string

beforeEach(() => {
  abisDir = fs.mkdtempSync(path.join(os.tmpdir(), 'allow-kit-'))
  fs.mkdirSync(path.join(abisDir, 'eth'), { recursive: true })
  fs.writeFileSync(
    path.join(abisDir, 'eth', 'susds.json'),
    JSON.stringify(ABI),
    'utf8'
  )
})

afterEach(() => {
  fs.rmSync(abisDir, { recursive: true, force: true })
})

describe('generateAllowTypes', () => {
  it('declares an overloaded function once per signature, never bare', () => {
    const generated = generateAllowTypes(abisDir, CONTRACTS)

    expect(generated).toContain('"deposit(uint256,address)"')
    expect(generated).toContain('"deposit(uint256,address,uint16)"')
    // A bare `deposit` would type-check and then fail at runtime.
    expect(generated).not.toMatch(/^\s+deposit:/m)
  })

  it('leaves a function with one implementation under its bare name', () => {
    const generated = generateAllowTypes(abisDir, CONTRACTS)

    expect(generated).toMatch(/^\s+redeem: \(/m)
    expect(generated).not.toContain('"redeem(uint256)"')
  })

  it('still omits view functions', () => {
    expect(generateAllowTypes(abisDir, CONTRACTS)).not.toContain('balanceOf')
  })

  it('keeps each overload’s own parameters', () => {
    const generated = generateAllowTypes(abisDir, CONTRACTS)

    expect(generated).toContain('"deposit(uint256,address)": (assets')
    expect(generated).toContain('referral?:')
  })
})

describe('the allow kit proxy', () => {
  it('builds a permission for an overload named by signature', () => {
    const kit: any = buildAllowKit(abisDir, CONTRACTS)

    const permission = kit.eth.susds['deposit(uint256,address)']()

    expect(permission.targetAddress).toEqual(ADDRESS.toLowerCase())
    expect(permission.selector).toEqual(selector('deposit(uint256,address)'))
    // The other overload is a different function, not a different spelling.
    expect(kit.eth.susds['deposit(uint256,address,uint16)']().selector).toEqual(
      selector('deposit(uint256,address,uint16)')
    )
  })

  it('explains an ambiguous bare name instead of vanishing', () => {
    const kit: any = buildAllowKit(abisDir, CONTRACTS)

    expect(() => kit.eth.susds.deposit).toThrow('is ambiguous')
    // The message has to carry the way out, not just the diagnosis.
    expect(() => kit.eth.susds.deposit).toThrow(
      'allow.eth.susds["deposit(uint256,address)"]'
    )
  })

  it('reports an ambiguous bare name as absent, so probing stays safe', () => {
    const kit: any = buildAllowKit(abisDir, CONTRACTS)

    expect('deposit' in kit.eth.susds).toBe(false)
    expect('redeem' in kit.eth.susds).toBe(true)
    expect(kit.eth.susds.then).toBeUndefined()
  })

  it('still resolves a function with one implementation', () => {
    const kit: any = buildAllowKit(abisDir, CONTRACTS)

    expect(kit.eth.susds.redeem().selector).toEqual(selector('redeem(uint256)'))
  })
})
