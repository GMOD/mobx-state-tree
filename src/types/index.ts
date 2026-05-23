// we import the types to re-export them inside types.
import { array } from "./complex-types/array.ts"
import { map } from "./complex-types/map.ts"
import { compose, model } from "./complex-types/model.ts"
import { boolean, DatePrimitive, finite, float, integer, nullType, number, string, undefinedType } from "./primitives.ts"
import { custom } from "./utility-types/custom.ts"
import { enumeration } from "./utility-types/enumeration.ts"
import { frozen } from "./utility-types/frozen.ts"
import { identifier, identifierNumber } from "./utility-types/identifier.ts"
import { late } from "./utility-types/late.ts"
import { lazy } from "./utility-types/lazy.ts"
import { literal } from "./utility-types/literal.ts"
import { maybe, maybeNull } from "./utility-types/maybe.ts"
import { optional } from "./utility-types/optional.ts"
import { reference, safeReference } from "./utility-types/reference.ts"
import { refinement } from "./utility-types/refinement.ts"
import { resilient } from "./utility-types/resilient.ts"
import { snapshotProcessor } from "./utility-types/snapshotProcessor.ts"
import { union } from "./utility-types/union.ts"
export const types = {
  enumeration,
  model,
  compose,
  custom,
  reference,
  safeReference,
  union,
  optional,
  literal,
  maybe,
  maybeNull,
  refinement,
  string,
  boolean,
  number,
  integer,
  float,
  finite,
  Date: DatePrimitive,
  map,
  array,
  frozen,
  identifier,
  identifierNumber,
  late,
  lazy,
  undefined: undefinedType,
  null: nullType,
  snapshotProcessor,
  resilient
}
