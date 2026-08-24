import { describe, it, expect, mock } from 'bun:test'
import * as actions from '../actions'
import { custom, defikit, swap, transfer } from '../actions'
import { constellation } from '../constellation'
import { push } from '../push'
import * as codegen from './codegen.mock'

const USDC = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48'
const WETH = '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2'

describe('actions', () => {
  it('publishes the four helpers and nothing else', () => {
    // `@zodiaceco/sdk/actions` is a published entrypoint: everything exported
    // here is API we owe consumers. Entry shapes and the rendering `push()`
    // does live in ./permissionEntries so they stay private.
    expect(Object.keys(actions).sort()).toEqual([
      'custom',
      'defikit',
      'swap',
      'transfer',
    ])
  })

  it('describes a swap by its parameters', () => {
    expect(
      swap({ label: 'Rebalance stables', sell: [USDC], buy: [WETH] })
    ).toEqual({
      label: 'Rebalance stables',
      action: { type: 'swap', sell: [USDC], buy: [WETH] },
    })
  })

  it('describes a transfer by the allowance key that caps it', () => {
    const allowance = {
      key: '0x1234',
      refill: 0n,
      maxRefill: 0n,
      period: 0n,
      balance: 0n,
      timestamp: 0n,
    } as const

    expect(
      transfer({
        label: 'Grant payouts',
        tokens: [USDC],
        to: [WETH],
        allowance,
      })
    ).toEqual({
      label: 'Grant payouts',
      action: {
        type: 'transfer',
        tokens: [USDC],
        to: [WETH],
        allowance: '0x1234',
      },
    })
  })

  it('takes the bridge destination from the recipient nodes', () => {
    const gno = constellation(
      { workspace: 'GG', label: 'test', chain: 100 },
      { codegen }
    )

    expect(
      transfer({
        label: 'Grant payouts',
        tokens: [USDC],
        bridge: [{ to: [gno.safe['GG DAO']], receive: [WETH] }],
      })
    ).toEqual({
      label: 'Grant payouts',
      action: {
        type: 'transfer',
        tokens: [USDC],
        to: [],
        bridge: [
          {
            chain: 100,
            to: ['0xcccc00000000000000000000000000000000cccc'],
            receive: [WETH],
          },
        ],
      },
    })
  })

  it('takes a named chain when the recipients are plain addresses', () => {
    expect(
      transfer({
        label: 'Grant payouts',
        tokens: [USDC],
        bridge: [{ chain: 42161, to: [WETH], receive: [WETH] }],
      }).action.bridge?.[0].chain
    ).toBe(42161)
  })

  it('refuses a bridge target whose recipient contradicts its chain', () => {
    const gno = constellation(
      { workspace: 'GG', label: 'test', chain: 100 },
      { codegen }
    )

    expect(() =>
      transfer({
        label: 'Grant payouts',
        tokens: [USDC],
        bridge: [{ chain: 42161, to: [gno.safe['GG DAO']], receive: [WETH] }],
      })
    ).toThrow('spans chains "42161" and "100"')
  })

  it('refuses a bridge target with no chain to go on', () => {
    expect(() =>
      transfer({
        label: 'Grant payouts',
        tokens: [USDC],
        bridge: [{ to: [WETH], receive: [WETH] }],
      })
    ).toThrow('needs a `chain`')
  })

  it('takes a node recipient as the address it lives at', () => {
    const eth = constellation(
      { workspace: 'GG', label: 'test', chain: 1 },
      { codegen }
    )

    expect(
      transfer({
        label: 'Grant payouts',
        tokens: [USDC],
        to: [eth.safe['GG DAO']],
      })
    ).toEqual({
      label: 'Grant payouts',
      action: {
        type: 'transfer',
        tokens: [USDC],
        to: ['0xcccc00000000000000000000000000000000cccc'],
      },
    })
  })

  it('labels a bag of plain permissions', () => {
    const permission = { targetAddress: USDC, selector: '0xa9059cbb' } as const

    expect(custom({ label: 'Bot ops', permissions: [permission] })).toEqual({
      label: 'Bot ops',
      permissions: [permission],
    })
  })

  it('records a DeFi Kit call without fetching anything', () => {
    expect(
      defikit.aave_v3.deposit({
        label: 'Aave deposits',
        market: 'Core',
        targets: ['WETH'],
      })
    ).toEqual({
      label: 'Aave deposits',
      defiKit: {
        protocol: 'aave_v3',
        verb: 'deposit',
        params: { market: 'Core', targets: ['WETH'] },
      },
    })
  })
})

describe('push', () => {
  function mockApi() {
    const mockApply = mock(() => Promise.resolve({ ok: true }))
    const api = { applyConstellation: mockApply } as any
    const lastPayload = () => (mockApply.mock.calls[0] as any)[1] as any
    return { api, lastPayload }
  }

  function rolesWith(permissions: any[], chain: 1 | 100 = 1) {
    const eth = constellation(
      { workspace: 'GG', label: 'test', chain },
      { codegen }
    )
    const safe = eth.safe['GG DAO']

    return [
      safe,
      eth.roles['New Roles']({
        nonce: 0n,
        owner: safe,
        target: safe,
        avatar: safe,
        roles: { treasury_ops: { members: [], permissions } },
      }),
    ]
  }

  const rolesSpec = (payload: any) =>
    payload.specification[1].roles.treasury_ops

  it('sends entries as written, with addresses lowercased', async () => {
    const { api, lastPayload } = mockApi()

    await push(
      rolesWith([swap({ label: 'Swap', sell: [USDC], buy: [WETH] })]),
      {
        api,
      }
    )

    expect(rolesSpec(lastPayload()).permissions).toEqual([
      {
        label: 'Swap',
        action: {
          type: 'swap',
          sell: [USDC.toLowerCase()],
          buy: [WETH.toLowerCase()],
        },
      },
    ])
  })

  it('renders a DeFi Kit entry into the annotation for the role"s chain', async () => {
    const { api, lastPayload } = mockApi()

    await push(
      rolesWith([
        defikit.aave_v3.deposit({
          label: 'Aave deposits',
          market: 'Core',
          targets: ['WETH', 'USDC'],
        }),
      ]),
      { api }
    )

    expect(rolesSpec(lastPayload()).permissions).toEqual([
      {
        label: 'Aave deposits',
        annotation: {
          uri: 'https://kit.kpk.io/api/v1/permissions/eth/aave_v3/deposit?market=Core&targets=WETH&targets=USDC',
          schema: 'https://kit.kpk.io/api/v1/openapi.json',
        },
      },
    ])
  })

  it('addresses the chain the constellation is on', async () => {
    const { api, lastPayload } = mockApi()

    await push(
      rolesWith(
        [defikit.aave_v3.stake({ label: 'Aave staking', targets: ['AAVE'] })],
        100
      ),
      { api }
    )

    expect(rolesSpec(lastPayload()).permissions[0].annotation.uri).toContain(
      '/permissions/gno/aave_v3/stake'
    )
  })

  it('refuses a DeFi Kit entry on a chain DeFi Kit does not serve', async () => {
    const { api } = mockApi()

    expect(() =>
      push(
        rolesWith(
          [defikit.aave_v3.stake({ label: 'x', targets: [] })],
          137 as any
        ),
        { api }
      )
    ).toThrow('DeFi Kit does not serve chain "137"')
  })
})
