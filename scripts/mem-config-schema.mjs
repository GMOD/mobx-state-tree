// Allocation counterpart to scripts/ab-config-schema.mjs, over the same
// 262-track config-schema workload (it reuses config-schema-profile.mjs rather
// than restating it).
//
// Why this exists: a change that removes an own slot from a type object — the
// ADR 0003 / 0004 trick — moves *memory*, and the A/B timer cannot resolve it.
// The timing harness bottoms out around 1.1x (see CLAUDE.md, "Benchmarking"),
// while this reads the same to the byte on every run, so a sub-1% win is
// reportable here and simply invisible there. Run it before concluding that a
// slot-removal "did nothing".
//
// Reports, for the reachable type graph:
//   heap        retained bytes, measured between two forced GCs
//   typeObjects distinct type objects reachable via getSubTypes()/properties
//   ownSlots    total own property names across them  <- what the trick moves
//
// Chain-step intermediates (8 of the 9 ModelTypes a config schema builds are
// garbage as soon as the next `.actions()` runs) are NOT in the reachable set,
// so `ownSlots` undercounts what a change touches during construction. It is
// still the number that is stable enough to act on.
//
// Usage: node --expose-gc scripts/mem-config-schema.mjs [distDir]   (default ./dist)
import { pathToFileURL } from "node:url"

if (typeof global.gc !== "function") {
  console.error("run with --expose-gc")
  process.exit(1)
}

const distArg = process.argv[2] || "./dist"
// config-schema-profile.mjs reads its dist from argv[2] and resolves it as a
// URL, so hand it an absolute file: URL; and tell it not to self-run its timer.
process.argv[2] = pathToFileURL(`${distArg.replace(/\/$/, "")}/`).href
process.env.PROFILE_ONCE = "0"

const { buildAll } = await import("./config-schema-profile.mjs")

global.gc()
const before = process.memoryUsage().heapUsed
const schemas = buildAll()
global.gc()
const after = process.memoryUsage().heapUsed
if (!schemas.length) {
  throw new Error("empty workload")
}

const seen = new Set()
let typeObjects = 0
let ownSlots = 0
const walk = type => {
  if (!type || typeof type !== "object" || seen.has(type)) {
    return
  }
  seen.add(type)
  typeObjects++
  ownSlots += Object.getOwnPropertyNames(type).length

  const sub = type.getSubTypes?.()
  if (Array.isArray(sub)) {
    sub.forEach(walk)
  } else if (sub && typeof sub === "object") {
    walk(sub)
  }
  if (type.properties) {
    Object.values(type.properties).forEach(walk)
  }
}
schemas.forEach(walk)

console.log(
  `${distArg.padEnd(12)} heap=${((after - before) / 1e6).toFixed(2)} MB  ` +
    `typeObjects=${typeObjects}  ownSlots=${ownSlots}  ` +
    `slots/type=${(ownSlots / typeObjects).toFixed(2)}`
)
