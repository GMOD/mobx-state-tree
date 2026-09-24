import { describe, expect, test } from "vitest"
import {
  asArrayType,
  asMapType,
  asModelType,
  getPropertyMembers,
  getType,
  getUnionSubtypes,
  getWrappedType,
  isArrayType,
  isModelType,
  types,
  unwrapType,
  type IAnyType
} from "../../src"

const M = types.model("M", {
  id: types.identifier,
  xs: types.array(types.string)
})

describe("getWrappedType", () => {
  test("sees through each single-type wrapper", () => {
    const wrappers: IAnyType[] = [
      types.optional(M, { id: "a" }),
      types.stripDefault(M, { id: "a" }),
      types.refinement(M, () => true),
      types.snapshotProcessor(M, {}),
      types.late(() => M)
    ]
    for (const wrapper of wrappers) {
      expect(getWrappedType(wrapper)).toBe(M)
    }
  })

  test("has nothing to report for a type that picks its type per value", () => {
    expect(getWrappedType(types.union(M, types.string))).toBeUndefined()
    expect(getWrappedType(types.maybe(M))).toBeUndefined()
    expect(
      getWrappedType(types.resilient(M, types.frozen(), () => ({})))
    ).toBeUndefined()
  })

  test("has nothing to report for a type that wraps nothing", () => {
    expect(getWrappedType(M)).toBeUndefined()
    expect(getWrappedType(types.array(M))).toBeUndefined()
    expect(getWrappedType(types.string)).toBeUndefined()
  })

  test("reports a late type only once its definition resolves", () => {
    let definition: IAnyType | undefined
    const late = types.late(() => definition as IAnyType)
    expect(getWrappedType(late)).toBeUndefined()
    definition = M
    expect(getWrappedType(late)).toBe(M)
  })
})

describe("unwrapType", () => {
  test("strips stacked wrappers", () => {
    const stacked = types.stripDefault(
      types.snapshotProcessor(
        types.late(() => types.optional(M, { id: "a" })),
        {}
      ),
      { id: "a" }
    )
    expect(unwrapType(stacked)).toBe(M)
  })

  test("is the type a created node reports", () => {
    const wrappers = [
      types.optional(M, { id: "a" }),
      types.snapshotProcessor(M, {}),
      types.late(() => M),
      types.refinement(M, () => true)
    ]
    for (const wrapper of wrappers) {
      expect(getType(wrapper.create({ id: "a" }))).toBe(unwrapType(wrapper))
    }
  })

  test("leaves a type that wraps nothing alone", () => {
    const union = types.union(M, types.string)
    expect(unwrapType(union)).toBe(union)
    expect(unwrapType(M)).toBe(M)
  })
})

describe("as*Type", () => {
  test("reach an array, map or model through wrappers", () => {
    const xs = M.properties.xs
    expect(isArrayType(xs)).toBe(true)
    expect(asArrayType(xs)?.getChildType()).toBe(types.string)

    const map = types.map(M)
    expect(asMapType(types.optional(map, {}))).toBe(map)

    expect(
      asModelType(
        types.stripDefault(types.snapshotProcessor(M, {}), { id: "a" })
      )
    ).toBe(M)
  })

  test("do not guess through a union, where isXType still answers true", () => {
    const maybeArray = types.maybe(types.array(types.string))
    expect(isArrayType(maybeArray)).toBe(true)
    expect(asArrayType(maybeArray)).toBeUndefined()

    const models = types.union(M, types.model({ other: 1 }))
    expect(isModelType(models)).toBe(true)
    expect(asModelType(models)).toBeUndefined()
  })

  test("answer undefined for a different kind of type", () => {
    expect(asArrayType(M)).toBeUndefined()
    expect(asMapType(types.array(M))).toBeUndefined()
    expect(asModelType(types.string)).toBeUndefined()
  })
})

describe("reflection through wrappers", () => {
  test("getPropertyMembers reports a wrapped model's properties", () => {
    const { properties } = getPropertyMembers(
      types.optional(M, { id: "a" }) as unknown as typeof M
    )
    expect(Object.keys(properties)).toEqual(["id", "xs"])
  })

  test("getPropertyMembers reports no properties for a union of models", () => {
    const models = types.union(M, types.model({ other: 1 }))
    expect(
      getPropertyMembers(models as unknown as typeof M).properties
    ).toEqual({})
  })

  test("getUnionSubtypes sees through wrappers to the union", () => {
    const union = types.union(M, types.string)
    expect(getUnionSubtypes(types.optional(union, "x"))).toEqual([
      M,
      types.string
    ])
  })

  test("getUnionSubtypes does not mistake a resilient type for a union", () => {
    const resilient = types.resilient(
      types.union(M, types.string),
      types.frozen(),
      () => ({})
    )
    expect(() => getUnionSubtypes(resilient)).toThrow(
      "could not extract subtypes from union type"
    )
  })
})

describe.runIf(process.env.NODE_ENV !== "production")("compose", () => {
  test("rejects a part that only wraps a model", () => {
    const Other = types.model({ other: 1 })
    expect(() =>
      types.compose(M, types.optional(Other, {}) as unknown as typeof Other)
    ).toThrow("expected mobx-state-tree model type as argument 2")
  })
})
