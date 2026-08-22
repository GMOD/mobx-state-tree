import {
  isArrayType,
  isFrozenType,
  isIdentifierType,
  isLateType,
  isLiteralType,
  isMapType,
  isModelType,
  isOptionalType,
  isPrimitiveType,
  isReferenceType,
  isRefinementType,
  isUnionType,
  types,
  type IAnyType
} from "../../src/index.ts"

declare const t: IAnyType

// The guards whose parameter is typed `IT` used to be declared `type is IT`.
// That narrowing is a no-op in the positive branch and collapses the negative
// branch to `never`, so every one of these reads was a compile error
// ("Property 'name' does not exist on type 'never'"). They return `boolean` now.
if (!isFrozenType(t)) {
  console.log(t.name)
}
if (!isIdentifierType(t)) {
  console.log(t.name)
}
if (!isLateType(t)) {
  console.log(t.name)
}
if (!isLiteralType(t)) {
  console.log(t.name)
}
if (!isOptionalType(t)) {
  console.log(t.name)
}
if (!isPrimitiveType(t)) {
  console.log(t.name)
}
if (!isReferenceType(t)) {
  console.log(t.name)
}
if (!isRefinementType(t)) {
  console.log(t.name)
}
if (!isUnionType(t)) {
  console.log(t.name)
}

// these three narrow to a *different* type than their parameter, so their
// predicates are meaningful and are kept
if (isArrayType(t)) {
  console.log(t.getChildType().name)
}
if (isMapType(t)) {
  console.log(t.getChildType().name)
}
if (isModelType(t)) {
  console.log(t.properties)
}
if (!isArrayType(t)) {
  console.log(t.name)
}

// every boolean guard takes IAnyType, so a concrete type is accepted rather
// than rejected by a leftover generic constraint
const Todo = types.model("Todo", {
  id: types.identifier,
  done: types.optional(types.boolean, false)
})

console.log(
  isFrozenType(Todo),
  isIdentifierType(Todo),
  isLateType(Todo),
  isLiteralType(Todo),
  isOptionalType(Todo),
  isPrimitiveType(Todo),
  isReferenceType(Todo),
  isRefinementType(Todo),
  isUnionType(Todo)
)

console.log(
  isIdentifierType(Todo.properties.id),
  isOptionalType(Todo.properties.done),
  isPrimitiveType(types.string),
  isLiteralType(types.literal("a")),
  isFrozenType(types.frozen<{ x: number }>()),
  isReferenceType(types.reference(Todo)),
  isLateType(types.late(() => Todo)),
  isRefinementType(types.refinement(types.string, v => v.length > 0)),
  isUnionType(types.union(types.string, types.number))
)
