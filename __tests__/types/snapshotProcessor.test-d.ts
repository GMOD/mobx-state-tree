// Type-only regression tests for `types.snapshotProcessor` preProcessor typing.
// Checked by `pnpm test:types` (tsc -p __tests__/types/tsconfig.json) — vitest
// strips types via esbuild and would silently ignore these.

import { types, type SnapshotIn } from "../../src/index.ts"

const Tagged = types.model("Tagged", {
  kind: types.literal("tagged"),
  value: types.string
})

// pre-tag legacy snapshot: discriminator absent
interface Legacy {
  kind?: undefined
  value: string
}

type Loose = SnapshotIn<typeof Tagged> | Legacy

// `CustomC` is inferred from the preProcessor parameter annotation (`Loose`).
const Processed = types.snapshotProcessor(Tagged, {
  preProcessor(sn: Loose) {
    // returning the loose input un-narrowed compiles ONLY because the return
    // type permits `| CustomC`; under the old `IT["CreationType"]`-only return
    // this line required a @ts-expect-error
    return sn
  }
})

// the loose input is also the public creation type, so `.create()` accepts both
// the legacy and the tagged shape (this coupling is intended for
// snapshotProcessor — the preProcessor runs on everything passed to create)
Processed.create({ value: "x" })
Processed.create({ kind: "tagged", value: "x" })

// a strict reconstruction is still a valid return (CreationType branch)
types.snapshotProcessor(Tagged, {
  preProcessor(sn: Loose) {
    return sn.kind ? sn : { kind: "tagged" as const, value: sn.value }
  }
})

// without a loose CustomC the return collapses to the strict CreationType: a
// wrong shape is still rejected (the loosening is opt-in, not an escape hatch).
// The mismatch surfaces at the property (the inferred `(sn) => number`), so the
// directive sits on the preProcessor line.
types.snapshotProcessor(Tagged, {
  // @ts-expect-error number is not assignable to the model's creation type
  preProcessor(sn: SnapshotIn<typeof Tagged>) {
    return 5
  }
})
