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

  // `pull` fills a referenced node with what it read from chain so it reads
  // well in an editor. Pushing that back would declare it, and an owner added
  // since the pull would be removed again by the deployment — a change nobody
  // wrote down. So a reference travels as a reference.
  it('pushes a referenced account as a reference, not a declaration', async () => {
    const eth = setup()

    const { api, lastPayload } = mockApi()
    await push([eth.safe['GG DAO']], { api })

    expect(lastPayload().specification[0]).toEqual({
      ref: '0',
      type: 'SAFE',
      chain: 1,
      address: '0xcccc00000000000000000000000000000000cccc',
      label: 'GG DAO',
      vault: true,
    })
  })

  it('pushes only the fields a reference declares', async () => {
    const eth = setup()

    const { api, lastPayload } = mockApi()
    await push([eth.safe['Treasury']({ threshold: 3 })], { api })

    const spec = lastPayload().specification[0]

    expect(spec.threshold).toBe(3)
    // Left alone rather than restated at whatever the pull happened to read.
    expect(spec).not.toHaveProperty('owners')
    expect(spec).not.toHaveProperty('modules')
    // The address is not one of those fields. It is which account this is —
    // without it the node would be a creation, and a deployer other than the
    // last one would derive a second account under the same label.
    expect(spec.address).toBe(codegen.accounts.GG.safes[1].Treasury.address)
  })

  it('pushes everything a new node declares', async () => {
    const eth = setup()
    const owners = ['0xaaaa00000000000000000000000000000000aaaa'] as const

    const { api, lastPayload } = mockApi()
    await push(
      [eth.safe['New Safe']({ nonce: 0n, threshold: 1, owners: [...owners] })],
      { api }
    )

    expect(lastPayload().specification[0]).toMatchObject({
      nonce: '0',
      threshold: 1,
      owners: [...owners],
    })
  })

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

  it('resolves a node named as a permission target', async () => {
    const eth = setup()
    const safe = eth.safe['New Safe']({
      nonce: 0n,
      threshold: 1,
      owners: ['0xaaaa00000000000000000000000000000000aaaa'],
    })
    const roles = eth.roles['New Roles']({
      nonce: 0n,
      target: safe,
      owner: safe,
      avatar: safe,
      roles: {
        emergency: {
          members: ['0xbbbb00000000000000000000000000000000bbbb'],
          // The policy governs a Safe that this same push creates, so the
          // permission names the node rather than an address nobody has yet.
          permissions: [{ targetAddress: safe, selector: '0xe009cfde' }],
        },
      },
    })

    const { api, lastPayload } = mockApi()
    await push({ safe, roles }, { api })

    const spec = lastPayload().specification[1]

    expect(spec.roles.emergency.permissions[0].targetAddress).toEqual('$safe')
  })

  it('resolves an uninvoked accessor named as a permission target', async () => {
    const eth = setup()
    // The forward-reference form: two nodes that need each other cannot both be
    // invoked first, so a permission has to be able to name the accessor.
    const safeRef = eth.safe['New Safe']
    const roles = eth.roles['New Roles']({
      nonce: 0n,
      target: safeRef,
      owner: safeRef,
      avatar: safeRef,
      roles: {
        emergency: {
          members: ['0xbbbb00000000000000000000000000000000bbbb'],
          permissions: [{ targetAddress: safeRef, selector: '0xe009cfde' }],
        },
      },
    })
    const safe = safeRef({
      nonce: 0n,
      threshold: 1,
      owners: ['0xaaaa00000000000000000000000000000000aaaa'],
    })

    const { api, lastPayload } = mockApi()
    await push({ safe, roles }, { api })

    const spec = lastPayload().specification[1]

    expect(spec.roles.emergency.permissions[0].targetAddress).toEqual('$safe')
  })

  it('resolves a node named as a permission target inside a labelled entry', async () => {
    const eth = setup()
    const safe = eth.safe['New Safe']({
      nonce: 0n,
      threshold: 1,
      owners: ['0xaaaa00000000000000000000000000000000aaaa'],
    })
    const roles = eth.roles['New Roles']({
      nonce: 0n,
      target: safe,
      owner: safe,
      avatar: safe,
      roles: {
        emergency: {
          members: ['0xbbbb00000000000000000000000000000000bbbb'],
          permissions: [
            {
              label: 'Disable the module',
              permissions: [{ targetAddress: safe, selector: '0xe009cfde' }],
            },
          ],
        },
      },
    })

    const { api, lastPayload } = mockApi()
    await push({ safe, roles }, { api })

    const entry = lastPayload().specification[1].roles.emergency.permissions[0]

    expect(entry.permissions[0].targetAddress).toEqual('$safe')
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

  it('rejects non-lowercase object keys as refs', async () => {
    const eth = setup()
    const assetSafe = eth.safe['GG DAO']
    const { api } = mockApi()

    expect(push({ assetSafe }, { api })).rejects.toThrow(
      'Invalid ref "assetSafe": refs must contain only lowercase letters, numbers, or underscores'
    )
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
    await push({ dao, roles, new_safe: newSafe }, { api })

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
        permissions: [],
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
