// Alternating-round A/B for the jbrowse config-schema type-construction
// workload. Per round: time A then B back to back, flipping the leading side
// each round; compare per-round MEDIANS (GC spikes skew means). See the
// "Benchmarking" section of CLAUDE.md for why the stock bench harness is not
// trustworthy for deltas under ~1.3x.
//
// Usage: node scripts/ab-config-schema.mjs <baselineDistDir> <newDistDir> [rounds]
process.env.NODE_ENV = "production"
Object.defineProperty(process, "env", { value: { ...process.env } })

const [, , baseDir, newDir, roundsArg] = process.argv
const ROUNDS = Number(roundsArg || 25)
const N = Number(process.env.N_TRACKS || 262)

async function makeWorkload(distDir) {
  const mod = await import(
    new URL(`${distDir}/mobx-state-tree.mjs`, `file://${process.cwd()}/`).href
  )
  const { types, setDevMode } = mod
  setDevMode(false)

  const JexlStringType = types.refinement("JexlString", types.string, s =>
    typeof s === "string" ? s.startsWith("jexl:") : false
  )
  const UriLocation = types.model("UriLocation", {
    locationType: types.literal("UriLocation"),
    uri: types.string,
    baseUri: types.maybe(types.string)
  })
  const LocalPathLocation = types.model("LocalPathLocation", {
    locationType: types.literal("LocalPathLocation"),
    localPath: types.string
  })
  const BlobLocation = types.model("BlobLocation", {
    locationType: types.literal("BlobLocation"),
    name: types.string,
    blobId: types.string
  })
  const FileLocation = types.snapshotProcessor(
    types.union(LocalPathLocation, UriLocation, BlobLocation),
    { preProcessor: sn => sn }
  )
  const slotTypes = [
    { model: types.array(types.string), def: [] },
    { model: types.map(types.number), def: {} },
    { model: types.boolean, def: true },
    { model: types.string, def: "black" },
    { model: types.integer, def: 1 },
    { model: types.number, def: 1 },
    { model: types.maybe(types.number), def: undefined },
    { model: types.maybe(types.boolean), def: undefined },
    { model: types.maybe(types.frozen()), def: undefined },
    { model: types.string, def: "" },
    { model: FileLocation, def: { uri: "/x", locationType: "UriLocation" } },
    { model: types.frozen(), def: {} }
  ]
  const ElementId = types.optional(types.identifier, () => "eid")

  const ConfigSlot = i => {
    const { model, def } = slotTypes[i % slotTypes.length]
    return types.stripDefault(types.union(JexlStringType, model), def)
  }

  const HOOKS = 3
  function ConfigurationSchema(modelName, nSlots, subSchemas = []) {
    const d = {}
    d.type = types.optional(types.literal(modelName), modelName)
    d.trackId = ElementId
    for (let i = 0; i < nSlots; i++) d[`slot${i}`] = ConfigSlot(i)
    for (const [name, sub] of subSchemas) d[name] = sub

    let m = types.model(`${modelName}ConfigurationSchema`, d).actions(self => ({
      setSubschema(k, v) {
        self[k] = v
      },
      setSlot(k, v) {
        self[k] = v
      }
    }))
    for (let i = 0; i < HOOKS; i++) m = m.actions(() => ({ [`a${i}`]() {} }))
    for (let i = 0; i < HOOKS; i++)
      m = m.views(() => ({
        get [`v${i}`]() {
          return i
        }
      }))
    m = m.preProcessSnapshot(sn => sn)
    return types.stripDefault(m, { type: modelName, trackId: "placeholderId" })
  }

  return () => {
    const out = []
    for (let i = 0; i < N; i++) {
      out.push(
        ConfigurationSchema(`Track${i}`, 40, [
          ["linearDisplay", ConfigurationSchema(`LinearDisplay${i}`, 25)],
          ["circularDisplay", ConfigurationSchema(`CircularDisplay${i}`, 15)]
        ])
      )
    }
    return out
  }
}

const a = await makeWorkload(baseDir)
const b = await makeWorkload(newDir)

const time = fn => {
  const t = performance.now()
  const r = fn()
  const d = performance.now() - t
  if (!r.length) throw new Error("empty")
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
const ma = median(A)
const mb = median(B)
console.log(
  `baseline: ${ma.toFixed(2)} ms   new: ${mb.toFixed(2)} ms   ratio: ${(ma / mb).toFixed(3)}x ${
    ma > mb ? "(new faster)" : "(new SLOWER)"
  }`
)
