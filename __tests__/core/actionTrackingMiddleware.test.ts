import { describe, expect, test } from "vitest"

import {
  addMiddleware,
  createActionTrackingMiddleware,
  flow,
  types
} from "../../src/index.ts"

const Store = types.model({ n: 0 }).actions(self => ({
  setSync(n: number) {
    self.n = n
  },
  // named generators: `flow` takes the middleware event name from generator.name
  setAsync: flow(function* setAsync(n: number) {
    yield Promise.resolve()
    self.n = n
  }),
  failAsync: flow(function* failAsync() {
    yield Promise.resolve()
    throw new Error("boom")
  })
}))

/**
 * Records `<tag>:<hook>:<context>` so a middleware that reads another
 * middleware's context shows up as a mismatched tag.
 */
function tracker(log: string[], tag: string) {
  return createActionTrackingMiddleware<string>({
    onStart: () => tag,
    onResume: () => {},
    onSuspend: () => {},
    onSuccess: (_call, context, result) =>
      log.push(`${tag}:success:${context}:${result}`),
    onFail: (_call, context, error) =>
      log.push(`${tag}:fail:${context}:${(error as Error).message}`)
  })
}

describe("createActionTrackingMiddleware", () => {
  test("tracks a sync action", () => {
    const store = Store.create()
    const log: string[] = []
    addMiddleware(store, tracker(log, "A"))

    store.setSync(1)

    expect(log).toEqual(["A:success:A:undefined"])
  })

  test("tracks a flow to completion", async () => {
    const store = Store.create()
    const log: string[] = []
    addMiddleware(store, tracker(log, "A"))

    await store.setAsync(1)

    expect(store.n).toBe(1)
    expect(log).toEqual(["A:success:A:undefined"])
  })

  test("tracks a rejected flow", async () => {
    const store = Store.create()
    const log: string[] = []
    addMiddleware(store, tracker(log, "A"))

    await expect(store.failAsync()).rejects.toThrow("boom")

    expect(log).toEqual(["A:fail:A:boom"])
  })

  // the running-action bookkeeping used to live at module scope, so a second
  // middleware overwrote the first's context and then deleted the shared entry;
  // the one that reached `flow_return` last threw on `undefined.context`
  test("two middlewares on one tree each keep their own context", async () => {
    const store = Store.create()
    const log: string[] = []
    addMiddleware(store, tracker(log, "A"))
    addMiddleware(store, tracker(log, "B"))

    await store.setAsync(1)

    expect(log.sort()).toEqual([
      "A:success:A:undefined",
      "B:success:B:undefined"
    ])
  })

  test("two middlewares on one tree both see a failure", async () => {
    const store = Store.create()
    const log: string[] = []
    addMiddleware(store, tracker(log, "A"))
    addMiddleware(store, tracker(log, "B"))

    await expect(store.failAsync()).rejects.toThrow("boom")

    expect(log.sort()).toEqual(["A:fail:A:boom", "B:fail:B:boom"])
  })

  test("filter opts an action out without disturbing the rest", async () => {
    const store = Store.create()
    const log: string[] = []
    addMiddleware(
      store,
      createActionTrackingMiddleware<string>({
        filter: call => call.name !== "setSync",
        onStart: () => "ctx",
        onResume: () => {},
        onSuspend: () => {},
        onSuccess: (call, context) => log.push(`${call.name}:${context}`),
        onFail: () => {}
      })
    )

    store.setSync(1)
    await store.setAsync(2)

    expect(log).toEqual(["setAsync:ctx"])
  })

  test("filtering out a flow action lets the flow run", async () => {
    const store = Store.create()
    const log: string[] = []
    addMiddleware(
      store,
      createActionTrackingMiddleware<string>({
        filter: () => false,
        onStart: () => "ctx",
        onResume: () => {},
        onSuspend: () => {},
        onSuccess: call => log.push(call.name),
        onFail: () => {}
      })
    )

    await store.setAsync(2)

    expect(store.n).toBe(2)
    expect(log).toEqual([])
  })

  test("a sync action's result reaches onSuccess", () => {
    const store = types
      .model({})
      .actions(() => ({
        answer() {
          return 42
        }
      }))
      .create()
    const log: string[] = []
    addMiddleware(store, tracker(log, "A"))

    expect(store.answer()).toBe(42)

    expect(log).toEqual(["A:success:A:42"])
  })

  function rootTracker(log: string[]) {
    return createActionTrackingMiddleware<string>({
      filter: call => call.parentId === 0,
      onStart: () => "ctx",
      onResume: () => {},
      onSuspend: () => {},
      onSuccess: (call, _context, result) =>
        log.push(`${call.name}:success:${result}`),
      onFail: (call, _context, error) =>
        log.push(`${call.name}:fail:${(error as Error).message}`)
    })
  }

  // flows share their root action's rootId, so the first to finish used to
  // settle the root and the next resume dereferenced the deleted entry
  test("a flow awaiting another flow settles once, after the outer one", async () => {
    const store = types
      .model({ n: 0 })
      .actions(self => ({
        inner: flow(function* inner() {
          yield Promise.resolve()
          self.n++
          return "inner"
        })
      }))
      .actions(self => ({
        outer: flow(function* outer() {
          yield self.inner()
          yield Promise.resolve()
          self.n++
          return "outer"
        })
      }))
      .create()
    const log: string[] = []
    addMiddleware(store, rootTracker(log))

    expect(await store.outer()).toBe("outer")

    expect(store.n).toBe(2)
    expect(log).toEqual(["outer:success:outer"])
  })

  test("a failed flow the action started is reported though a later one succeeds", async () => {
    const store = Store.actions(self => ({
      failThenOk() {
        return Promise.allSettled([self.failAsync(), self.setAsync(3)])
      }
    })).create()
    const log: string[] = []
    addMiddleware(store, rootTracker(log))

    await store.failThenOk()

    expect(store.n).toBe(3)
    expect(log).toEqual(["failAsync:fail:boom"])
  })

  test("a failure the awaiting flow catches is not reported", async () => {
    const store = Store.actions(self => ({
      recover: flow(function* recover() {
        try {
          yield self.failAsync()
          return "not reached"
        } catch {
          return "recovered"
        }
      })
    })).create()
    const log: string[] = []
    addMiddleware(store, rootTracker(log))

    expect(await store.recover()).toBe("recovered")

    expect(log).toEqual(["recover:success:recovered"])
  })

  test("an action starting two flows settles after both", async () => {
    const store = Store.actions(self => ({
      both() {
        return Promise.all([self.setAsync(1), self.setAsync(2)])
      }
    })).create()
    const log: string[] = []
    addMiddleware(store, rootTracker(log))

    await store.both()

    expect(store.n).toBe(2)
    expect(log).toEqual(["setAsync:success:undefined"])
  })
})
