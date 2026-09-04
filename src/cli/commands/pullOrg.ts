import type { ResolvedConfig } from '../config'
import { ApiClient } from '../../api'
import { getAddress } from 'ethers'
import {
  ModuleKind,
  Project,
  ScriptTarget,
  VariableDeclarationKind,
} from 'ts-morph'
import { mkdirSync, writeFileSync } from 'fs'
import { join } from 'path'
import { resolveZodiacDir } from '../../paths'

const toLiteral = (value: unknown, indent = 0): string => {
  const pad = '  '.repeat(indent)
  const childPad = '  '.repeat(indent + 1)

  if (value === null) return 'null'
  if (typeof value === 'bigint') return `${value}n`
  if (typeof value === 'string') return JSON.stringify(value)
  if (typeof value === 'number' || typeof value === 'boolean')
    return String(value)
  if (Array.isArray(value)) {
    if (value.length === 0) return '[]'
    return `[\n${value.map((v) => `${childPad}${toLiteral(v, indent + 1)}`).join(',\n')},\n${pad}]`
  }
  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
    if (entries.length === 0) return '{}'
    const props = entries.map(
      ([k, v]) =>
        `${childPad}${isBareKey(k) ? k : JSON.stringify(k)}: ${toLiteral(v, indent + 1)}`
    )
    return `{\n${props.join(',\n')},\n${pad}}`
  }
  return String(value)
}

/**
 * Whether a key can be written without quotes. Chain ids are grouping keys in
 * the generated data, and an unquoted number keys the `as const` type by chain
 * id — quoted, it would key by a string the callers never hold.
 */
const isBareKey = (key: string): boolean =>
  /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(key) || /^\d+$/.test(key)

export const pullOrg = async (config: ResolvedConfig) => {
  const client = new ApiClient({
    apiKey: config.apiKey,
  })

  const [users, workspaceAccounts] = await Promise.all([
    client.listUsers(),
    client.listAccounts(),
  ])

  // The generated accounts carry their onchain state so a node reads as the
  // account it names and completes in an editor. Only what a constellation
  // declares is ever pushed back, so this is for reading, not a declaration.
  //
  // Every account here holds code onchain: `/accounts` admits one only once
  // it has been seen to. That is what makes them safe to ask about, since
  // `/resolve` reads chain and cannot describe an address nothing was
  // deployed to. Nothing re-checks it — the listing carries no signal a
  // prediction would fail, so a proxy for it here would be one to trust
  // rather than one that works. Ask everything, and let it say when its
  // indexing has not reached one yet.
  const allAccounts = workspaceAccounts.flatMap((ws) => ws.accounts)
  const resolved = new Map<
    string,
    Awaited<ReturnType<typeof client.resolveConstellation>>['result'][number]
  >()

  if (allAccounts.length > 0) {
    const { result } = await client.resolveConstellation(
      workspaceAccounts[0].workspaceId, // any workspace works for the resolve route
      {
        accounts: allAccounts.map(({ chain, address }) => ({
          chain,
          address,
        })),
      }
    )

    // Aligned with the request, entry for entry.
    allAccounts.forEach((account, index) => {
      resolved.set(account.id, result[index])
    })
  }

  // Group accounts by type and then by chain into separate bracket-access
  // namespaces: `safes[chain]`, `rolesMods[chain]`, `delays[chain]`. This way
  // `eth.safe[...]` IntelliSense only suggests SAFE labels deployed on the
  // constellation's own chain, and the label-collision suffix only kicks in
  // where a label is genuinely ambiguous — same type, same chain.
  type AccountsByChain = Record<number, Record<string, unknown>>

  const accountsRecord: Record<string, unknown> = {}
  for (const ws of workspaceAccounts) {
    const safes: AccountsByChain = {}
    const rolesMods: AccountsByChain = {}
    const delays: AccountsByChain = {}

    const bucketsByType = {
      SAFE: safes,
      ROLES: rolesMods,
      DELAY: delays,
    } as const

    type NodeType = 'SAFE' | 'ROLES' | 'DELAY'
    const isNodeType = (type: string): type is NodeType =>
      type === 'SAFE' || type === 'ROLES' || type === 'DELAY'

    // Accounts we only know by address — Safe owners, external role
    // members, route targets — carry no label. They can't key a
    // label-addressed namespace, so they stay out of the codegen.
    // Vault entries always carry one.

    // Count labels per namespace so we only suffix collisions a constellation
    // could actually run into. Two safes named `Treasury` on different chains
    // never compete for a key, because a constellation only ever sees one of
    // those chains.
    const namespaceKey = (type: NodeType, chain: number) => `${type}:${chain}`
    const labelCounts = new Map<string, Map<string, number>>()

    for (const account of ws.accounts) {
      const { label } = account
      if (label == null || !isNodeType(account.type)) continue
      const key = namespaceKey(account.type, account.chain)
      let counts = labelCounts.get(key)
      if (!counts) {
        counts = new Map()
        labelCounts.set(key, counts)
      }
      counts.set(label, (counts.get(label) ?? 0) + 1)
    }

    for (const account of ws.accounts) {
      const { label } = account
      if (label == null || !isNodeType(account.type)) continue
      const onChain = resolved.get(account.id)
      const counts = labelCounts.get(namespaceKey(account.type, account.chain))
      const key =
        (counts?.get(label) ?? 0) > 1
          ? `${label} (${getAddress(account.address)})`
          : label
      const byChain = bucketsByType[account.type]
      const byLabel = (byChain[account.chain] ??= {})
      byLabel[key] = {
        id: account.id,
        label,
        address: account.address,
        chain: account.chain,
        vault: account.vault,
        ...(onChain?.type === 'SAFE' && {
          threshold: onChain.threshold,
          owners: [...onChain.owners],
          modules: [...onChain.modules],
        }),
      }
    }

    accountsRecord[ws.workspaceName] = {
      workspaceId: ws.workspaceId,
      workspaceName: ws.workspaceName,
      safes,
      rolesMods,
      delays,
    }
  }

  const nameCount = new Map<string, number>()
  for (const user of users) {
    nameCount.set(user.fullName, (nameCount.get(user.fullName) ?? 0) + 1)
  }

  const usersRecord: Record<string, unknown> = {}
  for (const user of users) {
    const handle =
      nameCount.get(user.fullName)! > 1
        ? `${user.fullName} (${user.id})`
        : user.fullName
    usersRecord[handle] = {
      id: user.id,
      fullName: user.fullName,
      personalSafes: user.personalSafes,
    }
  }

  const outDir = resolveZodiacDir(config.rootDir)

  mkdirSync(outDir, { recursive: true })

  // Pin CJS so `require()` works regardless of the parent package.json's type
  writeFileSync(
    join(outDir, 'package.json'),
    JSON.stringify(
      {
        type: 'commonjs',
        main: 'index.js',
        types: 'index.d.ts',
      },
      null,
      2
    )
  )

  // Use ts-morph to generate TS, then emit JS + d.ts
  const project = new Project({
    compilerOptions: {
      declaration: true,
      module: ModuleKind.CommonJS,
      target: ScriptTarget.ESNext,
      outDir,
    },
    useInMemoryFileSystem: true,
  })

  const sourceFile = project.createSourceFile('index.ts', '')

  sourceFile.addVariableStatement({
    isExported: true,
    declarationKind: VariableDeclarationKind.Const,
    declarations: [
      {
        name: 'users',
        initializer: `${toLiteral(usersRecord)} as const`,
      },
    ],
  })

  sourceFile.addVariableStatement({
    isExported: true,
    declarationKind: VariableDeclarationKind.Const,
    declarations: [
      {
        name: 'accounts',
        initializer: `${toLiteral(accountsRecord)} as const`,
      },
    ],
  })

  const emitResult = sourceFile.getEmitOutput()
  for (const outputFile of emitResult.getOutputFiles()) {
    const filePath = outputFile.getFilePath()
    const fileName = filePath.includes('.d.ts') ? 'index.d.ts' : 'index.js'
    let contents = outputFile.getText()
    // Augment the SDK's global `ZodiacGeneratedCodegen` interface so
    // `constellation()`'s default type parameter picks up these literal
    // shapes automatically.
    if (fileName === 'index.d.ts') {
      contents += `
declare global {
    interface ZodiacGeneratedCodegen {
        users: typeof users;
        accounts: typeof accounts;
    }
}
`
    }
    writeFileSync(join(outDir, fileName), contents)
  }
}
