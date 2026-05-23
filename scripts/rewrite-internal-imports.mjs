// One-shot codemod: rewrite every `from "../../internal.ts"` import to direct
// imports from the file that actually defines/exports each symbol.
//
// Algorithm:
//   1. Walk src/ and collect a map: exportedName -> defining file path.
//      Follow `export * from "X"` so re-export barrels are transparent.
//   2. For each file that imports from internal.ts, split the named imports
//      by their defining file, and rewrite to a set of direct imports.
//      Preserve `type` keyword on type-only specifiers; if every specifier
//      from a target file is a type, hoist `type` to the import keyword.
//   3. Skip src/internal.ts and src/index.ts (handled separately).

import { readFileSync, writeFileSync, readdirSync, statSync } from "node:fs"
import { join, relative, dirname, resolve } from "node:path"

const SRC = resolve("src")

function walk(dir) {
  const out = []
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    const s = statSync(p)
    if (s.isDirectory()) {
      out.push(...walk(p))
    } else if (p.endsWith(".ts") && !p.endsWith(".d.ts")) {
      out.push(p)
    }
  }
  return out
}

const files = walk(SRC)

// ---------- Step 1: build exportedName -> definingFile map ----------

// Per-file direct exports (declared in the file itself) and re-export targets.
const direct = new Map() // file -> Set<name>
const reexportAll = new Map() // file -> string[] (target files, absolute)
const reexportNamed = new Map() // file -> Map<localName, targetFile>

const importRe = /import\s+(?:type\s+)?(?:\{[^}]*\}|[\w*]+|[\w*]+\s*,\s*\{[^}]*\})\s+from\s+["']([^"']+)["']/g
const exportFromRe =
  /export\s+(\*|type\s+\*|\{[^}]+\})\s+from\s+["']([^"']+)["']/g
const exportDeclRe =
  /export\s+(?:declare\s+)?(?:async\s+)?(?:abstract\s+)?(?:default\s+)?(?:(?:class|function|const|let|var|enum|interface|type|namespace)\s+)([A-Za-z_$][\w$]*)/g

function resolveImport(fromFile, spec) {
  // Only handle relative imports in src/.
  if (!spec.startsWith(".")) return null
  const base = resolve(dirname(fromFile), spec)
  // strip extension if present
  const noExt = base.replace(/\.tsx?$/, "")
  const candidates = [
    noExt + ".ts",
    noExt + ".tsx",
    join(noExt, "index.ts"),
    join(noExt, "index.tsx")
  ]
  for (const c of candidates) {
    try {
      if (statSync(c).isFile()) return c
    } catch {}
  }
  return null
}

for (const f of files) {
  const src = readFileSync(f, "utf8")
  const d = new Set()
  direct.set(f, d)

  // declared exports
  for (const m of src.matchAll(exportDeclRe)) {
    d.add(m[1])
  }
  // export { A, B as C } (without from)
  for (const m of src.matchAll(
    /export\s+\{([^}]+)\}(?!\s*from)/g
  )) {
    for (const part of m[1].split(",")) {
      const cleaned = part.trim().replace(/^type\s+/, "")
      if (!cleaned) continue
      const asMatch = cleaned.match(/\s+as\s+([A-Za-z_$][\w$]*)/)
      const exported = asMatch ? asMatch[1] : cleaned.split(/\s+/)[0]
      d.add(exported)
    }
  }

  // re-exports
  for (const m of src.matchAll(exportFromRe)) {
    const what = m[1].trim()
    const target = resolveImport(f, m[2])
    if (!target) continue
    if (what === "*" || what === "type *") {
      if (!reexportAll.has(f)) reexportAll.set(f, [])
      reexportAll.get(f).push(target)
    } else {
      // { A, B as C, type D }
      const named = what.slice(1, -1)
      for (const part of named.split(",")) {
        const cleaned = part.trim().replace(/^type\s+/, "")
        if (!cleaned) continue
        const asMatch = cleaned.match(/\s+as\s+([A-Za-z_$][\w$]*)/)
        const exported = asMatch ? asMatch[1] : cleaned.split(/\s+/)[0]
        if (!reexportNamed.has(f)) reexportNamed.set(f, new Map())
        reexportNamed.get(f).set(exported, target)
      }
    }
  }
}

// Resolve a name to its ultimate defining file (chase star re-exports).
function resolveName(file, name, visited = new Set()) {
  if (visited.has(file)) return null
  visited.add(file)
  if (direct.get(file)?.has(name)) return file
  const named = reexportNamed.get(file)
  if (named?.has(name)) {
    return resolveName(named.get(name), name, visited)
  }
  for (const target of reexportAll.get(file) ?? []) {
    const res = resolveName(target, name, visited)
    if (res) return res
  }
  return null
}

const internalFile = join(SRC, "internal.ts")
const indexFile = join(SRC, "index.ts")

// Build symbol -> file map by resolving from internal.ts (the API surface).
const symbolToFile = new Map()
const internalDirect = direct.get(internalFile) ?? new Set()
const internalReexportNamed = reexportNamed.get(internalFile) ?? new Map()
const internalReexportAll = reexportAll.get(internalFile) ?? []

const allNames = new Set([
  ...internalDirect,
  ...internalReexportNamed.keys()
])
for (const target of internalReexportAll) {
  for (const n of direct.get(target) ?? []) allNames.add(n)
  for (const n of reexportNamed.get(target)?.keys() ?? []) allNames.add(n)
}

for (const name of allNames) {
  const f = resolveName(internalFile, name)
  if (f) symbolToFile.set(name, f)
}

// Save the map for inspection.
const mapForLog = {}
for (const [name, file] of symbolToFile) {
  mapForLog[name] = relative(SRC, file)
}
writeFileSync(
  "scripts/symbol-map.json",
  JSON.stringify(mapForLog, null, 2)
)
console.log(`Resolved ${symbolToFile.size} symbols`)

// ---------- Step 2: rewrite imports ----------

const internalImportRe =
  /import\s+(type\s+)?\{([^}]+)\}\s+from\s+["'](?:\.\.\/)+internal\.ts["']\s*;?\s*\n/g

let rewrittenCount = 0

for (const f of files) {
  if (f === internalFile || f === indexFile) continue
  const original = readFileSync(f, "utf8")
  if (!/internal\.ts/.test(original)) continue

  let modified = original
  const blocks = [...original.matchAll(internalImportRe)]
  if (blocks.length === 0) continue

  // Collect all named specifiers from internal imports
  // Each specifier: { name: string, typeKw: boolean (block-level or per-spec) }
  const allSpecs = []
  for (const block of blocks) {
    const blockType = !!block[1]
    const inner = block[2]
    for (const part of inner.split(",")) {
      const trimmed = part.trim()
      if (!trimmed) continue
      const isTypeSpec = /^type\s+/.test(trimmed)
      const cleaned = trimmed.replace(/^type\s+/, "")
      // "Foo" or "Foo as Bar"
      const asMatch = cleaned.match(/^([A-Za-z_$][\w$]*)\s+as\s+([A-Za-z_$][\w$]*)$/)
      const sourceName = asMatch ? asMatch[1] : cleaned
      const localName = asMatch ? asMatch[2] : cleaned
      allSpecs.push({
        sourceName,
        localName,
        isType: blockType || isTypeSpec
      })
    }
  }

  // Group by target file
  const byFile = new Map() // file -> array of {sourceName, localName, isType}
  const unresolved = []
  for (const spec of allSpecs) {
    const target = symbolToFile.get(spec.sourceName)
    if (!target) {
      unresolved.push(spec.sourceName)
      continue
    }
    // If target file is the same as this file, skip (self-reference)
    if (target === f) continue
    if (!byFile.has(target)) byFile.set(target, [])
    byFile.get(target).push(spec)
  }

  if (unresolved.length) {
    console.warn(
      `[warn] ${relative(SRC, f)}: unresolved symbols:`,
      unresolved.join(", ")
    )
  }

  // Build replacement import block (sorted by file for stability)
  const targets = [...byFile.keys()].sort((a, b) =>
    relative(dirname(f), a).localeCompare(relative(dirname(f), b))
  )
  const newImports = []
  for (const target of targets) {
    const specs = byFile.get(target).sort((a, b) => a.sourceName.localeCompare(b.sourceName))
    const allType = specs.every(s => s.isType)
    const formatted = specs
      .map(s => {
        const kw = !allType && s.isType ? "type " : ""
        const rename =
          s.sourceName !== s.localName ? ` as ${s.localName}` : ""
        return `${kw}${s.sourceName}${rename}`
      })
      .join(", ")
    let relPath = relative(dirname(f), target).replace(/\\/g, "/")
    if (!relPath.startsWith(".")) relPath = "./" + relPath
    const typeKw = allType ? "type " : ""
    newImports.push(
      `import ${typeKw}{ ${formatted} } from "${relPath}"`
    )
  }

  // Remove the old blocks (first replace each block with empty)
  for (const block of blocks) {
    modified = modified.replace(block[0], "")
  }

  // Insert new imports at the position of the first removed block.
  const firstIdx = original.indexOf(blocks[0][0])
  const before = modified.slice(0, firstIdx)
  const after = modified.slice(firstIdx)
  modified =
    before +
    (newImports.length ? newImports.join("\n") + "\n" : "") +
    after

  writeFileSync(f, modified)
  rewrittenCount++
}

console.log(`Rewrote imports in ${rewrittenCount} files`)
