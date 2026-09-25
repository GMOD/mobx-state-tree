import { expect, test } from "vitest"
import { cast, types, unprotect } from "../../src"

function time(f: () => void) {
  const start = performance.now()
  f()
  return performance.now() - start
}

const names = Array.from({ length: 50_000 }, (_, i) => `sample_${i}`)

test("reversing or clearing 50,000 strings reconciles in linear time", () => {
  const store = types
    .model({ a: types.array(types.string) })
    .create({ a: names })
  unprotect(store)

  const reverse = time(() => {
    store.a = cast(names.slice().reverse())
  })
  expect(store.a[0]).toBe(names.at(-1))

  const clear = time(() => store.a.clear())
  expect(store.a.length).toBe(0)

  expect(reverse).toBeLessThan(2000)
  expect(clear).toBeLessThan(1000)
})

test("reversing or clearing 20,000 identified models reconciles in linear time", () => {
  const Item = types.model({ id: types.identifier })
  const store = types
    .model({ a: types.array(Item) })
    .create({ a: names.slice(0, 20_000).map(id => ({ id })) })
  unprotect(store)

  const reverse = time(() => {
    store.a = cast(store.a.slice().reverse())
  })
  expect(store.a[0]!.id).toBe(names[19_999])

  const clear = time(() => store.a.clear())
  expect(store.a.length).toBe(0)

  expect(reverse).toBeLessThan(2000)
  expect(clear).toBeLessThan(3000)
})
