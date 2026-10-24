// Alternating-round A/B for an editor-shaped tree: pages of identified
// elements with ~60 props each (the shape of lavrton's Polotno PRs #2306-#2311).
//
// Usage: node scripts/ab-editor.mjs <baselineDistDir> <newDistDir> [rounds]
process.env.NODE_ENV = "production"
Object.defineProperty(process, "env", { value: { ...process.env } })

const [, , baseDir, newDir, roundsArg] = process.argv
const ROUNDS = Number(roundsArg || 15)
const N = 600

async function load(distDir) {
  const mst = await import(
    new URL(`${distDir}/mobx-state-tree.mjs`, `file://${process.cwd()}/`).href
  )
  mst.setDevMode?.(false)
  const { types, getSnapshot, applySnapshot, detach, unprotect } = mst

  const props = { id: types.identifier, x: 0, y: 0 }
  for (let i = 0; i < 58; i++) props[`p${i}`] = i % 2 ? 0 : ""
  const Element = types.model("Element", props)
  const Page = types
    .model("Page", {
      id: types.identifier,
      elements: types.array(Element)
    })
    .actions(self => ({
      moveAll(dx, dy) {
        for (const el of self.elements) {
          el.x += dx
          el.y += dy
        }
      }
    }))
  const Doc = types.model("Doc", { pages: types.array(Page) })

  const elementSnap = (id, i = 0) => ({ id, x: i, y: i })
  const pageSnap = (p, n) => ({
    id: `pg${p}`,
    elements: Array.from({ length: n }, (_, i) => elementSnap(`e${p}-${i}`))
  })
  const doc = (pages, n) =>
    Doc.create({
      pages: Array.from({ length: pages }, (_, p) => pageSnap(p, n))
    })

  const time = fn => {
    const t = performance.now()
    fn()
    return performance.now() - t
  }

  return {
    drag() {
      const d = doc(1, N)
      const page = d.pages[0]
      page.moveAll(1, 1)
      return time(() => {
        for (let i = 0; i < 10; i++) page.moveAll(1, 1)
      })
    },
    dragThenSnapshot() {
      const d = doc(1, N)
      const page = d.pages[0]
      page.moveAll(1, 1)
      getSnapshot(d)
      return time(() => {
        for (let i = 0; i < 10; i++) {
          page.moveAll(1, 1)
          getSnapshot(d)
        }
      })
    },
    detachGroup() {
      const d = doc(6, N)
      unprotect(d)
      const els = d.pages[0].elements.slice()
      return time(() => {
        for (const el of els) detach(el)
      })
    },
    replaceArray() {
      const d = doc(1, N)
      const page = d.pages[0]
      const next = getSnapshot(page).elements.map((e, i) => ({
        ...e,
        x: e.x + 1
      }))
      next.reverse()
      return time(() => applySnapshot(page.elements, next))
    },
    reorderPages() {
      const d = doc(100, 6)
      const snap = getSnapshot(d).pages.slice()
      const moved = snap.splice(80, 1)[0]
      snap.splice(10, 0, moved)
      return time(() => applySnapshot(d, { pages: snap }))
    },
    undoToSnapshot() {
      const d = doc(1, N)
      const before = getSnapshot(d)
      d.pages[0].elements.forEach((el, i) => {
        unprotect(d)
        el.x = i
      })
      return time(() => applySnapshot(d, before))
    }
  }
}

const median = xs => {
  const s = [...xs].sort((a, b) => a - b)
  return s[Math.floor(s.length / 2)]
}

const A = await load(baseDir)
const B = await load(newDir)
for (const name of Object.keys(A)) {
  for (let w = 0; w < 3; w++) {
    A[name]()
    B[name]()
  }
  const a = []
  const b = []
  for (let r = 0; r < ROUNDS; r++) {
    if (r % 2) {
      b.push(B[name]())
      a.push(A[name]())
    } else {
      a.push(A[name]())
      b.push(B[name]())
    }
  }
  const ma = median(a)
  const mb = median(b)
  console.log(
    `${name.padEnd(18)} base ${ma.toFixed(2)} ms   new ${mb.toFixed(2)} ms   ${(ma / mb).toFixed(2)}x`
  )
}
