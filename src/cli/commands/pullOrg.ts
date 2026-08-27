import type { ResolvedConfig } from '../config'
import { ApiClient } from '../../api'
import { invariant } from '@epic-web/invariant'
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
        `${childPad}${/^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(k) ? k : JSON.stringify(k)}: ${toLiteral(v, indent + 1)}`
    )
    return `{\n${props.join(',\n')},\n${pad}}`
  }
  return String(value)
}

export const pullOrg = async (config: ResolvedConfig) => {
  const client = new ApiClient({
    apiKey: config.apiKey,
  })

  const [users, workspaceAccounts] = await Promise.all([
    client.listUsers(),
    client.listAccounts(),
  ])

  // Fetch fresh on-chain state via `resolveConstellation` for every
  // account we can resolve:
  //   - `spec` present → pass the stored apply-time node verbatim
  //     (deployed nodes match on-chain; undeployed ones derive via
  //     CREATE2 from the stored nonce + config).
  //   - a deployed or modified `vault: true` with no spec → treat as a
  //     pre-existing on-chain SAFE. The resolver finds it on-chain.
  //   - a draft or pending vault, or a constituent with no spec → it may only
  //     have a predicted address. Skip resolution and emit minimal fields.
  const allAccounts = workspaceAccounts.flatMap((ws) => ws.accounts)
  const resolvableAccounts = allAccounts.filter(
    (account) =>
      account.spec != null ||
      (account.vault &&
        'deploymentState' in account &&
        (account.deploymentState === 'Deployed' ||
          account.deploymentState === 'Modified'))
  )
  const resolved = new Map<
    string,
    Awaited<ReturnType<typeof client.resolveConstellation>>['result'][number]
  >()
  if (resolvableAccounts.length > 0) {
    const response = await client.resolveConstellation(
      workspaceAccounts[0].workspaceId, // any workspace works for the resolve route
      {
        specification: resolvableAccounts.map((account, i) =>
          account.spec != null
            ? account.spec
            : {
                // Synthesize a ref for vault-fallback entries (no stored
                // spec). The /resolve payload requires a ref on every
                // entry; the value isn't used downstream beyond echoing
                // back into the response, so a positional id is fine.
                ref: `vault_${i}` as Lowercase<string>,
                type: 'SAFE',
                chain: account.chain,
                address: account.address,
              }
        ),
      }
    )
    invariant(
      response?.result?.length === resolvableAccounts.length,
      `resolveConstellation returned ${response?.result?.length ?? 0} accounts for ${resolvableAccounts.length} accounts`
    )
    resolvableAccounts.forEach((account, i) => {
      resolved.set(account.id, response.result[i])
    })
  }

  // Group accounts by type into separate bracket-access namespaces:
  // `safes`, `rolesMods`, `delays`. This way `eth.safe[...]`
  // IntelliSense only suggests SAFE labels, and the label-collision
  // suffix only kicks in when two accounts **of the same type** share
  // a label.
  const accountsRecord: Record<string, unknown> = {}
  for (const ws of workspaceAccounts) {
    const safes: Record<string, unknown> = {}
    const rolesMods: Record<string, unknown> = {}
    const delays: Record<string, unknown> = {}

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

    // Count labels per type so we only suffix within-type collisions.
    const labelCountByType: Record<NodeType, Map<string, number>> = {
      SAFE: new Map(),
      ROLES: new Map(),
      DELAY: new Map(),
    }
    for (const account of ws.accounts) {
      const { label } = account
      if (label == null || !isNodeType(account.type)) continue
      const counts = labelCountByType[account.type]
      counts.set(label, (counts.get(label) ?? 0) + 1)
    }

    for (const account of ws.accounts) {
      const { label } = account
      if (label == null || !isNodeType(account.type)) continue
      const onChain = resolved.get(account.id)
      const counts = labelCountByType[account.type]
      const key =
        (counts.get(label) ?? 0) > 1
          ? `${label} (${getAddress(account.address)})`
          : label
      bucketsByType[account.type][key] = {
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
