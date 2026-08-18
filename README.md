# Zodiac OS SDK

Programmatically manage [Zodiac](https://www.zodiac.eco) account constellations.

## Getting started

### 1. Install

```bash
npm install @zodiaceco/sdk
```

### 2. Authorize project

```bash
zodiac init
```

Opens a browser tab so you can sign in, pick the org you want to use, and approve a new API key. The key (and matching `ZODIAC_API_URL`) are written to a `.env` file in your project root — labeled after the directory so you can find and revoke it later from [app.zodiac.eco/admin/api-keys](https://app.zodiac.eco/admin/api-keys).

**IMPORTANT:** Make sure to add `.env` to your `.gitignore`.

### 3. Create a config file

Create a `zodiac.config.ts` in your project root.

```ts
import { defineConfig } from '@zodiaceco/sdk/cli/config'

export default defineConfig({
  contracts: {
    mainnet: {
      dai: '0x6B175474E89094C44Da98b954EedeAC495271d0F',
    },
  },
})
```

### 4. Pull your org data

```bash
# Pull everything (org data + contract ABIs)
zodiac pull
```

This generates typed data in `.zodiac/` at your project root with your org's users and accounts (workspace vaults plus accounts that have been applied via a constellation). Add `.zodiac/` to your `.gitignore`.

## Constellation API

The `constellation()` function is the main SDK entry point. It returns an API for declaring account constellations — the set of Safes, Roles mods, and users that make up your on-chain setup.

```ts
import { constellation } from '@zodiaceco/sdk'
```

### Scoping to a workspace and chain

Each constellation is scoped to a single workspace and chain. The `workspace` option must be a valid workspace name from your org.

```ts
const eth = constellation({
  workspace: 'GG',
  label: 'Production',
  chain: 1,
})
```

### Referencing existing accounts

Bracket access gives you existing Safes and Roles mods from the selected workspace — both **vault accounts** (manually-promoted entries surfaced in the workspace UI) and any **constellation accounts** previously created by a `push()`. The codegen records them under the same `accounts` map, marked with a `vault` flag for the subset that are also workspace vaults. Names auto-complete from the codegen output.

```ts
// Reference an existing Safe — no invocation needed
const ggDao = eth.safe['GG DAO']

// Reference an existing Roles mod
const ggDaoRoles = eth.roles['GG DAO Roles']

// Optionally invoke with overrides
const ggDaoOverridden = eth.safe['GG DAO']({ threshold: 5 })
```

> `bun push` runs `pull-org` first via the `prepush` hook, so re-pushing always sees the freshest existing-account values from your org.

### Creating new accounts

Use bracket access with a new label to create new nodes. Every mandatory field (`nonce`, `threshold`, `owners` for Safes; `nonce` for Roles mods) must be supplied explicitly — the SDK does not inject any runtime defaults. The type system surfaces a missing field as a compile-time error so you can't ship an incomplete spec.

```ts
// New Safe — nonce, threshold, owners are required
const newSafe = eth.safe['New Safe']({
  nonce: 0n,
  threshold: 2,
  owners: [
    eth.user['Alice Sample'],
    '0xb8e48df6818d3cbc648b3e8ec248a4f547135f7a',
  ],
  modules: [ggDaoRoles],
})

// New Roles mod targeting an existing Safe
const newRoles = eth.roles['New Roles']({
  nonce: 0n,
  target: ggDao,
})
```

When a bracket label matches an existing account from your codegen, all overrides become optional — you pass only the fields you want to change against the live configuration.

### Circular references between new nodes

New nodes can reference each other before either has been invoked — use the uninvoked factory as a forward reference:

```ts
const safe = eth.safe['New Safe']({
  nonce: 0n,
  threshold: 1,
  owners: [eth.user['Alice Sample']],
  // Forward reference to a Roles mod that doesn't exist yet
  modules: [eth.roles['New Roles']],
})

const roles = eth.roles['New Roles']({
  nonce: 0n,
  target: safe,
})
```

References are resolved by label at `push()` time, so both sides of the cycle must be included in the call.

### Referencing users

`eth.user[handle]` resolves a user to their personal Safe address on the current chain:

```ts
const aliceAddress = eth.user['Alice Sample']
```

### Pushing the constellation

The `push()` function takes all nodes and sends them to the Zodiac OS API. Pass either a named object (keys become refs) or an array:

```ts
import { push } from '@zodiaceco/sdk'

await push({ ggDao, ggDaoRoles, newSafe, newRoles })
```

All referenced nodes must be included in the `push()` call.

By default, `push()` creates an API client from the `ZODIAC_API_KEY` environment variable. You can pass a custom client:

```ts
await push({ ggDao, newRoles }, { api: new ApiClient({ apiKey: '...' }) })
```

## CLI reference

```
Usage: zodiac [options] [command]

Zodiac SDK CLI – pull org data and contract ABIs

Options:
  -V, --version        output the version number
  -c, --config <path>  path to the config file (default: "zodiac.config.ts")
  -h, --help           display help for command

Commands:
  init                 Authorize this directory with a Zodiac org. Opens a browser to mint an API key and writes it to .env.
  pull-org             Fetch Zodiac users and accounts, generate TypeScript types
  pull-contracts       Fetch contract ABIs, generate typed permissions kit
  pull                 Fetch Zodiac org and contracts ABI, generate SDK functions
  help [command]       display help for command
```
