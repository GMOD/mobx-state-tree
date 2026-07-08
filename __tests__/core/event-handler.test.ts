import { expect, test } from "vitest"
import { EventHandlers } from "../../src/utils.ts"

// A handler removed mid-emit must still run in an emit that was already in
// progress when the removal happened (classic copy-on-emit semantics). The
// reentrant inner emit below must not corrupt the outer emit's iteration.
test("reentrant emit does not skip handlers unregistered during the outer emit", () => {
  const eh = new EventHandlers<{ x: () => void }>()
  const calls: string[] = []
  let reentered = false

  const a = () => {
    calls.push("a")
    if (!reentered) {
      reentered = true
      eh.emit("x") // reentrant emit while the outer emit is still running
    }
  }
  const b = () => {
    calls.push("b")
    eh.unregister("x", c)
  }
  const c = () => {
    calls.push("c")
  }

  eh.register("x", a)
  eh.register("x", b)
  eh.register("x", c)

  eh.emit("x")

  // outer emit began with [a, b, c] registered, so c must run in it even though
  // b unregisters c; the trailing "c" is the outer emit's call.
  expect(calls[calls.length - 1]).toBe("c")
})
