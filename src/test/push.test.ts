import { describe, it, expect, mock } from 'bun:test'
import { encodeKey } from 'zodiac-roles-sdk'
import { push } from '../push'
import { constellation } from '../constellation'
import * as codegen from './codegen.mock'

function mockApi() {
  const mockApply = mock(() => Promise.resolve({ ok: true }))
  const api = { applyConstellation: mockApply } as any
  const lastPayload = () => (mockApply.mock.calls[0] as any)[1] as any
  return { api, lastPayload }
}

describe('push', () => {
  function setup() {
    return constellation(
      { workspace: 'GG', label: 'test', chain: 1 },
      { codegen }
    )
  }

  it('resolves nested node refs to $ref strings', async () => {
    const eth = setup()
    const dao = eth.safe['GG DAO']
    const roles = eth.roles['New Roles']({
      nonce: 0n,
      target: dao,
      owner: dao,
      avatar: dao,
    })

    const { api, lastPayload } = mockApi()
    await push([dao, roles], { api })

    const spec = lastPayload().specification[1]
    expect(spec.target).toBe('$0')
    expect(spec.owner).toBe('$0')
    expect(spec.avatar).toBe('$0')
  })

  it('throws when a referenced node is not in the push list', async () => {
    const eth = setup()
    const dao = eth.safe['GG DAO']
    const roles = eth.roles['New Roles']({
      nonce: 0n,
      target: dao,
      owner: dao,
      avatar: dao,
    })

    const { api } = mockApi()
    expect(push([roles], { api })).rejects.toThrow(
      'Node "GG DAO" is referenced but not included in the push() call'
    )
  })

  it('uses array index as ref for array input', async () => {
    const eth = setup()
    const dao = eth.safe['GG DAO']
    const treasury = eth.safe['Treasury']

    const { api, lastPayload } = mockApi()
    await push([dao, treasury], { api })

    const specs = lastPayload().specification
    expect(specs[0].ref).toBe('0')
    expect(specs[1].ref).toBe('1')
  })

  it('uses object keys as refs', async () => {
    const eth = setup()
    const dao = eth.safe['GG DAO']
    const treasury = eth.safe['Treasury']

    const { api, lastPayload } = mockApi()
    await push({ dao, treasury }, { api })

    const specs = lastPayload().specification
    expect(specs[0].ref).toBe('dao')
    expect(specs[1].ref).toBe('treasury')
  })

  it('converts bigint nonce to string', async () => {
    const eth = setup()
    const newSafe = eth.safe['New Safe']({
      nonce: 42n,
      threshold: 1,
      owners: [],
      modules: [],
    })

    const { api, lastPayload } = mockApi()
    await push([newSafe], { api })

    const spec = lastPayload().specification[0]
    expect(spec.nonce).toBe('42')
  })

  it('resolves refs in owners and modules arrays', async () => {
    const eth = setup()
    const dao = eth.safe['GG DAO']
    const roles = eth.roles['GG DAO']

    const newSafe = eth.safe['New Safe']({
      nonce: 0n,
      threshold: 2,
      owners: [eth.user['Alice Sample'], dao],
      modules: [roles],
    })

    const { api, lastPayload } = mockApi()
    await push({ dao, roles, newSafe }, { api })

    const spec = lastPayload().specification[2]
    expect(spec.owners).toEqual([
      codegen.users['Alice Sample'].personalSafes[1].address,
      '$dao',
    ])
    expect(spec.modules).toEqual(['$roles'])
  })

  it('strips _constellation from spec output', async () => {
    const eth = setup()
    const dao = eth.safe['GG DAO']

    const { api, lastPayload } = mockApi()
    await push([dao], { api })

    const spec = lastPayload().specification[0]
    expect(spec._constellation).toBeUndefined()
  })

  it('passes label and chain from constellation metadata', async () => {
    const eth = constellation(
      { workspace: 'GG', label: 'my constellation', chain: 1 },
      { codegen }
    )
    const dao = eth.safe['GG DAO']

    const { api, lastPayload } = mockApi()
    await push([dao], { api })

    const payload = lastPayload()
    expect(payload.label).toBe('my constellation')
    expect(payload.chain).toBe(1)
  })

  it('resolves circular refs between new nodes', async () => {
    const eth = setup()

    const safe = eth.safe['New Safe']({
      nonce: 0n,
      threshold: 1,
      owners: [],
      modules: [eth.roles['New Roles']],
    })
    const roles = eth.roles['New Roles']({
      nonce: 0n,
      target: safe,
    })

    const { api, lastPayload } = mockApi()
    await push({ safe, roles }, { api })

    const specs = lastPayload().specification
    expect(specs[0].modules).toEqual(['$roles'])
    expect(specs[1].target).toBe('$safe')
  })

  it('preserves Record-form allowances so unmentioned entries are not cleared', async () => {
    const eth = setup()

    const usdm_user_payouts = {
      key: encodeKey('usdm_user_payouts'),
      refill: 1000n,
      maxRefill: 1000n,
      period: 86400n,
      balance: 1000n,
      timestamp: 0n,
    }

    const safe = eth.safe['GG DAO']
    const roles = eth.roles['GG DAO']({
      nonce: 0n,
      owner: safe,
      target: safe,
      avatar: safe,
      allowances: { usdm_user_payouts, deprecated: null },
    })

    const { api, lastPayload } = mockApi()
    await push({ safe, roles }, { api })

    const spec = lastPayload().specification[1]
    expect(spec.allowances).toEqual({
      usdm_user_payouts: {
        key: encodeKey('usdm_user_payouts'),
        refill: '1000',
        maxRefill: '1000',
        period: '86400',
        balance: '1000',
        timestamp: '0',
      },
      deprecated: null,
    })
  })

  it('preserves Record-form roles so unmentioned roles are not cleared', async () => {
    const eth = setup()

    const safe = eth.safe['GG DAO']
    const roles = eth.roles['GG DAO']({
      nonce: 0n,
      owner: safe,
      target: safe,
      avatar: safe,
      roles: {
        eth_wrapping: {
          members: [],
          permissions: [],
        },
        deprecated: null,
      },
    })

    const { api, lastPayload } = mockApi()
    await push({ safe, roles }, { api })

    const spec = lastPayload().specification[1]
    expect(spec.roles).toEqual({
      eth_wrapping: {
        key: 'eth_wrapping',
        members: [],
        targets: [],
        annotations: [],
      },
      deprecated: null,
    })
  })

  it('throws for invalid nodes', async () => {
    const { api } = mockApi()
    expect(() => push([{ not: 'a node' } as any], { api })).toThrow(
      'unexpected node input'
    )
  })
})
