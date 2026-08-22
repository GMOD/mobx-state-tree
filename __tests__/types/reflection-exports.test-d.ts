// Pins the exports that downstream type-reflection helpers (jbrowse's
// `mst-reflection.ts`) otherwise have to hand-declare or detect structurally.
// Checked by `pnpm test:types`.

import {
  cannotDetermineSubtype,
  getUnionSubtypes,
  isOptionalType,
  types,
  type IAnyType,
  type ILiteralType,
  type IOptionalIType
} from "../../src/index.ts"

declare const t: IAnyType

// the "cannot report a subtype" sentinel is a value, so `getSubTypes()` can be
// discriminated by comparison rather than by `typeof sub === "object"`
const sub = t.getSubTypes()
if (sub !== null && sub !== cannotDetermineSubtype && !Array.isArray(sub)) {
  console.log(sub.name)
}

// `literal()` publishes the value it matches
const literalA = types.literal("a")
const value: "a" = literalA.value
console.log(value)

// so an enumeration's members can be mapped back to their values without a
// hand-written interface
const Enum = types.enumeration("Colors", ["red", "green"])
const members = getUnionSubtypes(Enum) as ILiteralType<string>[]
const names: string[] = members.map(m => m.value)
console.log(names)

// IOptionalIType's parameters default, so the boolean isOptionalType guard can
// be followed by a one-word assertion rather than a two-argument one
function getDefaultValue(type: IAnyType) {
  if (!isOptionalType(type)) {
    throw new TypeError("type must be an optional type")
  }
  return (type as IOptionalIType).getDefaultInstanceOrSnapshot()
}
console.log(getDefaultValue(types.optional(types.string, "x")))
