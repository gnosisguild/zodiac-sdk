import { chainIdFor, type ChainPrefix } from './networks'

export type AbiFragment = Record<string, any>
export type Abi = AbiFragment[]

type Implementation = { abi?: unknown }
type Account = Implementation & {
  proxy?: unknown
  implementation?: Implementation
}

// Returns null on any failure so callers can fall back to a manual ABI file.
export async function fetchAbi(
  chainId: number,
  address: `0x${string}`
): Promise<Abi | null> {
  const url = `https://api.abi.pub/v1/chains/${chainId}/accounts/${address}`
  let account: Account
  try {
    const resp = await fetch(url)
    if (!resp.ok) return null
    account = (await resp.json()) as Account
  } catch {
    return null
  }
  if (account == null || typeof account !== 'object') return null

  // For a proxy the endpoint reports the proxy under `proxy` and the contract
  // that actually holds the functions under `implementation`. Permissions are
  // written against the implementation ABI.
  const abi = account.proxy ? account.implementation?.abi : account.abi
  if (!Array.isArray(abi) || abi.length === 0) return null
  return abi as Abi
}

export const fetchAbiForPrefix = (
  prefix: ChainPrefix,
  address: `0x${string}`
) => fetchAbi(chainIdFor(prefix), address)
