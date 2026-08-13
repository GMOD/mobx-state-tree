// Profile the workload CLAUDE.md names as the open target for JBrowse startup:
// building one config-schema *type* per track at runtime, 262 of them.
//
// Faithful to packages/core/src/configuration/{configurationSchema,configurationSlot}.ts:
// every slot is `stripDefault(union(JexlString, valueModel), default)`, every
// schema is `model(...).actions(...)` plus the chained hooks a baseConfiguration
// contributes, wrapped in a final `stripDefault`.
//
// Usage: node scripts/config-schema-profile.mjs [dist-path]   (default ./dist)
process.env.NODE_ENV = "production"
Object.defineProperty(process, "env", { value: { ...process.env } })

const dist = process.argv[2] || new URL("../dist/", import.meta.url).href
const { types, setDevMode } = await import(
  new URL("mobx-state-tree.mjs", dist.endsWith("/") ? dist : `${dist}/`).href
)
setDevMode(false)

// ---- module-eval singletons, exactly as jbrowse has them -------------------
const JexlStringType = types.refinement(
  "JexlString",
  types.string,
  s => typeof s === "string" && s.startsWith("jexl:")
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

const slotTypes = {
  stringArray: { model: types.array(types.string), def: [] },
  numberMap: { model: types.map(types.number), def: {} },
  boolean: { model: types.boolean, def: true },
  color: { model: types.string, def: "black" },
  integer: { model: types.integer, def: 1 },
  number: { model: types.number, def: 1 },
  maybeNumber: { model: types.maybe(types.number), def: undefined },
  maybeBoolean: { model: types.maybe(types.boolean), def: undefined },
  maybeFrozen: { model: types.maybe(types.frozen()), def: undefined },
  string: { model: types.string, def: "" },
  text: { model: types.string, def: "" },
  fileLocation: {
    model: FileLocation,
    def: { uri: "/x", locationType: "UriLocation" }
  },
  frozen: { model: types.frozen(), def: {} }
}
const slotNames = Object.keys(slotTypes)

// ---- ConfigSlot ------------------------------------------------------------
function ConfigSlot(typeName) {
  const { model, def } = slotTypes[typeName]
  return types.stripDefault(types.union(JexlStringType, model), def)
}

const ElementId = types.optional(types.identifier, () => "eid")

// ---- makeConfigurationSchemaModel -----------------------------------------
// SLOTS_PER_SCHEMA ~ what a real track config schema carries once its
// baseConfiguration slots are merged in.
const SLOTS_PER_SCHEMA = 40
const HOOKS = 3

function ConfigurationSchema(
  modelName,
  nSlots = SLOTS_PER_SCHEMA,
  subSchemas = []
) {
  const modelDefinition = {}
  modelDefinition.type = types.optional(types.literal(modelName), modelName)
  modelDefinition.trackId = ElementId
  for (let i = 0; i < nSlots; i++) {
    modelDefinition[`slot${i}`] = ConfigSlot(slotNames[i % slotNames.length])
  }
  for (const [name, sub] of subSchemas) {
    modelDefinition[name] = sub
  }

  let completeModel = types
    .model(`${modelName}ConfigurationSchema`, modelDefinition)
    .actions(self => ({
      setSubschema(k, v) {
        self[k] = v
      },
      setSlot(k, v) {
        self[k] = v
      }
    }))
  for (let i = 0; i < HOOKS; i++) {
    completeModel = completeModel.actions(() => ({ [`a${i}`]() {} }))
  }
  for (let i = 0; i < HOOKS; i++) {
    completeModel = completeModel.views(() => ({
      get [`v${i}`]() {
        return i
      }
    }))
  }
  completeModel = completeModel.preProcessSnapshot(sn => sn)
  return types.stripDefault(completeModel, {
    type: modelName,
    trackId: "placeholderId"
  })
}

// A track config schema nests two display sub-schemas, each itself a schema.
function buildTrackSchema(i) {
  const displays = [
    ["linearDisplay", ConfigurationSchema(`LinearDisplay${i}`, 25)],
    ["circularDisplay", ConfigurationSchema(`CircularDisplay${i}`, 15)]
  ]
  return ConfigurationSchema(`Track${i}`, SLOTS_PER_SCHEMA, displays)
}

const N = Number(process.env.N_TRACKS || 262)

export function buildAll() {
  const out = []
  for (let i = 0; i < N; i++) {
    out.push(buildTrackSchema(i))
  }
  return out
}

if (process.env.PROFILE_ONCE !== "0") {
  // warm
  for (let i = 0; i < 2; i++) buildAll()
  const t = performance.now()
  const REPEATS = Number(process.env.REPEATS || 10)
  for (let r = 0; r < REPEATS; r++) buildAll()
  const ms = (performance.now() - t) / REPEATS
  console.log(
    `built ${N} track schemas (each: 40 slots + 2 nested displays) in ${ms.toFixed(1)} ms`
  )
}
