import { bench, describe } from "vitest"
import { types, type IAnyModelType } from "../src/index.ts"

// A benchmark modeled on jbrowse's state-tree shape: wide models (~40 props of
// mixed kinds) built by composing a few base mixins and then chaining many
// .views()/.actions()/.volatile() steps that add NO new properties. jbrowse's
// LinearGenomeView model alone chains ~16 such steps over ~40 props, and every
// display/track/view type is built this way at module-eval time — so the
// per-chain-step cost of ModelType construction is paid hundreds of times
// before the app first renders.
//
// The cloneAndEnhance fast path (skip toPropertiesObject/freeze on chain steps
// that add no properties) targets exactly this. Run with `vitest bench`.

function wideProps(prefix: string, withId = false) {
  const p: Record<string, any> = {
    [`${prefix}_id`]: withId ? types.identifier : types.optional(types.string, ""),
    [`${prefix}_type`]: types.literal(prefix),
    [`${prefix}_name`]: types.optional(types.string, ""),
    [`${prefix}_height`]: types.optional(types.number, 100),
    [`${prefix}_visible`]: types.optional(types.boolean, true),
    [`${prefix}_regions`]: types.array(
      types.model({ refName: types.string, start: types.number, end: types.number })
    ),
    [`${prefix}_config`]: types.frozen(),
    [`${prefix}_tags`]: types.map(types.string),
    [`${prefix}_color`]: types.maybe(types.string)
  }
  for (let i = 0; i < 24; i++) {
    p[`${prefix}_f${i}`] = types.optional(types.string, "")
  }
  return p
}

// three composable base mixins, each with props + a few views/actions
function baseMixin(name: string, withId = false) {
  let M: IAnyModelType = types.model(name, wideProps(name, withId))
  for (let i = 0; i < 4; i++) {
    M = M.views(() => ({ get [`${name}_v${i}`]() { return 1 } }))
      .actions(() => ({ [`${name}_a${i}`]() {} }))
  }
  return M
}

// Build a jbrowse-like display type: compose 3 mixins, then a long chain of
// no-new-prop steps (the hot path), with an occasional .props() in the middle.
function buildDisplayType(): IAnyModelType {
  let M: IAnyModelType = types.compose(
    "Display",
    baseMixin("base", true),
    baseMixin("linear"),
    baseMixin("feature")
  )
  for (let i = 0; i < 16; i++) {
    M = M.volatile(() => ({ [`vol${i}`]: 0 }))
      .views(() => ({ get [`view${i}`]() { return i } }))
      .actions(() => ({ [`act${i}`]() {} }))
    if (i === 8) {
      M = M.props({ extra: types.optional(types.number, 0) })
    }
  }
  return M
}

describe("jbrowse-like model", () => {
  bench("construct display model type (module-eval cost)", () => {
    buildDisplayType()
  })

  const DisplayType = buildDisplayType()
  const SessionType = types.model("Session", {
    displays: types.array(DisplayType)
  })
  const snapshot = {
    displays: Array.from({ length: 20 }, (_, i) => ({
      base_id: `d${i}`,
      base_type: "base",
      linear_type: "linear",
      feature_type: "feature"
    }))
  }
  bench("create session instance with 20 displays", () => {
    SessionType.create(snapshot as never)
  })
})
