import type { ApplyConstellationPayload } from '@zodiaceco/api-types'

// Extract the "new ROLES" spec variant (has required nonce) to avoid union duplication
type ApiNewRolesSpec = Extract<
  ApplyConstellationPayload['specification'][number],
  { type: 'ROLES'; nonce: string }
>

/** A role definition in the API's serialized format (bigints as template literal strings). */
export type ApiRoleSpec = Extract<
  NonNullable<ApiNewRolesSpec['roles']>,
  readonly any[]
>[number]

/** An allowance definition in the API's serialized format (bigints as template literal strings). */
export type ApiAllowanceSpec = Extract<
  NonNullable<ApiNewRolesSpec['allowances']>,
  readonly any[]
>[number]

/** Recursively converts `${bigint}` template literal strings to `bigint`. */
type RealBigints<T> = T extends `${bigint}`
  ? bigint
  : T extends readonly (infer U)[]
    ? RealBigints<U>[]
    : T extends Record<string, any>
      ? { [K in keyof T]: RealBigints<T[K]> }
      : T

/** A role definition with bigint fields as actual bigints. */
export type RoleSpec = RealBigints<ApiRoleSpec>

/** An allowance definition with bigint fields as actual bigints. */
export type AllowanceSpec = RealBigints<ApiAllowanceSpec>
