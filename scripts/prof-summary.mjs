// Summarize a V8 .cpuprofile as self-time per function, plus total-time for a
// few named frames. Usage: node scripts/prof-summary.mjs <file.cpuprofile> [topN]
import { readFileSync } from "node:fs"

const file = process.argv[2]
const topN = Number(process.argv[3] || 25)
const prof = JSON.parse(readFileSync(file, "utf8"))

const byId = new Map(prof.nodes.map(n => [n.id, n]))
const selfTicks = new Map()
for (const id of prof.samples) {
  selfTicks.set(id, (selfTicks.get(id) || 0) + 1)
}
const total = prof.samples.length

const label = n => {
  const f = n.callFrame
  const url = (f.url || "").split("/").slice(-1)[0]
  return `${f.functionName || "(anonymous)"} @ ${url}:${f.lineNumber + 1}`
}

// self time aggregated by label
const self = new Map()
for (const [id, ticks] of selfTicks) {
  const n = byId.get(id)
  if (!n) continue
  const k = label(n)
  self.set(k, (self.get(k) || 0) + ticks)
}

// total (inclusive) time: walk children
const childTotal = new Map()
function subtree(id, seen = new Set()) {
  if (seen.has(id)) return 0
  seen.add(id)
  const n = byId.get(id)
  if (!n) return 0
  let t = selfTicks.get(id) || 0
  for (const c of n.children || []) t += subtree(c, seen)
  return t
}
for (const n of prof.nodes) {
  const k = label(n)
  childTotal.set(k, (childTotal.get(k) || 0) + subtree(n.id))
}

const pct = t => `${((t / total) * 100).toFixed(1)}%`

console.log(`total samples: ${total}\n`)
console.log("=== SELF TIME ===")
for (const [k, t] of [...self].sort((a, b) => b[1] - a[1]).slice(0, topN)) {
  console.log(`${pct(t).padStart(6)}  ${k}`)
}
console.log("\n=== INCLUSIVE TIME (top frames) ===")
for (const [k, t] of [...childTotal]
  .sort((a, b) => b[1] - a[1])
  .slice(0, topN)) {
  console.log(`${pct(t).padStart(6)}  ${k}`)
}
