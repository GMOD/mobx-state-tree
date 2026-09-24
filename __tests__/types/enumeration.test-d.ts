// Type-only tests for `types.enumeration`'s inference. Checked by
// `pnpm test:types`.

import { types, type Instance } from "../../src/index.ts"

type Equal<X, Y> =
  (<T>() => T extends X ? 1 : 2) extends <T>() => T extends Y ? 1 : 2
    ? true
    : false
// an enum and the union of its members are the same set but not always
// `Equal`, so enums are compared by mutual assignability
type Same<X, Y> = [X] extends [Y] ? ([Y] extends [X] ? true : false) : false
function expectType<T extends true>(): T | void {}

enum Color {
  Red = "red",
  Blue = "blue"
}

const unnamed = types.enumeration(["a", "b"])
expectType<Equal<Instance<typeof unnamed>, "a" | "b">>()

const named = types.enumeration("E", ["a", "b"])
expectType<Equal<Instance<typeof named>, "a" | "b">>()

// a readonly array, in either form, rather than spreading it into a copy
const values = ["x", "y"] as const
const fromConstUnnamed = types.enumeration(values)
const fromConstNamed = types.enumeration("XY", values)
expectType<Equal<Instance<typeof fromConstUnnamed>, "x" | "y">>()
expectType<Equal<Instance<typeof fromConstNamed>, "x" | "y">>()

// a string enum, with or without an explicit type argument
const fromEnum = types.enumeration("Color", Object.values(Color))
const fromEnumExplicit = types.enumeration<Color>(Object.values(Color))
expectType<Same<Instance<typeof fromEnum>, Color>>()
expectType<Same<Instance<typeof fromEnumExplicit>, Color>>()

// only an array already widened to string[] falls back to string
const loose: string[] = ["q"]
const fromLoose = types.enumeration(loose)
expectType<Equal<Instance<typeof fromLoose>, string>>()

// @ts-expect-error not a member
named.create("c")
