# Zodiac Constellation — agent notes

This repo is a **Zodiac constellation**: a TypeScript description of an org's smart-account graph (Safes, mods, users, permissions). `npm run push` sends the spec to Zodiac, which diffs it against onchain state and gives a UI to review + sign the transactions.

User-facing docs are in `README.md` — read it before suggesting edits to `constellation/`.

## Project map

- `constellation/index.ts` — entrypoint. **Only exported values get pushed.**
- `constellation/roles/<role>/` — `members.ts` (addresses) + `permissions.ts`
  (a list of entries: `custom`, `defikit`, `swap`, `transfer` from
  `@zodiaceco/sdk/actions`, or a bare `allow` kit permission).
- `constellation/allowances/` — reusable Roles allowance objects (key, refill, period, ...).
  A permission draws on one by naming its key: `c.withinAllowance("usdc_payouts")`.
- `zodiac.config.ts` — contracts the `allow` kit should know about.
- `.zodiac/` — generated codegen; **never edit by hand**. Re-run `npm run pull` (or `pull-org` / `pull-contracts`) to refresh.

## Conventions

- Entries **describe, they never compile**. `defikit` stores a protocol, verb
  and parameters; `swap` stores its token lists. The permissions are built when
  the constellation is deployed, so a stored revision never carries a copy of
  what a preset meant on the day it was written.

- Import `constellation`, `allow`, `c` and the `Members` / `Permissions` types from `@zodiaceco/sdk`, the entries from `@zodiaceco/sdk/actions`.
- After editing `zodiac.config.ts` (contracts) or anything that changes referenced accounts/users, run `npm run pull` so the generated types match.
- Any package manager works: run the scripts with `npm run`, `pnpm`, `yarn` or `bun run`. The `zodiac` CLI loads `.env` itself.
- `npx zodiac push --dry-run` prints what would be pushed, without pulling or an API key: use it to check an edit.
