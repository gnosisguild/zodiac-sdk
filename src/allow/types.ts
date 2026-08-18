import type { BigNumberish, BytesLike, ParamType } from 'ethers'
import type {
  Condition,
  FunctionPermission,
  TargetPermission,
} from 'zodiac-roles-sdk'

export type Options = {
  send?: boolean
  delegatecall?: boolean
  etherWithinAllowance?: `0x${string}`
  callWithinAllowance?: `0x${string}`
}

export type PrimitiveValue = BigNumberish | BytesLike | string | boolean

// Signature matches `zodiac-roles-sdk` so values from `c.*` are assignable.
export type ConditionFunction<T = unknown> = (
  abiType: ParamType,
  _?: T
) => Condition

type RequireAtLeastOne<T> = {
  [K in keyof T]-?: Required<Pick<T, K>> & Partial<Pick<T, Exclude<keyof T, K>>>
}[keyof T]

type ArrayElement<T extends readonly unknown[]> = T extends readonly (infer U)[]
  ? U
  : never

export type PrimitiveScoping<T extends PrimitiveValue> =
  | T
  | ConditionFunction<T>

export type ArrayScoping<T extends readonly any[]> =
  | readonly Scoping<ArrayElement<T>>[]
  | ConditionFunction<T>

export type StructScoping<T extends { [key: string]: any }> =
  | RequireAtLeastOne<{ [K in keyof T]?: Scoping<T[K]> }>
  | ConditionFunction<T>

export type Scoping<T> = T extends PrimitiveValue
  ? PrimitiveScoping<T>
  : T extends readonly any[]
    ? ArrayScoping<T>
    : T extends { [key: string]: any }
      ? StructScoping<T>
      : unknown

export type { FunctionPermission, TargetPermission }

export const EVERYTHING = Symbol.for('@zodiaceco/allow-kit/EVERYTHING')
export type EVERYTHING = typeof EVERYTHING
