import type {
  ApplyConstellationPayload,
  ApplyConstellationResult,
  ChainId,
} from '@zodiaceco/api-types'
import { invariant } from '@epic-web/invariant'
import {
  assertRecipientChains,
  isDeFiKitEntry,
  toAnnotation,
} from './permissionEntries'
import { ApiClient } from './api'
import type {
  ConstellationMeta,
  ConstellationNode,
  ConstellationNodeInternal,
  RoleDef,
} from './constellation'

type PushOpts = {
  /** API client instance. Defaults to a client configured from environment variables. */
  api?: ApiClient
}

/**
 * Applies the given nodes as the next revision of the constellations they
 * belong to, and answers with a url per constellation to review and deploy.
 *
 * Each node travels with what it was actually given, never with the onchain
 * state a `pull` filled it with for reading — so a node passed as a bare
 * reference declares nothing and leaves the account it names alone. Nodes
 * naming each other travel as references and are substituted for addresses
 * once those are derived at deploy.
 *
 * Passing an object names each node by its key; passing an array names them by
 * position. Either way the name is the node's `ref`, which is how the app
 * follows a node from one revision to the next.
 *
 * ```ts
 * const eth = constellation({ workspace: 'GG', label: 'my constellation', chain: 1 })
 * const dao = eth.safe['GG DAO']
 * const roles = eth.roles['New Roles']({ nonce: 0n, target: dao, owner: dao, avatar: dao })
 *
 * await push({ dao, roles })
 * ```
 */
export async function push(
  nodes: ConstellationNode[] | { [key: string]: ConstellationNode },
  opts?: PushOpts
): Promise<ApplyConstellationResult[]> {
  const api = opts?.api ?? new ApiClient()
  const refs = deriveRefs(nodes)

  // Group nodes by constellation (multiple constellations can be applied with a single call)
  const groups = new Map<
    string,
    { meta: ConstellationMeta; nodes: ConstellationNodeInternal[] }
  >()

  for (const node of refs.byIdentity.keys()) {
    const meta = node._constellation
    invariant(
      meta,
      `Node "${node.label}" is not associated with a constellation`
    )
    const key = `${meta.workspaceId}:${meta.chain}:${meta.label}`
    let group = groups.get(key)
    if (!group) {
      group = { meta, nodes: [] }
      groups.set(key, group)
    }
    group.nodes.push(node)
  }

  const results: ApplyConstellationResult[] = []
  for (const { meta, nodes: groupNodes } of groups.values()) {
    const specification = groupNodes.map((n) => nodeToSpec(n, refs))
    const result = await api.applyConstellation(meta.workspaceId, {
      label: meta.label,
      chain: meta.chain,
      specification,
    })
    results.push(result)
  }

  return results
}

/**
 * What a ref may be spelled like. Refs come from export names and object keys,
 * so any identifier a node can be declared under has to survive the push —
 * except one opening with `$`, which is how a node references another. A list
 * of nodes refs them by position, so a plain index counts too.
 */
const IDENTIFIER = /^(?:[a-zA-Z_][a-zA-Z0-9_$]*|\d+)$/

type RefsIndex = {
  byIdentity: Map<ConstellationNodeInternal, string>
  byLabel: Map<string, string>
}

function labelKey(node: ConstellationNodeInternal): string {
  return `${node._constellation.workspaceId}:${node.type}:${node.label}`
}

function deriveRefs(
  nodes: ConstellationNode[] | { [key: string]: ConstellationNode }
): RefsIndex {
  const byIdentity = new Map<ConstellationNodeInternal, string>()
  const byLabel = new Map<string, string>()

  const register = (node: ConstellationNodeInternal, ref: string) => {
    invariant(
      IDENTIFIER.test(ref),
      `Invalid ref "${ref}": a ref is a JavaScript identifier, and cannot start with "$"`
    )
    byIdentity.set(node, ref)
    byLabel.set(labelKey(node), ref)
  }

  if (Array.isArray(nodes)) {
    for (let i = 0; i < nodes.length; i++) {
      const node = nodes[i]
      invariant(
        isConstellationNode(node),
        `unexpected node input at index: ${i}`
      )
      register(node, `${i}`)
    }
  } else {
    for (const [key, node] of Object.entries(nodes)) {
      invariant(
        isConstellationNode(node),
        `unexpected node input under key: ${key}`
      )
      register(node, key)
    }
  }

  return { byIdentity, byLabel }
}

/**
 * What situates a node rather than configures it: which account it is, and how
 * the workspace holds it. Always sent, even for a reference that declares
 * nothing — none of it reaches the onchain diff, and leaving it out would lose
 * the label and the vault the node belongs to.
 *
 * `address` above all. It is what the pull resolved the label to, and the only
 * thing that says which account this is: a node without one is a creation, and
 * its address is derived from whoever deploys. Drop it and a second deployer
 * provisions a duplicate under the same label rather than reconfiguring the
 * account that is already there.
 */
const IDENTITY_FIELDS = new Set(['type', 'chain', 'address', 'label', 'vault'])

function nodeToSpec(
  node: ConstellationNodeInternal,
  refs: RefsIndex
): ApplyConstellationPayload['specification'][number] {
  const { id, _constellation, _declared, ...rest } = node as Record<string, any>
  // A node built by hand rather than through an accessor says nothing about
  // what it declares, so there is nothing to go on and everything travels.
  const declared = Array.isArray(_declared) ? new Set<string>(_declared) : null
  const spec: Record<string, any> = {}

  for (const [key, value] of Object.entries(rest)) {
    // A referenced node carries the state `pull` read from chain. Sending it
    // back would declare it: an owner added since the pull would be removed
    // again by the deployment, without anyone having written that down. So
    // state travels only when this node actually declares it.
    if (declared != null && !IDENTITY_FIELDS.has(key) && !declared.has(key)) {
      continue
    }

    if (node.type === 'ROLES' && key === 'roles' && value != null) {
      spec.roles = describeRoles(
        value as Record<string, RoleDef | null>,
        node.chain,
        refs
      )
      continue
    }
    spec[key] = resolveRefs(value, refs)
  }

  spec.ref = refs.byIdentity.get(node)
  invariant(spec.ref != null, 'ref not found')

  return stringifyBigints(
    spec
  ) as ApplyConstellationPayload['specification'][number]
}

/**
 * Entries travel to the API as they were written — parameters and labels — and
 * are compiled when the constellation is deployed. Only a DeFi Kit entry is
 * rendered here, into the annotation uri that names the chain it was written
 * for; the permissions behind it are fetched from that uri at deploy.
 */
function describeRoles(
  roles: Record<string, RoleDef | null>,
  chain: ChainId,
  refs: RefsIndex
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(roles).map(([key, def]) => {
      if (def == null) {
        return [key, null] as const
      }

      return [
        key,
        {
          key,
          members: resolveRefs(def.members, refs),
          permissions: def.permissions.map((entry) => {
            assertRecipientChains(entry, chain)

            return resolveRefs(
              isDeFiKitEntry(entry)
                ? { label: entry.label, annotation: toAnnotation(entry, chain) }
                : entry,
              refs
            )
          }),
        },
      ] as const
    })
  )
}

function resolveRefs(value: unknown, refs: RefsIndex): unknown {
  if (isConstellationNode(value)) {
    const ref = refs.byIdentity.get(value) ?? refs.byLabel.get(labelKey(value))
    invariant(
      ref != null,
      `Node "${value.label}" is referenced but not included in the push() call`
    )
    return `$${ref}`
  }

  if (Array.isArray(value)) {
    return value.map((v) => resolveRefs(v, refs))
  }

  if (typeof value === 'object' && value !== null) {
    const resolved: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value)) {
      resolved[k] = resolveRefs(v, refs)
    }
    return resolved
  }

  // API expects lowercase addresses
  if (typeof value === 'string' && /^0x[0-9a-fA-F]{40}$/.test(value)) {
    return value.toLowerCase()
  }

  return value
}

function stringifyBigints(value: unknown): unknown {
  if (typeof value === 'bigint') {
    return value.toString()
  }

  if (Array.isArray(value)) {
    return value.map(stringifyBigints)
  }

  if (typeof value === 'object' && value !== null) {
    const result: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value)) {
      result[k] = stringifyBigints(v)
    }
    return result
  }

  return value
}

function isConstellationNode(
  value: unknown
): value is ConstellationNodeInternal {
  if (typeof value === 'function' || typeof value === 'object') {
    const obj = value as any
    return (
      obj != null &&
      typeof obj.type === 'string' &&
      typeof obj.chain === 'number' &&
      typeof obj._constellation === 'object'
    )
  }
  return false
}
