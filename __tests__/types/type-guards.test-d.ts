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
