import { it, test, expect, describe } from "vitest"
import { configure } from "mobx"
import {
  types,
  hasParent,
  tryResolve,
  getSnapshot,
  applySnapshot,
  getType,
  setLivelinessChecking,
  SnapshotIn,
  Instance,
  IAnyType
} from "../../src"

const createTestFactories = () => {
  const Box = types.model("Box", {
    width: types.number,
    height: types.number
  })
  const Square = types.model("Square", {
    width: types.number
  })
  const Cube = types.model("Cube", {
    width: types.number,
    height: types.number,
    depth: types.number
  })
  const Plane = types.union(Square, Box)
  const Heighed = types.union(Box, Cube)
  const DispatchPlane = types.union(
    {
      dispatcher: snapshot => (snapshot && "height" in snapshot ? Box : Square)
    },
    Box,
    Square
  )
  const Block = types.model("Block", {
    list: types.array(Heighed)
  })
  return { Box, Square, Cube, Plane, DispatchPlane, Heighed, Block }
}
const createLiteralTestFactories = () => {
  const Man = types.model("Man", { type: types.literal("M") })
  const Woman = types.model("Woman", { type: types.literal("W") })
  const All = types.model("All", { type: types.string })
  const ManWomanOrAll = types.union(Man, Woman, All)
  return { Man, Woman, All, ManWomanOrAll }
}
if (process.env.NODE_ENV !== "production") {
  test("it should complain about multiple applicable types no dispatch method", () => {
    const { Box, Square } = createTestFactories()
    const PlaneNotEager = types.union({ eager: false }, Square, Box)
    expect(() => {
      PlaneNotEager.create({ width: 2, height: 2 })
    }).toThrow(/Error while converting/)
  })
}
test("it should have parent whenever creating or applying from a complex data structure to a model which has Union typed children", () => {
  const { Block, Heighed } = createTestFactories()
  const block = Block.create({
    list: [{ width: 2, height: 2 }]
  })
  const child = tryResolve(block, "./list/0")
  expect(hasParent(child)).toBe(true)
})
if (process.env.NODE_ENV !== "production") {
  test("it should complain about no applicable types", () => {
    const { Heighed } = createTestFactories()
    expect(() => {
      Heighed.create({ height: 2 } as any)
    }).toThrow(/Error while converting/)
  })
}
test("it should be smart enough to discriminate by keys", () => {
  const { Box, Plane, Square } = createTestFactories()
  const doc = types.union(Square, Box).create({ width: 2 })
  expect(Box.is(doc)).toEqual(false)
  expect(Square.is(doc)).toEqual(true)
})
test("it should discriminate by value type", () => {
  const Size = types.model("Size", {
    width: 0,
    height: 0
  })
  const Picture = types.model("Picture", {
    url: "",
    size: Size
  })
  const Square = types.model("Square", {
    size: 0
  })
  const PictureOrSquare = types.union(Picture, Square)
  const doc = PictureOrSquare.create({ size: { width: 0, height: 0 } })
  expect(Picture.is(doc)).toEqual(true)
  expect(Square.is(doc)).toEqual(false)
})
test("it should compute exact union types", () => {
  const { Box, Plane, Square } = createTestFactories()
  expect(Plane.is(Box.create({ width: 3, height: 2 }))).toEqual(true)
  expect(Plane.is(Square.create({ width: 3 }))).toEqual(true)
})
test("it should compute exact union types - 2", () => {
  const { Box, DispatchPlane, Square } = createTestFactories()
  expect(DispatchPlane.is(Box.create({ width: 3, height: 2 }))).toEqual(true)
  expect(
    DispatchPlane.is(
      Square.create(
        { width: 3, height: 2 } as any /* incorrect type, superfluous attr!*/
      )
    )
  ).toEqual(true)
})
test("it should use dispatch to discriminate", () => {
  const { Box, DispatchPlane, Square } = createTestFactories()
  const a = DispatchPlane.create({ width: 3 })
  expect(getSnapshot(a)).toEqual({ width: 3 })
})

test("it should eagerly match by ambiguos value", () => {
  const { ManWomanOrAll, All, Man } = createLiteralTestFactories()
  const person = ManWomanOrAll.create({ type: "Z" })
  expect(All.is(person)).toEqual(true)
  expect(Man.is(person)).toEqual(false)
})

test("it should eagerly match by ambiguos value - 2", () => {
  const { All, Man } = createLiteralTestFactories()
  const person = types.union(All, Man).create({ type: "M" })
  expect(All.is(person)).toEqual(true)
  expect(Man.is(person)).toEqual(false) // not matched, All grabbed everything!
})

test("it should eagerly match by value literal", () => {
  const { ManWomanOrAll, All, Man } = createLiteralTestFactories()
  const person = ManWomanOrAll.create({ type: "M" })
  expect(All.is(person)).toEqual(false)
  expect(Man.is(person)).toEqual(true)
})

test("dispatch", () => {
  const Odd = types
    .model({
      value: types.number
    })
    .actions(self => ({
      isOdd() {
        return true
      },
      isEven() {
        return false
      }
    }))
  const Even = types.model({ value: types.number }).actions(self => ({
    isOdd() {
      return false
    },
    isEven() {
      return true
    }
  }))
  const Num = types.union(
    { dispatcher: snapshot => (snapshot.value % 2 === 0 ? Even : Odd) },
    Even,
    Odd
  )
  expect(Num.create({ value: 3 }).isOdd()).toBe(true)
  expect(Num.create({ value: 3 }).isEven()).toBe(false)
  expect(Num.create({ value: 4 }).isOdd()).toBe(false)
  expect(Num.create({ value: 4 }).isEven()).toBe(true)
  if (process.env.NODE_ENV !== "production") {
    expect(() => {
      types.union(
        ((snapshot: any) => (snapshot.value % 2 === 0 ? Even : Odd)) as any, // { dispatcher: snapshot => (snapshot.value % 2 === 0 ? Even : Odd) },
        Even,
        Odd
      )
    }).toThrow("expected object")
  }
})

test("961 - apply snapshot to union should not throw when union keeps models with different properties and snapshot is got by getSnapshot", () => {
  const Foo = types.model({ foo: 1 })
  const Bar = types.model({ bar: 1 })
  const U = types.union(Foo, Bar)

  const u = U.create({ foo: 1 })
  applySnapshot(u, getSnapshot(Bar.create()))
})

// `noMatchMessage` is the throw path used in prod builds when `determineType`
// returns undefined (typecheck is a no-op in NODE_ENV=production, so the
// detailed "Error while converting" message from typecheck() never runs).
// Without these diagnostics the prod-only failure is "No matching type for
// union (…) for snapshot with type 'X'" — useless for debugging which field
// is actually wrong.
describe("noMatchMessage diagnostics", () => {
  const A = types.model("A", {
    type: types.literal("A"),
    n: types.number,
    s: types.maybe(types.string)
  })
  const B = types.model("B", {
    type: types.literal("B"),
    flag: types.boolean
  })
  const Untagged = types.model("Untagged", {
    width: types.number
  })

  function noMatchMessage(union: any, snapshot: unknown): string {
    return union.noMatchMessage(snapshot)
  }

  test("when snapshot's `type` discriminator picks exactly one candidate, the message lists that candidate's per-property errors", () => {
    const U = types.union(A, B)
    const msg = noMatchMessage(U, { type: "A", n: "not-a-number" })
    expect(msg).toMatch(
      /No matching type for union .* for snapshot with type "A"/
    )
    // Bullets point at the offending property of the matched candidate
    expect(msg).toContain('at path "/n"')
    expect(msg).toContain("not-a-number")
    // And do NOT include B's errors — we filtered to the single candidate
    expect(msg).not.toContain('at path "/flag"')
  })

  test("missing required property is reported as the matched candidate's error", () => {
    const U = types.union(A, B)
    const msg = noMatchMessage(U, { type: "A" })
    expect(msg).toMatch(/for snapshot with type "A"/)
    expect(msg).toContain('at path "/n"')
  })

  test("when no union member declares a matching literal `type`, falls back to the short message", () => {
    const U = types.union(A, B)
    const msg = noMatchMessage(U, { type: "Nope", n: 1 })
    expect(msg).toMatch(
      /^No matching type for union .* for snapshot with type "Nope"$/
    )
  })

  test("when the snapshot is not a plain object or has no `type` field, falls back to the short message", () => {
    const U = types.union(A, B)
    expect(noMatchMessage(U, 42)).toMatch(/^No matching type for union /)
    expect(noMatchMessage(U, { n: 1 })).toMatch(/^No matching type for union /)
  })

  test("when the discriminator is ambiguous (two candidates share the literal), falls back to the short message rather than picking arbitrarily", () => {
    const A1 = types.model("A1", { type: types.literal("A"), x: types.number })
    const A2 = types.model("A2", { type: types.literal("A"), y: types.string })
    const U = types.union(A1, A2)
    const msg = noMatchMessage(U, { type: "A" })
    expect(msg).toMatch(
      /^No matching type for union .* for snapshot with type "A"$/
    )
  })

  test("union members without a literal `type` property are skipped during candidate selection", () => {
    const U = types.union(Untagged, A)
    // Snapshot's `type` matches A's literal, Untagged has no `type` literal.
    const msg = noMatchMessage(U, { type: "A", n: "bad" })
    expect(msg).toContain('at path "/n"')
  })

  if (process.env.NODE_ENV !== "production") {
    test("the diagnostic message is what gets thrown from instantiate() when determineType returns undefined", () => {
      const U = types.union(A, B)
      // Bypass typecheckInternal (which would throw with the dev-mode
      // "Error while converting" message first) by calling instantiate
      // directly, mimicking the prod-build code path.
      expect(() => {
        ;(U as any).instantiate(null, "", undefined, {
          type: "A",
          n: "not-a-number"
        })
      }).toThrow(/for snapshot with type "A"[\s\S]*at path "\/n"/)
    })
  }
})

// Real-world discriminated unions rarely hold bare models: jbrowse config
// schemas are always optional(model) or optional(snapshotProcessor(model)).
// resolveModelType() drills through those wrappers so the `type` discriminator
// still scopes both the create()-time validation error and the prod-build
// noMatchMessage to the single intended member.
describe("discriminated-union scoping through optional/snapshotProcessor wrappers", () => {
  const A = types.optional(
    types.model("A", { type: types.literal("A"), n: types.number }),
    { type: "A", n: 0 }
  )
  const B = types.optional(
    types.model("B", { type: types.literal("B"), flag: types.boolean }),
    { type: "B", flag: false }
  )

  function createError(union: any, snapshot: unknown): string {
    try {
      union.create(snapshot)
    } catch (e) {
      return String(e)
    }
    throw new Error("expected create() to throw")
  }

  // create()-time validation only runs when type checking is enabled, which is
  // off in NODE_ENV=production builds (the repo's test:prod run). Gate the
  // throw-asserting cases the same way the rest of this file does.
  test("create() error is scoped to the member matching the `type` discriminator", () => {
    if (process.env.NODE_ENV !== "production") {
      const U = types.union(A, B)
      const msg = createError(U, { type: "A", n: "not-a-number" })
      expect(msg).toContain('at path "/n"')
      expect(msg).toContain("not-a-number")
      // The wall — every member's full structure + "No type is applicable" — is
      // exactly what wrapped members used to produce. It must be gone.
      expect(msg).not.toContain("No type is applicable for the union")
      expect(msg).not.toContain('at path "/flag"')
    }
  })

  test("scoping also drills through snapshotProcessor wrappers", () => {
    if (process.env.NODE_ENV !== "production") {
      const P = types.optional(
        types.snapshotProcessor(
          types.model("P", { type: types.literal("P"), n: types.number }),
          { preProcessor: (sn: any) => sn }
        ),
        { type: "P", n: 0 }
      )
      const Q = types.optional(
        types.model("Q", { type: types.literal("Q"), s: types.string }),
        { type: "Q", s: "" }
      )
      const U = types.union(P, Q)
      const msg = createError(U, { type: "P", n: "not-a-number" })
      expect(msg).toContain('at path "/n"')
      expect(msg).not.toContain("No type is applicable for the union")
    }
  })

  test("a valid snapshot for the discriminated member still succeeds", () => {
    const U = types.union(A, B)
    expect(() => U.create({ type: "B", flag: true })).not.toThrow()
  })

  test("non-eager union still detects ambiguity when a catch-all also matches", () => {
    if (process.env.NODE_ENV !== "production") {
      // Catch carries a non-literal `type`, so { type: "A", n: 0 } validates
      // clean for BOTH A and Catch. A non-eager union must report that as
      // ambiguous rather than short-circuiting to A on the discriminator match.
      const Catch = types.optional(
        types.model("Catch", { type: types.string, n: types.number }),
        { type: "", n: 0 }
      )
      const U = types.union({ eager: false }, A, Catch)
      expect(() => U.create({ type: "A", n: 0 })).toThrow(
        "No type is applicable for the union"
      )
    }
  })

  test("an untagged catch-all member is not pre-empted by a failed discriminator match", () => {
    // C carries no literal `type`, so it can legitimately absorb { type: "A" }
    // shapes that A rejects. The union is not fully discriminated, so a failed
    // A-match must fall through rather than short-circuit to A's errors.
    const C = types.optional(
      types.model("C", { type: types.string, extra: types.string }),
      { type: "", extra: "" }
    )
    const U = types.union(A, C)
    expect(() =>
      U.create({ type: "A", n: "bad", extra: "ok" } as any)
    ).not.toThrow()
  })
})

// End-to-end simulation of the real jbrowse-components setup that motivated the
// scoping fix. jbrowse's ConfigurationSchema(name, slots, {explicitlyTyped})
// returns types.optional(model, default) where the model carries
// `type: types.optional(types.literal(name), name)` and always has a
// postProcessSnapshot (and sometimes a preProcessSnapshot) baked in. A union of
// those is what backs `pluginManager.pluggableConfigSchemaType('display')` etc.
// Unpatched, the optional()/processor wrappers fail the `instanceof ModelType`
// gate, so a single bad slot dumped every member's full structure. These tests
// assert the error is scoped to the one member the `type` discriminator names.
describe("jbrowse ConfigurationSchema union scoping (end-to-end simulation)", () => {
  function ConfigurationSchema(
    name: string,
    slots: Record<string, IAnyType>,
    opts: { preProcessor?: (s: any) => any } = {}
  ): IAnyType {
    let model: any = types.model(name, {
      type: types.optional(types.literal(name), name),
      ...slots
    })
    // jbrowse applies postProcessSnapshot to every schema unconditionally
    model = model.postProcessSnapshot((snap: any) => snap)
    if (opts.preProcessor) {
      model = model.preProcessSnapshot(opts.preProcessor)
    }
    return types.optional(model, { type: name })
  }

  const Wiggle = ConfigurationSchema("LinearWiggleDisplay", {
    height: types.optional(types.number, 100),
    color: types.optional(types.string, "blue")
  })
  const Basic = ConfigurationSchema("LinearBasicDisplay", {
    height: types.optional(types.number, 100),
    trackLabel: types.optional(types.string, "")
  })
  const Alignments = ConfigurationSchema("LinearAlignmentsDisplay", {
    height: types.optional(types.number, 100),
    showSoftClipping: types.optional(types.boolean, false)
  })
  // mirrors a schema with a preProcessSnapshot (e.g. the showLabels slot)
  const Snp = ConfigurationSchema(
    "LinearSNPCoverageDisplay",
    { height: types.optional(types.number, 100) },
    { preProcessor: (s: any) => s }
  )
  const DisplayUnion = types.union(Wiggle, Basic, Alignments, Snp)

  test("a bad slot is scoped to the member named by `type`, not a wall", () => {
    if (process.env.NODE_ENV !== "production") {
      let msg = "NO THROW"
      try {
        DisplayUnion.create({
          type: "LinearWiggleDisplay",
          height: "tall"
        } as any)
      } catch (e) {
        msg = String(e)
      }
      // the one real reason, scoped to the right member
      expect(msg).toContain('at path "/height"')
      expect(msg).toContain("is not assignable to type: `number`")
      // the wall must be gone: no "No type is applicable", and no other
      // member's structure leaking into the message
      expect(msg).not.toContain("No type is applicable for the union")
      expect(msg).not.toContain("trackLabel")
      expect(msg).not.toContain("showSoftClipping")
    }
  })

  test("scoping holds for a member wrapped with a preProcessSnapshot", () => {
    if (process.env.NODE_ENV !== "production") {
      let msg = "NO THROW"
      try {
        DisplayUnion.create({
          type: "LinearSNPCoverageDisplay",
          height: "tall"
        } as any)
      } catch (e) {
        msg = String(e)
      }
      expect(msg).toContain('at path "/height"')
      expect(msg).not.toContain("No type is applicable for the union")
    }
  })

  test("a valid display snapshot resolves to the discriminated member", () => {
    const node = DisplayUnion.create({
      type: "LinearAlignmentsDisplay",
      showSoftClipping: true
    })
    expect((node as { type: string }).type).toBe("LinearAlignmentsDisplay")
  })
})

describe("1045 - secondary union types with applySnapshot and ids", () => {
  function initTest(
    useSnapshot: boolean,
    useCreate: boolean,
    submodel1First: boolean,
    type: number
  ) {
    setLivelinessChecking("error")

    const Submodel1NoSP = types.model("Submodel1", {
      id: types.identifier,
      extraField1: types.string,
      extraField2: types.maybe(types.string)
    })

    const Submodel1SP = types.snapshotProcessor(Submodel1NoSP, {
      preProcessor(sn: SnapshotIn<Instance<typeof Submodel1NoSP>>) {
        const { id, extraField1, extraField2 } = sn
        return {
          id,
          extraField1: extraField1.toUpperCase(),
          extraField2: extraField2?.toUpperCase()
        }
      }
    })

    const Submodel2NoSP = types.model("Submodel2", {
      id: types.identifier,
      extraField1: types.maybe(types.string),
      extraField2: types.string
    })

    const Submodel2SP = types.snapshotProcessor(Submodel2NoSP, {
      preProcessor(sn: SnapshotIn<Instance<typeof Submodel2NoSP>>) {
        const { id, extraField1, extraField2 } = sn
        return {
          id,
          extraField1: extraField1?.toUpperCase(),
          extraField2: extraField2.toUpperCase()
        }
      }
    })

    const Submodel1 = useSnapshot ? Submodel1SP : Submodel1NoSP
    const Submodel2 = useSnapshot ? Submodel2SP : Submodel2NoSP

    const Submodel = submodel1First
      ? types.union(Submodel1, Submodel2)
      : types.union(Submodel2, Submodel1)

    const Model = types.array(Submodel)

    const store = Model.create([{ id: "id1", extraField1: "extraField1" }])

    return {
      store,
      applySn: function () {
        const sn1 = {
          id: "id1",
          extraField1: "new extraField1",
          extraField2: "some value"
        }
        const sn2 = {
          id: "id1",
          extraField1: undefined,
          extraField2: "some value"
        }
        const sn = type === 1 ? sn1 : sn2
        const submodel = type === 1 ? Submodel1 : Submodel2
        const expected = useSnapshot
          ? {
              id: sn.id,
              extraField1: sn.extraField1?.toUpperCase(),
              extraField2: sn.extraField2?.toUpperCase()
            }
          : sn

        applySnapshot(store, [useCreate ? (submodel as any).create(sn) : sn])

        expect(store.length).toBe(1)
        expect(store[0]).toEqual(expected)
        expect(getType(store[0])).toBe(
          useSnapshot ? submodel.getSubTypes() : submodel
        )
      }
    }
  }

  for (const useSnapshot of [false, true]) {
    describe(
      useSnapshot ? "with snapshotProcessor" : "without snapshotProcessor",
      () => {
        for (const submodel1First of [true, false]) {
          describe(
            submodel1First ? "submodel1 first" : "submodel2 first",
            () => {
              for (const useCreate of [false, true]) {
                describe(
                  useCreate ? "using create" : "not using create",
                  () => {
                    for (const type of [2, 1]) {
                      describe(`snapshot is of type Submodel${type}`, () => {
                        it(`apply snapshot works when the node is not touched`, () => {
                          configure({
                            useProxies: "never"
                          })

                          const t = initTest(
                            useSnapshot,
                            useCreate,
                            submodel1First,
                            type
                          )
                          t.applySn()
                        })

                        it(`apply snapshot works when the node is touched`, () => {
                          configure({
                            useProxies: "never"
                          })

                          const t = initTest(
                            useSnapshot,
                            useCreate,
                            submodel1First,
                            type
                          )
                          // tslint:disable-next-line:no-unused-expression
                          t.store[0]
                          t.applySn()
                        })
                      })
                    }
                  }
                )
              }
            }
          )
        }
      }
    )
  }
})
