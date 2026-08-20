import { describe, it, expect, afterEach } from 'bun:test'
import { fetchAbi } from '../allow/fetch'

const WETH = '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2'
const USDC = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48'

const IMPLEMENTATION_ABI = [
  { type: 'function', name: 'transfer', inputs: [], outputs: [] },
]
const PROXY_ABI = [
  { type: 'function', name: 'upgradeTo', inputs: [], outputs: [] },
]

const realFetch = globalThis.fetch

// Returns the URLs the code under test requested.
function mockResponse(body: unknown, { ok = true }: { ok?: boolean } = {}) {
  const requested: string[] = []
  globalThis.fetch = ((input: RequestInfo | URL) => {
    requested.push(String(input))
    return Promise.resolve({
      ok,
      json: () => Promise.resolve(body),
    } as Response)
  }) as typeof fetch
  return requested
}

afterEach(() => {
  globalThis.fetch = realFetch
})

describe('fetchAbi', () => {
  it('returns the ABI of a plain contract', async () => {
    mockResponse({ chainId: 1, address: WETH, abi: IMPLEMENTATION_ABI })

    expect(await fetchAbi(1, WETH)).toEqual(IMPLEMENTATION_ABI)
  })

  it('returns the implementation ABI for a proxy, not the proxy ABI', async () => {
    mockResponse({
      chainId: 1,
      address: USDC,
      abi: PROXY_ABI,
      proxy: { target: '0x43506849d7c04f9138d1a2050bbf3a0c054402dd' },
      implementation: { verified: true, abi: IMPLEMENTATION_ABI },
    })

    expect(await fetchAbi(1, USDC)).toEqual(IMPLEMENTATION_ABI)
  })

  it('queries the accounts endpoint', async () => {
    const requested = mockResponse({ abi: IMPLEMENTATION_ABI })
    await fetchAbi(1, WETH)

    expect(requested).toEqual([
      `https://api.abi.pub/v1/chains/1/accounts/${WETH}`,
    ])
  })

  it('returns null when a proxy implementation is unverified', async () => {
    mockResponse({
      chainId: 1,
      address: USDC,
      proxy: { target: '0x43506849d7c04f9138d1a2050bbf3a0c054402dd' },
      implementation: { verified: false },
    })

    expect(await fetchAbi(1, USDC)).toBeNull()
  })

  it('returns null for an empty ABI', async () => {
    mockResponse({ abi: [] })

    expect(await fetchAbi(1, WETH)).toBeNull()
  })

  it('returns null on a failed request', async () => {
    mockResponse({}, { ok: false })

    expect(await fetchAbi(1, WETH)).toBeNull()
  })
})
