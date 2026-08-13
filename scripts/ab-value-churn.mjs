// Alternating-round A/B for the value-churn path CLAUDE.md identifies as the
// workload that actually matters: one typed write per frame on a
// jbrowse-shaped session, with an onSnapshot(root) listener above it (the
// TimeTraveller shape) — ~75 us/write on this fork today.
//
// Usage: node scripts/ab-value-churn.mjs <baselineDistDir> <newDistDir> [rounds]
process.env.NODE_ENV = "production"
Object.defineProperty(process, "env", { value: { ...process.env } })

const [, , baseDir, newDir, roundsArg] = process.argv
const ROUNDS = Number(roundsArg || 21)
const MODE = process.env.MODE || "onSnapshot" // onSnapshot | bare | autorunSnapshot

async function makeWorkload(distDir) {
  const { types, onSnapshot, getSnapshot, setDevMode } = await import(
    new URL(`${distDir}/mobx-state-tree.mjs`, `file://${process.cwd()}/`).href
  )
  const { autorun } = await import("mobx")
  setDevMode(false)

  // a view model of jbrowse-ish width: ~40 props, many computed views
  const viewProps = {
    id: types.identifier,
    type: types.literal("LinearGenomeView"),
    offsetPx: types.optional(types.number, 0),
    bpPerPx: types.optional(types.number, 1),
    displayedRegions: types.array(
      types.model({
        refName: types.string,
        start: types.number,
        end: types.number,
        assemblyName: types.string
      })
    ),
    tracks: types.array(types.frozen())
  }
  for (let i = 0; i < 34; i++) {
    viewProps[`f${i}`] = types.optional(types.string, "")
  }
  let View = types.model("LinearGenomeView", viewProps)
  for (let i = 0; i < 12; i++) {
    View = View.views(self => ({
      get [`v${i}`]() {
        return self.offsetPx + i
      }
    }))
  }
  View = View.actions(self => ({
    horizontalScroll(d) {
      self.offsetPx = self.offsetPx + d
    }
  }))

  const Session = types.model("Session", {
    id: types.optional(types.string, "s"),
    views: types.array(View),
    tracks: types.array(types.frozen())
  })
  const Root = types.model("Root", {
    session: types.optional(Session, {}),
    other: types.optional(
      types.model("Other", { a: types.optional(types.number, 0) }),
      {}
    )
  })

  const root = Root.create({
    session: {
      views: [
        {
          id: "v1",
          type: "LinearGenomeView",
          displayedRegions: [
            { refName: "ctgA", start: 0, end: 50000, assemblyName: "volvox" }
          ]
        }
      ],
      tracks: Array.from({ length: 262 }, (_, i) => ({
        trackId: `t${i}`,
        type: "X"
      }))
    }
  })
  const view = root.session.views[0]

  let dispose
  if (MODE === "onSnapshot") {
    dispose = onSnapshot(root, () => {})
  } else if (MODE === "autorunSnapshot") {
    dispose = autorun(() => getSnapshot(view))
  }
  if (dispose) {
    // keep a reference so it is not collected
    globalThis.__keep = (globalThis.__keep || []).concat(dispose)
  }

  return n => {
    for (let i = 0; i < n; i++) {
      view.horizontalScroll(1)
    }
    return view.offsetPx
  }
}

const a = await makeWorkload(baseDir)
const b = await makeWorkload(newDir)

const INNER = Number(process.env.INNER || 400)
const time = fn => {
  const t = performance.now()
  const r = fn(INNER)
  const d = performance.now() - t
  if (!r) throw new Error("no work")
  return d
}

for (let i = 0; i < 5; i++) {
  time(a)
  time(b)
}

const A = []
const B = []
for (let r = 0; r < ROUNDS; r++) {
  if (r % 2 === 0) {
    A.push(time(a))
    B.push(time(b))
  } else {
    B.push(time(b))
    A.push(time(a))
  }
}
const median = xs => {
  const s = [...xs].sort((x, y) => x - y)
  return s[Math.floor(s.length / 2)]
}
const ma = median(A) / INNER
const mb = median(B) / INNER
console.log(
  `[${MODE}] baseline: ${(ma * 1000).toFixed(1)} us/write   new: ${(mb * 1000).toFixed(1)} us/write   ratio: ${(
    ma / mb
  ).toFixed(3)}x ${ma > mb ? "(new faster)" : "(new SLOWER)"}`
)
