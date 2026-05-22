Findings on the unbundled-ESM-for-webpack question:

Reproduced the failure and identified the exact mechanism:

- The TDZ only fires under webpack production mode, which enables optimization.concatenateModules (scope
  hoisting). It concatenates the ESM modules into a single scope. In the hoisted output, classes get laid out in
  this order:
  - L6771: class OptionalValue extends BaseType (eager use)
  - L6944: class CoreType extends SimpleType (eager use)
  - L10431: class BaseType (defined after its first use)
    → ReferenceError: Cannot access 'BaseType' before initialization
- The internal.ts barrel doesn't fix this — it just re-exports, while webpack picks a different linearization
  than the source order.
- Webpack dev mode, esbuild, Vite, Node ESM, and Node CJS all handle it fine — only scope-hoisted webpack
  production trips.

The fix is mechanical but touches ~15 files: every class X extends BaseType|SimpleType|ComplexType|BaseNode (in
optional.ts, late.ts, refinement.ts, resilient.ts, snapshotProcessor.ts, union.ts, frozen.ts, literal.ts,
lazy.ts, custom.ts, identifier.ts, primitives.ts, array.ts, map.ts, model.ts, scalar-node.ts, object-node.ts)
needs to import its base class directly from core/type/type.ts (or core/node/BaseNode.ts) rather than via
../../internal.ts. That forces webpack's module graph to evaluate the base class file before any of its
subclasses, regardless of hoisting decisions.

Happy to attempt that refactor if/when you want to revisit — it's not exotic, just a lot of single-import edits
— but it'd add real diff vs upstream, so per your call we're leaving it bundled.
