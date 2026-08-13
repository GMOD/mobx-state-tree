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
})
