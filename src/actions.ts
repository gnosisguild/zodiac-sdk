import type { Address, ChainId } from '@zodiaceco/api-types'
import type { allow as ethereumKit } from 'defi-kit/eth'
import type { Permission } from 'zodiac-roles-sdk'
import { recipientChains } from './permissionEntries'
import type {
  AllowanceKey,
  DeFiKitEntry,
  LabelledPermissions,
  PermissionEntry,
  SwapEntry,
  TransferEntry,
} from './permissionEntries'
import type { AllowanceSpec } from './types'

export type { PermissionEntry }
export type { Permissions } from './permissionEntries'

/**
 * Allows signing CoW orders selling any of `sell` for any of `buy`. The
 * parameters are compiled into permissions when the constellation is deployed,
 * never here — a stored revision that carried its own copy would go stale as
 * soon as the compiler changed.
 */
export const swap = ({ label, sell, buy }: SwapParams): SwapEntry => ({
  label,
  action: { type: 'swap', sell: [...sell], buy: [...buy] },
})

/**
 * Allows transferring any of `tokens` to any of `to` on the role's own chain,
 * and — through `bridge` — to recipients on other chains over Across. Both are
 * optional on their own; a transfer names at least one recipient somewhere.
 */
export const transfer = ({
  label,
  tokens,
  to = [],
  bridge = [],
  allowance,
}: TransferParams): TransferEntry => {
  const entry: TransferEntry = {
    label,
    action: {
      type: 'transfer',
      tokens: [...tokens],
      to: to.map(toAddress),
      ...(bridge.length > 0 && { bridge: bridge.map(toBridgeTarget) }),
      ...(allowance != null && { allowance: allowanceKey(allowance) }),
    },
  }

  // Remember which chains the `to` nodes live on so push() can refuse a
  // recipient from another chain. Symbol-keyed: never serialized.
  const chains = to.flatMap((recipient) =>
    typeof recipient === 'string' || recipient.chain == null
      ? []
      : [recipient.chain]
  )

  if (chains.length > 0) {
    Object.defineProperty(entry, recipientChains, {
      value: chains,
      enumerable: false,
    })
  }

  return entry
}

/**
 * A labelled bag of `allow`-kit permissions — the code-side counterpart of the
 * app's Custom action, for everything the other action types don't cover. It
 * takes plain permissions, not other actions.
 */
export const custom = ({
  label,
  permissions,
}: CustomParams): LabelledPermissions => ({
  label,
  permissions: [...permissions],
})

/**
 * The DeFi Kit allow kit — same protocol, verb and parameter surface, plus a
 * `label`. A DeFi Kit entry is nothing but its annotation: the permissions are
 * fetched from the annotation's uri at deploy, so nothing is fetched here.
 *
 * Protocols and parameters are typed against the Ethereum kit, the widest of
 * the chains DeFi Kit serves. Values that only exist on another chain still
 * type-check; the API validates them when the annotation is resolved.
 */
export const defikit: DeFiKit = new Proxy({} as DeFiKit, {
  get: (_, protocol: string) =>
    new Proxy(
      {},
      {
        get:
          (_, verb: string) =>
          ({ label, ...params }: { label: string }) => ({
            label,
            defiKit: { protocol, verb, params },
          }),
      }
    ),
})

const allowanceKey = (allowance: AllowanceSpec | AllowanceKey) =>
  typeof allowance === 'string' ? allowance : allowance.key

const toAddress = (recipient: Recipient): Address =>
  typeof recipient === 'string' ? recipient : recipient.address

/**
 * A node knows the chain it lives on, so a bridge target written with nodes
 * needs no `chain` of its own. Naming one anyway is allowed — a plain address
 * carries no chain — but a node that disagrees with it is a mistake worth
 * catching here rather than at deploy.
 */
const toBridgeTarget = ({ chain, to, receive }: BridgeTarget) => ({
  chain: destinationChain(chain, to),
  to: to.map(toAddress),
  receive: [...receive],
})

const destinationChain = (
  chain: ChainId | undefined,
  recipients: readonly Recipient[]
): ChainId => {
  let destination = chain

  for (const recipient of recipients) {
    if (typeof recipient === 'string' || recipient.chain == null) {
      continue
    }

    if (destination != null && destination !== recipient.chain) {
      throw new Error(
        `A bridge target has one destination, but this one spans chains "${destination}" and "${recipient.chain}"`
      )
    }

    destination = recipient.chain
  }

  if (destination == null) {
    throw new Error(
      'A bridge target needs a `chain` unless its recipients are nodes that know one'
    )
  }

  return destination
}

type SwapParams = {
  /** Names the action in the app. Never reaches the chain. */
  label: string
  /** Tokens the role may sell. */
  sell: readonly Address[]
  /** Tokens the role may buy. */
  buy: readonly Address[]
}

type TransferParams = {
  /** Names the action in the app. Never reaches the chain. */
  label: string
  /** Tokens the role may transfer. Use the zero address for the native token. */
  tokens: readonly Address[]
  /** Addresses the role may transfer to on the role's own chain. A node stands
   * for its address, so only nodes that already have one — an account from your
   * codegen, or one bound by address — can be named here. */
  to?: readonly Recipient[]
  /** Destinations on other chains, bridged over Across. */
  bridge?: readonly BridgeTarget[]
  /** Allowance capping what may be sent, declared on the roles modifier. */
  allowance?: AllowanceSpec | AllowanceKey
}

type CustomParams = {
  /** Names the action in the app. Never reaches the chain. */
  label: string
  permissions: readonly Permission[]
}

/** An address, or a node that already knows the address it lives at. */
type Recipient =
  | Address
  | { readonly address: Address; readonly chain?: ChainId }

type BridgeTarget = {
  /** The destination chain. Inferred from the recipients when they are nodes. */
  chain?: ChainId
  /** Addresses the role may bridge to on the destination chain. */
  to: readonly Recipient[]
  /** Tokens the role may receive on the destination chain. */
  receive: readonly Address[]
}

type EthereumKit = typeof ethereumKit

type DeFiKit = {
  readonly [Protocol in keyof EthereumKit]: {
    readonly [Verb in keyof EthereumKit[Protocol]]: DeFiKitVerb<
      EthereumKit[Protocol][Verb]
    >
  }
}

type DeFiKitVerb<Verb> = Verb extends (params: infer Params) => unknown
  ? (params: Params & { label: string }) => DeFiKitEntry
  : (params: { label: string }) => DeFiKitEntry
