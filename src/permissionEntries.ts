import type { Address, ChainId } from '@zodiaceco/api-types'
import type { Permission } from 'zodiac-roles-sdk'

/**
 * The shapes a role's `permissions` travel to the API in, and the one piece of
 * rendering `push()` still does. Internal: the helpers that build these live in
 * `./actions`, and nothing here is part of the published interface beyond the
 * `PermissionEntry` type that module re-exports.
 */

/**
 * The base url of the DeFi Kit API. Annotations point back at it so that a role
 * can be read as presets again, and so that a DeFi Kit entry written in code is
 * indistinguishable from one configured in the app.
 */
const DEFI_KIT_BASE_URL = 'https://kit.kpk.io/api/v1'

/** The chains DeFi Kit serves, by the prefix it addresses them with. */
const DEFI_KIT_CHAIN_PREFIXES: Record<number, string> = {
  1: 'eth',
  10: 'oeth',
  100: 'gno',
  8453: 'base',
  42161: 'arb1',
}

/** Renders a DeFi Kit entry into the annotation it stands for on `chain`. */
export const toAnnotation = (
  { defiKit: { protocol, verb, params } }: DeFiKitEntry,
  chain: ChainId
) => {
  const prefix = DEFI_KIT_CHAIN_PREFIXES[chain]

  if (prefix == null) {
    throw new Error(`DeFi Kit does not serve chain "${chain}"`)
  }

  return {
    uri: `${DEFI_KIT_BASE_URL}/permissions/${prefix}/${protocol}/${verb}?${searchParams(params)}`,
    schema: `${DEFI_KIT_BASE_URL}/openapi.json`,
  }
}

export const isDeFiKitEntry = (entry: PermissionEntry): entry is DeFiKitEntry =>
  typeof entry === 'object' && entry !== null && 'defiKit' in entry

/**
 * Search params are appended one value at a time, the form annotation uris are
 * normalized to before they are matched back against a preset.
 */
const searchParams = (params: Record<string, DeFiKitParamValue>) => {
  const searchParams = new URLSearchParams()

  for (const [name, value] of Object.entries(params)) {
    if (value == null) {
      continue
    }

    for (const entry of Array.isArray(value) ? value : [value]) {
      searchParams.append(name, String(entry))
    }
  }

  return searchParams
}

/** The bytes32 key an allowance is addressed by on the modifier. */
export type AllowanceKey = `0x${string}`

export type SwapEntry = {
  label: string
  action: { type: 'swap'; sell: Address[]; buy: Address[] }
}

export type TransferEntry = {
  label: string
  action: {
    type: 'transfer'
    tokens: Address[]
    to: Address[]
    bridge?: { chain: ChainId; to: Address[]; receive: Address[] }[]
    allowance?: AllowanceKey
  }
}

export type LabelledPermissions = {
  label: string
  permissions: Permission[]
}

export type DeFiKitEntry = {
  label: string
  defiKit: {
    protocol: string
    verb: string
    params: Record<string, DeFiKitParamValue>
  }
}

export type DeFiKitParamValue =
  | string
  | number
  | boolean
  | readonly (string | number | boolean)[]
  | null
  | undefined

/**
 * One entry of a role's `permissions`. A bare permission stays valid, but every
 * labelled form names something the app can show as a single card.
 */
export type PermissionEntry =
  | Permission
  | LabelledPermissions
  | SwapEntry
  | TransferEntry
  | DeFiKitEntry
