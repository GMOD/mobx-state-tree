import { bench, describe } from "vitest"
import { types, type IAnyModelType } from "../src/index.ts"

// Isolates the sub-costs of building a jbrowse-shaped model type at module-eval:
// - `model()` over raw props: the one unavoidable toPropertiesObject pass.
// - `compose()`: merges already-converted property bags — must NOT re-run
//   toPropertiesObject over the (growing) inherited set.
// - `.props()`: only the added delta needs conversion, not the inherited props.
// - a no-new-prop chain step (`.actions()`): reuses the parent's converted +
//   frozen properties and derived names/identifier verbatim, so it's ~free.
// Guards the cloneAndEnhance fast paths in model.ts against regression.

function wideProps(prefix: string, withId = false) {
  const p: Record<string, any> = {
    [`${prefix}_id`]: withId ? types.identifier : types.optional(types.string, ""),
    [`${prefix}_type`]: types.literal(prefix),
    [`${prefix}_regions`]: types.array(types.model({ start: types.number })),
    [`${prefix}_tags`]: types.map(types.string)
  }
  for (let i = 0; i < 36; i++) p[`${prefix}_f${i}`] = types.optional(types.string, "")
  return p
}

const A = types.model("base", wideProps("base", true))
const B = types.model("linear", wideProps("linear"))
const C = types.model("feature", wideProps("feature"))

describe("model construction", () => {
  bench("model() over 40 raw props", () => {
    void types.model("m", wideProps("m", true))
  })

  bench("compose() 3 x 40 converted props", () => {
    void types.compose("D", A, B, C)
  })

  bench(".props(+1) on a 40-prop parent", () => {
    void A.props({ zz: types.optional(types.number, 0) })
  })

  bench("40 no-new-prop chain steps on a 40-prop parent", () => {
    let M: IAnyModelType = A
    for (let i = 0; i < 40; i++) {
      M = M.views(() => ({ get [`v${i}`]() { return i } }))
        .actions(() => ({ [`a${i}`]() {} }))
    }
    return void M
  })
})
