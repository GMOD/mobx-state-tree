import { describe, expect, test, vi } from "vitest"

// mobx's minified production builds rename the administration's `values_`
// field (to `j` in mobx 7.0 and 7.1). Vitest loads the unminified build in dev
// and the minified one under NODE_ENV=production. These stand-ins rename the
// field, or hide it outright, in whichever build loads, to cover what a
// CommonJS consumer running in production gets.
const mode = vi.hoisted(() => ({ current: "renamed" as "renamed" | "hidden" }))
const getAtomCalls = vi.hoisted(() => ({ count: 0 }))

vi.mock("mobx", async importOriginal => {
  const mobx = await importOriginal<typeof import("mobx")>()
  const renamed = (adm: any) => {
    const real = "values_" in adm ? "values_" : "j"
    const exposed = (key: string | symbol) =>
      mode.current === "renamed" && key === "j"
    return new Proxy(adm, {
      get: (target, key) =>
        exposed(key)
          ? target[real]
          : key === real
            ? undefined
            : Reflect.get(target, key),
      ownKeys: target => [
        ...Reflect.ownKeys(target).filter(key => key !== real),
        ...(mode.current === "renamed" ? ["j"] : [])
      ],
      getOwnPropertyDescriptor: (target, key) =>
        exposed(key)
          ? Reflect.getOwnPropertyDescriptor(target, real)
          : key === real
            ? undefined
            : Reflect.getOwnPropertyDescriptor(target, key)
    })
  }
  return {
    ...mobx,
    _getAdministration: (thing: any, property?: string) =>
      renamed(mobx._getAdministration(thing, property)),
    getAtom: (thing: any, property?: string) => {
      getAtomCalls.count++
      return mobx.getAtom(thing, property)
    }
  }
})

// the setup file has already loaded src against the real mobx
async function load(as: "renamed" | "hidden") {
  vi.resetModules()
  mode.current = as
  return import("../../src/index.ts")
}

function exercise({
  getSnapshot,
  onSnapshot,
  types,
  unprotect
}: typeof import("../../src/index.ts")) {
  const Item = types.model("Item", { id: types.identifier, v: 0 })
  const Store = types.model("Store", {
    items: types.array(Item),
    label: types.stripDefault(types.string, "x")
  })
  const store = Store.create({ items: [{ id: "a" }, { id: "b", v: 2 }] })
  unprotect(store)
  const snapshots: unknown[] = []
  onSnapshot(store, s => snapshots.push(s))
  store.items[0]!.v = 1
  store.label = "y"
  return { snapshot: getSnapshot(store), snapshots }
}

const expected = {
  snapshot: {
    items: [
      { id: "a", v: 1 },
      { id: "b", v: 2 }
    ],
    label: "y"
  },
  snapshots: [
    {
      items: [
        { id: "a", v: 1 },
        { id: "b", v: 2 }
      ]
    },
    {
      items: [
        { id: "a", v: 1 },
        { id: "b", v: 2 }
      ],
      label: "y"
    }
  ]
}

function getAtomCallsToSnapshot({
  getSnapshot,
  types
}: typeof import("../../src/index.ts")) {
  const wide = types.model({ a: 1, b: 2, c: 3 }).create()
  getAtomCalls.count = 0
  getSnapshot(wide)
  return getAtomCalls.count
}

describe("a mobx build whose administration fields are minified", () => {
  test("finds the renamed property map", async () => {
    const mst = await load("renamed")
    expect(exercise(mst)).toEqual(expected)
    expect(getAtomCallsToSnapshot(mst)).toBe(0)
  })

  test("falls back to getAtom when there is no property map", async () => {
    const mst = await load("hidden")
    expect(exercise(mst)).toEqual(expected)
    expect(getAtomCallsToSnapshot(mst)).toBe(3)
  })
})
