import { describe, test, expect } from "vitest"
import { types, Instance, lazyInit } from "../../src/index.ts"
import { when } from "mobx"

function enhance(base: ReturnType<typeof createBase>) {
  return base
    .views(self => ({
      get upperName() {
        return self.name.toUpperCase()
      }
    }))
    .actions(self => ({
      increment() {
        self.count += 1
      }
    }))
}

function createBase() {
  return types.model("Base", {
    name: types.string,
    count: 0
  })
}

describe("lazyInit", () => {
  test("standalone lazyInit with full type inference", async () => {
    const Base = createBase()

    const LazyModel = lazyInit(Base, async () => enhance)

    await LazyModel.preload()

    const instance = LazyModel.create({ name: "hello" })

    const _nameCheck: string = instance.name
    const _upperCheck: string = instance.upperName
    const _countCheck: number = instance.count
    instance.increment()

    expect(instance.name).toBe("hello")
    expect(instance.upperName).toBe("HELLO")
    expect(instance.count).toBe(1)
  })

  test("class method lazyInit should work", async () => {
    const Base = types.model("Base2", {
      name: types.string,
      count: 0
    })

    const LazyModel = Base.lazyInit(async () => {
      return (base: typeof Base) =>
        base
          .views(self => ({
            get upperName() {
              return self.name.toUpperCase()
            }
          }))
          .actions(self => ({
            increment() {
              self.count += 1
            }
          }))
    })

    await LazyModel.preload()

    const instance = LazyModel.create({ name: "hello" })

    expect(instance.name).toBe("hello")
    expect((instance as any).upperName).toBe("HELLO")
    expect(instance.count).toBe(0)
    ;(instance as any).increment()
    expect(instance.count).toBe(1)
  })

  test("create before preload should work, views/actions arrive async", async () => {
    const Base = types.model("DeferredBase", {
      value: 0
    })

    const LazyModel = lazyInit(Base, async () => {
      return (base: typeof Base) =>
        base.views(self => ({
          get doubled() {
            return self.value * 2
          }
        }))
    })

    const instance = LazyModel.create({ value: 5 })

    // instance exists with properties but lazy views not yet available
    expect(instance.value).toBe(5)
    expect((instance as any).lazyLoaded).toBe(false)

    // wait for lazy loading to complete
    await when(() => (instance as any).lazyLoaded === true)

    expect((instance as any).doubled).toBe(10)
  })

  test("preload should be idempotent", async () => {
    let loadCount = 0
    const Base = types.model("IdempotentBase", {
      value: types.string
    })

    const LazyModel = lazyInit(Base, async () => {
      loadCount++
      return (base: typeof Base) =>
        base.views(self => ({
          get reversed() {
            return self.value.split("").reverse().join("")
          }
        }))
    })

    await LazyModel.preload()
    await LazyModel.preload()
    await LazyModel.preload()

    expect(loadCount).toBe(1)
  })

  test("should work with volatile state", async () => {
    const Base = types.model("VolatileBase", {
      name: types.string
    })

    const LazyModel = lazyInit(Base, async () => {
      return (base: typeof Base) =>
        base
          .volatile(() => ({
            tempValue: 42
          }))
          .views(self => ({
            get summary() {
              return `${self.name}: ${self.tempValue}`
            }
          }))
          .actions(self => ({
            setTemp(v: number) {
              self.tempValue = v
            }
          }))
    })

    await LazyModel.preload()

    const instance = LazyModel.create({ name: "test" })

    expect(instance.summary).toBe("test: 42")
    instance.setTemp(99)
    expect(instance.summary).toBe("test: 99")
  })

  test("should work with preProcessSnapshot and postProcessSnapshot", async () => {
    const Base = types.model("SnapshotBase", {
      value: 0
    })

    const LazyModel = lazyInit(Base, async () => {
      return (base: typeof Base) =>
        base
          .actions(self => ({
            setValue(v: number) {
              self.value = v
            }
          }))
          .preProcessSnapshot(snap => ({
            ...snap,
            value: (snap.value || 0) * 2
          }))
          .postProcessSnapshot(snap => ({
            ...snap,
            value: snap.value / 2
          }))
    })

    await LazyModel.preload()

    const instance = LazyModel.create({ value: 5 })

    // preProcessSnapshot doubled the input
    expect(instance.value).toBe(10)
  })

  test("should work with types.compose", async () => {
    const ModelA = types.model("A", { a: types.string })
    const ModelB = types.model("B", { b: types.number })

    const Composed = types.compose("Composed", ModelA, ModelB)

    const LazyComposed = lazyInit(Composed, async () => {
      return (base: typeof Composed) =>
        base.views(self => ({
          get combined() {
            return `${self.a}-${self.b}`
          }
        }))
    })

    await LazyComposed.preload()

    const instance = LazyComposed.create({ a: "hello", b: 42 })

    expect(instance.combined).toBe("hello-42")
  })

  test("model without lazyInit should work normally", () => {
    const Normal = types
      .model("Normal", { x: 0 })
      .views(self => ({
        get doubled() {
          return self.x * 2
        }
      }))

    const instance = Normal.create({ x: 5 })
    expect(instance.doubled).toBe(10)
  })

  test("lazyLoaded observable transitions from false to true", async () => {
    const Base = types.model("ObsBase", { x: 1 })

    const LazyModel = lazyInit(Base, async () => {
      return (base: typeof Base) =>
        base.views(self => ({
          get tripled() {
            return self.x * 3
          }
        }))
    })

    const instance = LazyModel.create({ x: 7 })
    expect((instance as any).lazyLoaded).toBe(false)

    await when(() => (instance as any).lazyLoaded === true)

    expect((instance as any).tripled).toBe(21)
  })
})
