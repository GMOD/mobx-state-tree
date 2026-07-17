import { test, expect } from "vitest"
import { autorun, isComputedProp } from "mobx"
import { types, extendInstance, getSnapshot, unprotect } from "../../src"

const Base = types.model("Base", { count: types.optional(types.number, 5) })

test("attaches views, actions and volatile state to a live instance", () => {
  const m = extendInstance(Base.create({ count: 5 }), self => ({
    state: { multiplier: 3 },
    views: {
      get scaled() {
        return (self as typeof m).count * (self as typeof m).multiplier
      }
    },
    actions: {
      bump() {
        ;(self as typeof m).count += 10
      },
      setMultiplier(v: number) {
        ;(self as typeof m).multiplier = v
      }
    }
  })) as ReturnType<typeof Base.create> & {
    multiplier: number
    scaled: number
    bump(): void
    setMultiplier(v: number): void
  }

  expect(m.scaled).toBe(15)
  expect(isComputedProp(m, "scaled")).toBe(true)
})

test("attached view is a reactive computed driven by attached actions", () => {
  const m = extendInstance(Base.create({ count: 5 }), self => {
    const s = self as any
    return {
      state: { multiplier: 3 },
      views: {
        get scaled() {
          return s.count * s.multiplier
        }
      },
      actions: {
        bump() {
          s.count += 10
        },
        setMultiplier(v: number) {
          s.multiplier = v
        }
      }
    }
  }) as any

  const seen: number[] = []
  const dispose = autorun(() => seen.push(m.scaled))
  m.bump() // count 5 -> 15
  m.setMultiplier(10) // multiplier 3 -> 10
  dispose()

  expect(seen).toEqual([15, 45, 150])
  expect(m.count).toBe(15)
})

test("write protection stays intact after augmentation", () => {
  const m = extendInstance(Base.create({ count: 1 }), () => ({
    views: { get double() {} }
  })) as any
  expect(() => {
    m.count = 99
  }).toThrow(/protected/)
})

test("augmentation does not affect the snapshot", () => {
  const m = extendInstance(Base.create({ count: 7 }), self => ({
    state: { volatileThing: 123 },
    views: {
      get view1() {
        return (self as any).count
      }
    },
    actions: {
      act1() {}
    }
  }))
  expect(getSnapshot(m)).toEqual({ count: 7 })
})

test("rejects invalid extension keys", () => {
  expect(() =>
    // @ts-expect-error 'nope' is not a valid extension field
    extendInstance(Base.create(), () => ({ nope: {} }))
  ).toThrow(/invalid key 'nope'/)
})

test("throws on non-model nodes", () => {
  const arr = types.array(types.number).create([1, 2, 3])
  unprotect(arr)
  expect(() => extendInstance(arr, () => ({ views: {} }))).toThrow(
    /can only be used on model instances/
  )
})
