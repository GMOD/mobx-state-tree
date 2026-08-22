import { test, expect } from "vitest"
import { smallScenario, mediumScenario, largeScenario } from "./scenarios"
import { start } from "./timer"

// TODO: Not sure how this should work. This feels super fragile.
const TOO_SLOW_MS = 10000
test("performs well on small scenario", () => {
  expect(smallScenario(10).elapsed < TOO_SLOW_MS).toBe(true)
})
test("performs well on medium scenario", () => {
  expect(mediumScenario(10).elapsed < TOO_SLOW_MS).toBe(true)
})
test("performs well on large scenario", () => {
  expect(largeScenario(10, 0, 0).elapsed < TOO_SLOW_MS).toBe(true)
  expect(largeScenario(10, 10, 0).elapsed < TOO_SLOW_MS).toBe(true)
  expect(largeScenario(10, 0, 10).elapsed < TOO_SLOW_MS).toBe(true)
  expect(largeScenario(10, 10, 10).elapsed < TOO_SLOW_MS).toBe(true)
})
// The delays are 10ms rather than 2ms, and the assertions are ordering rather
// than inequality with 0: `start()` reports whole milliseconds, so a 2ms timer
// firing a shade early rounded to 0 and failed `expect(lap).not.toBe(0)` — seen
// on CI, after which the assertion throwing inside the setTimeout left the
// promise unresolved and the test hit its 5s timeout instead.
test("timer", () => {
  return new Promise<void>(resolve => {
    const go = start()
    setTimeout(function () {
      const lap = go(true)
      setTimeout(function () {
        const total = go()
        expect(lap).toBeGreaterThan(0)
        expect(total).toBeGreaterThan(lap)
        resolve()
      }, 10)
    }, 10)
  })
})
