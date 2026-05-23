// Rewrite src/index.ts to re-export directly from defining files instead
// of via ./internal.ts. Uses scripts/symbol-map.json produced by
// rewrite-internal-imports.mjs.

import { readFileSync, writeFileSync } from "node:fs"
import { relative, dirname, resolve } from "node:path"

const SRC = resolve("src")
const indexPath = resolve("src/index.ts")
const map = JSON.parse(readFileSync("scripts/symbol-map.json", "utf8"))

const original = readFileSync(indexPath, "utf8")

// Match two blocks: `export type { ... } from "./internal.ts"` and
// `export { ... } from "./internal.ts"`
const blockRe =
  /export\s+(type\s+)?\{([^}]+)\}\s+from\s+["']\.\/internal\.ts["']\s*;?\s*\n?/g

const blocks = [...original.matchAll(blockRe)]
if (blocks.length === 0) {
  console.error("No blocks found")
  process.exit(1)
}

const valueByFile = new Map() // file -> Set of "Name" or "Name as Alias"
const typeByFile = new Map()

function addToMap(byFile, file, entry) {
  if (!byFile.has(file)) byFile.set(file, new Set())
  byFile.get(file).add(entry)
}

for (const block of blocks) {
  const isType = !!block[1]
  const target = isType ? typeByFile : valueByFile
  for (const part of block[2].split(",")) {
    const trimmed = part.trim().replace(/^type\s+/, "")
    if (!trimmed) continue
    const asMatch = trimmed.match(
      /^([A-Za-z_$][\w$]*)\s+as\s+([A-Za-z_$][\w$]*)$/
    )
    const sourceName = asMatch ? asMatch[1] : trimmed
    const file = map[sourceName]
    if (!file) {
      console.warn(`unresolved: ${sourceName}`)
      continue
    }
    const abs = resolve(SRC, file)
    addToMap(target, abs, trimmed)
  }
}

function buildBlock(byFile, kw) {
  const targets = [...byFile.keys()].sort()
  const out = []
  for (const target of targets) {
    let relPath = relative(dirname(indexPath), target).replace(/\\/g, "/")
    if (!relPath.startsWith(".")) relPath = "./" + relPath
    const specs = [...byFile.get(target)].sort()
    out.push(
      `export ${kw}{\n  ${specs.join(",\n  ")}\n} from "${relPath}"`
    )
  }
  return out.join("\n")
}

let modified = original
for (const block of blocks) modified = modified.replace(block[0], "")

const firstIdx = original.indexOf(blocks[0][0])
const replacement =
  buildBlock(typeByFile, "type ") + "\n\n" + buildBlock(valueByFile, "") + "\n"
modified =
  modified.slice(0, firstIdx) + replacement + modified.slice(firstIdx)

writeFileSync(indexPath, modified)
console.log("rewrote index.ts")
